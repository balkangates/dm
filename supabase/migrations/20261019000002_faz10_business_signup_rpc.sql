-- ============================================================
-- FAZ 10 · dv_business_signup — "İşletme Aç" öz-kayıt RPC
--
-- Gerekçe: businesses INSERT RLS ile yalnızca admin'e açıktır
--          (businesses_insert_admin · 20261018000001:355-357);
--          kullanıcının kendi işletme kaydı için SECURITY DEFINER
--          fonksiyon gerekir.
--
-- Etki (tek transaction):
--   1) businesses satırı  (slug benzersizliği sağlanır)
--   2) business_staff     (owner = çağıran kullanıcı, active)
--   3) profiles.role      'customer' → 'business'
--
-- Idempotent: kullanıcının zaten bağlı (active) işletmesi varsa
--             mevcut kaydı döndürür, ikinci kez eklemez.
-- Erişim: yalnızca authenticated (anon/public kapalı).
-- ============================================================
create or replace function public.dv_business_signup(
  p_name        text,
  p_category    text,
  p_district    text,
  p_city        text,
  p_address     text,
  p_slug        text default null,
  p_phone       text default null,
  p_description text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_email  text;
  v_pname  text;
  v_id     uuid;
  v_slug   text;
  v_base   text;
  v_try    text;
  v_i      int;
  v_exists uuid;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısınız.';
  end if;

  select role, email, name into v_role, v_email, v_pname
  from public.profiles where id = v_uid;
  if not found then
    raise exception 'Hesap profili bulunamadı.';
  end if;
  if v_role = 'admin' then
    raise exception 'Yönetici hesapları işletme açamaz.';
  end if;
  if v_role not in ('customer', 'business') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  -- Zaten bağlı mı? → mevcut kaydı döndür (idempotent)
  select business_id into v_exists
  from public.business_staff
  where user_id = v_uid and active
  limit 1;
  if v_exists is not null then
    return coalesce(
      (select jsonb_build_object('business_id', b.id, 'slug', b.slug, 'name', b.name, 'already', true)
       from public.businesses b where b.id = v_exists),
      jsonb_build_object('business_id', v_exists, 'already', true));
  end if;

  -- Alan doğrulamaları (uygulama sunucusuyla aynı sınırlar)
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

  -- Slug: uygulama sunucusu slugify() ile üretir; boşsa burada basit üret.
  v_base := trim(both '-' from regexp_replace(lower(coalesce(p_slug, p_name)), '[^a-z0-9]+', '-', 'g'));
  v_base := left(v_base, 40);
  if length(v_base) < 2 then
    v_base := 'isletme';
  end if;

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
    values (v_slug, p_name, p_category, p_district, p_city, p_address, p_phone, p_description)
    returning id into v_id;
  exception when unique_violation then
    -- yarış durumu: slug biri tarafından alınmış → yeni son ek üret
    v_slug := v_base || '-' || floor(random() * 9000 + 1000)::text;
    insert into public.businesses (slug, name, category, district, city, address, phone, description)
    values (v_slug, p_name, p_category, p_district, p_city, p_address, p_phone, p_description)
    returning id into v_id;
  end;

  insert into public.business_staff (business_id, user_id, name, email, role, active)
  values (v_id, v_uid, coalesce(v_pname, p_name), coalesce(v_email, 'kayit@dampingvar.demo'), 'owner', true);

  update public.profiles set role = 'business'
  where id = v_uid and role = 'customer';

  return jsonb_build_object('business_id', v_id, 'slug', v_slug, 'name', p_name, 'already', false);
end;
$$;

-- Erişim: yalnızca girişli kullanıcılar (anon kapalı)
revoke execute on function public.dv_business_signup(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.dv_business_signup(text, text, text, text, text, text, text, text) to authenticated;
