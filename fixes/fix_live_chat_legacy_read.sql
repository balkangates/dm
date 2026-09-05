-- =====================================================================
-- ⚠️ SÜPER EDİLDİ (SUPERSEDED) — fixes/fix_live_chat_store_isolation.sql
--    dosyasını çalıştırın, BU DOSYAYI DEĞİL.
--    Sebep: bu dosyadaki politika (store_id şartını tamamen kaldırma)
--    mağazalar arası izolasyonu bozuyordu — birden fazla mağaza aynı
--    anda müşterileriyle yazışırken RLS seviyesinde herkes herkesin
--    mesajını okuyabilir hale geliyordu. store_isolation.sql aynı NULL
--    store_id sorununu, izolasyonu bozmadan çözüyor.
-- =====================================================================

-- fix_live_chat_legacy_read.sql
-- ─────────────────────────────────────────────────────────────────────
-- KANIT (kullanıcının paylaştığı messages_rows.csv / conversations_rows.csv):
--   Atılan 14 test mesajının TAMAMI conversation_id =
--   'e3fc6ac0-5e8f-4bb6-9aa1-ca1d84ddaf73' (LiveStream.tsx'teki
--   LEGACY_GLOBAL_CONV_ID sabiti) üzerinden gitmiş. Bu konuşmanın
--   store_id sütunu NULL.
--
-- fix_live_chat_final.sql'deki messages_live_chat_public_read politikası
-- şu şartı arıyordu:
--     EXISTS (SELECT 1 FROM conversations c
--             WHERE c.id = messages.conversation_id AND c.store_id IS NOT NULL)
-- store_id NULL olduğu için bu EXISTS hiç sağlanmıyor → RLS bu
-- konuşmadaki HİÇBİR satırı kimseye okutmuyor. Mesajlar INSERT
-- politikası sayesinde yazılabiliyor (o, store_id kontrolü yapmıyor)
-- ama geri okunamıyor — "karşılıklı ekranlarda görünmüyor" belirtisi
-- tam olarak bu.
--
-- ÇÖZÜM: message_type='live' olan satırlar zaten tasarım gereği HERKESE
-- AÇIK bir yayın sohbeti (özel/1:1 mesajlaşma değil) — bu yüzden
-- store_id şartını tamamen kaldırıyoruz. Hem mağazaya özel hem de
-- legacy/global konuşmalar aynı kuralla okunabilir olur, bu sınıf hata
-- bir daha çıkmaz.
--
-- NOT: Özel/1:1 mesajlaşma (message_type != 'live') bu politikadan
-- ETKİLENMİYOR — sadece 'live' tipi satırlar için ek/permissive bir
-- SELECT politikası bu. Diğer message_type'lar için ayrı politikalar
-- (varsa) aynen geçerliliğini korur.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN. fix_live_chat_final.sql
-- çalıştırılmış olsun olmasın fark etmez, bu dosya politikayı DROP +
-- yeniden CREATE ederek üzerine yazar (idempotent).
-- =====================================================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_live_chat_public_read ON public.messages;
CREATE POLICY messages_live_chat_public_read ON public.messages FOR SELECT
USING (
  message_type = 'live'
);

-- INSERT politikası aynı kalıyor (değişmedi, referans için tekrar yazılıyor):
DROP POLICY IF EXISTS messages_live_chat_insert ON public.messages;
CREATE POLICY messages_live_chat_insert ON public.messages FOR INSERT
WITH CHECK (
  message_type = 'live' AND sender_id = auth.uid()
);

-- Doğrulama: artık aşağıdaki sorgu (kendi kullanıcı JWT'niz ile, RLS
-- aktifken) o 14 test mesajının hepsini döndürmeli:
--   SELECT id, message, conversation_id FROM public.messages
--   WHERE conversation_id = 'e3fc6ac0-5e8f-4bb6-9aa1-ca1d84ddaf73';
-- =====================================================================
