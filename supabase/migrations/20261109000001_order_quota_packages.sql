-- ================================================================== *
-- Sipariş kotası + bakiye (09.11.2026)
--
-- Kural:
--  * Her paketin dönem (UTC takvim ayı; paket yenilenince) başına tanımlı
--    SİPARİŞ KOTASI vardır. Müşterinin işletme sayfasından verdiği her
--    sipariş (gel-al, paket servis, rezerve) bu kotadan 1 adet düşer.
--  * Ücretsiz Profil de aynı mantıkla çalışır: paketine tanımlı aylık
--    ücretsiz sipariş adedi kadar sipariş alır.
--  * Dönem kotası bitince işletme, paketin tanımlı MİNİMUM adedi ve
--    KATLARI kadar, paketin tanımlı BİRİM FİYATI üzerinden sipariş
--    bakiyesi ekleyebilir. Bakiye, dönem kotası bittikten sonra kullanılır
--    ve dönem sonunda silinmez.
--  * Kota + bakiye bitince yeni sipariş alınmaz (müşteriye "şu an sipariş
--    alınamıyor" denir); bakiye eklenince veya dönem yenilenince açılır.
--  * Bütün değerler packages tablosundadır; yönetim panelinden güncellenir.
--    NULL = bu paket için sipariş limiti TANIMSIZ (sınırlama uygulanmaz) —
--    migration mevcut işletmelerin siparişini kesmez.
--  * DampingVar müşteri ödemesi almaz: bakiye ekleme, işletmeye sunulan
--    platform hizmetidir; defterde faturalanacak satır (billed=false) olarak
--    tutulur ve sözleşmeye göre faturalandırılır.
-- İDEMPOTENT: tekrar çalıştırmak güvenlidir.
-- ================================================================== *

-- ------------------------- paket ayarları -------------------------- *
alter table public.packages
  add column if not exists order_quota_monthly integer
    check (order_quota_monthly is null or order_quota_monthly >= 0),
  add column if not exists order_unit_price_cents integer
    check (order_unit_price_cents is null or order_unit_price_cents >= 0),
  add column if not exists order_topup_min_qty integer not null default 1
    check (order_topup_min_qty >= 1);

-- ------------------------- işletme bakiyesi ------------------------ *
alter table public.businesses
  add column if not exists order_credit_balance integer not null default 0
    check (order_credit_balance >= 0);

-- ------------------------- hareket defteri ------------------------- *
create table if not exists public.order_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('QUOTA_USE','BALANCE_USE','TOPUP')),
  order_id uuid,                               -- QUOTA_USE / BALANCE_USE: hangi sipariş
  qty integer not null check (qty > 0),
  period text not null,                       -- 'YYYY-MM' (UTC)
  package_code text,
  unit_price_cents integer,
  amount_cents integer,                        -- yalnız TOPUP: qty * birim fiyat (hizmet bedeli)
  billed boolean not null default false,       -- yalnız TOPUP: faturaya yansıdı mı
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists order_credit_ledger_biz_period_idx
  on public.order_credit_ledger (business_id, period, kind);

alter table public.order_credit_ledger enable row level security;
drop policy if exists order_credit_ledger_member_read on public.order_credit_ledger;
create policy order_credit_ledger_member_read on public.order_credit_ledger
  for select using (public.is_business_member(business_id));
-- INSERT/UPDATE/DELETE politikası YOK: yazmalar yalnızca aşağıdaki security definer RPC'lerle.

-- ------------------------- yardımcı: durum ------------------------- *
create or replace function public.dv_order_quota_state(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(now() at time zone 'UTC', 'YYYY-MM');
  v_plan text;
  v_pkg public.packages%rowtype;
  v_balance integer;
  v_used integer;
begin
  select coalesce(plan_code, 'FREE'), order_credit_balance into v_plan, v_balance
  from public.businesses where id = p_business_id;
  if not found then return null; end if;

  select * into v_pkg from public.packages where code = v_plan;
  if not found then select * into v_pkg from public.packages where code = 'FREE'; end if;

  select coalesce(sum(qty), 0) into v_used
  from public.order_credit_ledger
  where business_id = p_business_id and period = v_period and kind = 'QUOTA_USE';

  return jsonb_build_object(
    'period', v_period,
    'packageCode', v_pkg.code,
    'packageName', v_pkg.name,
    'unlimited', v_pkg.order_quota_monthly is null,
    'quota', v_pkg.order_quota_monthly,
    'used', v_used,
    'quotaRemaining', case when v_pkg.order_quota_monthly is null then null
                           else greatest(v_pkg.order_quota_monthly - v_used, 0) end,
    'balance', v_balance,
    'unitPriceCents', v_pkg.order_unit_price_cents,
    'topupMinQty', v_pkg.order_topup_min_qty
  );
end;
$$;

-- İşletme personeli ve yönetici durumu görür.
create or replace function public.dv_order_quota_state_member(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.dv_order_quota_state(p_business_id);
end;
$$;

-- Herkese açık: yalnızca "sipariş alınabilir mi" (sayı sızdırmaz).
create or replace function public.dv_order_capacity_available(p_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare s jsonb;
begin
  s := public.dv_order_quota_state(p_business_id);
  if s is null then return false; end if;
  if (s->>'unlimited')::boolean then return true; end if;
  return coalesce((s->>'quotaRemaining')::int, 0) > 0 or coalesce((s->>'balance')::int, 0) > 0;
end;
$$;

-- ------------------------- sipariş = kota tüketimi ------------------ *
-- Kota, siparişin eklendiği AYNI işlemde (BEFORE INSERT tetikleyici) düşülür:
--  * satır kilidiyle yarış yok (aynı anda son kota için iki sipariş olamaz),
--  * sipariş eklenemezse kota da düşmez (işlem geri alınır),
--  * istemcinin doğrudan çağırabileceği bir "kota harca" RPC'si YOKTUR
--    (başka işletmenin kotasını boşaltma riski kapalı).
-- Kota + bakiye yoksa 'ORDER_QUOTA_EXHAUSTED' hatası verir; API bunu müşteriye çevirir.
create or replace function public.dv_consume_order_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(now() at time zone 'UTC', 'YYYY-MM');
  v_plan text;
  v_quota integer;
  v_pkg_code text;
  v_balance integer;
  v_used integer;
begin
  select coalesce(plan_code, 'FREE'), order_credit_balance into v_plan, v_balance
  from public.businesses where id = new.business_id for update;
  if not found then return new; end if;

  select code, order_quota_monthly into v_pkg_code, v_quota from public.packages where code = v_plan;
  if not found then select code, order_quota_monthly into v_pkg_code, v_quota from public.packages where code = 'FREE'; end if;

  -- Tanımsız (NULL) kota: sınırlama uygulanmaz.
  if v_quota is null then return new; end if;

  select coalesce(sum(qty), 0) into v_used
  from public.order_credit_ledger
  where business_id = new.business_id and period = v_period and kind = 'QUOTA_USE';

  if v_used < v_quota then
    insert into public.order_credit_ledger (business_id, kind, qty, period, package_code, order_id, created_by)
    values (new.business_id, 'QUOTA_USE', 1, v_period, v_pkg_code, new.id, auth.uid());
    return new;
  end if;

  if v_balance > 0 then
    update public.businesses set order_credit_balance = order_credit_balance - 1 where id = new.business_id;
    insert into public.order_credit_ledger (business_id, kind, qty, period, package_code, order_id, created_by)
    values (new.business_id, 'BALANCE_USE', 1, v_period, v_pkg_code, new.id, auth.uid());
    return new;
  end if;

  raise exception 'ORDER_QUOTA_EXHAUSTED' using errcode = 'P0001';
end;
$$;

drop trigger if exists orders_consume_quota on public.orders;
create trigger orders_consume_quota
  before insert on public.orders
  for each row execute function public.dv_consume_order_slot();

-- ------------------------- bakiye ekle ----------------------------- *
-- Adet, paketin minimum adedi ve katları olmalıdır; tutar = adet × paket birim fiyatı.
create or replace function public.dv_topup_order_credits(p_business_id uuid, p_qty integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_pkg public.packages%rowtype;
  v_amount integer;
  v_balance integer;
begin
  if auth.uid() is null or not public.is_business_staff(p_business_id, array['owner','OWNER']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(plan_code, 'FREE') into v_plan from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  select * into v_pkg from public.packages where code = v_plan;
  if not found then select * into v_pkg from public.packages where code = 'FREE'; end if;

  if v_pkg.order_quota_monthly is null or v_pkg.order_unit_price_cents is null then
    raise exception 'Bu paket için sipariş bakiyesi tanımlı değil.';
  end if;
  if p_qty is null or p_qty < v_pkg.order_topup_min_qty or p_qty % v_pkg.order_topup_min_qty <> 0 then
    raise exception 'Adet en az % ve katları (% , % ...) olmalıdır.', v_pkg.order_topup_min_qty,
      v_pkg.order_topup_min_qty * 2, v_pkg.order_topup_min_qty * 3;
  end if;
  if p_qty > 1000000 then raise exception 'Adet çok büyük.'; end if;

  v_amount := p_qty * v_pkg.order_unit_price_cents;
  update public.businesses set order_credit_balance = order_credit_balance + p_qty
    where id = p_business_id returning order_credit_balance into v_balance;
  insert into public.order_credit_ledger
    (business_id, kind, qty, period, package_code, unit_price_cents, amount_cents, billed, created_by)
  values
    (p_business_id, 'TOPUP', p_qty, to_char(now() at time zone 'UTC', 'YYYY-MM'), v_pkg.code,
     v_pkg.order_unit_price_cents, v_amount, false, auth.uid());

  return jsonb_build_object('ok', true, 'added', p_qty, 'amountCents', v_amount,
                            'unitPriceCents', v_pkg.order_unit_price_cents, 'balance', v_balance);
end;
$$;

-- ------------------------- yetkiler -------------------------------- *
revoke all on function public.dv_order_quota_state(uuid) from public, anon, authenticated;
grant execute on function public.dv_order_quota_state(uuid) to service_role;
grant execute on function public.dv_order_quota_state_member(uuid) to authenticated, service_role;
grant execute on function public.dv_order_capacity_available(uuid) to anon, authenticated, service_role;
revoke all on function public.dv_consume_order_slot() from public, anon, authenticated;
grant execute on function public.dv_topup_order_credits(uuid, integer) to authenticated, service_role;

-- ------------------------- DEMO tohum değerleri -------------------- *
-- Gerçek değerler yönetim panelinden girilir. Yalnızca henüz tanımsız (NULL) paketlere yazılır;
-- yönetici güncellemeleri ezilmez. Bu rakamlar DEMO'dur.
update public.packages set order_quota_monthly = 20,   order_unit_price_cents = 800, order_topup_min_qty = 10  where code = 'FREE'  and order_quota_monthly is null;
update public.packages set order_quota_monthly = 300,  order_unit_price_cents = 600, order_topup_min_qty = 50  where code = 'PRO'   and order_quota_monthly is null;
update public.packages set order_quota_monthly = 1000, order_unit_price_cents = 400, order_topup_min_qty = 100 where code = 'BOOST' and order_quota_monthly is null;
update public.packages set order_quota_monthly = 2000, order_unit_price_cents = 300, order_topup_min_qty = 100 where code = 'AI28'  and order_quota_monthly is null;
