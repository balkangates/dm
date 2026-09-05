-- =====================================================================
-- fix_live_chat_cross_visibility_v2.sql
-- ─────────────────────────────────────────────────────────────────────
-- ÖNCEKİ DÜZELTME NEDEN İŞE YARAMADI?
--
-- fix_live_chat_cross_visibility.sql'deki RLS politikası şu koşulu
-- arıyordu:
--     c.group_category = 'live_auction'
--
-- Ama `get_or_create_store_live_conversation()` RPC'sinin GERÇEK/GÜNCEL
-- hâli (fix_store_live_chat.sql) conversations satırını INSERT ederken
-- `group_category` diye bir alana HİÇ değer yazmıyor:
--
--     INSERT INTO public.conversations
--       (store_id, topic, title, created_by, is_admin_moderated)
--     VALUES (...)
--
-- Yani mağaza canlı sohbetleri gerçekte `store_id` ile ayırt ediliyor,
-- `group_category='live_auction'` ile DEĞİL. Önceki politika hiçbir
-- zaman eşleşmedi — sessizce hiçbir şey açmadı, bu yüzden "her iki
-- taraf da sadece kendi yazdığını görüyor" sorunu AYNEN devam etti.
--
-- Bu dosya, aynı politikayı DOĞRU koşulla (c.store_id IS NOT NULL)
-- yeniden tanımlıyor.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN. (Önceki
-- fix_live_chat_cross_visibility.sql çalıştırılmış olsa da olmasa da
-- fark etmez, bu dosya politikayı DROP + yeniden CREATE ediyor.)
-- =====================================================================

-- 0) TEŞHİS (isteğe bağlı ama önerilir) — çalıştırıp mevcut durumu görün:
--    SELECT polname, cmd, qual FROM pg_policies
--    WHERE schemaname='public' AND tablename='messages';
--
--    SELECT id, store_id, group_category, topic FROM public.conversations
--    WHERE store_id IS NOT NULL LIMIT 5;
--    (group_category sütunu NULL/boş çıkacaktır — bu, sorunun kanıtı.)

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Önceki (yanlış koşullu) politikayı temizle
DROP POLICY IF EXISTS messages_live_chat_public_read ON public.messages;

-- DOĞRU koşulla yeniden oluştur: conversation'ın store_id'si varsa
-- (yani bu bir mağaza canlı sohbetiyse) ve mesaj message_type='live'
-- ise, giriş yapmış HERHANGİ bir kullanıcı okuyabilir.
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

-- Realtime publication'ında olduğundan emin ol (RLS'ten bağımsız, daha
-- temel bir sebep — tabloda değilse hiçbir event gitmez).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- conversations tablosunun kendisi de SELECT edilebiliyor mu kontrol
-- edin — messages okunsa bile LiveStream.tsx'in ilk adımı
-- get_or_create_store_live_conversation RPC'si (SECURITY DEFINER
-- olduğu için RLS'i zaten bypass ediyor, bu adım sorun olmamalı) ama
-- garanti olsun diye conversations üzerinde de aynı mantıkla bir okuma
-- politikası ekliyoruz.
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_store_chat_read ON public.conversations;
CREATE POLICY conversations_store_chat_read ON public.conversations FOR SELECT
USING (store_id IS NOT NULL);
