-- =============================================================================
-- 00_durum_kontrol_salt_okunur.sql
-- SALT OKUNUR durum tespiti. Hiçbir DDL/DML YOKTUR (yalnızca SELECT).
--
-- Amaç: Supabase SQL editöründe çalıştırıp sonucu paylaşmak. Çıktıya göre
-- TEK bir yol seçilir:
--   1) Tablolar YOK (proje boş)          → 20261017000003_..._v3_...sql
--   2) Tablolar VAR ama roller BÜYÜK harf → 20261017000004_roles_lowercase_patch.sql
--      (sonra v3 ve faz5 dosyaları da idempotent olduğu için güvenle çalışır)
--   3) Roller zaten küçük harf           → yalnızca faz5 dosyası yeterli olabilir;
--      yine de v3 + faz5 tekrar çalıştırılabilir (idempotent).
-- =============================================================================

-- 1) public şemasındaki bilinen tabloların varlığı
select t.table_name,
       case when t.table_name in (
         'profiles','businesses','business_hours','business_staff','business_services',
         'products','business_media','reviews','campaigns','qr_codes','campaign_usages',
         'referrals','bonus_policies','bonus_grants','ai_contents','marketing_plans',
         'marketing_plan_days','video_assets','ad_campaigns','analytics_events','packages',
         'ai_settings','fraud_reviews','audit_logs','service_fee_rules','invoices',
         'invoice_items','saved_campaigns','followed_businesses','notifications',
         'affiliate_networks','affiliate_offers','affiliate_clicks','affiliate_conversions',
         'users'
       ) then 'BILINEN_TABLO' else 'DIGER' end as etiket
from information_schema.tables t
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by 1;

-- 2) Eski (v1/v2) kullanıcı tablosu ve rol biçimi
select 'users tablosu var mı' as kontrol,
       case when to_regclass('public.users') is null then 'YOK (taze şema benzeri)'
            else 'VAR (eski v1/v2 şema)' end as sonucu
union all
select 'profiles tablosu var mı',
       case when to_regclass('public.profiles') is null then 'YOK'
            else 'VAR' end
union all
select 'supabase_migrations şeması',
       case when to_regclass('supabase_migrations.schema_migrations') is null then 'YOK'
            else 'VAR' end;

-- 3) Hesap rolü değerleri (büyük/küçük harf tespiti) — profiles varsa
do $$
begin
  if to_regclass('public.profiles') is not null then
    raise notice 'PROFILES.role değerleri: %',
      (select coalesce(string_agg(distinct role, ', ' order by role), '—') from public.profiles);
  else
    raise notice 'PROFILES tablosu yok.';
  end if;
  if to_regclass('public.users') is not null then
    raise notice 'USERS.role değerleri: %',
      (select coalesce(string_agg(distinct role, ', ' order by role), '—') from public.users);
  else
    raise notice 'USERS tablosu yok.';
  end if;
  if to_regclass('public.business_staff') is not null then
    raise notice 'BUSINESS_STAFF.role değerleri: %',
      (select coalesce(string_agg(distinct role, ', ' order by role), '—') from public.business_staff);
  else
    raise notice 'BUSINESS_STAFF tablosu yok.';
  end if;
end $$;

-- 4) Yardımcı fonksiyonların ve RLS durumunun özeti
select p.proname as fonksiyon, n.nspname as sema, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public') and p.proname like 'dv\_%' or (n.nspname = 'public' and p.proname in ('is_admin','is_business_member','is_business_staff_role'))
order by 1;

select c.relname as tablo, c.relrowsecurity as rls_acik,
       (select count(*) from pg_policy pol where pol.polrelid = c.oid) as policy_sayisi
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 5) Yeni kullanıcı trigger'ı (auth.users üzerinde profil oluşturma) var mı?
select t.tgname as trigger, c.relname as hedef_tablo, p.proname as fonksiyon
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname in ('auth','public')
order by 1;

-- 6) Rollere tanım (GRANT) durumu — Supabase'de anon/authenticated erişimi için
select grantee, table_schema, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('profiles','campaigns','businesses')
  and privilege_type = 'SELECT'
order by 1, 2, 3;

-- BİTTİ. Yukarıdaki çıktıyı paylaşın; hiçbir şey değiştirilmedi.
