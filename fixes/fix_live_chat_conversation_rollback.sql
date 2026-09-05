-- =====================================================================
-- fix_live_chat_conversation_rollback.sql
-- ─────────────────────────────────────────────────────────────────────
-- GERÇEK KÖK NEDEN (messages_conversation_id_fkey / 23503):
--
-- fix_live_chat_participants_v3.sql'deki get_or_create_store_live_conversation()
-- fonksiyonu TÜM gövdeyi (conversations INSERT'i DAHİL) tek bir
-- BEGIN...EXCEPTION...END bloğunda çalıştırıyordu:
--
--   BEGIN
--     ...
--     INSERT INTO conversations (...) RETURNING id INTO v_conversation_id;  -- (A)
--     ...
--     INSERT INTO conversation_participants (...)
--       ON CONFLICT (conversation_id, user_id) DO NOTHING;                  -- (B)
--     RETURN v_conversation_id;
--   EXCEPTION WHEN undefined_column OR invalid_column_reference THEN
--     ...
--     RETURN v_conversation_id;
--   END;
--
-- PL/pgSQL'de bir EXCEPTION bloğu, o bloğa girişte ÖRTÜK bir SAVEPOINT
-- açar. (B) adımında HERHANGİ bir hata oluşup EXCEPTION tarafından
-- yakalandığında, Postgres o savepoint'e geri sarar — bu da (A)'da az
-- önce COMMIT olmamış (henüz transaction içinde) conversations INSERT'ini
-- de GERİ ALIR. Ama v_conversation_id bir PL/pgSQL DEĞİŞKENİ olduğu için
-- rollback'ten etkilenmiyor, değerini koruyor. Fonksiyon sonunda artık
-- DB'de HİÇ VAR OLMAYAN bu id'yi RETURN ediyor. Frontend bunu geçerli
-- sanıp messages.conversation_id olarak kullanıyor → INSERT INTO messages
-- → FK ihlali (23503, "Key is not present in table conversations").
-- Rapor edilen ID (70a0c692-...) tam olarak bu şekilde: kodda hardcode
-- edilmiş DEĞİL, DB'de rollback edilmiş, hiç var olmamış bir kayıt.
--
-- ÇÖZÜM: Katılımcı ekleme adımını (B) AYRI, İÇ İÇE (nested) bir
-- BEGIN...EXCEPTION...END bloğuna alıyoruz. Bu iç bloğun KENDİ savepoint'i
-- olduğu için, içindeki bir hata SADECE o alt-adımı geri alır — dıştaki
-- conversations INSERT'i (A) ASLA etkilenmez. Fonksiyon her zaman
-- GERÇEKTEN COMMIT OLMUŞ/var olan bir conversation id döndürür.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN. Önceki v3 dosyası
-- çalıştırılmış olsun olmasın fark etmez — bu dosya fonksiyonu
-- CREATE OR REPLACE ile güvenli şekilde üzerine yazar, idempotent'tir.
-- =====================================================================

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

  -- Önce mağazanın gerçekten var olduğunu doğrula (yok yere conversation
  -- oluşturmayı engeller).
  SELECT owner_id INTO v_owner_id FROM public.stores WHERE id = p_store_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE store_id = p_store_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- ── (A) Sohbeti oluştur — bu adım artık HİÇBİR alt-adımın hatasından
  --        etkilenmeyecek, çünkü kendi dışında ayrı bir EXCEPTION bloğu
  --        yok. Bu satır COMMIT olursa (fonksiyon başarıyla dönerse veya
  --        çağıran taraf transaction'ı commit ederse) kalıcıdır.
  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (store_id, topic, title, created_by, is_admin_moderated)
    VALUES (p_store_id, 'general', 'Canlı Yayın Sohbeti', v_owner_id, false)
    RETURNING id INTO v_conversation_id;
  END IF;

  v_role := CASE WHEN v_caller = v_owner_id THEN 'dealer' ELSE 'customer' END;

  -- ── (B) Katılımcı ekle — AYRI/nested blok. Buradaki HERHANGİ bir hata
  --        (unique constraint eksik/42P10, geçici bir sorun, vb.) SADECE
  --        bu alt-bloğun kendi savepoint'ine geri sarar. Yukarıdaki (A)
  --        adımı (conversations INSERT'i) KESİNLİKLE etkilenmez.
  BEGIN
    INSERT INTO public.conversation_participants (conversation_id, user_id, role, joined_at)
    VALUES (v_conversation_id, v_caller, v_role, now())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- ON CONFLICT hedefi (unique constraint) her nedense yoksa/hata
    -- verirse: "var mı kontrol et, yoksa ekle" mantığına düş.
    IF NOT EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = v_conversation_id AND user_id = v_caller
    ) THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id, role, joined_at)
      VALUES (v_conversation_id, v_caller, v_role, now());
    END IF;
  END;

  -- v_conversation_id burada HER ZAMAN gerçekten var olan/kalıcı bir
  -- conversations.id'sidir — (B)'de ne olursa olsun (A) geri alınmadı.
  RETURN v_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_store_live_conversation(uuid) TO authenticated;

-- (conversation_id, user_id) üzerinde UNIQUE kısıt yoksa ekle — ON CONFLICT
-- için gerekli. Zaten varsa hata vermeden geçer (idempotent).
DO $$
BEGIN
  ALTER TABLE public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_user_id_key
    UNIQUE (conversation_id, user_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- storeId verilmediğinde (eski genel hero) kullanılan sabit
-- LEGACY_GLOBAL_CONV_ID'nin conversations tablosunda var olduğundan emin ol
-- — aksi halde aynı FK hatası oradan da gelebilir.
INSERT INTO public.conversations (id, topic, title, is_admin_moderated)
VALUES ('e3fc6ac0-5e8f-4bb6-9aa1-ca1d84ddaf73', 'general', 'Genel Canlı Yayın Sohbeti', false)
ON CONFLICT (id) DO NOTHING;
