-- =====================================================================
-- 0001 init_schema — Drizzle şemasından (src/db/schema.ts) üretilen BASELINE.
-- Mevcut tablolar/PK/FK/unique/index/default'lar birebir korunur.
-- Üretim: drizzle-kit generate (ardından 'statement-breakpoint' yorumları temizlendi).
-- Bundan sonra şema değişiklikleri YALNIZCA yeni migration dosyalarıyla yapılır.
-- =====================================================================
CREATE TABLE "ad_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"placement" text DEFAULT 'ANASAYFA' NOT NULL,
	"city" text,
	"district" text,
	"category" text,
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "ad_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ai_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"platform" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"cta" text,
	"variant" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" text DEFAULT 'AI' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);

CREATE TABLE "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	CONSTRAINT "ai_settings_key_unique" UNIQUE("key")
);

CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"campaign_id" uuid,
	"user_id" uuid,
	"kind" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"role" text DEFAULT 'SYSTEM' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "business_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"commission_rate" double precision DEFAULT 0.06 NOT NULL,
	"commission_base" text DEFAULT 'AFTER_DAMPING' NOT NULL,
	"fixed_fee_cents" integer DEFAULT 0 NOT NULL,
	"per_customer_fee_cents" integer DEFAULT 0 NOT NULL,
	"referral_rate" double precision DEFAULT 0.01 NOT NULL,
	"pool_contribution_rate" double precision DEFAULT 0.03 NOT NULL,
	"damping_reward_rate" double precision DEFAULT 0.02 NOT NULL,
	"package_code" text DEFAULT 'PRO' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"opens_at" text DEFAULT '09:00' NOT NULL,
	"closes_at" text DEFAULT '22:00' NOT NULL,
	"closed" boolean DEFAULT false NOT NULL
);

CREATE TABLE "business_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text DEFAULT 'IMAGE' NOT NULL,
	"url" text,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "business_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_key" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'CASHIER' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sub_category" text,
	"sector_key" text DEFAULT 'magaza' NOT NULL,
	"district" text NOT NULL,
	"city" text DEFAULT 'İstanbul' NOT NULL,
	"address" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"phone" text,
	"whatsapp" text,
	"website" text,
	"instagram" text,
	"description" text,
	"story" text,
	"logo_text" text,
	"cover_image" text,
	"plan_code" text DEFAULT 'FREE' NOT NULL,
	"rating" double precision DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);

CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'PERCENT' NOT NULL,
	"discount_percent" double precision DEFAULT 0 NOT NULL,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"min_basket_cents" integer DEFAULT 0 NOT NULL,
	"max_discount_cents" integer DEFAULT 0 NOT NULL,
	"usage_limit" integer,
	"per_customer_limit" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"time_start" text,
	"time_end" text,
	"days" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'PUBLISHED' NOT NULL,
	"qr_enabled" boolean DEFAULT true NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"redemptions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_code_unique" UNIQUE("code")
);

CREATE TABLE "damping_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text DEFAULT 'GLOBAL' NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "damping_pool_key_unique" UNIQUE("key")
);

CREATE TABLE "damping_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"available_cents" integer DEFAULT 0 NOT NULL,
	"pending_cents" integer DEFAULT 0 NOT NULL,
	"reserved_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_earned_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_spent_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "damping_wallets_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "fraud_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"user_id" uuid,
	"reason" text NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "marketing_plan_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"theme" text NOT NULL,
	"task" text NOT NULL,
	"channel" text NOT NULL,
	"caption" text,
	"cta" text,
	"done" boolean DEFAULT false NOT NULL
);

CREATE TABLE "marketing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"title" text NOT NULL,
	"goal" text NOT NULL,
	"sector_key" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_monthly_cents" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb,
	"ai_quota_monthly" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "packages_code_unique" UNIQUE("code")
);

CREATE TABLE "pool_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"direction" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"discount_price_cents" integer,
	"category" text,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"business_id" uuid NOT NULL,
	"campaign_id" uuid,
	"customer_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	"transaction_id" uuid,
	CONSTRAINT "qr_codes_code_unique" UNIQUE("code")
);

CREATE TABLE "referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"transaction_id" uuid,
	"inviter_id" uuid NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_id" uuid NOT NULL,
	"invitee_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"fraud_flags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "business_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"duration_min" integer,
	"active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gross_sales_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"damping_used_cents" integer DEFAULT 0 NOT NULL,
	"net_sales_cents" integer DEFAULT 0 NOT NULL,
	"commission_cents" integer DEFAULT 0 NOT NULL,
	"pool_contribution_cents" integer DEFAULT 0 NOT NULL,
	"pool_consumed_cents" integer DEFAULT 0 NOT NULL,
	"net_position_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'CALCULATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "store_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"campaign_id" uuid,
	"customer_id" uuid,
	"cashier_id" uuid,
	"qr_code_id" uuid,
	"receipt_no" text NOT NULL,
	"gross_amount_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"damping_used_cents" integer DEFAULT 0 NOT NULL,
	"net_amount_cents" integer NOT NULL,
	"commission_base_cents" integer DEFAULT 0 NOT NULL,
	"commission_rate" double precision DEFAULT 0 NOT NULL,
	"commission_cents" integer DEFAULT 0 NOT NULL,
	"pool_contribution_cents" integer DEFAULT 0 NOT NULL,
	"damping_earned_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"payment_method" text DEFAULT 'NAKIT' NOT NULL,
	"reversal_of" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_transactions_receipt_no_unique" UNIQUE("receipt_no")
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"district" text,
	"referral_code" text NOT NULL,
	"referred_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);

CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_ad_id_ad_campaigns_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ai_contents" ADD CONSTRAINT "ai_contents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "business_contracts" ADD CONSTRAINT "business_contracts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "business_media" ADD CONSTRAINT "business_media_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "business_staff" ADD CONSTRAINT "business_staff_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "damping_wallets" ADD CONSTRAINT "damping_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fraud_reviews" ADD CONSTRAINT "fraud_reviews_transaction_id_store_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."store_transactions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "marketing_plan_days" ADD CONSTRAINT "marketing_plan_days_plan_id_marketing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."marketing_plans"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_plans" ADD CONSTRAINT "marketing_plans_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pool_ledger" ADD CONSTRAINT "pool_ledger_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_transaction_id_store_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."store_transactions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "business_services" ADD CONSTRAINT "business_services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_cashier_id_business_staff_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."business_staff"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_wallet_id_damping_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."damping_wallets"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "ai_contents_business_idx" ON "ai_contents" USING btree ("business_id");
CREATE INDEX "analytics_events_business_idx" ON "analytics_events" USING btree ("business_id","kind");
CREATE INDEX "businesses_category_idx" ON "businesses" USING btree ("category","district");
CREATE INDEX "campaigns_business_idx" ON "campaigns" USING btree ("business_id");
CREATE INDEX "marketing_plan_days_plan_idx" ON "marketing_plan_days" USING btree ("plan_id");
CREATE INDEX "pool_ledger_business_idx" ON "pool_ledger" USING btree ("business_id");
CREATE INDEX "qr_codes_customer_idx" ON "qr_codes" USING btree ("customer_id");
CREATE INDEX "store_transactions_business_idx" ON "store_transactions" USING btree ("business_id");
CREATE INDEX "store_transactions_customer_idx" ON "store_transactions" USING btree ("customer_id");
CREATE INDEX "store_transactions_created_idx" ON "store_transactions" USING btree ("created_at");
CREATE INDEX "users_referral_idx" ON "users" USING btree ("referral_code");
CREATE INDEX "wallet_ledger_wallet_idx" ON "wallet_ledger" USING btree ("wallet_id");