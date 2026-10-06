-- =====================================================================
-- 0004 rls_deny_by_default  (CHECKLIST_NEW_TABLE adım 1-3, tüm tablolar için)
-- Supabase, public şemadaki tabloları PostgREST ile anon/authenticated rollerine
-- varsayılan olarak AÇAR. Anon key istemciye gittiği için, policy yazılana kadar
-- (Faz 4) hiçbir tabloya Data API üzerinden erişim OLMAMALI.
--   1) RLS açılır (policy yok = hiç satır dönmez)
--   2) anon/authenticated'ın tüm tablo/sequence/fonksiyon yetkileri geri alınır
--   3) Yeni tablolar için de varsayılan yetkiler kapatılır
-- Uygulama sunucusu `postgres`/service_role ile bağlanır (BYPASSRLS) — etkilenmez.
-- Faz 4'te işletme-izolasyonlu policy + gereken minimal GRANT'ler eklenecek.
-- Doğrulama: anon key ile https://<ref>.supabase.co/rest/v1/businesses → [] veya 401/403 dönmeli.
-- =====================================================================
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;

  -- Supabase dışı (yerel/CI) Postgres'te bu roller olmayabilir
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
  END IF;
END $$;

COMMIT;
