-- DampingVar M3 — 2/2: BÜTÜNLÜK + RLS (deny-by-default) + YETKİ SERTLEŞTİRME
-- EKLEMELİDİR: mevcut veriyi silmez/değiştirmez. Yeni davranış yalnızca "geçersiz değer / ledger değiştirme" reddidir.

-- 1) Durum sözlükleri. Kaynak: src/db/schema.ts yorumları (kodda kullanılan tüm değerler bu kümelerin içinde).
--    audit_logs.role için KISIT YOKTUR (kodda "SYSTEM" gibi ek roller kullanılıyor).
ALTER TABLE public.businesses ADD CONSTRAINT businesses_plan_code_check CHECK (plan_code IN ('FREE', 'PRO', 'BOOST'));
ALTER TABLE public.business_staff ADD CONSTRAINT business_staff_role_check CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER'));
ALTER TABLE public.business_contracts ADD CONSTRAINT business_contracts_commission_base_check CHECK (commission_base IN ('GROSS', 'NET_AFTER_DISCOUNT', 'AFTER_DAMPING'));
ALTER TABLE public.business_media ADD CONSTRAINT business_media_kind_check CHECK (kind IN ('IMAGE', 'VIDEO'));
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_type_check CHECK (type IN ('PERCENT', 'FIXED', 'PRODUCT', 'HOUR', 'DAY', 'FIRST', 'RETURN', 'QR_ONLY'));
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'ENDED'));
ALTER TABLE public.qr_codes ADD CONSTRAINT qr_codes_status_check CHECK (status IN ('ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED'));
ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_entry_type_check CHECK (entry_type IN ('EARN', 'SPEND', 'EXPIRE', 'REVERSE', 'REFERRAL'));
ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_status_check CHECK (status IN ('PENDING', 'AVAILABLE', 'RESERVED', 'SPENT', 'EXPIRED', 'CANCELLED', 'FRAUD_REVIEW'));
ALTER TABLE public.pool_ledger ADD CONSTRAINT pool_ledger_direction_check CHECK (direction IN ('CONTRIBUTE', 'CONSUME', 'REVERSE'));
ALTER TABLE public.store_transactions ADD CONSTRAINT store_transactions_status_check CHECK (status IN ('COMPLETED', 'REVERSED', 'FRAUD_REVIEW', 'CANCELLED'));
ALTER TABLE public.referrals ADD CONSTRAINT referrals_status_check CHECK (status IN ('PENDING', 'QUALIFIED', 'REJECTED', 'FRAUD_REVIEW'));
ALTER TABLE public.referral_rewards ADD CONSTRAINT referral_rewards_status_check CHECK (status IN ('PENDING', 'AVAILABLE', 'PAID', 'CANCELLED', 'FRAUD_REVIEW'));
ALTER TABLE public.ai_contents ADD CONSTRAINT ai_contents_kind_check CHECK (kind IN ('SOCIAL', 'AD', 'VIDEO', 'STORY', 'CAMPAIGN', 'PRODUCT', 'LOCAL', 'REPORT'));
ALTER TABLE public.ai_contents ADD CONSTRAINT ai_contents_status_check CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'REJECTED'));
ALTER TABLE public.ad_campaigns ADD CONSTRAINT ad_campaigns_status_check CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'ENDED'));
ALTER TABLE public.ad_events ADD CONSTRAINT ad_events_kind_check CHECK (kind IN ('IMPRESSION', 'CLICK'));
ALTER TABLE public.fraud_reviews ADD CONSTRAINT fraud_reviews_status_check CHECK (status IN ('OPEN', 'CLEARED', 'BLOCKED'));

-- 2) Değiştirilemez (append-only) defterler: UPDATE / DELETE / TRUNCATE reddedilir.
--    Not: bu tablolara bağlı işletme/kullanıcı silme (ON DELETE CASCADE) bilinçli olarak engellenir.
CREATE OR REPLACE FUNCTION public.forbid_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION '% tablosu değiştirilemez (append-only): % engellendi', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER wallet_ledger_immutable_row BEFORE UPDATE OR DELETE ON public.wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER wallet_ledger_immutable_truncate BEFORE TRUNCATE ON public.wallet_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER pool_ledger_immutable_row BEFORE UPDATE OR DELETE ON public.pool_ledger
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER pool_ledger_immutable_truncate BEFORE TRUNCATE ON public.pool_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER audit_logs_immutable_row BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER audit_logs_immutable_truncate BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_ledger_mutation();

-- 3) Satır düzeyi güvenlik: TÜM tablolarda açık. Politika yazılana kadar anon/authenticated hiçbir satır göremez.
--    (service_role ve postgres RLS'i aşar; politikalar M5'te eklenecek.)
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damping_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damping_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

-- 4) Savunma derinliği: finansal tablolara istemci rolleri (anon/authenticated) YAZAMAZ — ileride yanlışlıkla
--    gevşek bir RLS politikası yazılsa bile. Yazma yalnızca SECURITY DEFINER RPC / service_role ile olur.
--    Roller yalnızca Supabase'de vardır; düz PostgreSQL'de sessizce atlanır.
DO $$
DECLARE r text; t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY ARRAY['damping_wallets', 'wallet_ledger', 'damping_pool', 'pool_ledger', 'store_transactions', 'referral_rewards', 'settlements', 'audit_logs'] LOOP
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM %I', t, r);
      END LOOP;
    END IF;
  END LOOP;
END
$$;
