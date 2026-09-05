-- =====================================================================
-- fixes/fix_live_chat_consolidated_final.sql
-- ─────────────────────────────────────────────────────────────────────
-- BU DOSYA fix_store_live_chat / fix_live_chat_cross_visibility(_v2) /
-- fix_live_chat_participants_v3 / fix_live_chat_conversation_rollback /
-- fix_live_chat_final / fix_live_chat_legacy_read / fix_live_chat_
-- store_isolation / fix_live_chat_participants_v5 (9 dosya) SERİSİNİN
-- TAMAMINI SÜPERSEDED EDER. Bundan sonra messages/conversations/
-- conversation_participants üzerinde değişiklik gerekirse BU DOSYAYI
-- düzenleyin, yeni fix_live_chat_*.sql dosyası AÇMAYIN.
--
-- DAYANAK: 2026-08-19 tarihli canlı-DB teşhisi (bkz.
-- PHASE1_1_SONUC_gercek_durum.md) + kullanıcı tarafından doğrulanmış
-- 3 fonksiyonel test (mağazalar arası izolasyon ✅, aynı mağaza içinde
-- çift yönlü canlı sohbet görünürlüğü ✅, DM ✅ — hepsi RLS yeniden
-- açıldıktan SONRA test edildi).
--
-- TASARIM İLKESİ: Bu migration, ŞU AN ÇALIŞAN davranışı KORUR — yeni
-- bir davranış icat etmez. PART 1 mevcut aktif durumu (16 policy'nin
-- gerekli olan kısmı + gerçek fonksiyon gövdesi) idempotent şekilde
-- YENİDEN yazıp tek dosyaya sabitler (fonksiyonel değişiklik YOK).
-- PART 2, teşhiste "ölü kod" olarak doğrulanmış (0 satıra karşılık
-- gelen / kod tabanından hiç çağrılmayan) parçaları temizler — her biri
-- gerekçesiyle ayrı ayrı işaretli, isterseniz PART 2'yi atlayıp sadece
-- PART 1'i çalıştırabilirsiniz.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN. Tamamen idempotent.
-- =====================================================================

BEGIN;

-- =====================================================================
-- PART 1 — MEVCUT ÇALIŞAN DURUMU SABİTLE (fonksiyonel değişiklik yok)
-- =====================================================================

-- ── 1a) RLS açık (zaten açık, garanti altına alınıyor) ──────────────
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- ── 1b) messages: temel (sender/receiver/admin) + canlı sohbet + DM ──
-- NOT: "msg_select/msg_insert/msg_update" (kaynağı repoda bulunamayan,
-- muhtemelen Dashboard'dan elle eklenmiş policy'ler) burada AYNEN
-- korunuyor — DM akışının bir kısmı (receiver_id tabanlı) ve admin
-- erişimi buna dayanıyor, testte "DM doğru çalışıyor" onayı bu
-- policy'lerin AKTİF olduğu durumda alındı. İsimlerini SADECE
-- standardize ediyoruz (msg_ prefix yerine messages_ prefix), MANTIĞA
-- dokunmuyoruz.
DROP POLICY IF EXISTS msg_select ON public.messages;
DROP POLICY IF EXISTS messages_base_participant_or_admin_read ON public.messages;
CREATE POLICY messages_base_participant_or_admin_read ON public.messages FOR SELECT
USING (
  (sender_id = auth.uid())
  OR (receiver_id = auth.uid())
  OR (
    message_type = 'live' AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND c.store_id IS NOT NULL
    )
  )
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS msg_insert ON public.messages;
DROP POLICY IF EXISTS messages_base_sender_insert ON public.messages;
CREATE POLICY messages_base_sender_insert ON public.messages FOR INSERT
WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS msg_update ON public.messages;
DROP POLICY IF EXISTS messages_base_participant_or_admin_update ON public.messages;
CREATE POLICY messages_base_participant_or_admin_update ON public.messages FOR UPDATE
USING (
  (sender_id = auth.uid())
  OR (receiver_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- Canlı sohbete özel SELECT/INSERT — base policy zaten live mesajları
-- kapsıyor (1b'deki OR koşulu) ama INSERT tarafında message_type='live'
-- şartını AYRICA netleştiren bu policy'yi de koruyoruz (defense in
-- depth — base policy'nin sender_id şartı tek başına yeterli olsa da,
-- iki policy OR'landığı için zarar vermiyor, kaldırmak risk/fayda
-- açısından gereksiz).
DROP POLICY IF EXISTS messages_live_chat_insert ON public.messages;
CREATE POLICY messages_live_chat_insert ON public.messages FOR INSERT
WITH CHECK (message_type = 'live' AND sender_id = auth.uid());

-- ── 1c) conversations: temel + canlı sohbet + DM okuma ──────────────
DROP POLICY IF EXISTS conv_select_participant_or_live_or_admin ON public.conversations;
DROP POLICY IF EXISTS conversations_base_participant_or_admin_read ON public.conversations;
CREATE POLICY conversations_base_participant_or_admin_read ON public.conversations FOR SELECT
USING (
  (store_id IS NOT NULL)
  OR (created_by = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS conv_insert_authenticated ON public.conversations;
DROP POLICY IF EXISTS conversations_base_authenticated_insert ON public.conversations;
CREATE POLICY conversations_base_authenticated_insert ON public.conversations FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

DROP POLICY IF EXISTS conv_update_owner_or_admin ON public.conversations;
DROP POLICY IF EXISTS conversations_base_owner_or_admin_update ON public.conversations;
CREATE POLICY conversations_base_owner_or_admin_update ON public.conversations FOR UPDATE
USING (
  (created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- (fix_dm_customer_store_messaging.sql'den — DOKUNULMUYOR, aynen
-- korunuyor, test edildi ve çalışıyor)
-- conversations_dm_participants_read, messages_dm_participants_read/
-- insert/update policy'leri BU DOSYADA YENİDEN YAZILMIYOR — zaten
-- doğru ve aktifler, karıştırmamak için olduğu gibi bırakılıyor.

-- ── 1d) conversation_participants ────────────────────────────────────
DROP POLICY IF EXISTS cp_select_self_or_admin ON public.conversation_participants;
DROP POLICY IF EXISTS conversation_participants_store_chat_read ON public.conversation_participants;
DROP POLICY IF EXISTS conversation_participants_self_or_store_chat_or_admin_read ON public.conversation_participants;
CREATE POLICY conversation_participants_self_or_store_chat_or_admin_read ON public.conversation_participants FOR SELECT
USING (
  (user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id AND c.store_id IS NOT NULL
  )
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS cp_insert_self ON public.conversation_participants;
DROP POLICY IF EXISTS conversation_participants_self_insert ON public.conversation_participants;
CREATE POLICY conversation_participants_self_insert ON public.conversation_participants FOR INSERT
WITH CHECK (user_id = auth.uid());

-- ── 1e) get_or_create_store_live_conversation — DB'de fiilen çalışan
-- hâliyle (pg_get_functiondef ile alınan gerçek gövde) BİREBİR
-- yeniden tanımlanıyor; artık bir dosyada kayıtlı. `customer_id IS
-- NULL` filtresi korunuyor (DM konuşmasıyla canlı-sohbet konuşmasını
-- ayırt etmek için gerekli, testte DM'in doğru çalıştığı bu filtreyle
-- doğrulandı).
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

  SELECT owner_id INTO v_owner_id FROM public.stores WHERE id = p_store_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE store_id = p_store_id AND customer_id IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  -- (A) Bu adım kendi başına, dışında hiçbir EXCEPTION bloğu yok —
  -- (B)'de çıkacak bir hata bunu ASLA geri saramaz (bkz.
  -- fix_live_chat_conversation_rollback.sql'deki orijinal analiz).
  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (store_id, topic, title, created_by, is_admin_moderated)
    VALUES (p_store_id, 'general', 'Canlı Yayın Sohbeti', v_owner_id, false)
    RETURNING id INTO v_conversation_id;
  END IF;

  v_role := CASE WHEN v_caller = v_owner_id THEN 'dealer' ELSE 'customer' END;

  -- (B) Katılımcı ekleme — nested/ayrı savepoint, best-effort.
  BEGIN
    INSERT INTO public.conversation_participants (conversation_id, user_id, role, joined_at)
    VALUES (v_conversation_id, v_caller, v_role, now())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_store_live_conversation(uuid) TO authenticated;

-- ── 1f) Realtime publication (zaten üyeydi, garanti altına alınıyor) ──
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

COMMIT;

-- =====================================================================
-- PART 2 — TEŞHİSTE "ÖLÜ KOD" DOĞRULANMIŞ TEMİZLİK (opsiyonel ama önerilir)
-- Her madde ayrı transaction'da, ayrı ayrı çalıştırılabilir/atlanabilir.
-- =====================================================================

-- ── 2a) Yinelenen UNIQUE kısıt — ikisi de aynı (conversation_id,
-- user_id) tanımına sahip (sorgu4 ile doğrulandı). Eski/muhtemelen elle
-- eklenen ismi kaldırıyoruz, fix dosyalarından gelen ismi koruyoruz.
BEGIN;
ALTER TABLE public.conversation_participants
  DROP CONSTRAINT IF EXISTS conversation_participants_conv_user_key;
COMMIT;

-- ── 2b) join_store_live_chat — kod tabanında (app/lib/components/
-- modules/public) hiçbir çağrısı yok (grep ile doğrulandı), v5'in
-- yarım kalmış tasarımının kalıntısı. Kullanılmadığı için siliniyor.
-- EĞER ileride "sohbete katıl" adımını client'tan ayrı bir RPC olarak
-- çağırmak isterseniz, bu bloğu ÇALIŞTIRMAYIN ve bunun yerine
-- LiveStream.tsx'e gerçek bir çağrı ekleyin.
BEGIN;
DROP FUNCTION IF EXISTS public.join_store_live_chat(uuid, uuid);
COMMIT;

-- ── Doğrulama (PART 1 + 2'den sonra) ─────────────────────────────────
-- SELECT polname, cmd FROM pg_policies
-- WHERE schemaname='public' AND tablename IN ('messages','conversations','conversation_participants')
-- ORDER BY tablename, cmd;
-- (Artık "kaynağı bilinmiyor" policy kalmamalı — hepsi bu dosyada
-- açıklanmış olmalı.)
--
-- Fonksiyonel testleri (mağaza izolasyonu, çift yönlü canlı sohbet, DM)
-- BİR KEZ DAHA tekrarlayın — PART 1 fonksiyonel olarak no-op olmalı
-- ama gerçek doğrulama her zaman testtir, dosya yorumu değil.
-- =====================================================================
