-- =====================================================================
-- fix_invoice_delivery_note_rls_v2.sql
-- ─────────────────────────────────────────────────────────────────────
-- BU DOSYA fix_invoice_delivery_note_rls.sql'İN SERTLEŞTİRİLMİŞ HÂLİDİR.
-- Orijinal dosya SİLİNMEDİ (referans için fixes/ altında duruyor).
-- Değişenler: (1) tek transaction, (2) anon GRANT'i kaldırıldı,
-- (3) SECURITY DEFINER ön-doğrulaması + gerekçe yorumları eklendi,
-- (4) changelog alanı eklendi.
--
-- SORUN (orijinalden özet): "irsaliye oluşuyor, fatura oluşmuyor
-- [görünmüyor]". Kök neden: store_order_invoices / delivery_notes
-- tabloları CREATE TABLE ile oluşturulurken authenticated rolüne SELECT
-- GRANT'i hiç verilmemiş. RLS açık/kapalı olması PostgREST/istemci
-- açısından fark etmez — GRANT olmadan tablo görünmez.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN. İdempotenttir.
-- Tüm blok TEK transaction içinde çalışır — GRANT ile RLS ENABLE
-- arasında (ayrı ayrı çalıştırılırsa teorik olarak oluşabilecek)
-- "GRANT var ama RLS henüz kapalı" ara-durum penceresi tamamen
-- ortadan kalkar.
-- =====================================================================

BEGIN;

-- ── 0) ÖN-DOĞRULAMA: create_order_documents() gerçekten SECURITY
--      DEFINER mı? ────────────────────────────────────────────────────
-- Bu sorgu bilgi amaçlıdır, script'i durdurmaz; sonucu SQL Editor'ün
-- "Results" panelinde görüp gözle teyit edin. Beklenen: 1 satır,
-- security_type = 'DEFINER'.
SELECT
  routine_name,
  security_type,        -- 'DEFINER' beklenir
  routine_definition IS NOT NULL AS has_body
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'create_order_documents';

-- NEDEN INSERT/UPDATE/DELETE GRANT'İ VERİLMİYOR (BİLİNÇLİ TERCİH):
-- store_order_invoices ve delivery_notes satırları uygulamadan hiçbir
-- zaman doğrudan client (authenticated rolüyle .insert()/.update())
-- tarafından yazılmıyor; tek yazma yolu create_order_documents() RPC'si
-- (fixes/fix_order_documents_before_shipping.sql, satır ~156) ve o
-- fonksiyon SECURITY DEFINER olarak tanımlı — yani fonksiyonu ÇAĞIRAN
-- kullanıcının kendi GRANT'i değil, fonksiyonun SAHİBİNİN (genelde
-- postgres/owner rolü) yetkileri geçerli olur. Bu yüzden authenticated
-- rolüne INSERT/UPDATE/DELETE GRANT vermek gereksiz bir yazma yüzeyi
-- açar (RLS policy'si olmadan sessizce satır eklenebilir riski) ve
-- KASITLI OLARAK atlanmıştır. Yukarıdaki SELECT sorgusunun sonucu
-- 'DEFINER' DEĞİLSE, bu varsayım geçersizdir — bu durumda RPC'yi
-- SECURITY DEFINER'a çevirmeden bu dosyayı production'a uygulamayın.

-- ── 1) ASIL DÜZELTME: eksik SELECT GRANT'i ekle ─────────────────────
-- NOT: anon'a GRANT VERİLMİYOR (v1'den fark). Policy zaten
-- auth.uid() gerektirdiği için anon (girişsiz) rolü hiçbir satır
-- göremeyecekti — grant vermek pratikte zararsız ama gereksiz bir
-- yüzeydi; varsayılan olarak en dar izin ilkesine göre kaldırıldı.
GRANT SELECT ON public.store_order_invoices TO authenticated;
GRANT SELECT ON public.delivery_notes TO authenticated;

-- ── 2) Ek güvenlik: RLS'i aç, sadece ilgililer okusun ───────────────
-- Aynı transaction içinde olduğu için GRANT ile RLS ENABLE arasında
-- "sadece GRANT var, RLS henüz yok" şeklinde geçici bir sızıntı
-- penceresi oluşamaz (COMMIT'e kadar hiçbir değişiklik dışarıdan
-- görünmez).
ALTER TABLE public.store_order_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_order_invoices_owner_read ON public.store_order_invoices;
CREATE POLICY store_order_invoices_owner_read ON public.store_order_invoices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.store_orders so
    JOIN public.stores st ON st.id = so.store_id
    WHERE so.id = store_order_invoices.order_id
      AND (st.owner_id = auth.uid() OR so.customer_id = auth.uid())
  )
);

ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_notes_owner_read ON public.delivery_notes;
CREATE POLICY delivery_notes_owner_read ON public.delivery_notes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.store_orders so
    JOIN public.stores st ON st.id = so.store_id
    WHERE so.id = delivery_notes.order_id
      AND (st.owner_id = auth.uid() OR so.customer_id = auth.uid())
  )
);

COMMIT;

-- ── Doğrulama ────────────────────────────────────────────────────────
-- Uygulamadan (SQL Editor'den değil): dealer olarak /dealer/orders
-- sayfasını yenileyin — "Fatura: FTR-2026-000013" gibi bir satır artık
-- görünmeli (kayıt zaten DB'de duruyordu, sadece okunamıyordu).
--
-- Ek doğrulama: farklı bir mağazanın bayisiyle giriş yapıp o mağazaya
-- ait OLMAYAN bir order_id için store_order_invoices/delivery_notes
-- sorgulayın — 0 satır dönmeli (owner_id/customer_id policy'si çalışıyor
-- demektir).
-- =====================================================================

-- ── CHANGELOG ────────────────────────────────────────────────────────
-- [TARİH]        | [ÇALIŞTIRAN] | [NOT]
-- ______-__-__   | ____________ | İlk uygulama (v2, bu dosya)
-- ______-__-__   | ____________ |
-- =====================================================================
