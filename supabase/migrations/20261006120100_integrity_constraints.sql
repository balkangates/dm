-- =====================================================================
-- 0002 integrity_constraints
-- Faz 0 audit (§3 Veri tutarsızlıkları) bulgularını DB seviyesinde kapatır.
-- Değer kümeleri pg ENUM yerine CHECK ile korunur: aynı garantiyi verir, ama
-- yeni durum eklemek (Faz 8-11, 17) tip yeniden yaratmadan tek ALTER ile yapılır
-- ve Drizzle'daki `text` kolon tipleri değişmeden kalır (uygulama kodu etkilenmez).
-- =====================================================================
BEGIN;

/* ---------- businesses / hours / staff / contracts ---------- */
ALTER TABLE businesses
  ADD CONSTRAINT businesses_rating_chk CHECK (rating >= 0 AND rating <= 5),
  ADD CONSTRAINT businesses_review_count_chk CHECK (review_count >= 0),
  ADD CONSTRAINT businesses_plan_code_fk FOREIGN KEY (plan_code) REFERENCES packages(code) ON UPDATE CASCADE;

ALTER TABLE business_hours
  ADD CONSTRAINT business_hours_day_chk CHECK (day_of_week BETWEEN 0 AND 6);
CREATE UNIQUE INDEX business_hours_business_day_uq ON business_hours (business_id, day_of_week);

ALTER TABLE business_staff
  ADD CONSTRAINT business_staff_role_chk CHECK (role IN ('OWNER','MANAGER','CASHIER'));
CREATE UNIQUE INDEX business_staff_business_email_uq ON business_staff (business_id, lower(email));

ALTER TABLE business_contracts
  ADD CONSTRAINT business_contracts_rates_chk CHECK (
    commission_rate BETWEEN 0 AND 1 AND referral_rate BETWEEN 0 AND 1
    AND pool_contribution_rate BETWEEN 0 AND 1 AND damping_reward_rate BETWEEN 0 AND 1),
  ADD CONSTRAINT business_contracts_fees_chk CHECK (fixed_fee_cents >= 0 AND per_customer_fee_cents >= 0),
  ADD CONSTRAINT business_contracts_base_chk CHECK (commission_base IN ('GROSS','NET_AFTER_DISCOUNT','AFTER_DAMPING')),
  ADD CONSTRAINT business_contracts_package_fk FOREIGN KEY (package_code) REFERENCES packages(code) ON UPDATE CASCADE;
-- İşletme başına en fazla bir AKTİF sözleşme
CREATE UNIQUE INDEX business_contracts_one_active_uq ON business_contracts (business_id) WHERE active;

/* ---------- catalog ---------- */
ALTER TABLE products
  ADD CONSTRAINT products_price_chk CHECK (price_cents >= 0),
  ADD CONSTRAINT products_discount_chk CHECK (discount_price_cents IS NULL OR (discount_price_cents >= 0 AND discount_price_cents <= price_cents));
ALTER TABLE business_services
  ADD CONSTRAINT business_services_price_chk CHECK (price_cents >= 0),
  ADD CONSTRAINT business_services_duration_chk CHECK (duration_min IS NULL OR duration_min > 0);
ALTER TABLE business_media
  ADD CONSTRAINT business_media_kind_chk CHECK (kind IN ('IMAGE','VIDEO'));
ALTER TABLE reviews
  ADD CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5);

/* ---------- users / referral ---------- */
ALTER TABLE users
  ADD CONSTRAINT users_referred_by_fk FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE referrals
  ADD CONSTRAINT referrals_inviter_fk FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT referrals_invitee_fk FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT referrals_status_chk CHECK (status IN ('PENDING','QUALIFIED','REJECTED','FRAUD_REVIEW'));
-- Tek seviye (A→B): bir kullanıcı yalnızca BİR kişi tarafından davet edilmiş sayılır
CREATE UNIQUE INDEX referrals_invitee_uq ON referrals (invitee_id);
CREATE INDEX referrals_inviter_idx ON referrals (inviter_id);

ALTER TABLE referral_rewards
  ADD CONSTRAINT referral_rewards_inviter_fk FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT referral_rewards_amount_chk CHECK (amount_cents >= 0),
  ADD CONSTRAINT referral_rewards_status_chk CHECK (status IN ('PENDING','AVAILABLE','PAID','CANCELLED','FRAUD_REVIEW'));
CREATE UNIQUE INDEX referral_rewards_referral_tx_uq ON referral_rewards (referral_id, transaction_id);
CREATE INDEX referral_rewards_tx_idx ON referral_rewards (transaction_id);

/* ---------- campaigns / QR ---------- */
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_type_chk CHECK (type IN ('PERCENT','FIXED','PRODUCT','HOUR','DAY','FIRST','RETURN','QR_ONLY')),
  ADD CONSTRAINT campaigns_status_chk CHECK (status IN ('DRAFT','PUBLISHED','ENDED')),
  ADD CONSTRAINT campaigns_discount_chk CHECK (
    discount_percent BETWEEN 0 AND 100 AND discount_amount_cents >= 0
    AND min_basket_cents >= 0 AND max_discount_cents >= 0),
  ADD CONSTRAINT campaigns_limits_chk CHECK ((usage_limit IS NULL OR usage_limit > 0) AND per_customer_limit >= 1),
  ADD CONSTRAINT campaigns_period_chk CHECK (ends_at IS NULL OR ends_at >= starts_at),
  ADD CONSTRAINT campaigns_counters_chk CHECK (views >= 0 AND clicks >= 0 AND redemptions >= 0);
CREATE INDEX campaigns_status_idx ON campaigns (status, ends_at);

ALTER TABLE qr_codes
  ADD CONSTRAINT qr_codes_status_chk CHECK (status IN ('ACTIVE','REDEEMED','EXPIRED','CANCELLED')),
  ADD CONSTRAINT qr_codes_transaction_fk FOREIGN KEY (transaction_id) REFERENCES store_transactions(id) ON DELETE SET NULL;
CREATE INDEX qr_codes_campaign_idx ON qr_codes (campaign_id);
CREATE INDEX qr_codes_business_idx ON qr_codes (business_id);

/* ---------- finans: işlemler ---------- */
-- Finansal geçmiş işletme/kullanıcı silinince kaybolmasın: CASCADE → RESTRICT
ALTER TABLE store_transactions DROP CONSTRAINT store_transactions_business_id_businesses_id_fk;
ALTER TABLE store_transactions
  ADD CONSTRAINT store_transactions_business_id_businesses_id_fk
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE settlements DROP CONSTRAINT settlements_business_id_businesses_id_fk;
ALTER TABLE settlements
  ADD CONSTRAINT settlements_business_id_businesses_id_fk
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT,
  ADD CONSTRAINT settlements_period_chk CHECK (period_end >= period_start);

ALTER TABLE store_transactions
  ADD CONSTRAINT store_transactions_reversal_fk FOREIGN KEY (reversal_of) REFERENCES store_transactions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT store_transactions_status_chk CHECK (status IN ('COMPLETED','REVERSED','FRAUD_REVIEW','CANCELLED')),
  ADD CONSTRAINT store_transactions_rate_chk CHECK (commission_rate BETWEEN 0 AND 1),
  -- Normal işlemler negatif tutar taşıyamaz; yalnızca iade (reversal) satırları ters işaretli olabilir
  ADD CONSTRAINT store_transactions_amounts_chk CHECK (
    reversal_of IS NOT NULL OR (
      gross_amount_cents >= 0 AND discount_cents >= 0 AND damping_used_cents >= 0 AND net_amount_cents >= 0
      AND commission_base_cents >= 0 AND commission_cents >= 0
      AND pool_contribution_cents >= 0 AND damping_earned_cents >= 0));
-- Bir işlem DB seviyesinde en fazla bir kez iade edilebilir
CREATE UNIQUE INDEX store_transactions_one_reversal_uq ON store_transactions (reversal_of) WHERE reversal_of IS NOT NULL;
CREATE INDEX store_transactions_campaign_idx ON store_transactions (campaign_id);
CREATE INDEX store_transactions_qr_idx ON store_transactions (qr_code_id);

/* ---------- finans: cüzdan / havuz ---------- */
ALTER TABLE damping_wallets DROP CONSTRAINT damping_wallets_user_id_users_id_fk;
ALTER TABLE damping_wallets
  ADD CONSTRAINT damping_wallets_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  -- Negatif bakiye DB seviyesinde imkansız
  ADD CONSTRAINT damping_wallets_nonneg_chk CHECK (
    available_cents >= 0 AND pending_cents >= 0 AND reserved_cents >= 0
    AND lifetime_earned_cents >= 0 AND lifetime_spent_cents >= 0);

ALTER TABLE wallet_ledger DROP CONSTRAINT wallet_ledger_wallet_id_damping_wallets_id_fk;
ALTER TABLE wallet_ledger
  ADD CONSTRAINT wallet_ledger_wallet_id_damping_wallets_id_fk FOREIGN KEY (wallet_id) REFERENCES damping_wallets(id) ON DELETE RESTRICT,
  ADD CONSTRAINT wallet_ledger_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT wallet_ledger_type_chk CHECK (entry_type IN ('EARN','SPEND','EXPIRE','REVERSE','REFERRAL')),
  ADD CONSTRAINT wallet_ledger_status_chk CHECK (status IN ('PENDING','AVAILABLE','RESERVED','SPENT','EXPIRED','CANCELLED','FRAUD_REVIEW')),
  ADD CONSTRAINT wallet_ledger_amount_chk CHECK (amount_cents <> 0);
CREATE INDEX wallet_ledger_user_idx ON wallet_ledger (user_id);
CREATE INDEX wallet_ledger_ref_idx ON wallet_ledger (ref_type, ref_id);

-- Ortak havuz negatif olamaz: havuzda olmayan para ödül olarak dağıtılamaz (Faz 9 rezervasyonu bunun üstüne kurulacak)
ALTER TABLE damping_pool ADD CONSTRAINT damping_pool_nonneg_chk CHECK (balance_cents >= 0);
ALTER TABLE pool_ledger
  ADD CONSTRAINT pool_ledger_direction_chk CHECK (direction IN ('CONTRIBUTE','CONSUME','REVERSE')),
  ADD CONSTRAINT pool_ledger_amount_chk CHECK (amount_cents <> 0 AND (direction = 'REVERSE' OR amount_cents > 0));
CREATE INDEX pool_ledger_ref_idx ON pool_ledger (ref_type, ref_id);

/* ---------- AI / reklam / diğer ---------- */
ALTER TABLE marketing_plans
  ADD CONSTRAINT marketing_plans_status_chk CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED'));
CREATE UNIQUE INDEX marketing_plans_business_uq ON marketing_plans (business_id);
ALTER TABLE marketing_plan_days
  ADD CONSTRAINT marketing_plan_days_day_chk CHECK (day BETWEEN 1 AND 28);
CREATE UNIQUE INDEX marketing_plan_days_plan_day_uq ON marketing_plan_days (plan_id, day);

ALTER TABLE ai_contents
  ADD CONSTRAINT ai_contents_status_chk CHECK (status IN ('DRAFT','APPROVED','PUBLISHED','REJECTED'));

ALTER TABLE ad_campaigns
  ADD CONSTRAINT ad_campaigns_status_chk CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','ENDED')),
  ADD CONSTRAINT ad_campaigns_nonneg_chk CHECK (budget_cents >= 0 AND impressions >= 0 AND clicks >= 0),
  ADD CONSTRAINT ad_campaigns_period_chk CHECK (ends_at IS NULL OR ends_at >= starts_at);
ALTER TABLE ad_events
  ADD CONSTRAINT ad_events_kind_chk CHECK (kind IN ('IMPRESSION','CLICK'));
CREATE INDEX ad_events_ad_idx ON ad_events (ad_id, kind);

ALTER TABLE packages
  ADD CONSTRAINT packages_nonneg_chk CHECK (price_monthly_cents >= 0 AND ai_quota_monthly >= 0);

ALTER TABLE fraud_reviews
  ADD CONSTRAINT fraud_reviews_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fraud_reviews_status_chk CHECK (status IN ('OPEN','CLEARED','BLOCKED'));
CREATE INDEX fraud_reviews_status_idx ON fraud_reviews (status);

CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

/* ---------- Append-only defterler ---------- */
-- Ledger ve audit kayıtları sonradan değiştirilemez/silinemez; düzeltme = yeni ters kayıt.
CREATE FUNCTION prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% tablosu append-only: % işlemi yapılamaz (düzeltme için ters kayıt ekleyin)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
CREATE TRIGGER wallet_ledger_append_only BEFORE UPDATE OR DELETE ON wallet_ledger FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER pool_ledger_append_only   BEFORE UPDATE OR DELETE ON pool_ledger   FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER audit_logs_append_only    BEFORE UPDATE OR DELETE ON audit_logs    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

COMMIT;
