-- ================================================================== *
-- FAZ 12C — Güvenli sipariş + işletme mod ayarları + fiş/fiyat (21.10.2026)
--
-- 1) SİPARİŞ ARTIK YALNCA GİRİŞ YAPMIŞ MÜŞTERİ (canlı testte doğrulanan
--    misafir RLS engeli bu kararla kökten kalkar):
--      * orders_insert_self (customer_id = auth.uid()) mevcut politikası
--        korunur; misafir insert politikası EKLENMEZ.
--      * API tarafı oturum zorunlu (401).
-- 2) DEDUPE: security definer RPC (misafirde select RLS'te kör
--    kaldığından; oturumlu akışta da tek noktadan).
-- 3) İŞLETME AYARLARI (varsayılan: tüm modlar KAPALI — işletme isterse
--    açar; "sipariş alıyorum" anahtarı + otomatik fiş yazdırma):
--    businesses: mode_gel_al / mode_rezerve / mode_paket_servis /
--                accepting_orders / order_autoprint / kdv_rate
-- 4) KDV: işletme varsayılanı (0/1/10/18/20) + ürün bazlı override.
-- 5) ÜRÜN NOTLARI/EKSTRALARI: products.options (jsonb ad listesi —
--    örn. Turşu, Biber, Ketçap, Mayonez); sipariş kalemlerine
--    "olsun/olmasın" tercihiyle taşınır.
-- 6) SİPARİŞ DÖKÜMÜ: matrah → kampanya indirimi → KDV → ödenecek.
-- ================================================================== *

-- --------------------- dedupe (security definer) -------------------- *
create or replace function public.dv_order_recent_exists(
  p_business_id uuid,
  p_phone text,
  p_since timestamptz
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    where o.business_id = p_business_id
      and o.customer_phone = p_phone
      and o.created_at >= p_since
  );
$$;

grant execute on function public.dv_order_recent_exists(uuid, text, timestamptz)
  to anon, authenticated, service_role;

-- --------------------- işletme sipariş ayarları -------------------- *
alter table public.businesses
  add column if not exists mode_gel_al boolean not null default false,
  add column if not exists mode_paket_servis boolean not null default false,
  add column if not exists mode_rezerve boolean not null default false,
  add column if not exists accepting_orders boolean not null default true,
  add column if not exists order_autoprint boolean not null default true,
  add column if not exists kdv_rate integer not null default 20
    check (kdv_rate in (0, 1, 10, 18, 20));

-- --------------------- ürünler: notlar + KDV ----------------------- *
alter table public.products
  add column if not exists options jsonb not null default '[]',
  add column if not exists kdv_rate integer
    check (kdv_rate is null or kdv_rate in (0, 1, 10, 18, 20));

-- --------------------- sipariş döküm kolonları --------------------- *
alter table public.orders
  add column if not exists subtotal_cents integer not null default 0,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists kdv_cents integer not null default 0,
  add column if not exists campaign_title text;
