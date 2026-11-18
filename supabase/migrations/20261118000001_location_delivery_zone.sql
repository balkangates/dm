-- =============================================================================
-- KONUM + TESLİMAT BÖLGESİ (18.11.2026)
--  * businesses.delivery_radius_km : işletme profili çevresinde teslimat yarıçapı (km). NULL = sınırsız.
--  * profiles.lat / lng            : müşterinin kayıtlı adresinin konumu (adres kaydedilince otomatik).
--  businesses.lat / lng zaten var; adres kaydedilince uygulama otomatik doldurur.
-- Tekrar çalıştırılabilir (idempotent).
-- =============================================================================
alter table public.businesses
  add column if not exists delivery_radius_km numeric(6,1);

alter table public.businesses drop constraint if exists businesses_delivery_radius_chk;
alter table public.businesses
  add constraint businesses_delivery_radius_chk
  check (delivery_radius_km is null or (delivery_radius_km > 0 and delivery_radius_km <= 200));

alter table public.profiles
  add column if not exists lat double precision,
  add column if not exists lng double precision;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='businesses' and column_name='delivery_radius_km') then
    raise exception 'businesses.delivery_radius_km oluşmadı';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='lat') then
    raise exception 'profiles.lat oluşmadı';
  end if;
end $$;
