-- =====================================================================
-- fix_dm_customer_store_messaging.sql
-- ─────────────────────────────────────────────────────────────────────
-- KÖK SORUN (rapor edilenle birebir örtüşüyor):
--
-- Mevcut get_or_create_store_live_conversation() RPC'si bir konuşmayı
-- SADECE store_id'ye göre buluyordu:
--
--     SELECT id FROM conversations WHERE store_id = p_store_id LIMIT 1
--
-- customer_id / kimin müşteri olduğu bilgisi conversations tablosunda
-- HİÇ YOK. Sonuç: bir mağazaya giren HER müşteri aynı tek conversation
-- satırına düşüyor (bu, "Canlı Yayın Sohbeti" için kasıtlı ve doğru —
-- TikTok-live tarzı HERKESE AÇIK yayın sohbeti). Ama bu satırdaki
-- sorunun asıl kaynağı: sistemde bunun YANINDA, müşteri ↔ mağaza
-- arasında ÖZEL (1:1) bir mesajlaşma/DM hattı hiç yok. Müşteri mağaza
-- seçince veya "Sor" linkine tıklayınca doğru kişiyle eşleşen özel bir
-- kayıt açılmıyor, kimin kime yazdığı (customer_id / store_id / hangi
-- profiles.id) net ayrışmıyor.
--
-- BU DOSYA NE YAPAR (mevcut CANLI YAYIN SOHBETİNE DOKUNMADAN, TAMAMEN
-- AYRI/EK bir sistem kurar):
--   1) conversations.customer_id sütununu ekler.
--   2) (store_id, customer_id) üzerinde UNIQUE kısıt — bir müşterinin bir
--      mağaza ile HER ZAMAN TEK bir özel konuşması olur; tekrar seçince
--      yeni kayıt AÇILMAZ, var olan bulunur.
--   3) get_or_create_store_dm_conversation(p_store_id) — MÜŞTERİ
--      tarafında çağrılır, (store_id, auth.uid()) eşleşmesine göre
--      konuşmayı bulur/oluşturur.
--   4) list_store_dm_conversations(p_store_id) — BAYİ tarafında
--      çağrılır, o mağazanın TÜM özel müşteri konuşmalarını (kim,
--      son mesaj, okunmamış sayısı) listeler → doğru kişiye doğru
--      cevap verme ekranı için.
--   5) messages tablosuna gelen 'dm' tipi satırlarda conversations
--      tablosundaki last_message_at/preview'i otomatik güncelleyen
--      trigger.
--   6) RLS: bir DM konuşmasını SADECE o konuşmanın müşterisi (customer_id)
--      VEYA o mağazanın sahibi (stores.owner_id) okuyabilir/yazabilir —
--      mağazalar arası ve müşteriler arası çapraz görünürlük YOK.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştırıp RUN. İdempotent'tir —
-- birden fazla kez çalıştırılabilir. LiveStream.tsx / message_type='live'
-- akışını etkilemez.
-- =====================================================================

-- ── 1) conversations.customer_id ────────────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.conversations.customer_id IS
  'Özel (1:1) mağaza-müşteri DM konuşmalarında müşterinin profiles.id''si. '
  'Canlı yayın sohbeti (herkese açık) satırlarında NULL kalır.';

-- ── 1b) "Sor" bağlamı için DOĞRU FK'lar ──────────────────────────────
-- ÖNEMLİ: messages.product_id → public.products(id) ve messages.order_id
-- → public.orders(id) referans veriyor. Ama müşteri tarafındaki ürün
-- kartları public.store_products'tan, "Siparişlerim" listesi de
-- public.store_orders'tan geliyor — İKİSİ DE AYRI TABLO/ID UZAYI.
-- store_products.id / store_orders.id değerlerini olduğu gibi mevcut
-- product_id/order_id sütunlarına yazmak FK ihlaline (23503) yol açar
-- — projede daha önce yaşanan "hayalet id" hatasıyla AYNI SINIF sorun.
-- Bu yüzden "Sor" bağlamı için AYRI, DOĞRU tabloya bağlı iki yeni sütun
-- ekliyoruz; mevcut product_id/order_id sütunlarına DOKUNULMUYOR (başka
-- akışlar — teklif/negotiation vb. — hâlâ onları kullanabilir).
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS store_product_id uuid REFERENCES public.store_products(id),
  ADD COLUMN IF NOT EXISTS store_order_id   uuid REFERENCES public.store_orders(id);

COMMENT ON COLUMN public.messages.store_product_id IS
  'ProductCard "Sor" linkinden gelen mesajlarda ilgili store_products.id.';
COMMENT ON COLUMN public.messages.store_order_id IS
  'Siparişlerim "Sor" linkinden gelen mesajlarda ilgili store_orders.id.';

-- ── 2) Bir müşterinin bir mağazayla TEK özel konuşması olsun ────────
CREATE UNIQUE INDEX IF NOT EXISTS conversations_store_customer_dm_uidx
  ON public.conversations (store_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- ── 3) MÜŞTERİ: mağazayla özel sohbeti bul/oluştur ──────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_store_dm_conversation(p_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_owner   uuid;
  v_conv_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_id INTO v_owner FROM public.stores WHERE id = p_store_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Bayi kendi mağazasıyla "müşteri" olarak DM açamaz — bayi tarafı
  -- list_store_dm_conversations() ile mevcut müşteri konuşmalarını görür.
  IF v_caller = v_owner THEN
    RAISE EXCEPTION 'DEALER_CANNOT_DM_OWN_STORE' USING ERRCODE = 'P0001';
  END IF;

  -- customer_id = v_caller olduğu için bu SELECT sadece BU kullanıcının
  -- BU mağazayla olan konuşmasını bulur — başka müşterinin kaydı asla
  -- dönmez (raporlanan hatanın kaynağı buydu).
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE store_id = p_store_id AND customer_id = v_caller;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations
      (store_id, customer_id, created_by, topic, group_category, title, is_admin_moderated)
    VALUES
      (p_store_id, v_caller, v_caller, 'support', 'customer_rep', 'Mağaza Mesajları', false)
    ON CONFLICT (store_id, customer_id) WHERE customer_id IS NOT NULL
      DO UPDATE SET updated_at = now()
    RETURNING id INTO v_conv_id;
  END IF;

  -- Katılımcı kayıtları — best-effort, nested blok (bkz.
  -- fix_live_chat_conversation_rollback.sql'deki savepoint dersi: dış
  -- INSERT'i etkilemesin diye ayrı bloğa alındı).
  BEGIN
    INSERT INTO public.conversation_participants (conversation_id, user_id, role, joined_at)
    VALUES (v_conv_id, v_caller, 'customer', now())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    INSERT INTO public.conversation_participants (conversation_id, user_id, role, joined_at)
    VALUES (v_conv_id, v_owner, 'dealer', now())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- katılımcı ekleme başarısız olsa bile konuşma id'si geçerli kalır
  END;

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_store_dm_conversation(uuid) TO authenticated;

-- ── 4) BAYİ: mağazasının tüm özel müşteri konuşmalarını listele ────
CREATE OR REPLACE FUNCTION public.list_store_dm_conversations(p_store_id uuid)
RETURNS TABLE (
  conversation_id      uuid,
  customer_id          uuid,
  customer_name        text,
  last_message_at      timestamptz,
  last_message_preview text,
  unread_count         bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner  uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_id INTO v_owner FROM public.stores WHERE id = p_store_id;
  IF v_owner IS NULL OR v_owner <> v_caller THEN
    RAISE EXCEPTION 'NOT_STORE_OWNER' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.customer_id,
    COALESCE(p.company_name, p.full_name, p.rumuz, 'Müşteri'),
    c.last_message_at,
    c.last_message_preview,
    (
      SELECT count(*) FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.message_type = 'dm'
        AND m.sender_id = c.customer_id
        AND m.is_read = false
    )
  FROM public.conversations c
  JOIN public.profiles p ON p.id = c.customer_id
  WHERE c.store_id = p_store_id AND c.customer_id IS NOT NULL
  ORDER BY c.last_message_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_store_dm_conversations(uuid) TO authenticated;

-- ── 5) 'dm' mesajı gelince conversations özet alanlarını güncelle ──
CREATE OR REPLACE FUNCTION public.touch_dm_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.message_type = 'dm' AND NEW.conversation_id IS NOT NULL THEN
    UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = left(NEW.message, 140),
        updated_at = now()
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_dm_conversation ON public.messages;
CREATE TRIGGER trg_touch_dm_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_dm_conversation_on_message();

-- ── 6) RLS — sadece müşterisi ve mağaza sahibi görsün/yazsın ────────
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_dm_participants_read ON public.conversations;
CREATE POLICY conversations_dm_participants_read ON public.conversations FOR SELECT
USING (
  customer_id IS NOT NULL
  AND (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = conversations.store_id AND s.owner_id = auth.uid())
  )
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_dm_participants_read ON public.messages;
CREATE POLICY messages_dm_participants_read ON public.messages FOR SELECT
USING (
  message_type = 'dm'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.customer_id IS NOT NULL
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = auth.uid())
      )
  )
);

DROP POLICY IF EXISTS messages_dm_participants_insert ON public.messages;
CREATE POLICY messages_dm_participants_insert ON public.messages FOR INSERT
WITH CHECK (
  message_type = 'dm'
  AND sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.customer_id IS NOT NULL
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = auth.uid())
      )
  )
);

DROP POLICY IF EXISTS messages_dm_participants_update ON public.messages;
CREATE POLICY messages_dm_participants_update ON public.messages FOR UPDATE
USING (
  message_type = 'dm'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.customer_id IS NOT NULL
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = auth.uid())
      )
  )
);

-- Realtime — dealer gelen-kutusu ve müşteri widget'ı anlık güncellensin.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Doğrulama (isteğe bağlı) ─────────────────────────────────────────
--  SELECT id, store_id, customer_id, last_message_preview FROM public.conversations
--  WHERE customer_id IS NOT NULL ORDER BY last_message_at DESC LIMIT 20;
-- =====================================================================
