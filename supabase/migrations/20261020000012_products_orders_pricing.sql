-- ================================================================== *
-- FAZ 12B — Ürünler, Çift Fiyat ve Sipariş Tipi (20.10.2026)
--
-- Gereksinim: ürün tanımlarken İKİ fiyat —
--   * işletme içi fiyat (gel-al + rezervasyon/içeride) = price_cents
--   * adrese teslim (paket servis / takeaway) fiyatı  = delivery_price_cents
--     (boş bırakılırsa işletme içi fiyat geçerlidir)
-- Kampanya tanımlarken kapsam ZORUNLU seçim:
--   GEL_AL (işletme içi) | PAKET_SERVIS (adrese teslim) | ALL (ikisi)
--   (eski kayıtlar 'ALL' olarak doldurulur — bu alan olmadan创建 edilmişlerdi)
-- Siparişler teslimat tipine göre kaydedilir ve panellerde filtrelenir.
-- ================================================================== *

-- Ürün: adrese teslim fiyatı (opsiyonel — boşsa işletme içi fiyat geçerli)
alter table public.products
  add column if not exists delivery_price_cents integer
  check (delivery_price_cents is null or delivery_price_cents >= 0);

-- Kampanya kapsamı (zorunlu seçim; eski satırlar 'ALL')
alter table public.campaigns
  add column if not exists service_mode text not null default 'ALL'
  check (service_mode in ('ALL','GEL_AL','PAKET_SERVIS'));

-- Sipariş teslimat tipi
alter table public.orders
  add column if not exists delivery_type text not null default 'PAKET_SERVIS'
  check (delivery_type in ('GEL_AL','PAKET_SERVIS'));
