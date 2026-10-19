-- ============================================================
-- FAZ 10 · dv_admin_approve_business sertleştirme (v2)
--
-- SORUN (canlıda raporlandı): yönetici "Onayla" dediğinde bazı
-- durumlarda rol customer'da kalabiliyor. Kök neden: fonksiyonun
-- "zaten bağlı" erken-dönüş dalı yalnızca business_staff'a bakıyor;
-- staff kaydı var ama rol customer ise (kısmi sıfırlama / manuel
-- düzeltme sonrası) rol HİÇ güncellenmiyor ve kullanıcı "onay
-- çalışmıyor" durumunda kalıyor.
--
-- DÜZELTME: erken-dönüş dalında da rol 'business'e çevrilir
-- (dv.trusted_update GUC ile profiles_guard'dan geçer) ve bekleyen
-- talepler kapatılır. Aynı zamanda staff kaydı olan ama talebi
-- olmayan kullanıcıda da tutarlı davranış sağlar.
--
-- SQL Editor'de postgres rolüyle çalıştırılır; security definer
-- ile authenticated kullanıcı RPC'yi çağırır.
-- ============================================================

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
  -- VE rolü 'business' ile hizala (staff varsa rol customer olamaz)
  select business_id into v_exists
  from public.business_staff
  where user_id = p_user_id and active
  limit 1;
  if v_exists is not null then
    perform set_config('dv.trusted_update', 'on', true);
    update public.profiles set role = 'business'
     where id = p_user_id and role <> 'business';
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
  where id = p_user_id and role <> 'business';

  update public.business_requests
     set status = 'approved', decided_by = v_admin, decided_at = now(), updated_at = now()
   where id = v_req.id;

  return jsonb_build_object(
    'business_id', v_id, 'slug', v_slug, 'name', v_name,
    'user_id', p_user_id, 'already', false);
end;
$$;

revoke execute on function public.dv_admin_approve_business(uuid) from public, anon;
grant execute on function public.dv_admin_approve_business(uuid) to authenticated;

-- ---------- DOĞRULAMA ----------
select proname, prosecdef from pg_proc
where proname = 'dv_admin_approve_business' and pronamespace = 'public'::regnamespace;
