-- =====================================================================
-- fix_live_chat_final.sql
-- ─────────────────────────────────────────────────────────────────────
-- BULGU: "Bayi mağaza mesaj/chat listesinde customer'ın yazdığı mesaj
-- görünmüyor" — bu, conversation_id UYUŞMAZLIĞI DEĞİL (dealer ve
-- customer aynı store_id → aynı conversation_id'yi çözümlüyor, bkz.
-- fix_live_chat_conversation_rollback.sql). Sorun: public.messages
-- tablosundaki SELECT RLS politikası eksik/eski.
--
-- Bu projede aynı sorunu çözmeye çalışan 3 ÖNCEKİ, BİRBİRİNİ GEÇERSİZ
-- KILAN deneme var:
--   1) fix_live_chat_cross_visibility.sql    → koşul: group_category='live_auction'  (YANLIŞ, hiç eşleşmiyor)
--   2) fix_live_chat_cross_visibility_v2.sql → koşul: store_id IS NOT NULL           (DOĞRU)
--   3) fix_live_chat_participants_v3.sql     → aynı doğru koşul + participants RLS
-- Eğer DB'de bunlardan sadece (1) çalıştırılmışsa ya da HİÇBİRİ
-- çalıştırılmamışsa: customer'ın mesajı INSERT ile başarıyla yazılıyor
-- (INSERT politikası zaten sender_id=auth.uid() ile serbest) ama dealer
-- o satırı SELECT ile OKUYAMIYOR. RLS SELECT engeli hata FIRLATMAZ —
-- sessizce 0 satır döner, bu yüzden konsolda hata da görünmüyor.
--
-- Bu dosya tüm önceki RLS denemelerini GEÇERSİZ KILAR ve tek, kesin,
-- idempotent bir son hal tanımlar. Sırayla/ayrı ayrı hangi eski
-- dosyaların çalıştırıldığından BAĞIMSIZ olarak güvenle çalıştırılabilir.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN.
-- =====================================================================

-- ── 1) messages: RLS aç + SELECT/INSERT politikalarını KESİN hale getir ──
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_live_chat_public_read ON public.messages;
CREATE POLICY messages_live_chat_public_read ON public.messages FOR SELECT
USING (
  message_type = 'live'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id AND c.store_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS messages_live_chat_insert ON public.messages;
CREATE POLICY messages_live_chat_insert ON public.messages FOR INSERT
WITH CHECK (
  message_type = 'live' AND sender_id = auth.uid()
);

-- ── 2) conversations: dealer/customer sohbeti (store_id doluysa) okuyabilsin ──
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_store_chat_read ON public.conversations;
CREATE POLICY conversations_store_chat_read ON public.conversations FOR SELECT
USING (store_id IS NOT NULL);

-- ── 3) conversation_participants RLS (fix_live_chat_participants_v3'ten) ──
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_participants_store_chat_read ON public.conversation_participants;
CREATE POLICY conversation_participants_store_chat_read ON public.conversation_participants FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id AND c.store_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS conversation_participants_self_insert ON public.conversation_participants;
CREATE POLICY conversation_participants_self_insert ON public.conversation_participants FOR INSERT
WITH CHECK (user_id = auth.uid());

-- ── 4) Realtime publication — RLS doğru olsa bile tabloda değilse HİÇ
--        event gitmez (daha temel, ayrı bir sebep). İkisi de garantiye
--        alınıyor.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 5) Doğrulama (isteğe bağlı) — çalıştırıp mevcut politikaları görün:
--    SELECT polname, cmd, qual FROM pg_policies
--    WHERE schemaname='public' AND tablename IN ('messages','conversations','conversation_participants')
--    ORDER BY tablename, cmd;
-- =====================================================================
