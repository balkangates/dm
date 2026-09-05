-- =====================================================================
-- fix_live_chat_store_isolation.sql
-- ─────────────────────────────────────────────────────────────────────
-- DÜZELTME: fix_live_chat_legacy_read.sql'de yapılan değişiklik bir
-- GERİLEME (regression) içeriyordu.
--
-- O dosyada messages_live_chat_public_read politikası şuna indirgenmişti:
--     USING ( message_type = 'live' )
-- Yani conversations tablosuyla HİÇ ilişkilendirme kalmamıştı. Bu,
-- store_id=NULL olan legacy konuşmayı okunabilir yaptı (o sorunu
-- çözdü) AMA yan etkisi: artık HERHANGİ bir giriş yapmış kullanıcı,
-- API'yi doğrudan sorgulayarak (uygulama arayüzünü hiç kullanmadan)
-- TÜM mağazaların canlı sohbet mesajlarını okuyabilir hale geldi —
-- birden fazla mağaza aynı anda müşterileriyle yazışıyorsa, RLS
-- seviyesinde mağazalar arası izolasyon YOK oldu. Uygulama arayüzü
-- conversation_id filtresi kullandığı için normal kullanımda ekranda
-- karışma görünmez, ama bu bir güvenlik/gizlilik açığıdır (defense in
-- depth ilkesine aykırı) — bir mağazanın müşterisi başka bir mağazanın
-- özel canlı sohbetini teknik olarak okuyabilir.
--
-- BU DOSYA: mağaza bazlı izolasyonu GERİ GETİRİYOR (her conversation
-- sadece kendi store_id'siyle eşleşen satırları kapsar — ki zaten
-- client tarafında da conversation_id'ye göre filtreleniyor, RLS bunu
-- DB seviyesinde de garanti ediyor) VE SADECE bilinen tek legacy/global
-- konuşmayı (LEGACY_GLOBAL_CONV_ID, storeId verilmediğinde kullanılan
-- sabit) ayrıca istisna olarak izin veriyor — store_id NULL olan
-- BAŞKA/rastgele konuşmaları DEĞİL, sadece bu bilinen tek ID'yi.
--
-- NOT: Bu politika hâlâ "conversation X'e ait mesajları okuyabilir mi"
-- sorusunu conversation bazında cevaplıyor — yani her mağazanın canlı
-- sohbeti kendi conversation_id'si altında izole. Bir mağazanın
-- müşterisi başka bir mağazanın conversation_id'sini BİLMEDİĞİ sürece
-- zaten sorgulayamaz; ama bilse bile store_id şartı sayesinde SADECE o
-- mağazanın kendi conversation'ındaki satırları görür — çapraz
-- mağazalar arası KARIŞMA (aynı sorguda birden fazla mağazanın mesajı
-- aynı anda dönmesi) söz konusu değildir, çünkü her satır kendi
-- conversation_id'sine bağlı kalır.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN. Önceki
-- fix_live_chat_legacy_read.sql çalıştırılmış olsun olmasın fark etmez
-- — bu dosya politikayı DROP + yeniden CREATE ederek üzerine yazar.
-- =====================================================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_live_chat_public_read ON public.messages;
CREATE POLICY messages_live_chat_public_read ON public.messages FOR SELECT
USING (
  message_type = 'live'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (
        c.store_id IS NOT NULL                                    -- normal mağaza sohbeti
        OR c.id = 'e3fc6ac0-5e8f-4bb6-9aa1-ca1d84ddaf73'::uuid     -- SADECE bilinen legacy/global sohbet
      )
  )
);

DROP POLICY IF EXISTS messages_live_chat_insert ON public.messages;
CREATE POLICY messages_live_chat_insert ON public.messages FOR INSERT
WITH CHECK (
  message_type = 'live' AND sender_id = auth.uid()
);

-- ── Doğrulama ────────────────────────────────────────────────────────
-- Her mağazanın kendi conversation_id'si için ayrı ayrı sorgu — hiçbiri
-- diğerinin mesajını içermemeli:
--   SELECT conversation_id, count(*) FROM public.messages
--   WHERE message_type = 'live'
--   GROUP BY conversation_id;
-- (Her satır ayrı bir mağazaya/legacy'e ait — bu zaten her zaman
--  böyleydi, INSERT sırasında doğru conversation_id yazılıyor. Değişen
--  sadece KİMİN okuyabileceği, mesajların hangi conversation'a
--  yazıldığı değil.)
-- =====================================================================
