-- ============================================================
-- FAZ 10 (revize) · Onay akışlı işletme açma
--   1) KALINTI TETİK TEMİZLİĞİ (canlı DB'de FAZ 5 öncesi kilidi kaldırır)
--   2) business_requests — müşteri "İşletme Aç" talepleri (bekleyen)
--   3) dv_business_request      — müşterinin talep göndermesi/upsert
--   4) dv_admin_approve_business— yönetici onayı: businesses + business_staff
--      yazılır, rol customer→business, talep onaylanır
--   5) dv_business_signup kaldırıldı (ani öz-kayıt yerini onay akışına bıraktı)
--
-- Eski "Bu alanlar kullanıcı tarafından değiştirilemez." kilidi FAZ 5 öncesi
-- kalıntı bir tetikten geliyor; profiles_guard (20261019000003) aynı işi
-- güvenli yolla yaptığından kalıntılar düşürülür.
-- ============================================================

-- ---------- BÖLÜM 0 — Kalıntı tetik temizliği (idempotent) ----------
do $$
declare
  r record;
  dropped text := '';
begin
  for r in
    select t.tgname, c.relname as tbl, p.proname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and p.proname <> 'profiles_guard'
      and pg_get_functiondef(p.oid) ilike '%değiştirilemez%'
  loop
    execute format('drop trigger %I on public.%I', r.tgname, r.tbl);
    dropped := dropped || r.tbl || '.' || r.tgname || ' (' || r.proname || '); ';
  end loop;
  if dropped = '' then
    raise notice 'BOLUM 0: kalinti tetik yok (temiz).';
  else
    raise notice 'BOLUM 0 dusuruldu: %', dropped;
  end if;
end $$;

-- ---------- BÖLÜM 1 — business_requests ----------
create table if not exists public.business_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  payload    jsonb not null,
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz
);

create unique index if not exists business_requests_one_pending
  on public.business_requests (user_id) where status = 'pending';
create index if not exists business_requests_status_idx
  on public.business_requests (status);

alter table public.business_requests enable row level security;

drop policy if exists business_requests_insert_own on public.business_requests;
create policy business_requests_insert_own
  on public.business_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists business_requests_select_own on public.business_requests;
create policy business_requests_select_own
  on public.business_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Güncelleme/silme: istemciler için YOK (yalnızca security definer RPC).

-- ---------- BÖLÜM 2 — dv_business_request (talep gönder/upsert) ----------
create or replace function public.dv_business_request(
  p_name        text,
  p_category    text,
  p_district    text,
  p_city        text,
  p_address     text,
  p_phone       text default null,
  p_description text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_req   uuid;
  v_exists uuid;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısınız.';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if not found then
    raise exception 'Hesap profili bulunamadı.';
  end if;
  if v_role = 'admin' then
    raise exception 'Yönetici hesapları işletme açamaz.';
  end if;
  if v_role not in ('customer', 'business') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  -- Zaten bağlı → hata değil, durum döndür
  select business_id into v_exists
  from public.business_staff
  where user_id = v_uid and active
  limit 1;
  if v_exists is not null then
    return jsonb_build_object('already', true, 'business_id', v_exists);
  end if;

  -- Alan doğrulamaları (aynı sınırlar)
  p_name        := nullif(trim(p_name), '');
  p_category    := nullif(trim(p_category), '');
  p_district    := nullif(trim(p_district), '');
  p_city        := coalesce(nullif(trim(p_city), ''), 'İstanbul');
  p_address     := nullif(trim(p_address), '');
  p_phone       := nullif(trim(p_phone), '');
  p_description := nullif(trim(p_description), '');

  if p_name is null or length(p_name) < 2 or length(p_name) > 120 then
    raise exception 'İşletme adı 2-120 karakter olmalı.';
  end if;
  if p_category is null or length(p_category) < 2 or length(p_category) > 60 then
    raise exception 'Kategori 2-60 karakter olmalı.';
  end if;
  if p_district is null or length(p_district) < 2 or length(p_district) > 60 then
    raise exception 'İlçe 2-60 karakter olmalı.';
  end if;
  if length(p_city) < 2 or length(p_city) > 60 then
    raise exception 'İl 2-60 karakter olmalı.';
  end if;
  if p_address is null or length(p_address) < 5 or length(p_address) > 240 then
    raise exception 'Adres 5-240 karakter olmalı.';
  end if;
  if p_phone is not null and (length(p_phone) < 7 or length(p_phone) > 20 or p_phone !~ '^[0-9+() -]+$') then
    raise exception 'Telefon geçerli değil.';
  end if;
  if p_description is not null and length(p_description) > 400 then
    raise exception 'Açıklama en fazla 400 karakter olabilir.';
  end if;

  -- Bekleyen talep varsa güncelle, yoksa aç (tek pending)
  update public.business_requests
     set payload = jsonb_build_object(
           'name', p_name, 'category', p_category, 'district', p_district,
           'city', p_city, 'address', p_address, 'phone', p_phone,
           'description', p_description),
         updated_at = now()
   where user_id = v_uid and status = 'pending';
  if not found then
    insert into public.business_requests (user_id, payload)
    values (v_uid, jsonb_build_object(
             'name', p_name, 'category', p_category, 'district', p_district,
             'city', p_city, 'address', p_address, 'phone', p_phone,
             'description', p_description));
  end if;

  select id into v_req
  from public.business_requests
  where user_id = v_uid and status = 'pending'
  limit 1;

  return jsonb_build_object('request_id', v_req, 'status', 'pending', 'name', p_name);
end;
$$;

-- ---------- BÖLÜM 3 — dv_admin_approve_business (onay) ----------
create or replace function public.dv_admin_approve_business(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  uuid := auth.uid();
  v_email  text;
  v_pname  text;
  v_role   text;
  v_req    public.business_requests%rowtype;
  v_name   text;
  v_category text;
  v_district text;
  v_city   text;
  v_address text;
  v_phone  text;
  v_desc   text;
  v_id     uuid;
  v_slug   text;
  v_base   text;
  v_try    text;
  v_i      int;
  v_exists uuid;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Yönetici yetkisi gerekli.';
  end if;
  if p_user_id is null then
    raise exception 'Kullanıcı gerekli.';
  end if;

  select email, name, role into v_email, v_pname, v_role
  from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Kullanıcı bulunamadı.';
  end if;

  -- Zaten bağlı → mevcut kaydı döndür, bekleyen talepleri kapat
  select business_id into v_exists
  from public.business_staff
  where user_id = p_user_id and active
  limit 1;
  if v_exists is not null then
    update public.business_requests
       set status = 'approved', decided_by = v_admin, decided_at = now(), updated_at = now()
     where user_id = p_user_id and status = 'pending';
    return coalesce(
      (select jsonb_build_object('business_id', b.id, 'slug', b.slug, 'name', b.name, 'already', true)
       from public.businesses b where b.id = v_exists),
      jsonb_build_object('business_id', v_exists, 'already', true));
  end if;

  select * into v_req
  from public.business_requests
  where user_id = p_user_id and status = 'pending'
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'Bekleyen işletme talebi yok. Önce kullanıcının "İşletme Aç" formunu göndermesi gerekir.';
  end if;

  -- Payload doğrulama (defansif — talep zaten sunucuda doğrulanmıştı)
  v_name     := nullif(trim(coalesce(v_req.payload ->> 'name', '')), '');
  v_category := nullif(trim(coalesce(v_req.payload ->> 'category', '')), '');
  v_district := nullif(trim(coalesce(v_req.payload ->> 'district', '')), '');
  v_city     := coalesce(nullif(trim(coalesce(v_req.payload ->> 'city', '')), ''), 'İstanbul');
  v_address  := nullif(trim(coalesce(v_req.payload ->> 'address', '')), '');
  v_phone    := nullif(trim(coalesce(v_req.payload ->> 'phone', '')), '');
  v_desc     := nullif(trim(coalesce(v_req.payload ->> 'description', '')), '');

  if v_name is null or length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Talep verisi geçersiz: işletme adı.';
  end if;
  if v_category is null or length(v_category) < 2 or length(v_category) > 60 then
    raise exception 'Talep verisi geçersiz: kategori.';
  end if;
  if v_district is null or length(v_district) < 2 or length(v_district) > 60 then
    raise exception 'Talep verisi geçersiz: ilçe.';
  end if;
  if v_address is null or length(v_address) < 5 or length(v_address) > 240 then
    raise exception 'Talep verisi geçersiz: adres.';
  end if;

  -- Slug üretimi + benzersizlik
  v_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  v_base := left(v_base, 40);
  if length(v_base) < 2 then
    v_base := 'isletme';
  end if;
  v_slug := null;
  for v_i in 1..50 loop
    v_try := case when v_i = 1 then v_base else v_base || '-' || v_i end;
    if not exists (select 1 from public.businesses where slug = v_try) then
      v_slug := v_try;
      exit;
    end if;
  end loop;
  if v_slug is null then
    v_slug := v_base || '-' || floor(random() * 9000 + 1000)::text;
  end if;

  begin
    insert into public.businesses (slug, name, category, district, city, address, phone, description)
    values (v_slug, v_name, v_category, v_district, v_city, v_address, v_phone, v_desc)
    returning id into v_id;
  exception when unique_violation then
    v_slug := v_base || '-' || floor(random() * 9000 + 1000)::text;
    insert into public.businesses (slug, name, category, district, city, address, phone, description)
    values (v_slug, v_name, v_category, v_district, v_city, v_address, v_phone, v_desc)
    returning id into v_id;
  end;

  insert into public.business_staff (business_id, user_id, name, email, role, active)
  values (v_id, p_user_id, coalesce(v_pname, v_name), coalesce(v_email, 'kayit@dampingvar.demo'), 'owner', true);

  -- profiles_guard: yalnızca bu security definer fonksiyon işaretleyebilir
  perform set_config('dv.trusted_update', 'on', true);
  update public.profiles set role = 'business'
  where id = p_user_id and role = 'customer';

  update public.business_requests
     set status = 'approved', decided_by = v_admin, decided_at = now(), updated_at = now()
   where id = v_req.id;

  return jsonb_build_object(
    'business_id', v_id, 'slug', v_slug, 'name', v_name,
    'user_id', p_user_id, 'already', false);
end;
$$;

-- ---------- BÖLÜM 4 — Eski ani öz-kayıt kaldırıldı ----------
drop function if exists public.dv_business_signup(text, text, text, text, text, text, text, text);

-- ---------- BÖLÜM 5 — Erişim ----------
revoke execute on function public.dv_business_request(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.dv_business_request(text, text, text, text, text, text, text) to authenticated;

revoke execute on function public.dv_admin_approve_business(uuid) from public, anon;
grant execute on function public.dv_admin_approve_business(uuid) to authenticated;

-- ---------- DOĞRULAMA ----------
select c.relname as table_name, t.tgname, p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
order by 1, 2;
