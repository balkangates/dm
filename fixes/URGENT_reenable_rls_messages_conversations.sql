-- =====================================================================
-- fixes/URGENT_reenable_rls_messages_conversations.sql
-- ─────────────────────────────────────────────────────────────────────
-- NEDEN AYRI VE ACİL: diagnose_live_chat_current_state.sql'in sonucu
-- (2026-08-19 tarihli teşhis) messages / conversations /
-- conversation_participants tablolarının ÜÇÜNDE de RLS'in KAPALI
-- olduğunu gösterdi. Mevcut policy'ler (sorgu1 çıktısında görülen 16
-- policy) bu yüzden ŞU AN HİÇ ÇALIŞMIYOR. Eğer bu tablolarda
-- authenticated rolüne GRANT varsa (mesajlaşma özelliği çalıştığına
-- göre büyük ihtimalle var), giriş yapmış HERHANGİ bir kullanıcı TÜM
-- mesajları (özel/DM dahil) ve TÜM konuşmaları doğrudan sorgulayabilir.
--
-- Bu dosya SADECE RLS'i yeniden açar — policy MANTIĞINA dokunmaz,
-- hiçbir policy DROP/CREATE etmez. Mevcut policy'ler zaten mantıklı
-- görünüyor (bkz. PHASE1_1_SONUC_gercek_durum.md); asıl konsolidasyon
-- (bilinmeyen kaynaklı 8 policy'nin incelenmesi, legacy-id istisnasının
-- kaldırılması, vb.) Faz 1.2'de, daha kapsamlı bir dosyada yapılacak.
-- Bu ara-adımın TEK amacı: veri sızıntısı penceresini KAPATMAK, en
-- fazla birkaç dakika içinde, tasarım kararı beklemeden.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN. Tamamen idempotent
-- (ALTER TABLE ... ENABLE ROW LEVEL SECURITY zaten açıksa etkisiz).
-- =====================================================================

BEGIN;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ── Doğrulama 1: RLS gerçekten açıldı mı? ────────────────────────────
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN ('messages', 'conversations', 'conversation_participants');
-- Beklenen: üçü de rls_enabled = true

-- ── Doğrulama 2 (ÖNEMLİ — uygulamadan manuel test): ─────────────────
-- RLS açıldıktan sonra normal kullanım hâlâ çalışıyor mu diye kontrol
-- edin (16 policy OR'landığı için muhtemelen sorunsuz olacak, ama
-- teyit şart):
--   1) Bir mağazanın bayisi olarak /dealer/live sayfasında canlı sohbete
--      mesaj yazıp okuyun.
--   2) Aynı mağazanın müşterisi olarak /store/[storeId] sayfasında
--      canlı sohbeti izleyin — bayinin ve kendi mesajınızı görmelisiniz.
--   3) FARKLI bir mağazanın bayisi/müşterisi olarak giriş yapıp o
--      mağazanın sohbetini görmediğinizi doğrulayın (izolasyon testi).
--   4) Varsa DM (özel mesajlaşma) akışını da aynı şekilde test edin.
-- Herhangi biri kırılırsa, hangi policy'nin eksik/yanlış kaldığını
-- Faz 1.2'de ele alacağız — ama RLS'i tekrar kapatmak ÇÖZÜM DEĞİL.
-- =====================================================================
