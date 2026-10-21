-- =============================================================================
-- FAZ 12C-3 (21.10.2026) — KAPSAM ÇOKLU + ÖDEME KAPSAMI + REZERVE SAATİ
--                                + PROFİL TELEFON/ADRES
--
-- Kullanıcı gereksinimleri:
--   1) Müşteri profilinde cep numarası + adres olsun; sipariş formuna
--      OTOMATİK gelsin (profiles.phone VARDI, profiles.address EKLENİYOR).
--   2) Kampanya kapsamı AYRI AYRI işaretlenir: gel-al / rezerve / paket servis
--      (biri, ikisi, üçü veya hepsi). Eski tekli service_mode korunur.
--   3) Ödeme kapsamı AYRI: kapıda/iş yerinde nakit / kart. Kart maliyeti daha
--      yüksek olduğu için örn. "yalnız nakit" kampanya tanımlanabilir
--      (ör. nakite özel %30 indirim).
--   4) Rezerve siparişte REZERVE SAATİ zorunlu (masa planı için).
-- =============================================================================

-- 1) profiles: teslimat adresi (cep telefonu zaten var: profiles.phone)
alter table public.profiles
  add column if not exists address text
  check (address is null or char_length(btrim(address)) <= 300);

-- 2) campaigns: çoklu sipariş tipi kapsamı + ödeme kapsamı
alter table public.campaigns
  add column if not exists service_modes text[] not null default array['GEL_AL','REZERVE','PAKET_SERVIS'],
  add column if not exists payment_scope text[] not null default array['CASH_DOOR','CARD_DOOR'];

alter table public.campaigns drop constraint if exists campaigns_service_modes_check;
alter table public.campaigns
  add constraint campaigns_service_modes_check
  check (cardinality(service_modes) between 1 and 3
         and service_modes <@ array['GEL_AL','REZERVE','PAKET_SERVIS']::text[]);

alter table public.campaigns drop constraint if exists campaigns_payment_scope_check;
alter table public.campaigns
  add constraint campaigns_payment_scope_check
  check (cardinality(payment_scope) between 1 and 2
         and payment_scope <@ array['CASH_DOOR','CARD_DOOR']::text[]);

-- Eski tekli kapsamdan geriye dönük doldurma. Yalnızca daha önce elle
-- değiştirilmemiş (varsayılan "üçü") satırlar güncellenir — tekrar
-- çalıştırılsa bile sahip olduğu özel seçimler bozulmaz.
update public.campaigns
   set service_modes = case service_mode
                          when 'GEL_AL'         then array['GEL_AL']::text[]
                          when 'PAKET_SERVIS'   then array['PAKET_SERVIS']::text[]
                          when 'REZERVE'        then array['REZERVE']::text[]
                          else array['GEL_AL','REZERVE','PAKET_SERVIS']::text[]
                        end
 where service_mode in ('GEL_AL','PAKET_SERVIS','REZERVE')
   and service_modes = array['GEL_AL','REZERVE','PAKET_SERVIS']::text[];

-- Eski tekli kolon artık REZERVE de kabul etsin (eski istemciler için).
alter table public.campaigns drop constraint if exists campaigns_service_mode_check;
alter table public.campaigns
  add constraint campaigns_service_mode_check
  check (service_mode in ('ALL','GEL_AL','PAKET_SERVIS','REZERVE'));

-- 3) orders: rezervasyon saati (masa planı için; REZERVE siparişte zorunlu —
--    zorunluluk uygulama katmanında: app/api/voice/route.ts + widget + motor)
alter table public.orders
  add column if not exists reserved_at timestamptz;

create index if not exists orders_reserved_idx on public.orders (business_id, reserved_at);

-- 4) orders: FAZ 12C ile REZERVE delivery_type olarak eklendi; 0012'deki CHECK
--    yalnız GEL_AL/PAKET_SERVIS'e izin verdiği için REZERVE insert'leri 500
--    veriyordu (canlıda 21.10.2026 tespit + düzeltme).
alter table public.orders drop constraint if exists orders_delivery_type_check;
alter table public.orders
  add constraint orders_delivery_type_check
  check (delivery_type in ('GEL_AL','REZERVE','PAKET_SERVIS'));
