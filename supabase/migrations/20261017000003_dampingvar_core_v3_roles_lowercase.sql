-- =============================================================================
-- 20261017000003_dampingvar_core_v3_roles_lowercase.sql
-- DampingVar — çekirdek v3 şeması (küçük harf roller).
--
-- KAYNAĞI: Canlı Supabase projesinden dışa aktarılan tablo şeması
-- (Supabase_tablolar.txt) ile db/schema.ts karşılaştırılarak hazırlandı.
-- Bu dosya BOŞ bir veritabanı için tam şemayı kurar; v3 uygulanmış bir
-- veritabanında ÇALIŞTIRILMASI GEREKMEZ (idempotenttir, tekrar çalışmak zararsız).
--
-- Kapsam NOTLARI:
--  * Musteri cüzdanı, nakit bakiye, ortak puan havuzu, mahsup, store_transactions,
--    business_contracts, referral_rewards tabloları YOKTUR (iş modeli gereği).
--  * users tablosu YOKTUR; hesaplar auth.users + public.profiles üzerindedir.
--  * Roller KÜÇÜK HARFTİR: profiles.role in (customer,business,admin).
--    (business_staff.role küçük harfi 20261017000004 yamasıyla güncellenir.)
--  * Parasal değerler integer cent/kuruş; durum metinleri BÜYÜK harftir
--    (DRAFT/PUBLISHED/QR_SCANNED vb.) — yalnızca ROLLER küçüktür.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- public.profiles — Supabase Auth kullanıcısının uygulama profili
-- (id = auth.users.id; rol istemciden GELMEZ, trigger ile atanır)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 120),
  email text UNIQUE,
  phone text CHECK (phone IS NULL OR char_length(phone) <= 40),
  district text CHECK (district IS NULL OR char_length(district) <= 80),
  referral_code text NOT NULL UNIQUE,
  referred_by uuid,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','business','admin')),
  lang text NOT NULL DEFAULT 'tr' CHECK (lang IN ('tr','en','ka')),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','GEL','EUR')),
  country text NOT NULL DEFAULT 'TR' CHECK (char_length(country) = 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.profiles(id)
);

-- -----------------------------------------------------------------------------
-- İşletmeler ve bağlı tablolar
-- -----------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  sub_category text,
  sector_key text NOT NULL DEFAULT 'magaza',
  district text NOT NULL,
  city text NOT NULL DEFAULT 'İstanbul',
  address text NOT NULL,
  lat double precision,
  lng double precision,
  phone text,
  whatsapp text,
  website text,
  instagram text,
  description text,
  story text,
  logo_text text,
  cover_image text,
  plan_code text NOT NULL DEFAULT 'FREE',
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','GEL','EUR')),
  country text NOT NULL DEFAULT 'TR' CHECK (char_length(country) = 2),
  rating double precision NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  verified boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_pkey PRIMARY KEY (id)
);

create table if not exists public.business_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  opens_at text NOT NULL DEFAULT '09:00' CHECK (opens_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  closes_at text NOT NULL DEFAULT '22:00' CHECK (closes_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  closed boolean NOT NULL DEFAULT false,
  CONSTRAINT business_hours_pkey PRIMARY KEY (id),
  CONSTRAINT business_hours_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

-- Personel rolleri: yama sonrası küçük harf (owner|manager|cashier).
-- (Canlı v3 şemasında şimdilik BÜYÜK harf olan veri/policy'ler 0004 yamasıyla
--  küçük harfe çevrilir; is_business_member() her iki biçimi de kabul eder.)
create table if not exists public.business_staff (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  user_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner','manager','cashier')),
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT business_staff_pkey PRIMARY KEY (id),
  CONSTRAINT business_staff_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
  CONSTRAINT business_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

create table if not exists public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  discount_price_cents integer CHECK (discount_price_cents IS NULL OR discount_price_cents >= 0),
  category text,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.business_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  duration_min integer CHECK (duration_min IS NULL OR duration_min > 0),
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT business_services_pkey PRIMARY KEY (id),
  CONSTRAINT business_services_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.business_media (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'IMAGE' CHECK (kind IN ('IMAGE','VIDEO')),
  url text,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT business_media_pkey PRIMARY KEY (id),
  CONSTRAINT business_media_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  author_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

-- -----------------------------------------------------------------------------
-- Kampanyalar / QR / kullanım kayıtları
-- -----------------------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  code text NOT NULL DEFAULT ('DMP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))) UNIQUE,
  title text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'PERCENT' CHECK (type IN ('PERCENT','FIXED','PRODUCT','HOUR','DAY','FIRST','RETURN','QR_ONLY')),
  discount_percent double precision NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  discount_amount_cents integer NOT NULL DEFAULT 0 CHECK (discount_amount_cents >= 0),
  min_basket_cents integer NOT NULL DEFAULT 0 CHECK (min_basket_cents >= 0),
  max_discount_cents integer NOT NULL DEFAULT 0 CHECK (max_discount_cents >= 0),
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  per_customer_limit integer NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  time_start text,
  time_end text,
  days jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','PAUSED','ENDED')),
  moderation_status text NOT NULL DEFAULT 'PENDING' CHECK (moderation_status IN ('PENDING','APPROVED','REJECTED')),
  is_sponsored boolean NOT NULL DEFAULT false,
  slug text UNIQUE,
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','GEL','EUR')),
  image_url text,
  eligible_items jsonb NOT NULL DEFAULT '[]',
  exclusions jsonb NOT NULL DEFAULT '[]',
  terms text,
  qr_enabled boolean NOT NULL DEFAULT true,
  views integer NOT NULL DEFAULT 0 CHECK (views >= 0),
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  redemptions integer NOT NULL DEFAULT 0 CHECK (redemptions >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT campaigns_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.qr_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  business_id uuid NOT NULL,
  campaign_id uuid,
  customer_id uuid,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REDEEMED','EXPIRED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  CONSTRAINT qr_codes_pkey PRIMARY KEY (id),
  CONSTRAINT qr_codes_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
  CONSTRAINT qr_codes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id),
  CONSTRAINT qr_codes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id)
);

-- QR okutma ≠ doğrulanmış kullanım. Bütün durum geçişleri yalnızca
-- dv_qr_* RPC'leri üzerinden yapılır (doğrudan INSERT/UPDATE politikası YOK).
create table if not exists public.campaign_usages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  campaign_id uuid,
  qr_code_id uuid,
  customer_id uuid,
  status text NOT NULL DEFAULT 'QR_SCANNED' CHECK (status IN ('QR_SCANNED','SUBMITTED','VERIFIED','REJECTED','CANCELLED')),
  channel text NOT NULL DEFAULT 'IN_STORE' CHECK (channel IN ('IN_STORE','LINK','REFERRAL')),
  reported_basket_cents integer CHECK (reported_basket_cents IS NULL OR reported_basket_cents >= 0),
  reported_discount_cents integer CHECK (reported_discount_cents IS NULL OR reported_discount_cents >= 0),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','GEL','EUR')),
  idempotency_key text NOT NULL UNIQUE,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_usages_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_usages_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
  CONSTRAINT campaign_usages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id),
  CONSTRAINT campaign_usages_qr_code_id_fkey FOREIGN KEY (qr_code_id) REFERENCES public.qr_codes(id),
  CONSTRAINT campaign_usages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id),
  CONSTRAINT campaign_usages_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.business_staff(id)
);

-- -----------------------------------------------------------------------------
-- Davet / bonus (mağazaya bağlı indirim hakkı — nakit DEĞİL)
-- -----------------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL UNIQUE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'INVITED'
    CHECK (status IN ('INVITED','REGISTERED','PURCHASE_PENDING_VERIFICATION','QUALIFIED','BONUS_AVAILABLE','BONUS_USED','REJECTED','CANCELLED','FRAUD_REVIEW')),
  registered_at timestamptz,
  source_usage_id uuid,
  fraud_flags jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_pkey PRIMARY KEY (id),
  CONSTRAINT referrals_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.profiles(id),
  CONSTRAINT referrals_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES public.profiles(id),
  CONSTRAINT referrals_source_usage_id_fkey FOREIGN KEY (source_usage_id) REFERENCES public.campaign_usages(id)
);

create table if not exists public.bonus_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  business_id uuid,
  reward_kind text NOT NULL DEFAULT 'FIXED' CHECK (reward_kind IN ('FIXED','PERCENT_OF_BASKET')),
  reward_cents integer NOT NULL DEFAULT 0 CHECK (reward_cents >= 0),
  reward_percent double precision NOT NULL DEFAULT 0 CHECK (reward_percent >= 0 AND reward_percent <= 100),
  max_reward_cents integer NOT NULL DEFAULT 0 CHECK (max_reward_cents >= 0),
  min_purchase_cents integer NOT NULL DEFAULT 0 CHECK (min_purchase_cents >= 0),
  valid_days integer NOT NULL DEFAULT 60 CHECK (valid_days > 0),
  max_per_inviter integer NOT NULL DEFAULT 10 CHECK (max_per_inviter > 0),
  requires_verification boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bonus_policies_pkey PRIMARY KEY (id),
  CONSTRAINT bonus_policies_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.bonus_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_id uuid NOT NULL,
  source_referral_id uuid,
  source_usage_id uuid,
  policy_id uuid,
  value_cents integer NOT NULL DEFAULT 0 CHECK (value_cents >= 0),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','GEL','EUR')),
  min_purchase_cents integer NOT NULL DEFAULT 0 CHECK (min_purchase_cents >= 0),
  status text NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (status IN ('PENDING_VERIFICATION','AVAILABLE','USED','EXPIRED','REJECTED','CANCELLED')),
  expires_at timestamptz,
  redeemed_usage_id uuid,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bonus_grants_pkey PRIMARY KEY (id),
  CONSTRAINT bonus_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT bonus_grants_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
  CONSTRAINT bonus_grants_source_referral_id_fkey FOREIGN KEY (source_referral_id) REFERENCES public.referrals(id),
  CONSTRAINT bonus_grants_source_usage_id_fkey FOREIGN KEY (source_usage_id) REFERENCES public.campaign_usages(id),
  CONSTRAINT bonus_grants_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.bonus_policies(id),
  CONSTRAINT bonus_grants_redeemed_usage_id_fkey FOREIGN KEY (redeemed_usage_id) REFERENCES public.campaign_usages(id),
  CONSTRAINT bonus_grants_one_per_purchase UNIQUE (source_usage_id)
);

-- -----------------------------------------------------------------------------
-- AI pazarlama / içerik / video
-- -----------------------------------------------------------------------------
create table if not exists public.marketing_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  title text NOT NULL,
  goal text NOT NULL,
  sector_key text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_plans_pkey PRIMARY KEY (id),
  CONSTRAINT marketing_plans_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.marketing_plan_days (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  day integer NOT NULL CHECK (day >= 1 AND day <= 28),
  theme text NOT NULL,
  task text NOT NULL,
  channel text NOT NULL,
  caption text,
  cta text,
  done boolean NOT NULL DEFAULT false,
  CONSTRAINT marketing_plan_days_pkey PRIMARY KEY (id),
  CONSTRAINT marketing_plan_days_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.marketing_plans(id)
);

create table if not exists public.ai_contents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  kind text NOT NULL,
  platform text,
  title text NOT NULL,
  body text NOT NULL,
  cta text,
  variant text,
  meta jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PUBLISHED','REJECTED')),
  created_by text NOT NULL DEFAULT 'AI',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CONSTRAINT ai_contents_pkey PRIMARY KEY (id),
  CONSTRAINT ai_contents_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.video_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid,
  kind text NOT NULL DEFAULT 'STORYBOARD' CHECK (kind IN ('STORYBOARD','GENERATED','UPLOADED_EDIT')),
  topic text NOT NULL,
  title text NOT NULL,
  duration_sec integer NOT NULL DEFAULT 15 CHECK (duration_sec > 0),
  scenes jsonb NOT NULL DEFAULT '[]',
  captions jsonb NOT NULL DEFAULT '{}',
  steps jsonb NOT NULL DEFAULT '[]',
  poster text,
  render_status text NOT NULL DEFAULT 'NOT_RENDERED' CHECK (render_status IN ('NOT_RENDERED','QUEUED','RENDERED','FAILED')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PUBLISHED','REJECTED')),
  created_by text NOT NULL DEFAULT 'AI',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_assets_pkey PRIMARY KEY (id),
  CONSTRAINT video_assets_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

-- -----------------------------------------------------------------------------
-- Reklam / analitik / platform ayarları
-- -----------------------------------------------------------------------------
create table if not exists public.ad_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  name text NOT NULL,
  placement text NOT NULL DEFAULT 'ANASAYFA',
  city text,
  district text,
  category text,
  budget_cents integer NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','ENDED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  impressions integer NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  CONSTRAINT ad_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT ad_campaigns_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.analytics_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid,
  campaign_id uuid,
  user_id uuid,
  kind text NOT NULL CHECK (kind ~ '^[a-z0-9_]{1,64}$'),
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_events_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
  CONSTRAINT analytics_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id),
  CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

create table if not exists public.packages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  price_monthly_cents integer NOT NULL DEFAULT 0 CHECK (price_monthly_cents >= 0),
  features jsonb NOT NULL DEFAULT '[]',
  ai_quota_monthly integer NOT NULL DEFAULT 0 CHECK (ai_quota_monthly >= 0),
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT packages_pkey PRIMARY KEY (id)
);

create table if not exists public.ai_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  CONSTRAINT ai_settings_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- Hizmet bedeli ve faturalar (DampingVar geliri — müşteri indirimiyle karışmaz)
-- -----------------------------------------------------------------------------
create table if not exists public.service_fee_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid,
  package_code text,
  service_type text NOT NULL
    CHECK (service_type IN ('SUBSCRIPTION','CAMPAIGN_MANAGEMENT','FEATURED_PLACEMENT','REGIONAL_ADS','QR_MANAGEMENT','AI_CONTENT','GROWTH_28','VISIBILITY','REFERRAL_SERVICE','CUSTOM')),
  kind text NOT NULL DEFAULT 'FIXED' CHECK (kind IN ('FIXED','PERCENT')),
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  rate double precision NOT NULL DEFAULT 0 CHECK (rate >= 0 AND rate <= 1),
  calculation_base text NOT NULL DEFAULT 'MONTHLY'
    CHECK (calculation_base IN ('MONTHLY','PER_CAMPAIGN','PER_VERIFIED_USAGE','PER_CLICK','PER_IMPRESSION')),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','GEL','EUR')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_fee_rules_pkey PRIMARY KEY (id),
  CONSTRAINT service_fee_rules_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  number text NOT NULL UNIQUE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','GEL','EUR')),
  subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_rate double precision NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 1),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','ISSUED','SENT','PAID','PARTIALLY_PAID','OVERDUE','CANCELLED')),
  issued_at timestamptz,
  due_date timestamptz,
  paid_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

create table if not exists public.invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  fee_rule_id uuid,
  service_type text NOT NULL,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents integer NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  applied_rate double precision,
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  CONSTRAINT invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT invoice_items_fee_rule_id_fkey FOREIGN KEY (fee_rule_id) REFERENCES public.service_fee_rules(id)
);

create table if not exists public.fraud_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_usage_id uuid,
  user_id uuid,
  reason text NOT NULL,
  signals jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLEARED','BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fraud_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT fraud_reviews_campaign_usage_id_fkey FOREIGN KEY (campaign_usage_id) REFERENCES public.campaign_usages(id),
  CONSTRAINT fraud_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

create table if not exists public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  role text NOT NULL DEFAULT 'SYSTEM',
  action text NOT NULL,
  entity_type text,
  entity_id text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- Müşteri etkileşimleri
-- -----------------------------------------------------------------------------
create table if not exists public.saved_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT saved_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT saved_campaigns_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id),
  CONSTRAINT saved_campaigns_unique UNIQUE (user_id, campaign_id)
);

create table if not exists public.followed_businesses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT followed_businesses_pkey PRIMARY KEY (id),
  CONSTRAINT followed_businesses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT followed_businesses_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
  CONSTRAINT followed_businesses_unique UNIQUE (user_id, business_id)
);

create table if not exists public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'INFO' CHECK (kind IN ('INFO','BONUS','CAMPAIGN','REFERRAL','SYSTEM')),
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- -----------------------------------------------------------------------------
-- Affiliate (online fırsat) — tıklama ≠ satın alma; komisyon yalnızca raporla
-- -----------------------------------------------------------------------------
create table if not exists public.affiliate_networks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'NOT_CONNECTED'
    CHECK (status IN ('NOT_CONNECTED','PENDING_CREDENTIALS','CONNECTED','SUSPENDED')),
  reporting_method text CHECK (reporting_method IS NULL OR reporting_method IN ('API','POSTBACK','CSV','MANUAL')),
  commission_model text CHECK (commission_model IS NULL OR commission_model IN ('CPS','CPA','CPL','HYBRID')),
  notes text,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_networks_pkey PRIMARY KEY (id)
);

create table if not exists public.affiliate_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  merchant text NOT NULL,
  title text NOT NULL,
  description text,
  image_url text,
  category text NOT NULL DEFAULT 'genel',
  country text NOT NULL DEFAULT 'TR' CHECK (char_length(country) = 2),
  network_id uuid,
  destination_url text NOT NULL CHECK (destination_url ~* '^https?://'),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','GEL','EUR')),
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  price_verified boolean NOT NULL DEFAULT false,
  commission_terms text,
  disclosure text NOT NULL,
  terms text,
  exclusions jsonb NOT NULL DEFAULT '[]',
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','EXPIRED')),
  is_sponsored boolean NOT NULL DEFAULT false,
  is_sample boolean NOT NULL DEFAULT true,
  last_updated timestamptz NOT NULL DEFAULT now(),
  impressions integer NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_offers_pkey PRIMARY KEY (id),
  CONSTRAINT affiliate_offers_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.affiliate_networks(id)
);

create table if not exists public.affiliate_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL,
  user_id uuid,
  click_id text NOT NULL UNIQUE,
  outbound_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'WEB',
  confirmed_outbound boolean NOT NULL DEFAULT false,
  CONSTRAINT affiliate_clicks_pkey PRIMARY KEY (id),
  CONSTRAINT affiliate_clicks_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.affiliate_offers(id),
  CONSTRAINT affiliate_clicks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

create table if not exists public.affiliate_conversions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offer_id uuid,
  click_id text,
  network_id uuid,
  status text NOT NULL DEFAULT 'REPORTED'
    CHECK (status IN ('REPORTED','PENDING','APPROVED','REJECTED','REVERSED','PAID')),
  commission_cents integer CHECK (commission_cents IS NULL OR commission_cents >= 0),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','GEL','EUR')),
  source text NOT NULL DEFAULT 'NETWORK_REPORT' CHECK (source IN ('NETWORK_REPORT','MANUAL_ENTRY','DEMO_SAMPLE')),
  network_reference text,
  idempotency_key text NOT NULL UNIQUE,
  reported_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  paid_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_conversions_pkey PRIMARY KEY (id),
  CONSTRAINT affiliate_conversions_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.affiliate_offers(id),
  CONSTRAINT affiliate_conversions_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.affiliate_networks(id)
);

-- -----------------------------------------------------------------------------
-- İndeksler (sorgu yolları)
-- -----------------------------------------------------------------------------
create index if not exists businesses_category_idx on public.businesses (category, district);
create index if not exists campaigns_business_idx on public.campaigns (business_id);
create index if not exists campaigns_status_idx on public.campaigns (status, moderation_status);
create index if not exists qr_codes_customer_idx on public.qr_codes (customer_id);
create index if not exists campaign_usages_business_idx on public.campaign_usages (business_id);
create index if not exists campaign_usages_customer_idx on public.campaign_usages (customer_id);
create index if not exists campaign_usages_status_idx on public.campaign_usages (status);
create index if not exists campaign_usages_campaign_idx on public.campaign_usages (campaign_id);
create index if not exists bonus_grants_user_idx on public.bonus_grants (user_id, status);
create index if not exists marketing_plan_days_plan_idx on public.marketing_plan_days (plan_id);
create index if not exists ai_contents_business_idx on public.ai_contents (business_id);
create index if not exists analytics_events_business_idx on public.analytics_events (business_id, kind);
create index if not exists analytics_events_user_idx on public.analytics_events (user_id, kind);
create index if not exists invoices_business_idx on public.invoices (business_id);
create index if not exists notifications_user_idx on public.notifications (user_id, read);
create index if not exists affiliate_offers_category_idx on public.affiliate_offers (category, country);
create index if not exists affiliate_clicks_offer_idx on public.affiliate_clicks (offer_id);
create index if not exists affiliate_conversions_status_idx on public.affiliate_conversions (status);
create index if not exists business_staff_business_idx on public.business_staff (business_id);

-- BİTTİ (şema). RLS politikaları ve RPC'ler: 20261018000001 / 20261018000002.
