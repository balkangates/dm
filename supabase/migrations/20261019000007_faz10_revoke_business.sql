-- ============================================================
-- FAZ 10 · Onay GERİ ALMA (askıya alma) + onay v3
--
-- Yeni yönetici yeteneği: "Onayla" yanındaki "Geri al" ile işletme
-- askıya alınır:
--   * businesses.suspended_at = now()   → siteden gizlenir
--   * business_staff.active = false      → panel erişimi kapanır
--   * profiles.role: business → customer
--   * business_requests: approved → 'revoked'
--
-- dv_admin_approve_business v3 (create or replace):
--   * "zaten bağlı" dalı artık rolü de 'business'e hizalar + askıdaki
--     işletmeyi askıdan alır (0006'daki rol düzeltmesi buraya katıldı;
--     bu dosya tek başına yeterlidir)
--   * geri alınmış/onaylanmış bir talebi olan kullanıcıda YENİ talep
--     yoksa "restore" yolu: pasif personel kaydı yeniden aktif olur,
--     işletme askıdan alınır, rol business olur
--   * bekleyen talep varsa normal akış (yeni işletme) önceliklidir
--
-- SIRALAMA NOTU: 20261019000006 bu dosyadan ÖNCE çalıştırıldıysa
-- sorun değil (create or replace üstünü yazar).
-- ============================================================

-- ---------- BÖLÜM 0 — askıya alma kolonu ----------
alter table public.businesses
  add column if not exists suspended_at timestamptz;

-- Askıya alınan işletme herkese açık listelerden ve kendi sayfasından düşer
create index if not exists businesses_suspended_idx
  on public.businesses (suspended_at) where suspended_at is not null;

-- ---------- BÖLÜM 1 — talep durumuna 'revoked' ----------
alter table public.business_requests drop constraint if exists business_requests_status_check;
alter table public.business_requests
  add constraint business_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'revoked'));

-- ---------- BÖLÜM 2 — dv_admin_approve_business v3 ----------
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
  v_bname  text;
  v_bslug  text;
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

  -- (1) Zaten AKTİF bağlı → mevcut kaydı döndür, rolü hizala,
  --     askıdaki işletmeyi askıdan al, bekleyen/geçersiz talepleri kapat
  select business_id into v_exists
  from public.business_staff
  where user_id = p_user_id and active
  limit 1;
  if v_exists is not null then
    perform set_config('dv.trusted_update', 'on', true);
    update public.profiles set role = 'business'
     where id = p_user_id and role <> 'business';
    update public.businesses set suspended_at = null
     where id = v_exists and suspended_at is not null;
    update public.business_requests
       set status = 'approved', decided_by = v_admin, decided_at = now(), updated_at = now()
     where user_id = p_user_id and status in ('pending', 'revoked');
    return coalesce(
      (select jsonb_build_object('business_id', b.id, 'slug', b.slug, 'name', b.name, 'already', true)
       from public.businesses b where b.id = v_exists),
      jsonb_build_object('business_id', v_exists, 'already', true));
  end if;

  -- (2) BEKLEYEN talep var → normal akış: yeni işletme açılır
  select * into v_req
  from public.business_requests
  where user_id = p_user_id and status = 'pending'
  order by created_at desc
  limit 1;
  if found then
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
    where id = p_user_id and role <> 'business';

    update public.business_requests
       set status = 'approved', decided_by = v_admin, decided_at = now(), updated_at = now()
     where id = v_req.id;

    return jsonb_build_object(
      'business_id', v_id, 'slug', v_slug, 'name', v_name,
      'user_id', p_user_id, 'already', false);
  end if;

  -- (3) GERİ ALINMIŞ/ONAYLANMIŞ talebi olan (pasif personel kaydı ile)
  --      → askıdan alma (restore): kayıt yeniden aktif, işletme açılır
  select business_id into v_exists
  from public.business_staff
  where user_id = p_user_id and not active
  order by business_id
  limit 1;
  if v_exists is not null then
    update public.business_staff set active = true
     where user_id = p_user_id and business_id = v_exists;
    update public.businesses set suspended_at = null where id = v_exists;
    perform set_config('dv.trusted_update', 'on', true);
    update public.profiles set role = 'business'
     where id = p_user_id and role <> 'business';
    update public.business_requests
       set status = 'approved', decided_by = v_admin, decided_at = now(), updated_at = now()
     where id = (
       select id from public.business_requests
        where user_id = p_user_id and status = 'revoked'
        order by updated_at desc limit 1
     );
    select name, slug into v_bname, v_bslug from public.businesses where id = v_exists;
    return jsonb_build_object(
      'business_id', v_exists, 'slug', v_bslug, 'name', v_bname,
      'user_id', p_user_id, 'already', false, 'restored', true);
  end if;

  raise exception 'Bekleyen işletme talebi yok. Önce kullanıcının "İşletme Aç" formunu göndermesi gerekir.';
end;
$$;

-- ---------- BÖLÜM 3 — dv_admin_revoke_business (yeni) ----------
create or replace function public.dv_admin_revoke_business(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_exists uuid;
  v_bname text;
  v_bslug text;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Yönetici yetkisi gerekli.';
  end if;
  if p_user_id is null then
    raise exception 'Kullanıcı gerekli.';
  end if;

  select business_id into v_exists
  from public.business_staff
  where user_id = p_user_id and active
  limit 1;
  if v_exists is null then
    raise exception 'Kullanıcının aktif işletme bağlantısı yok.';
  end if;

  -- İşletmenin TÜM aktif personel bağlantıları kapatılır (askıya alma)
  update public.business_staff set active = false
   where business_id = v_exists and active;

  -- İşletme herkese açık görünürlükten düşer
  update public.businesses set suspended_at = now()
   where id = v_exists and suspended_at is null;

  -- Onaylanan kullanıcının rolü customer'a döner
  perform set_config('dv.trusted_update', 'on', true);
  update public.profiles set role = 'customer'
   where id = p_user_id and role <> 'customer';

  -- Talep geri alındı olarak işaretlenir (yeniden başvuru yolu açık kalır)
  update public.business_requests
     set status = 'revoked', decided_by = v_admin, decided_at = now(), updated_at = now()
   where user_id = p_user_id and status = 'approved';

  select name, slug into v_bname, v_bslug from public.businesses where id = v_exists;

  return jsonb_build_object(
    'business_id', v_exists, 'slug', v_bslug, 'name', v_bname,
    'user_id', p_user_id, 'revoked', true);
end;
$$;

-- ---------- BÖLÜM 4 — Erişim ----------
revoke execute on function public.dv_admin_approve_business(uuid) from public, anon;
grant execute on function public.dv_admin_approve_business(uuid) to authenticated;
revoke execute on function public.dv_admin_revoke_business(uuid) from public, anon;
grant execute on function public.dv_admin_revoke_business(uuid) to authenticated;

-- ---------- DOĞRULAMA ----------
select p.proname, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('dv_admin_approve_business', 'dv_admin_revoke_business')
order by p.proname;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'businesses' and column_name = 'suspended_at';
