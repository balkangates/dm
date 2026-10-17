import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * DampingVar — veri modeli
 * Tüm parasal değerler integer "cents" (kuruş) olarak tutulur.
 * Oranlar doublePrecision (0-1 arası veya yüzde, kolon adında belirtilir).
 * ------------------------------------------------------------------ */

// 1. İşletmeler (Damping Noktaları)
export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(), // restoran | market | magaza | hizmet | yapi
    subCategory: text("sub_category"),
    sectorKey: text("sector_key").notNull().default("magaza"),
    district: text("district").notNull(),
    city: text("city").notNull().default("İstanbul"),
    address: text("address").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    website: text("website"),
    instagram: text("instagram"),
    description: text("description"),
    story: text("story"),
    logoText: text("logo_text"),
    coverImage: text("cover_image"),
    planCode: text("plan_code").notNull().default("FREE"), // FREE | PRO | BOOST
    currency: text("currency").notNull().default("TRY"),
    country: text("country").notNull().default("TR"),
    rating: doublePrecision("rating").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    verified: boolean("verified").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("businesses_category_idx").on(t.category, t.district)]
);

// 2. Çalışma saatleri
export const businessHours = pgTable("business_hours", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0 = Pazar
  opensAt: text("opens_at").notNull().default("09:00"),
  closesAt: text("closes_at").notNull().default("22:00"),
  closed: boolean("closed").notNull().default(false),
});

// 3. Personel / roller
export const businessStaff = pgTable("business_staff", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  userKey: text("user_key").notNull(), // oturum kimliği (V1: e-posta tabanlı)
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("CASHIER"), // OWNER | MANAGER | CASHIER
  active: boolean("active").notNull().default(true),
});

// 4. Sözleşme / komisyon kuralları (kasiyer değiştiremez)
export const businessContracts = pgTable("business_contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  commissionRate: doublePrecision("commission_rate").notNull().default(0.06),
  commissionBase: text("commission_base").notNull().default("AFTER_DAMPING"), // GROSS | NET_AFTER_DISCOUNT | AFTER_DAMPING
  fixedFeeCents: integer("fixed_fee_cents").notNull().default(0),
  perCustomerFeeCents: integer("per_customer_fee_cents").notNull().default(0),
  referralRate: doublePrecision("referral_rate").notNull().default(0.01),
  poolContributionRate: doublePrecision("pool_contribution_rate").notNull().default(0.03),
  dampingRewardRate: doublePrecision("damping_reward_rate").notNull().default(0.02),
  packageCode: text("package_code").notNull().default("PRO"),
  active: boolean("active").notNull().default(true),
});

// 5. Ürünler
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  discountPriceCents: integer("discount_price_cents"),
  category: text("category"),
  imageUrl: text("image_url"),
  active: boolean("active").notNull().default(true),
});

// 6. Hizmetler
export const services = pgTable("business_services", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  durationMin: integer("duration_min"),
  active: boolean("active").notNull().default(true),
});

// 7. Medya
export const businessMedia = pgTable("business_media", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("IMAGE"), // IMAGE | VIDEO
  url: text("url"),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// 8. Yorumlar
export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  authorName: text("author_name").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 9. Müşteriler
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    district: text("district"),
    referralCode: text("referral_code").notNull().unique(),
    referredBy: uuid("referred_by"),
    // v2 — gerçek oturum katmanı (rol istemciden gelmez, sunucuda okunur)
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("CUSTOMER"), // CUSTOMER | BUSINESS | ADMIN
    businessId: uuid("business_id"),
    lang: text("lang").notNull().default("tr"),
    currency: text("currency").notNull().default("TRY"),
    country: text("country").notNull().default("TR"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("users_referral_idx").on(t.referralCode), index("users_role_idx").on(t.role)]
);

// 10. Kampanyalar
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(), // QR / kasa kodu kökü
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull().default("PERCENT"), // PERCENT|FIXED|PRODUCT|HOUR|DAY|FIRST|RETURN|QR_ONLY
    discountPercent: doublePrecision("discount_percent").notNull().default(0),
    discountAmountCents: integer("discount_amount_cents").notNull().default(0),
    minBasketCents: integer("min_basket_cents").notNull().default(0),
    maxDiscountCents: integer("max_discount_cents").notNull().default(0),
    usageLimit: integer("usage_limit"),
    perCustomerLimit: integer("per_customer_limit").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timeStart: text("time_start"),
    timeEnd: text("time_end"),
    days: jsonb("days").$type<number[]>().default([]),
    status: text("status").notNull().default("PUBLISHED"), // DRAFT | PUBLISHED | PAUSED | ENDED
    moderationStatus: text("moderation_status").notNull().default("APPROVED"), // PENDING | APPROVED | REJECTED
    isSponsored: boolean("is_sponsored").notNull().default(false),
    slug: text("slug"),
    currency: text("currency").notNull().default("TRY"),
    imageUrl: text("image_url"),
    eligibleItems: jsonb("eligible_items").$type<string[]>().default([]),
    exclusions: jsonb("exclusions").$type<string[]>().default([]),
    terms: text("terms"),
    qrEnabled: boolean("qr_enabled").notNull().default(true),
    views: integer("views").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    redemptions: integer("redemptions").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("campaigns_business_idx").on(t.businessId)]
);

// 11. QR kodları
export const qrCodes = pgTable(
  "qr_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull().unique(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    customerId: uuid("customer_id").references(() => users.id),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | REDEEMED | EXPIRED | CANCELLED
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    transactionId: uuid("transaction_id"),
  },
  (t) => [index("qr_codes_customer_idx").on(t.customerId)]
);

// 12. Damping Hane cüzdanı
export const dampingWallets = pgTable("damping_wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  availableCents: integer("available_cents").notNull().default(0),
  pendingCents: integer("pending_cents").notNull().default(0),
  reservedCents: integer("reserved_cents").notNull().default(0),
  lifetimeEarnedCents: integer("lifetime_earned_cents").notNull().default(0),
  lifetimeSpentCents: integer("lifetime_spent_cents").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 13. Cüzdan defteri (ledger) — bakiye asla düz +x ile oynatılmaz
export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => dampingWallets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    entryType: text("entry_type").notNull(), // EARN | SPEND | EXPIRE | REVERSE | REFERRAL
    status: text("status").notNull(), // PENDING|AVAILABLE|RESERVED|SPENT|EXPIRED|CANCELLED|FRAUD_REVIEW
    amountCents: integer("amount_cents").notNull(), // + kazanç / - harcama
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("wallet_ledger_wallet_idx").on(t.walletId)]
);

// 14. Ortak indirim havuzu
export const dampingPool = pgTable("damping_pool", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique().default("GLOBAL"),
  balanceCents: integer("balance_cents").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const poolLedger = pgTable(
  "pool_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").references(() => businesses.id),
    direction: text("direction").notNull(), // CONTRIBUTE | CONSUME | REVERSE
    amountCents: integer("amount_cents").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("pool_ledger_business_idx").on(t.businessId)]
);

// 15. Satış işlemleri
export const transactions = pgTable(
  "store_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    customerId: uuid("customer_id").references(() => users.id),
    cashierId: uuid("cashier_id").references(() => businessStaff.id),
    qrCodeId: uuid("qr_code_id").references(() => qrCodes.id),
    receiptNo: text("receipt_no").notNull().unique(),
    grossAmountCents: integer("gross_amount_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    dampingUsedCents: integer("damping_used_cents").notNull().default(0),
    netAmountCents: integer("net_amount_cents").notNull(),
    commissionBaseCents: integer("commission_base_cents").notNull().default(0),
    commissionRate: doublePrecision("commission_rate").notNull().default(0),
    commissionCents: integer("commission_cents").notNull().default(0),
    poolContributionCents: integer("pool_contribution_cents").notNull().default(0),
    dampingEarnedCents: integer("damping_earned_cents").notNull().default(0),
    status: text("status").notNull().default("COMPLETED"), // COMPLETED|REVERSED|FRAUD_REVIEW|CANCELLED
    paymentMethod: text("payment_method").notNull().default("NAKIT"),
    reversalOf: uuid("reversal_of"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("store_transactions_business_idx").on(t.businessId),
    index("store_transactions_customer_idx").on(t.customerId),
    index("store_transactions_created_idx").on(t.createdAt),
  ]
);

// 16. Referral
export const referrals = pgTable("referrals", {
  id: uuid("id").defaultRandom().primaryKey(),
  inviterId: uuid("inviter_id").notNull(),
  inviteeId: uuid("invitee_id").notNull(),
  code: text("code").notNull(),
  status: text("status").notNull().default("INVITED"),
  // INVITED | REGISTERED | PURCHASE_PENDING_VERIFICATION | QUALIFIED | BONUS_AVAILABLE | BONUS_USED | REJECTED | CANCELLED | FRAUD_REVIEW
  registeredAt: timestamp("registered_at", { withTimezone: true }),
  sourceUsageId: uuid("source_usage_id"),
  fraudFlags: jsonb("fraud_flags").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const referralRewards = pgTable("referral_rewards", {
  id: uuid("id").defaultRandom().primaryKey(),
  referralId: uuid("referral_id")
    .notNull()
    .references(() => referrals.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id").references(() => transactions.id),
  inviterId: uuid("inviter_id").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  status: text("status").notNull().default("PENDING"), // PENDING|AVAILABLE|PAID|CANCELLED|FRAUD_REVIEW
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 17. AI pazarlama planı
export const marketingPlans = pgTable("marketing_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  goal: text("goal").notNull(),
  sectorKey: text("sector_key").notNull(),
  status: text("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marketingPlanDays = pgTable(
  "marketing_plan_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => marketingPlans.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    theme: text("theme").notNull(),
    task: text("task").notNull(),
    channel: text("channel").notNull(),
    caption: text("caption"),
    cta: text("cta"),
    done: boolean("done").notNull().default(false),
  },
  (t) => [index("marketing_plan_days_plan_idx").on(t.planId)]
);

// 18. AI içerikleri (onay akışı)
export const aiContents = pgTable(
  "ai_contents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // SOCIAL | AD | VIDEO | STORY | CAMPAIGN | PRODUCT | LOCAL | REPORT
    platform: text("platform"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    cta: text("cta"),
    variant: text("variant"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    status: text("status").notNull().default("DRAFT"), // DRAFT|APPROVED|PUBLISHED|REJECTED
    createdBy: text("created_by").notNull().default("AI"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [index("ai_contents_business_idx").on(t.businessId)]
);

// 19. Reklam
export const adCampaigns = pgTable("ad_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  placement: text("placement").notNull().default("ANASAYFA"),
  city: text("city"),
  district: text("district"),
  category: text("category"),
  budgetCents: integer("budget_cents").notNull().default(0),
  status: text("status").notNull().default("DRAFT"), // DRAFT|PENDING_APPROVAL|ACTIVE|ENDED
  startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
});

export const adEvents = pgTable("ad_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  adId: uuid("ad_id")
    .notNull()
    .references(() => adCampaigns.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // IMPRESSION | CLICK
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 20. Analytics olayları
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").references(() => businesses.id),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    userId: uuid("user_id").references(() => users.id),
    kind: text("kind").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("analytics_events_business_idx").on(t.businessId, t.kind)]
);

// 21. Paketler (fiyatlar admin panelinden yönetilir, koda gömülmez)
export const packages = pgTable("packages", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
  features: jsonb("features").$type<string[]>().default([]),
  aiQuotaMonthly: integer("ai_quota_monthly").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

// 22. Admin: AI kullanım ayarları
export const aiSettings = pgTable("ai_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
});

// 23. Fraud incelemesi
export const fraudReviews = pgTable("fraud_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").references(() => transactions.id),
  userId: uuid("user_id"),
  reason: text("reason").notNull(),
  signals: jsonb("signals").$type<string[]>().default([]),
  status: text("status").notNull().default("OPEN"), // OPEN | CLEARED | BLOCKED
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 24. Audit log
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actor: text("actor").notNull(),
  role: text("role").notNull().default("SYSTEM"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 25. Mahsup / hakediş
export const settlements = pgTable("settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  grossSalesCents: integer("gross_sales_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  dampingUsedCents: integer("damping_used_cents").notNull().default(0),
  netSalesCents: integer("net_sales_cents").notNull().default(0),
  commissionCents: integer("commission_cents").notNull().default(0),
  poolContributionCents: integer("pool_contribution_cents").notNull().default(0),
  poolConsumedCents: integer("pool_consumed_cents").notNull().default(0),
  netPositionCents: integer("net_position_cents").notNull().default(0),
  status: text("status").notNull().default("CALCULATED"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ================================================================== *
 * v2 — YENİ İŞ MODELİ TABLOLARI (ek; mevcut hiçbir tablo silinmedi)
 * KURAL: DampingVar müşteri ödemesine aracılık etmez. Aşağıdaki
 * tablolarda müşteri cüzdanı, nakit bakiye, ortak puan havuzu veya
 * işletmeler arası mahsup alanı YOKTUR.
 * ================================================================== */

// 26. Kampanya kullanım / QR olay kayıtları
// QR okutma ≠ doğrulanmış satış. Durumlar birbirinden ayrı tutulur.
export const campaignUsages = pgTable(
  "campaign_usages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    qrCodeId: uuid("qr_code_id").references(() => qrCodes.id),
    customerId: uuid("customer_id").references(() => users.id),
    status: text("status").notNull().default("QR_SCANNED"),
    // QR_SCANNED | SUBMITTED | VERIFIED | REJECTED | CANCELLED
    channel: text("channel").notNull().default("IN_STORE"), // IN_STORE | LINK | REFERRAL
    // Aşağıdaki iki alan İŞLETMENİN BİLDİRDİĞİ bilgilerdir; DampingVar tahsilat yapmaz.
    reportedBasketCents: integer("reported_basket_cents"),
    reportedDiscountCents: integer("reported_discount_cents"),
    currency: text("currency").notNull().default("TRY"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).defaultNow().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => businessStaff.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("campaign_usages_business_idx").on(t.businessId),
    index("campaign_usages_customer_idx").on(t.customerId),
    index("campaign_usages_status_idx").on(t.status),
  ]
);

// 27. Bonus politikası (yönetici yapılandırır)
export const bonusPolicies = pgTable("bonus_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  businessId: uuid("business_id").references(() => businesses.id), // null = tüm platform
  rewardKind: text("reward_kind").notNull().default("FIXED"), // FIXED | PERCENT_OF_BASKET
  rewardCents: integer("reward_cents").notNull().default(0),
  rewardPercent: doublePrecision("reward_percent").notNull().default(0),
  maxRewardCents: integer("max_reward_cents").notNull().default(0),
  minPurchaseCents: integer("min_purchase_cents").notNull().default(0),
  validDays: integer("valid_days").notNull().default(60),
  maxPerInviter: integer("max_per_inviter").notNull().default(10),
  requiresVerification: boolean("requires_verification").notNull().default(true),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 28. Damping Bonus — MAĞAZAYA BAĞLI indirim hakkı (nakit değil)
export const bonusGrants = pgTable(
  "bonus_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Bonus HANGİ MAĞAZADA kazanıldıysa yalnızca orada kullanılabilir.
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    sourceReferralId: uuid("source_referral_id").references(() => referrals.id),
    // Aynı alışverişten birden fazla ödül üretilemez (DB seviyesinde garanti).
    sourceUsageId: uuid("source_usage_id").references(() => campaignUsages.id),
    policyId: uuid("policy_id").references(() => bonusPolicies.id),
    valueCents: integer("value_cents").notNull().default(0),
    currency: text("currency").notNull().default("TRY"),
    minPurchaseCents: integer("min_purchase_cents").notNull().default(0),
    status: text("status").notNull().default("PENDING_VERIFICATION"),
    // PENDING_VERIFICATION | AVAILABLE | USED | EXPIRED | REJECTED | CANCELLED
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    redeemedUsageId: uuid("redeemed_usage_id").references(() => campaignUsages.id),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("bonus_grants_one_per_purchase").on(t.sourceUsageId),
    index("bonus_grants_user_idx").on(t.userId, t.status),
  ]
);

// 29. Hizmet bedeli kuralları (DampingVar'ın GELİRİ — müşteri indirimiyle karışmaz)
export const serviceFeeRules = pgTable("service_fee_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id), // null = varsayılan kural
  packageCode: text("package_code"),
  serviceType: text("service_type").notNull(),
  // SUBSCRIPTION | CAMPAIGN_MANAGEMENT | FEATURED_PLACEMENT | REGIONAL_ADS
  // QR_MANAGEMENT | AI_CONTENT | GROWTH_28 | VISIBILITY | REFERRAL_SERVICE | CUSTOM
  kind: text("kind").notNull().default("FIXED"), // FIXED | PERCENT
  amountCents: integer("amount_cents").notNull().default(0),
  rate: doublePrecision("rate").notNull().default(0),
  calculationBase: text("calculation_base").notNull().default("MONTHLY"),
  // MONTHLY | PER_CAMPAIGN | PER_VERIFIED_USAGE | PER_CLICK | PER_IMPRESSION
  currency: text("currency").notNull().default("TRY"),
  validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 30. Faturalar (işletmeye kesilen hizmet bedeli)
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    number: text("number").notNull().unique(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    currency: text("currency").notNull().default("TRY"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxRate: doublePrecision("tax_rate").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    status: text("status").notNull().default("DRAFT"),
    // DRAFT | ISSUED | SENT | PAID | PARTIALLY_PAID | OVERDUE | CANCELLED
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("invoices_business_idx").on(t.businessId)]
);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  // Uygulanan kural + oran işlem anında dondurulur (geriye dönük değişmez).
  feeRuleId: uuid("fee_rule_id").references(() => serviceFeeRules.id),
  serviceType: text("service_type").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull().default(0),
  appliedRate: doublePrecision("applied_rate"),
  amountCents: integer("amount_cents").notNull().default(0),
});

// 31. Müşteri etkileşimleri
export const savedCampaigns = pgTable(
  "saved_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("saved_campaigns_unique").on(t.userId, t.campaignId)]
);

export const followedBusinesses = pgTable(
  "followed_businesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("followed_businesses_unique").on(t.userId, t.businessId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("INFO"), // INFO | BONUS | CAMPAIGN | REFERRAL | SYSTEM
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.read)]
);

/* ================================================================== *
 * v3 — AFFILIATE (ONLINE FIRSAT) GELİR AKIŞI
 * KURAL: Dış satıcıya giden tıklama = satın alma DEĞİLDİR.
 * Komisyon yalnızca ağ/işletme raporuna dayanır ve yaşam döngüsü
 * ayrı durumlarda tutulur. Müşteriye ait hiçbir para/bakiye yoktur.
 * ================================================================== */

export const affiliateNetworks = pgTable("affiliate_networks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  // NOT_CONNECTED | PENDING_CREDENTIALS | CONNECTED | SUSPENDED
  status: text("status").notNull().default("NOT_CONNECTED"),
  reportingMethod: text("reporting_method"), // API | POSTBACK | CSV | MANUAL
  commissionModel: text("commission_model"), // CPS | CPA | CPL | HYBRID
  notes: text("notes"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const affiliateOffers = pgTable(
  "affiliate_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    merchant: text("merchant").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    category: text("category").notNull().default("genel"),
    country: text("country").notNull().default("TR"),
    networkId: uuid("network_id").references(() => affiliateNetworks.id),
    destinationUrl: text("destination_url").notNull(),
    currency: text("currency").notNull().default("TRY"),
    // Fiyat yalnızca doğrulanmış/kaynaklı ise tutulur; aksi halde null.
    priceCents: integer("price_cents"),
    priceVerified: boolean("price_verified").notNull().default(false),
    // Komisyon koşulları ağ tarafından sağlanmadıysa null kalır (uydurulmaz).
    commissionTerms: text("commission_terms"),
    disclosure: text("disclosure").notNull(),
    terms: text("terms"),
    exclusions: jsonb("exclusions").$type<string[]>().default([]),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | PAUSED | EXPIRED
    isSponsored: boolean("is_sponsored").notNull().default(false),
    isSample: boolean("is_sample").notNull().default(true), // örnek/demo içerik etiketi
    lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow().notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("affiliate_offers_category_idx").on(t.category, t.country)]
);

export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => affiliateOffers.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    clickId: text("click_id").notNull().unique(), // ağa gönderilen izleme kimliği
    outboundAt: timestamp("outbound_at", { withTimezone: true }).defaultNow().notNull(),
    channel: text("channel").notNull().default("WEB"),
    confirmedOutbound: boolean("confirmed_outbound").notNull().default(false),
  },
  (t) => [index("affiliate_clicks_offer_idx").on(t.offerId)]
);

export const affiliateConversions = pgTable(
  "affiliate_conversions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    offerId: uuid("offer_id").references(() => affiliateOffers.id),
    clickId: text("click_id"),
    networkId: uuid("network_id").references(() => affiliateNetworks.id),
    // REPORTED | PENDING | APPROVED | REJECTED | REVERSED | PAID
    status: text("status").notNull().default("REPORTED"),
    commissionCents: integer("commission_cents"),
    currency: text("currency").notNull().default("TRY"),
    // Kaynak: ağ raporu, manuel giriş veya DEMO örneği (uydurma canlı veri değil).
    source: text("source").notNull().default("NETWORK_REPORT"), // NETWORK_REPORT | MANUAL_ENTRY | DEMO_SAMPLE
    networkReference: text("network_reference"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("affiliate_conversions_status_idx").on(t.status)]
);

/** Video/storyboard varlıkları (AI video hizmeti ve eğitim videoları) */
export const videoAssets = pgTable("video_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("STORYBOARD"), // STORYBOARD | GENERATED | UPLOADED_EDIT
  topic: text("topic").notNull(),
  title: text("title").notNull(),
  durationSec: integer("duration_sec").notNull().default(15),
  scenes: jsonb("scenes").$type<{ at: string; visual: string; caption: string }[]>().default([]),
  captions: jsonb("captions").$type<Record<string, string[]>>().default({}),
  steps: jsonb("steps").$type<string[]>().default([]),
  poster: text("poster"),
  // Gerçek üretim/oynatma servisi bağlı değilse GENERATED durumu verilmez.
  renderStatus: text("render_status").notNull().default("NOT_RENDERED"), // NOT_RENDERED | QUEUED | RENDERED | FAILED
  status: text("status").notNull().default("DRAFT"), // DRAFT | APPROVED | PUBLISHED | REJECTED
  createdBy: text("created_by").notNull().default("AI"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
