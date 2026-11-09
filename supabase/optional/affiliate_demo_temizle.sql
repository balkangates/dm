-- OPSİYONEL — migration değildir, otomatik çalışmaz. Supabase SQL Editor'de elle çalıştırın.
-- Amaç: gerçek moda geçerken eski "örnek/demo" affiliate kayıtlarını vitrinden kaldırmak.
-- Kayıtlar SİLİNMEZ (tıklama/dönüşüm geçmişi korunur); yalnızca süresi doldu olarak işaretlenir.

-- 1) Önce etkilenecek kayıtlara bakın:
select id, merchant, title, status, is_sample, clicks
from public.affiliate_offers
where is_sample = true;

-- 2) Onaylıyorsanız çalıştırın:
update public.affiliate_offers
   set status = 'EXPIRED', last_updated = now()
 where is_sample = true and status <> 'EXPIRED';
