-- ================================================================== *
-- Faturalama ve cari hesap (10.11.2026)
--
--  * Admin, işletme + dönem (ay) seçer; hizmetler OTOMATİK gelir
--    (paket/abonelik ve diğer sabit aylık hizmet bedeli kuralları +
--    henüz faturalanmamış sipariş bakiyesi hareketleri). Fatura e-Fatura
--    modülünden kesilir; burada fatura numarası ve tarihi girilip KAYDEDİLİR.
--  * Ödeme durumu: ödeme bekliyor (ISSUED/SENT/…) → ödeme geldi (PAID)
--    | iptal (CANCELLED) ; ödeme geldi → iade (REFUNDED).
--  * Her durum değişikliği cari hesaba (billing_entries) çift taraflı
--    hareket yazar; hesap ekstresi ve bakiye listesi bu defterden üretilir.
--  * Müşteri ödemesi burada YOKTUR; yalnızca DampingVar'ın işletmeye
--    sunduğu platform hizmetlerinin faturası ve tahsilatı.
-- İDEMPOTENT: tekrar çalıştırmak güvenlidir.
-- ================================================================== *

-- ------------------------- invoices genişletme ---------------------- *
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.invoices'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.invoices drop constraint %I', c);
  end loop;
  alter table public.invoices add constraint invoices_status_check
    check (status in ('DRAFT','ISSUED','SENT','PAID','PARTIALLY_PAID','OVERDUE','CANCELLED','REFUNDED'));
end $$;

alter table public.invoices
  add column if not exists invoice_date date,
  add column if not exists period text,
  add column if not exists payment_date date,
  add column if not exists payment_method text,
  add column if not exists payment_note text,
  add column if not exists refunded_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id);

alter table public.order_credit_ledger
  add column if not exists invoice_id uuid references public.invoices(id);
create index if not exists order_credit_ledger_unbilled_idx
  on public.order_credit_ledger (business_id) where kind = 'TOPUP' and invoice_id is null;

-- ------------------------- cari hareketleri ------------------------- *
-- debit  = borç    (işletme DampingVar'a borçlanır: fatura, iade ödemesi)
-- credit = alacak  (borç azalır: ödeme, iptal, iade faturası)
-- bakiye = Σ debit − Σ credit  (+ = işletmenin DampingVar'a borcu)
create table if not exists public.billing_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  entry_date date not null default current_date,
  kind text not null check (kind in ('INVOICE','PAYMENT','CANCEL','REFUND_NOTE','REFUND_PAYOUT','ADJUSTMENT')),
  description text not null,
  debit_cents integer not null default 0 check (debit_cents >= 0),
  credit_cents integer not null default 0 check (credit_cents >= 0),
  currency text not null default 'TRY' check (currency in ('TRY','USD','GEL','EUR')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((debit_cents > 0) <> (credit_cents > 0) or (debit_cents = 0 and credit_cents = 0))
);
create index if not exists billing_entries_biz_date_idx on public.billing_entries (business_id, entry_date, created_at);
-- Aynı fatura için aynı olay iki kez yazılamaz (çift tıklama / yeniden deneme güvenli).
create unique index if not exists billing_entries_invoice_kind_uq
  on public.billing_entries (invoice_id, kind) where invoice_id is not null and kind <> 'ADJUSTMENT';

alter table public.billing_entries enable row level security;
drop policy if exists billing_entries_admin on public.billing_entries;
create policy billing_entries_admin on public.billing_entries for select using (public.is_admin());
drop policy if exists billing_entries_member_read on public.billing_entries;
create policy billing_entries_member_read on public.billing_entries for select
  using (public.is_business_member(business_id));
-- INSERT/UPDATE/DELETE politikası YOK: yazmalar yalnızca aşağıdaki RPC'lerle.

-- ------------------------- hizmet satırları (otomatik) -------------- *
create or replace function public.dv_billing_lines(p_business_id uuid, p_period text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_plan text;
  v_lines jsonb := '[]'::jsonb;
  v_has_sub_rule boolean;
  v_price integer;
  v_pkg_name text;
  r record;
begin
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Dönem YYYY-AA biçiminde olmalıdır.';
  end if;
  v_start := ((p_period || '-01')::timestamp) at time zone 'UTC';
  v_end := v_start + interval '1 month';

  select coalesce(plan_code, 'FREE') into v_plan from public.businesses where id = p_business_id;
  if not found then raise exception 'İşletme bulunamadı.'; end if;

  -- 1) Sabit aylık hizmet bedeli kuralları (işletmeye özel kural, paket kuralından önceliklidir).
  for r in
    select distinct on (f.service_type) f.*
    from public.service_fee_rules f
    where f.active and f.kind = 'FIXED' and f.calculation_base = 'MONTHLY' and f.amount_cents > 0
      and (f.business_id = p_business_id or (f.business_id is null and f.package_code = v_plan))
      and f.valid_from < v_end and (f.valid_to is null or f.valid_to >= v_start)
    order by f.service_type, (f.business_id is not null) desc, f.valid_from desc
  loop
    v_lines := v_lines || jsonb_build_object(
      'source', 'RULE', 'ruleId', r.id, 'serviceType', r.service_type,
      'description', case r.service_type
        when 'SUBSCRIPTION' then 'Paket aboneliği (' || v_plan || ') — ' || p_period
        when 'AI_CONTENT' then 'AI içerik hizmeti — ' || p_period
        when 'GROWTH_28' then '28 günlük AI büyüme programı — ' || p_period
        when 'FEATURED_PLACEMENT' then 'Öne çıkan yerleşim — ' || p_period
        when 'REGIONAL_ADS' then 'Bölgesel reklam — ' || p_period
        when 'QR_MANAGEMENT' then 'QR kampanya yönetimi — ' || p_period
        when 'CAMPAIGN_MANAGEMENT' then 'Kampanya yönetimi — ' || p_period
        when 'VISIBILITY' then 'Görünürlük hizmeti — ' || p_period
        when 'REFERRAL_SERVICE' then 'Yönlendirme hizmeti — ' || p_period
        else 'Platform hizmeti — ' || p_period end,
      'quantity', 1, 'unitPriceCents', r.amount_cents, 'amountCents', r.amount_cents);
  end loop;

  -- 2) Abonelik kuralı HİÇ yoksa paket aylık fiyatına düş (kural 0 tutarlıysa faturalanmaz).
  select exists (
    select 1 from public.service_fee_rules f
    where f.active and f.service_type = 'SUBSCRIPTION'
      and (f.business_id = p_business_id or (f.business_id is null and f.package_code = v_plan))
  ) into v_has_sub_rule;
  if not v_has_sub_rule then
    select price_monthly_cents, name into v_price, v_pkg_name from public.packages where code = v_plan;
    if coalesce(v_price, 0) > 0 then
      v_lines := v_lines || jsonb_build_object(
        'source', 'PACKAGE', 'serviceType', 'SUBSCRIPTION',
        'description', 'Paket aboneliği (' || coalesce(v_pkg_name, v_plan) || ') — ' || p_period,
        'quantity', 1, 'unitPriceCents', v_price, 'amountCents', v_price);
    end if;
  end if;

  -- 3) Henüz faturalanmamış sipariş bakiyesi eklemeleri (dönem sonuna kadar), birim fiyata göre toplu.
  for r in
    select unit_price_cents, sum(qty)::int as q, sum(amount_cents)::int as a
    from public.order_credit_ledger
    where business_id = p_business_id and kind = 'TOPUP' and invoice_id is null and period <= p_period
    group by unit_price_cents order by unit_price_cents
  loop
    v_lines := v_lines || jsonb_build_object(
      'source', 'ORDER_TOPUP', 'serviceType', 'ORDER_CREDIT',
      'description', 'Ek sipariş bakiyesi (' || r.q || ' adet)',
      'quantity', r.q, 'unitPriceCents', r.unit_price_cents, 'amountCents', r.a);
  end loop;

  return v_lines;
end;
$$;

-- ------------------------- önizleme --------------------------------- *
create or replace function public.dv_billing_preview(p_business_id uuid, p_period text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lines jsonb;
  v_sub integer;
  v_rate numeric;
  v_existing jsonb;
  v_name text;
  v_plan text;
  v_cur text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select name, coalesce(plan_code,'FREE'), currency into v_name, v_plan, v_cur from public.businesses where id = p_business_id;
  if not found then raise exception 'İşletme bulunamadı.'; end if;

  v_lines := public.dv_billing_lines(p_business_id, p_period);
  select coalesce(sum((l->>'amountCents')::int), 0) into v_sub from jsonb_array_elements(v_lines) l;

  select coalesce(jsonb_agg(jsonb_build_object('number', number, 'status', status)), '[]'::jsonb)
    into v_existing
  from public.invoices where business_id = p_business_id and period = p_period and status <> 'CANCELLED';

  -- Önerilen KDV oranı: işletmenin son faturası, yoksa platformun son faturası (sabit değer yok).
  select tax_rate into v_rate from public.invoices where business_id = p_business_id order by created_at desc limit 1;
  if v_rate is null then select tax_rate into v_rate from public.invoices order by created_at desc limit 1; end if;

  return jsonb_build_object(
    'business', jsonb_build_object('id', p_business_id, 'name', v_name, 'planCode', v_plan, 'currency', v_cur),
    'period', p_period, 'lines', v_lines, 'subtotalCents', v_sub,
    'existing', v_existing, 'suggestedTaxRate', v_rate,
    'suggestedDate', (((p_period || '-01')::date) + interval '1 month' - interval '1 day')::date
  );
end;
$$;

-- ------------------------- fatura kaydet ---------------------------- *
create or replace function public.dv_billing_create_invoice(
  p_business_id uuid, p_period text, p_number text, p_invoice_date date,
  p_tax_rate numeric, p_note text default null, p_extra jsonb default '[]'::jsonb,
  p_allow_additional boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lines jsonb;
  v_all jsonb := '[]'::jsonb;
  v_item jsonb;
  v_sub integer := 0;
  v_tax integer;
  v_total integer;
  v_inv uuid;
  v_cur text;
  v_start timestamptz;
  v_qty integer;
  v_unit integer;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_number is null or length(btrim(p_number)) = 0 then raise exception 'Fatura numarası gerekli.'; end if;
  if p_invoice_date is null then raise exception 'Fatura tarihi gerekli.'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 1 then raise exception 'KDV oranı 0 ile 100 arasında olmalıdır.'; end if;
  if exists (select 1 from public.invoices where number = btrim(p_number)) then
    raise exception 'Bu fatura numarası zaten kayıtlı: %', btrim(p_number);
  end if;
  if not p_allow_additional and exists (
    select 1 from public.invoices where business_id = p_business_id and period = p_period and status <> 'CANCELLED') then
    raise exception 'Bu işletme için % dönemine ait fatura zaten var. Ek fatura gerekiyorsa onaylayın.', p_period;
  end if;

  select currency into v_cur from public.businesses where id = p_business_id for update;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
  v_start := ((p_period || '-01')::timestamp) at time zone 'UTC';

  -- Otomatik satırlar sunucuda yeniden hesaplanır (istemciden gelen tutarlara güvenilmez).
  v_lines := public.dv_billing_lines(p_business_id, p_period);
  v_all := v_lines;

  -- Elle eklenen ek satırlar (isteğe bağlı): açıklama + adet + birim fiyat.
  for v_item in select * from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) loop
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    v_unit := (v_item->>'unitPriceCents')::int;
    if coalesce(btrim(v_item->>'description'), '') = '' or v_qty < 1 or v_unit is null or v_unit < 0 then
      raise exception 'Ek satır geçersiz (açıklama, adet ≥ 1, birim fiyat ≥ 0).';
    end if;
    v_all := v_all || jsonb_build_object('source','CUSTOM','serviceType','CUSTOM',
      'description', btrim(v_item->>'description'), 'quantity', v_qty,
      'unitPriceCents', v_unit, 'amountCents', v_qty * v_unit);
  end loop;

  select coalesce(sum((l->>'amountCents')::int), 0) into v_sub from jsonb_array_elements(v_all) l;
  if jsonb_array_length(v_all) = 0 or v_sub <= 0 then
    raise exception 'Faturalanacak hizmet bulunamadı.';
  end if;
  v_tax := round(v_sub * p_tax_rate)::int;
  v_total := v_sub + v_tax;

  insert into public.invoices
    (business_id, number, period_start, period_end, currency, subtotal_cents, tax_rate, tax_cents, total_cents,
     status, issued_at, note, invoice_date, period, created_by)
  values
    (p_business_id, btrim(p_number), v_start, v_start + interval '1 month' - interval '1 second', coalesce(v_cur,'TRY'),
     v_sub, p_tax_rate, v_tax, v_total, 'ISSUED', p_invoice_date::timestamptz, nullif(btrim(coalesce(p_note,'')),''),
     p_invoice_date, p_period, auth.uid())
  returning id into v_inv;

  for v_item in select * from jsonb_array_elements(v_all) loop
    insert into public.invoice_items (invoice_id, fee_rule_id, service_type, description, quantity, unit_price_cents, amount_cents)
    values (v_inv, nullif(v_item->>'ruleId','')::uuid, v_item->>'serviceType', v_item->>'description',
            (v_item->>'quantity')::int, (v_item->>'unitPriceCents')::int, (v_item->>'amountCents')::int);
  end loop;

  -- Faturaya giren sipariş bakiyesi eklemeleri faturalandı olarak işaretlenir.
  update public.order_credit_ledger set billed = true, invoice_id = v_inv
  where business_id = p_business_id and kind = 'TOPUP' and invoice_id is null and period <= p_period;

  insert into public.billing_entries (business_id, invoice_id, entry_date, kind, description, debit_cents, currency, created_by)
  values (p_business_id, v_inv, p_invoice_date, 'INVOICE', 'Fatura ' || btrim(p_number) || ' (' || p_period || ')',
          v_total, coalesce(v_cur,'TRY'), auth.uid());

  return jsonb_build_object('ok', true, 'invoiceId', v_inv, 'number', btrim(p_number),
                            'subtotalCents', v_sub, 'taxCents', v_tax, 'totalCents', v_total);
end;
$$;

-- ------------------------- ödeme durumu ----------------------------- *
create or replace function public.dv_billing_set_status(
  p_invoice_id uuid, p_status text, p_date date default null, p_method text default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  v_date date := coalesce(p_date, current_date);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Fatura bulunamadı.'; end if;

  if p_status = 'PAID' then
    if inv.status not in ('DRAFT','ISSUED','SENT','PARTIALLY_PAID','OVERDUE') then
      raise exception 'Yalnızca ödeme bekleyen fatura "ödeme geldi" yapılabilir.';
    end if;
    update public.invoices set status = 'PAID', paid_at = v_date::timestamptz, payment_date = v_date,
      payment_method = nullif(btrim(coalesce(p_method,'')),''), payment_note = nullif(btrim(coalesce(p_note,'')),'')
    where id = inv.id;
    insert into public.billing_entries (business_id, invoice_id, entry_date, kind, description, credit_cents, currency, created_by)
    values (inv.business_id, inv.id, v_date, 'PAYMENT', 'Ödeme — fatura ' || inv.number, inv.total_cents, inv.currency, auth.uid());

  elsif p_status = 'CANCELLED' then
    if inv.status not in ('DRAFT','ISSUED','SENT','PARTIALLY_PAID','OVERDUE') then
      raise exception 'Yalnızca ödeme bekleyen fatura iptal edilebilir (ödenmiş fatura için iade kullanın).';
    end if;
    update public.invoices set status = 'CANCELLED', paid_at = null, payment_note = nullif(btrim(coalesce(p_note,'')),'')
    where id = inv.id;
    insert into public.billing_entries (business_id, invoice_id, entry_date, kind, description, credit_cents, currency, created_by)
    values (inv.business_id, inv.id, v_date, 'CANCEL', 'İptal — fatura ' || inv.number, inv.total_cents, inv.currency, auth.uid());
    -- Faturaya girmiş sipariş bakiyesi eklemeleri yeniden faturalanabilir olur.
    update public.order_credit_ledger set billed = false, invoice_id = null where invoice_id = inv.id;

  elsif p_status = 'REFUNDED' then
    if inv.status <> 'PAID' then raise exception 'Yalnızca ödenmiş fatura iade edilebilir.'; end if;
    update public.invoices set status = 'REFUNDED', refunded_at = v_date::timestamptz,
      payment_note = nullif(btrim(coalesce(p_note, inv.payment_note, '')),'')
    where id = inv.id;
    -- İade = iade faturası (borç düşer) + iade ödemesi (borç yeniden doğar) → net bakiye değişmez.
    insert into public.billing_entries (business_id, invoice_id, entry_date, kind, description, credit_cents, currency, created_by)
    values (inv.business_id, inv.id, v_date, 'REFUND_NOTE', 'İade faturası — fatura ' || inv.number, inv.total_cents, inv.currency, auth.uid());
    insert into public.billing_entries (business_id, invoice_id, entry_date, kind, description, debit_cents, currency, created_by)
    values (inv.business_id, inv.id, v_date, 'REFUND_PAYOUT', 'İade ödemesi — fatura ' || inv.number, inv.total_cents, inv.currency, auth.uid());
  else
    raise exception 'Geçersiz durum.';
  end if;

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

-- ------------------------- bakiye listesi --------------------------- *
create or replace function public.dv_billing_balances(p_as_of date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x order by (x->>'balanceCents')::int desc, x->>'name'), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'businessId', b.id, 'name', b.name, 'planCode', b.plan_code, 'currency', b.currency,
      'debitCents', e.debit, 'creditCents', e.credit, 'balanceCents', e.debit - e.credit,
      'openInvoices', (select count(*) from public.invoices i where i.business_id = b.id
                       and i.status in ('DRAFT','ISSUED','SENT','PARTIALLY_PAID','OVERDUE')),
      'lastPaymentDate', (select max(i.payment_date) from public.invoices i where i.business_id = b.id and i.payment_date is not null)
    ) as x
    from public.businesses b
    join (
      select business_id, coalesce(sum(debit_cents),0)::int as debit, coalesce(sum(credit_cents),0)::int as credit
      from public.billing_entries
      where p_as_of is null or entry_date <= p_as_of
      group by business_id
    ) e on e.business_id = b.id
  ) t;
  return v;
end;
$$;

-- ------------------------- yetkiler --------------------------------- *
revoke all on function public.dv_billing_lines(uuid, text) from public, anon, authenticated;
revoke all on function public.dv_billing_preview(uuid, text) from public, anon;
revoke all on function public.dv_billing_create_invoice(uuid, text, text, date, numeric, text, jsonb, boolean) from public, anon;
revoke all on function public.dv_billing_set_status(uuid, text, date, text, text) from public, anon;
revoke all on function public.dv_billing_balances(date) from public, anon;
grant execute on function public.dv_billing_preview(uuid, text) to authenticated;
grant execute on function public.dv_billing_create_invoice(uuid, text, text, date, numeric, text, jsonb, boolean) to authenticated;
grant execute on function public.dv_billing_set_status(uuid, text, date, text, text) to authenticated;
grant execute on function public.dv_billing_balances(date) to authenticated;
-- (Her admin RPC kendi içinde public.is_admin() ile yetkiyi tekrar doğrular.)
