-- =====================================================================
-- 0005 schema_hardening_auth_link  (Faz 02)
--   1) Eksik FK indeksleri (Supabase advisor: unindexed_foreign_keys) — JOIN/CASCADE performansı,
--      ve Faz 8 RLS policy alt sorgularının (business_id eşleşmesi) indeks kullanabilmesi için.
--   2) prevent_mutation() için sabit search_path (advisor: function_search_path_mutable).
--   3) Supabase Auth bağlantısı: business_staff.auth_user_id / users.auth_user_id.
--      Faz 7'de login ile doldurulur; Faz 8 RLS bu kolonlar üzerinden işletme izolasyonu kurar.
--      Nullable: mevcut/seed satırlar bozulmaz. auth.users yoksa (yerel/CI Postgres) FK atlanır.
-- Geri alma: DROP INDEX ... / ALTER TABLE ... DROP COLUMN auth_user_id (veri kaybı yalnızca bu kolonlarda).
-- =====================================================================
BEGIN;

-- 1) FK indeksleri
CREATE INDEX IF NOT EXISTS ad_campaigns_business_id_idx       ON ad_campaigns (business_id);
CREATE INDEX IF NOT EXISTS analytics_events_campaign_id_idx   ON analytics_events (campaign_id);
CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx       ON analytics_events (user_id);
CREATE INDEX IF NOT EXISTS business_contracts_package_code_idx ON business_contracts (package_code);
CREATE INDEX IF NOT EXISTS business_media_business_id_idx     ON business_media (business_id);
CREATE INDEX IF NOT EXISTS business_services_business_id_idx  ON business_services (business_id);
CREATE INDEX IF NOT EXISTS businesses_plan_code_idx           ON businesses (plan_code);
CREATE INDEX IF NOT EXISTS fraud_reviews_user_id_idx          ON fraud_reviews (user_id);
CREATE INDEX IF NOT EXISTS fraud_reviews_transaction_id_idx   ON fraud_reviews (transaction_id);
CREATE INDEX IF NOT EXISTS products_business_id_idx           ON products (business_id);
CREATE INDEX IF NOT EXISTS qr_codes_transaction_id_idx        ON qr_codes (transaction_id);
CREATE INDEX IF NOT EXISTS referral_rewards_inviter_id_idx    ON referral_rewards (inviter_id);
CREATE INDEX IF NOT EXISTS reviews_business_id_idx            ON reviews (business_id);
CREATE INDEX IF NOT EXISTS settlements_business_id_idx        ON settlements (business_id);
CREATE INDEX IF NOT EXISTS store_transactions_cashier_id_idx  ON store_transactions (cashier_id);
CREATE INDEX IF NOT EXISTS users_referred_by_idx              ON users (referred_by);

-- 2) Fonksiyon güvenliği
ALTER FUNCTION public.prevent_mutation() SET search_path = '';

-- 3) Auth bağlantısı
ALTER TABLE business_staff ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE users          ADD COLUMN IF NOT EXISTS auth_user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS business_staff_business_auth_user_uq ON business_staff (business_id, auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS business_staff_auth_user_id_idx     ON business_staff (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_uq               ON users (auth_user_id) WHERE auth_user_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_staff_auth_user_id_fk') THEN
      ALTER TABLE business_staff ADD CONSTRAINT business_staff_auth_user_id_fk
        FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_user_id_fk') THEN
      ALTER TABLE users ADD CONSTRAINT users_auth_user_id_fk
        FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

COMMIT;
