-- =====================================================================
-- fixes/diagnose_live_chat_current_state.sql
-- ─────────────────────────────────────────────────────────────────────
-- AMAÇ: 9 dosyalık fix_live_chat_* zincirinden SONRA, messages /
-- conversations / conversation_participants tablolarında ŞU AN
-- GERÇEKTEN hangi policy'lerin ve hangi fonksiyon gövdesinin aktif
-- olduğunu ortaya çıkarmak. SADECE TEŞHİS — hiçbir şeyi değiştirmez.
--
-- Supabase SQL Editor'e yapıştırıp RUN edin, İKİ sorgunun da (ve varsa
-- üçüncü/dördüncü ek sorguların) TAM çıktısını paylaşın.
-- =====================================================================

-- ── 1) Aktif RLS politikaları (hangi koşulla, hangi tabloda) ─────────
SELECT
  tablename,
  policyname,
  cmd            AS command,        -- SELECT / INSERT / UPDATE / DELETE / ALL
  permissive,                       -- PERMISSIVE / RESTRICTIVE
  roles,
  qual           AS using_expression,
  with_check     AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('messages', 'conversations', 'conversation_participants')
ORDER BY tablename, cmd, policyname;

-- ── 2) RLS açık mı, her tablo için ────────────────────────────────────
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('messages', 'conversations', 'conversation_participants');

-- ── 3) Aktif fonksiyon gövdeleri — HANGİ SÜRÜM (v3 / rollback / v5 /
--      başka bir şey) şu an DB'de kayıtlı? Kaynak kodu tam olarak
--      görüp hangi dosyayla eşleştiğini karşılaştırabilirsiniz.
SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_or_create_store_live_conversation',
    'join_store_live_chat'
  );
-- NOT: join_store_live_chat SADECE v5 çalıştırılmışsa var olur — 0 satır
-- dönerse, v5'in HENÜZ UYGULANMADIĞI anlamına gelir.

-- ── 4) (conversation_id, user_id) UNIQUE kısıtı var mı? ──────────────
-- v3/rollback/v5'in ON CONFLICT mantığının çalışması buna bağlı.
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.conversation_participants'::regclass
  AND contype = 'u';

-- ── 5) Realtime publication'da messages / conversation_participants
--      var mı? (RLS doğru olsa bile burada değilse hiçbir event gitmez)
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN ('messages', 'conversation_participants');

-- ── 6) Bilinen "hayalet" / legacy conversation id'leri gerçekten var mı?
SELECT id, store_id, customer_id, group_category, topic, created_at
FROM public.conversations
WHERE id IN (
  'e3fc6ac0-5e8f-4bb6-9aa1-ca1d84ddaf73',  -- LEGACY_GLOBAL_CONV_ID
  '70a0c692-d51a-4d98-823b-cba6baf4f318'   -- fix_live_chat_participants_v5.sql'de bahsi geçen "hayalet" id
);

-- ── 7) Kaç ayrı canlı-yayın conversation'ı var, store_id NULL olan
--      kaç tane? (legacy_read/store_isolation tartışmasının güncel
--      durumu)
SELECT
  (store_id IS NULL) AS store_id_null,
  count(*) AS conversation_count
FROM public.conversations
GROUP BY (store_id IS NULL);
-- =====================================================================
