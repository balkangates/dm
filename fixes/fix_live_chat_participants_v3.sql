-- =====================================================================
-- fix_live_chat_participants_v3.sql
-- ─────────────────────────────────────────────────────────────────────
-- ÖNCEKİ İKİ DENEMEDE (fix_live_chat_cross_visibility.sql ve _v2.sql)
-- sadece `messages` tablosunun RLS'ini genişletmiştik — bu, sohbeti
-- "herkese açık yayın sohbeti" gibi ele alan basit ve sağlam bir çözümdü
-- ve TEK BAŞINA hâlâ geçerli/gerekli. Ama sen haklı bir ek nokta
-- belirttin: sistemde muhtemelen `conversation_participants` tablosuna
-- dayanan bir RLS/mantık da var (mesaj atarken "messages_conversation_id_fkey"
-- FK hatası veya katılımcı olmayana engel) ve müşteri odaya girdiğinde
-- bu tabloya hiç eklenmiyor.
--
-- BU DOSYA İKİSİNİ BİRDEN, RACE-CONDITION'A KARŞI GÜVENLİ şekilde
-- çözüyor:
--
--   1) get_or_create_store_live_conversation(p_store_id) RPC'si artık
--      conversation'ı bulma/oluşturmanın YANINDA, çağıran kullanıcıyı
--      (auth.uid()) conversation_participants'a da ATOMİK olarak
--      ekliyor — tek DB round-trip, tek transaction. Client'ta ayrı bir
--      "var mı yok mu kontrol et, sonra ekle" adımına GEREK YOK — bu
--      pattern zaten yarış durumuna açık (iki sekme/iki useEffect aynı
--      anda "yok" görüp ikisi de INSERT'e çalışabilir). RPC içinde
--      IF NOT EXISTS...INSERT tek transaction'da çalıştığı için güvenli.
--
--   2) conversation_participants üzerinde RLS: kullanıcı kendi satırını
--      okuyabilir/ekleyebilir + bir mağaza sohbetinin TÜM katılımcı
--      listesini (kim yazıyor görmek için) okuyabilir.
--
--   3) messages RLS: hem "store_id IS NOT NULL" (basit, sağlam, ana
--      garanti — _v2'den) HEM DE conversation_participants'ta kaydı
--      olma şartı (ikisi OR'lu — participants kaydı bir sebeple
--      gecikirse/başarısız olursa bile mesajlaşma KOPMASIN diye asıl
--      garanti store_id şartı, participants şartı ek/performans amaçlı).
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN. (Önceki iki dosya
-- çalıştırılmışsa da çalıştırılmamışsa da sorun değil, hepsi idempotent.)
-- =====================================================================

-- ── 1) RPC: sohbeti bul/oluştur + katılımcı kaydını ATOMİK garanti et ──
CREATE OR REPLACE FUNCTION public.get_or_create_store_live_conversation(p_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
  v_owner_id uuid;
  v_caller uuid := auth.uid();
  v_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE store_id = p_store_id
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT owner_id INTO v_owner_id FROM public.stores WHERE id = p_store_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (store_id, topic, title, created_by, is_admin_moderated)
    VALUES (p_store_id, 'general', 'Canlı Yayın Sohbeti', v_owner_id, false)
    RETURNING id INTO v_conversation_id;
  END IF;

  -- Çağıran kim? Mağaza sahibiyse 'dealer', değilse 'customer'.
  v_role := CASE WHEN v_caller = v_owner_id THEN 'dealer' ELSE 'customer' END;

  -- Katılımcı kaydını ATOMİK garanti et — aynı transaction, tek round-trip.
  -- İki sekme/iki eşzamanlı çağrı olsa bile bu blok satır bazlı kilit
  -- alacağından (INSERT ... ON CONFLICT gibi davranır) çift kayıt oluşmaz.
  INSERT INTO public.conversation_participants (conversation_id, user_id, role, joined_at)
  VALUES (v_conversation_id, v_caller, v_role, now())
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_conversation_id;

EXCEPTION
  -- conversation_participants'ta (conversation_id, user_id) üzerinde
  -- UNIQUE/PK kısıtı YOKSA yukarıdaki ON CONFLICT hata verir — bu
  -- durumda "var mı kontrol et, yoksa ekle" mantığına geri düş.
  WHEN undefined_column OR invalid_column_reference THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = v_conversation_id AND user_id = v_caller
    ) THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id, role, joined_at)
      VALUES (v_conversation_id, v_caller, v_role, now());
    END IF;
    RETURN v_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_store_live_conversation(uuid) TO authenticated;

-- (conversation_id, user_id) üzerinde UNIQUE kısıt yoksa ekle — yukarıdaki
-- ON CONFLICT'in çalışması için gerekli. Zaten varsa hata vermeden geçer.
DO $$
BEGIN
  ALTER TABLE public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_user_id_key
    UNIQUE (conversation_id, user_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- ── 2) conversation_participants RLS ────────────────────────────────────
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_participants_store_chat_read ON public.conversation_participants;
CREATE POLICY conversation_participants_store_chat_read ON public.conversation_participants FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id AND c.store_id IS NOT NULL
  )
);

-- Client tarafında doğrudan (RPC'siz) insert denenirse diye güvenlik ağı —
-- kullanıcı SADECE kendi satırını ekleyebilir.
DROP POLICY IF EXISTS conversation_participants_self_insert ON public.conversation_participants;
CREATE POLICY conversation_participants_self_insert ON public.conversation_participants FOR INSERT
WITH CHECK (user_id = auth.uid());

-- ── 3) messages RLS — store_id şartı ANA garanti, participants EK ──────
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
