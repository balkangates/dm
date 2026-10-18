-- =============================================================================
-- 20261017000004_roles_lowercase_patch.sql
-- v1/v2 veya büyük harfli veri taşıyan veritabanları için İDEMPOTENT yama.
--
-- Ne yapar:
--  1) Hesap rollerini küçük harfe çevirir:  profiles.role / users.role (varsa)
--       ADMIN|BUSINESS|CUSTOMER → admin|business|admin
--  2) Personel rollerini küçük harfe çevirir: business_staff.role
--       OWNER|MANAGER|CASHIER → owner|manager|cashier   (karar a — onaylandı)
--  3) İlgili DEFAULT ve CHECK kısıtlarını küçük harfe günceller.
--  4) Aynı yamayı ikinci kez çalıştırmak ZARARSIZDIR (idempotent).
--
-- NOT: Eski Drizzle/panel katmanı bu yamadan sonra büyük harfli rol okuyamaz;
--      bu bilinçli bir geçiştir (eski katman FAZ 5'te kademeli olarak kaldırılır).
--      is_admin() / is_business_member() fonksiyonları KÜÇÜK/BÜYÜK harfe
--      duyarlı değildir; yama sonrası eski politika metinleri de çalışmaya devam eder.
--
-- Sıra: 00_durum_kontrol_salt_okunur.sql çıktısına göre:
--   tablolar varsa → bu yama, ardından v3 (idempotent) ve faz5 dosyaları.
-- =============================================================================

do $$
declare
  col_min int;
  col_max int;
  c record;
  t text;
begin
  ------------------------------------------------------------------ profiles
  if to_regclass('public.profiles') is not null then
    execute 'update public.profiles set role = lower(role) where role is distinct from lower(role)';
    execute 'alter table public.profiles alter column role set default ''customer''';
    for c in
      select conname from pg_constraint
      where conrelid = 'public.profiles'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) like '%role%'
    loop
      execute format('alter table public.profiles drop constraint %I', c.conname);
    end loop;
    execute 'alter table public.profiles add constraint profiles_role_check check (role in (''customer'',''business'',''admin''))';
    raise notice 'profiles.role küçük harfe çevrildi.';
  end if;

  ------------------------------------------------------- users (eski v1/v2)
  if to_regclass('public.users') is not null then
    execute 'update public.users set role = lower(role) where role is distinct from lower(role)';
    execute 'alter table public.users alter column role set default ''customer''';
    for c in
      select conname from pg_constraint
      where conrelid = 'public.users'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) like '%role%'
    loop
      execute format('alter table public.users drop constraint %I', c.conname);
    end loop;
    -- Eski şemada roller büyük harfli tanımlıydı; her iki biçim de kabul edilir
    -- (taşma sırasında tek tip küçük harf üretir, eski veriyi kırmaz).
    begin
      execute 'alter table public.users add constraint users_role_check check (role in (''customer'',''business'',''admin'',''CUSTOMER'',''BUSINESS'',''ADMIN''))';
    exception
      when duplicate_object then null;
    end;
    raise notice 'users.role küçük harfe çevrildi (varsa).';
  end if;

  ------------------------------------------------------- business_staff
  if to_regclass('public.business_staff') is not null then
    execute 'update public.business_staff set role = lower(role) where role is distinct from lower(role)';
    execute 'alter table public.business_staff alter column role set default ''cashier''';
    for c in
      select conname from pg_constraint
      where conrelid = 'public.business_staff'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) like '%role%'
    loop
      execute format('alter table public.business_staff drop constraint %I', c.conname);
    end loop;
    execute 'alter table public.business_staff add constraint business_staff_role_check check (role in (''owner'',''manager'',''cashier''))';
    raise notice 'business_staff.role küçük harfe çevrildi.';
  end if;

  --------------------------------------------------- kullanıcı/rol kolon genişliği
  -- Bazı eski şemalarda rol kolonu uzunluk CHECK taşır; bilgi amaçlı bırakılır.
  null;
end $$;

-- Yama sonrası durum (salt okunur özet — tablo yoksa hata vermez)
do $$
declare r record; out text := '';
begin
  if to_regclass('public.profiles') is not null then
    select coalesce(string_agg(distinct role, ', ' order by role), 'bos') into r from public.profiles;
    out := out || format('profiles.role: %s; ', r);
  else
    out := out || 'profiles: yok; ';
  end if;
  if to_regclass('public.business_staff') is not null then
    select coalesce(string_agg(distinct role, ', ' order by role), 'bos') into r from public.business_staff;
    out := out || format('business_staff.role: %s', r);
  else
    out := out || 'business_staff: yok';
  end if;
  raise notice 'YAMA SONRASI: %', out;
end $$;;

-- BİTTİ. Bu dosya veri silmez; yalnızca rol değerleri/durum kısıtları güncellenir.
