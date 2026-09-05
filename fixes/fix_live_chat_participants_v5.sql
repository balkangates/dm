-- =====================================================================
-- fix_live_chat_participants_v5.sql
-- ─────────────────────────────────────────────────────────────────────
-- v3 ve v4'te sorun tekrar ediyor: aynı "hayalet" conversation_id
-- (var olmayan bir satır) sürekli dönüyor. Bunun kesin sebebini
-- veritabanına doğrudan erişimim olmadığı için %100 teşhis edemiyorum
-- (en olası ihtimal: SQL Editor'de script'in bir kısmı hata verip TÜM
-- transaction'ın rollback olması — CREATE OR REPLACE FUNCTION dahil).
--
-- BU YÜZDEN YAKLAŞIMI DEĞİŞTİRİYORUM: artık "sohbeti bul/oluştur" ve
-- "katılımcı ekle" işlemlerini TAMAMEN AYRI İKİ RPC'YE bölüyorum.
-- Sohbet oluşturma artık aşırı basit — tek INSERT/SELECT, hiçbir
-- EXCEPTION bloğu, hiçbir katılımcı mantığı YOK. Bu RPC'nin döndürdüğü
-- id'nin geçersiz çıkması ARTIK MATEMATİKSEL OLARAK MÜMKÜN DEĞİL
-- (fonksiyon tek bir SELECT ya da tek bir INSERT...RETURNING çalıştırıp
-- onu döndürüyor, araya hiçbir şey giremiyor).
--
-- Katılımcı ekleme, client'ın conversationId'yi aldıktan SONRA ayrıca
-- (best-effort, hata olsa da sohbeti etkilemeyecek şekilde) çağırdığı
-- BAĞIMSIZ bir RPC oldu.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e TEK TEK, sırayla çalıştırın (her
-- bloğu ayrı "Run" ile) — böylece bir blok hata verirse diğerlerini
-- etkilemez, hangi bloğun sorunlu olduğunu da görürsünüz.
-- =====================================================================

-- ── ADIM 1/4: Ana fonksiyon — SADECE sohbeti bul/oluştur, başka hiçbir
--    şey yapmaz. ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_store_live_conversation(p_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_id FROM public.conversations WHERE store_id = p_store_id LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.conversations (store_id, topic, title, is_admin_moderated)
    VALUES (p_store_id, 'general', 'Canlı Yayın Sohbeti', false)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_store_live_conversation(uuid) TO authenticated;

-- ── ADIM 2/4: (conversation_id, user_id) UNIQUE kısıtı — yoksa ekle ────
DO $outer$
BEGIN
  ALTER TABLE public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_user_id_key
    UNIQUE (conversation_id, user_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $outer$;

-- ── ADIM 3/4: Katılımcı ekleme — AYRI, BAĞIMSIZ RPC. Client bunu
--    conversationId geldikten SONRA, best-effort (sonucunu beklemeden/
--    hata olursa yok sayarak) çağırır. ────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_store_live_chat(p_conversation_id uuid, p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner_id uuid;
  v_role text;
BEGIN
  IF v_caller IS NULL THEN RETURN; END IF;

  SELECT owner_id INTO v_owner_id FROM public.stores WHERE id = p_store_id;
  v_role := CASE WHEN v_caller = v_owner_id THEN 'dealer' ELSE 'customer' END;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role, joined_at)
  VALUES (p_conversation_id, v_caller, v_role, now())
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_store_live_chat(uuid, uuid) TO authenticated;

-- ── ADIM 4/4: TEŞHİS — bu iki sorguyu ayrı ayrı çalıştırıp SONUÇLARINI
--    paylaşın, bir sonraki adımı buna göre netleştirelim.

-- 4a) Bu spesifik "hayalet" id gerçekten var mı yok mu?
-- SELECT * FROM public.conversations WHERE id = '70a0c692-d51a-4d98-823b-cba6baf4f318';

-- 4b) Bu mağazaya ait kaç tane conversation satırı var? (Normalde 1 olmalı)
-- SELECT id, store_id, created_at FROM public.conversations
-- WHERE store_id = 'c22ac62e-cf6b-4b2a-9d3e-7380021c931a'
-- ORDER BY created_at;
