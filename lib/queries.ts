import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adCampaigns,
  affiliateClicks,
  affiliateConversions,
  affiliateNetworks,
  affiliateOffers,
  videoAssets,
  aiContents,
  aiSettings,
  analyticsEvents,
  auditLogs,
  bonusGrants,
  bonusPolicies,
  businessHours,
  businessMedia,
  businessStaff,
  businesses,
  campaignUsages,
  campaigns,
  followedBusinesses,
  fraudReviews,
  invoiceItems,
  invoices,
  marketingPlanDays,
  marketingPlans,
  notifications,
  packages,
  products,
  qrCodes,
  referrals,
  reviews,
  savedCampaigns,
  serviceFeeRules,
  users,
} from "@/db/schema";

export type BusinessRow = typeof businesses.$inferSelect;

let seeded = false;
/**
 * Demo verisi hazırlayıcısı. Seed hatası sayfa render'ını engellemez:
 * mevcut veritabanı içeriğiyle çalışmaya devam edilir ve hata loglanır.
 */
export async function ensureSeeded() {
  if (seeded) return;
  try {
    const { ensureSeed } = await import("@/lib/seed");
    await ensureSeed();
  } catch (err) {
    console.error("[DampingVar] seed atlandı:", err instanceof Error ? err.message : err);
  }
  seeded = true;
}

const iso = (d: Date | string | null | undefined) => (d ? (typeof d === "string" ? d : d.toISOString()) : null);

/* ================================================================== *
 * KEŞİF
 * ================================================================== */

export type CampaignCard = {
  id: string;
  slug: string | null;
  code: string;
  title: string;
  description: string | null;
  type: string;
  discountPercent: number;
  discountAmountCents: number;
  minBasketCents: number;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  timeStart: string | null;
  timeEnd: string | null;
  status: string;
  moderationStatus: string;
  isSponsored: boolean;
  imageUrl: string | null;
  qrEnabled: boolean;
  businessId: string;
  businessName: string;
  businessSlug: string;
  district: string;
  city: string;
  country: string;
  category: string;
  sectorKey: string;
  rating: number;
  reviewCount: number;
  coverImage: string | null;
  verified: boolean;
};

const CARD_SELECT = {
  id: campaigns.id,
  slug: campaigns.slug,
  code: campaigns.code,
  title: campaigns.title,
  description: campaigns.description,
  type: campaigns.type,
  discountPercent: campaigns.discountPercent,
  discountAmountCents: campaigns.discountAmountCents,
  minBasketCents: campaigns.minBasketCents,
  currency: campaigns.currency,
  startsAt: campaigns.startsAt,
  endsAt: campaigns.endsAt,
  timeStart: campaigns.timeStart,
  timeEnd: campaigns.timeEnd,
  status: campaigns.status,
  moderationStatus: campaigns.moderationStatus,
  isSponsored: campaigns.isSponsored,
  imageUrl: campaigns.imageUrl,
  qrEnabled: campaigns.qrEnabled,
  businessId: businesses.id,
  businessName: businesses.name,
  businessSlug: businesses.slug,
  district: businesses.district,
  city: businesses.city,
  country: businesses.country,
  category: businesses.category,
  sectorKey: businesses.sectorKey,
  rating: businesses.rating,
  reviewCount: businesses.reviewCount,
  coverImage: businesses.coverImage,
  verified: businesses.verified,
};

function toCard(r: Record<string, unknown>): CampaignCard {
  return {
    ...(r as unknown as Omit<CampaignCard, "startsAt" | "endsAt">),
    startsAt: iso(r.startsAt as Date),
    endsAt: iso(r.endsAt as Date),
  } as CampaignCard;
}

export async function listCampaignCards(opts?: { limit?: number; district?: string; category?: string }) {
  await ensureSeeded();
  const rows = await db
    .select(CARD_SELECT)
    .from(campaigns)
    .innerJoin(businesses, eq(campaigns.businessId, businesses.id))
    .where(
      and(
        eq(campaigns.status, "PUBLISHED"),
        eq(campaigns.moderationStatus, "APPROVED"),
        opts?.district ? eq(businesses.district, opts.district) : undefined,
        opts?.category ? eq(businesses.category, opts.category) : undefined
      )
    )
    .orderBy(desc(campaigns.isSponsored), desc(campaigns.createdAt))
    .limit(opts?.limit ?? 60);
  return rows.map((r) => toCard(r as unknown as Record<string, unknown>));
}

export async function getCampaignBySlug(slug: string) {
  await ensureSeeded();
  const rows = await db
    .select(CARD_SELECT)
    .from(campaigns)
    .innerJoin(businesses, eq(campaigns.businessId, businesses.id))
    .where(sql`${campaigns.slug} = ${slug} or ${campaigns.code} = ${slug}`)
    .limit(1);
  if (!rows[0]) return null;
  const card = toCard(rows[0] as unknown as Record<string, unknown>);
  const full = await db.select().from(campaigns).where(eq(campaigns.id, card.id)).limit(1);
  const business = await db.select().from(businesses).where(eq(businesses.id, card.businessId)).limit(1);
  const hours = await db.select().from(businessHours).where(eq(businessHours.businessId, card.businessId));
  const qr = await db.select().from(qrCodes).where(eq(qrCodes.campaignId, card.id)).limit(1);
  const usageRows = await db
    .select({
      scanned: sql<number>`count(*) filter (where status <> 'CANCELLED')::int`,
      verified: sql<number>`count(*) filter (where status = 'VERIFIED')::int`,
    })
    .from(campaignUsages)
    .where(eq(campaignUsages.campaignId, card.id));
  const related = await listCampaignCards({ limit: 12, district: card.district });
  return {
    card,
    campaign: full[0] ?? null,
    business: business[0] ?? null,
    hours: hours.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    qrCode: qr[0]?.code ?? null,
    usage: { scanned: Number(usageRows[0]?.scanned ?? 0), verified: Number(usageRows[0]?.verified ?? 0) },
    related: related.filter((r) => r.id !== card.id).slice(0, 4),
  };
}

export async function getBusinessBySlug(slug: string) {
  await ensureSeeded();
  const rows = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  const biz = rows[0] ?? null;
  if (!biz) return null;
  const [hours, prods, media, revs, camps, staff] = await Promise.all([
    db.select().from(businessHours).where(eq(businessHours.businessId, biz.id)),
    db.select().from(products).where(eq(products.businessId, biz.id)),
    db.select().from(businessMedia).where(eq(businessMedia.businessId, biz.id)),
    db.select().from(reviews).where(eq(reviews.businessId, biz.id)).orderBy(desc(reviews.createdAt)),
    db
      .select(CARD_SELECT)
      .from(campaigns)
      .innerJoin(businesses, eq(campaigns.businessId, businesses.id))
      .where(and(eq(campaigns.businessId, biz.id), eq(campaigns.status, "PUBLISHED"))),
    db.select().from(businessStaff).where(eq(businessStaff.businessId, biz.id)),
  ]);
  return {
    biz,
    hours: hours.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    products: prods,
    media,
    reviews: revs,
    campaigns: camps.map((c) => toCard(c as unknown as Record<string, unknown>)),
    staff,
  };
}

export async function listBusinesses() {
  await ensureSeeded();
  return await db.select().from(businesses).orderBy(desc(businesses.featured), desc(businesses.rating));
}

export async function listDistricts() {
  await ensureSeeded();
  const rows = await db
    .select({ district: businesses.district, city: businesses.city, n: sql<number>`count(*)::int` })
    .from(businesses)
    .groupBy(businesses.district, businesses.city);
  return rows.map((r) => ({ ...r, n: Number(r.n) }));
}

export async function listCategories() {
  await ensureSeeded();
  const rows = await db
    .select({ category: businesses.category, n: sql<number>`count(*)::int` })
    .from(businesses)
    .groupBy(businesses.category);
  return rows.map((r) => ({ ...r, n: Number(r.n) }));
}

/* ================================================================== *
 * MÜŞTERİ
 * ================================================================== */

export async function getCustomerData(userId: string) {
  await ensureSeeded();
  const [saved, followed, refs, bonuses, usages, notifs, viewed] = await Promise.all([
    db
      .select({ savedAt: savedCampaigns.createdAt, campaignId: savedCampaigns.id })
      .from(savedCampaigns)
      .where(eq(savedCampaigns.userId, userId)),
    db.select().from(followedBusinesses).where(eq(followedBusinesses.userId, userId)),
    db.select().from(referrals).where(eq(referrals.inviterId, userId)).orderBy(desc(referrals.createdAt)),
    db.select().from(bonusGrants).where(eq(bonusGrants.userId, userId)).orderBy(desc(bonusGrants.createdAt)),
    db.select().from(campaignUsages).where(eq(campaignUsages.customerId, userId)).orderBy(desc(campaignUsages.scannedAt)).limit(30),
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(20),
    db
      .select({ businessId: analyticsEvents.businessId, at: analyticsEvents.createdAt })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.userId, userId), eq(analyticsEvents.kind, "business_view")))
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(8),
  ]);

  const learning = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.userId, userId), eq(analyticsEvents.kind, "video_played")));
  const discovery = await db
    .select({ n: sql<number>`count(distinct ${analyticsEvents.campaignId})::int` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.userId, userId), eq(analyticsEvents.kind, "campaign_view")));

  const savedIds = saved.map((s) => s.campaignId);
  const followedIds = followed.map((f) => f.businessId);
  const bizIds = Array.from(new Set([...followedIds, ...viewed.map((v) => v.businessId).filter(Boolean) as string[], ...bonuses.map((b) => b.businessId)]));

  const [savedCampaignsRows, bizRows, invitees] = await Promise.all([
    savedIds.length
      ? db
          .select(CARD_SELECT)
          .from(campaigns)
          .innerJoin(businesses, eq(campaigns.businessId, businesses.id))
          .where(inArray(campaigns.id, savedIds))
      : Promise.resolve([]),
    bizIds.length ? db.select().from(businesses).where(inArray(businesses.id, bizIds)) : Promise.resolve([]),
    refs.length ? db.select().from(users).where(inArray(users.id, refs.map((r) => r.inviteeId))) : Promise.resolve([]),
  ]);

  const usageCampaignIds = Array.from(new Set(usages.map((u) => u.campaignId).filter(Boolean) as string[]));
  const usageCampaigns = usageCampaignIds.length
    ? await db.select().from(campaigns).where(inArray(campaigns.id, usageCampaignIds))
    : [];

  return {
    savedIds,
    followedIds,
    savedCampaigns: savedCampaignsRows.map((r) => toCard(r as unknown as Record<string, unknown>)),
    businesses: bizRows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      district: b.district,
      city: b.city,
      category: b.category,
      coverImage: b.coverImage,
      rating: b.rating,
      reviewCount: b.reviewCount,
      verified: b.verified,
      followed: followedIds.includes(b.id),
    })),
    referrals: refs.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      createdAt: iso(r.createdAt),
      registeredAt: iso(r.registeredAt),
      inviteeName: invitees.find((u) => u.id === r.inviteeId)?.name ?? "—",
      fraudFlags: (r.fraudFlags ?? []) as string[],
    })),
    bonuses: bonuses.map((b) => ({
      id: b.id,
      businessId: b.businessId,
      businessName: bizRows.find((x) => x.id === b.businessId)?.name ?? "—",
      businessSlug: bizRows.find((x) => x.id === b.businessId)?.slug ?? "",
      valueCents: b.valueCents,
      currency: b.currency,
      minPurchaseCents: b.minPurchaseCents,
      status: b.status,
      expiresAt: iso(b.expiresAt),
      createdAt: iso(b.createdAt),
      redeemedAt: iso(b.redeemedAt),
    })),
    activity: usages.map((u) => ({
      id: u.id,
      status: u.status,
      channel: u.channel,
      scannedAt: iso(u.scannedAt),
      verifiedAt: iso(u.verifiedAt),
      businessName: bizRows.find((x) => x.id === u.businessId)?.name ?? "—",
      campaignTitle: usageCampaigns.find((c) => c.id === u.campaignId)?.title ?? "—",
      reportedDiscountCents: u.reportedDiscountCents,
      currency: u.currency,
    })),
    notifications: notifs.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      createdAt: iso(n.createdAt),
    })),
    progress: {
      discoveryCount: Number(discovery[0]?.n ?? 0),
      savedCount: savedIds.length,
      invitedCount: refs.length,
      verifiedReferrals: refs.filter((r) => ["QUALIFIED", "BONUS_AVAILABLE", "BONUS_USED"].includes(r.status)).length,
      verifiedUsages: usages.filter((u) => u.status === "VERIFIED").length,
      bonusEarned: bonuses.filter((b) => ["AVAILABLE", "USED"].includes(b.status)).length,
      learningCount: Number(learning[0]?.n ?? 0),
    },
    recentlyViewed: viewed
      .map((v) => bizRows.find((b) => b.id === v.businessId))
      .filter(Boolean)
      .slice(0, 4)
      .map((b) => ({
        id: b!.id,
        name: b!.name,
        slug: b!.slug,
        district: b!.district,
        coverImage: b!.coverImage,
        category: b!.category,
      })),
  };
}

/* ================================================================== *
 * İŞLETME
 * ================================================================== */

export async function getBusinessData(businessId: string, days = 14) {
  await ensureSeeded();
  const since = Date.now() - days * 86400000;
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return null;

  const [hours, camps, qr, usages, staff, ads, contents, plans, pkgs, invs, feeRules, bonusRows, refRows, events] =
    await Promise.all([
      db.select().from(businessHours).where(eq(businessHours.businessId, businessId)),
      db.select().from(campaigns).where(eq(campaigns.businessId, businessId)).orderBy(desc(campaigns.createdAt)),
      db.select().from(qrCodes).where(eq(qrCodes.businessId, businessId)),
      db.select().from(campaignUsages).where(eq(campaignUsages.businessId, businessId)).orderBy(desc(campaignUsages.scannedAt)),
      db.select().from(businessStaff).where(eq(businessStaff.businessId, businessId)),
      db.select().from(adCampaigns).where(eq(adCampaigns.businessId, businessId)),
      db.select().from(aiContents).where(eq(aiContents.businessId, businessId)).orderBy(desc(aiContents.createdAt)),
      db.select().from(marketingPlans).where(eq(marketingPlans.businessId, businessId)).limit(1),
      db.select().from(packages),
      db.select().from(invoices).where(eq(invoices.businessId, businessId)).orderBy(desc(invoices.periodEnd)),
      db.select().from(serviceFeeRules).where(eq(serviceFeeRules.businessId, businessId)),
      db.select().from(bonusGrants).where(eq(bonusGrants.businessId, businessId)),
      db.select().from(referrals),
      db.select().from(analyticsEvents).where(eq(analyticsEvents.businessId, businessId)),
    ]);

  const planDays = plans[0]
    ? await db.select().from(marketingPlanDays).where(eq(marketingPlanDays.planId, plans[0].id)).orderBy(marketingPlanDays.day)
    : [];
  const invoiceIds = invs.map((i) => i.id);
  const items = invoiceIds.length
    ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds))
    : [];

  const evCount = (kind: string) => events.filter((e) => e.kind === kind).length;
  const byDay = (arr: Date[]) => {
    const out = Array.from({ length: days }, () => 0);
    arr.forEach((d) => {
      const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
      if (diff >= 0 && diff < days) out[days - 1 - diff] += 1;
    });
    return out;
  };
  const inRange = (d: Date | string | null | undefined) =>
    !!d && new Date(d).getTime() >= since;
  const evInRange = events.filter((e) => inRange(e.createdAt));

  const scanned = usages.filter((u) => u.status !== "CANCELLED");
  const verified = usages.filter((u) => u.status === "VERIFIED");
  const pending = usages.filter((u) => u.status === "SUBMITTED");
  const customersIds = Array.from(new Set(usages.map((u) => u.customerId).filter(Boolean) as string[]));
  const customerRows = customersIds.length ? await db.select().from(users).where(inArray(users.id, customersIds)) : [];

  return {
    biz,
    hours: hours.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    campaigns: camps.map((c) => ({
      id: c.id,
      slug: c.slug,
      code: c.code,
      title: c.title,
      description: c.description,
      type: c.type,
      discountPercent: c.discountPercent,
      discountAmountCents: c.discountAmountCents,
      minBasketCents: c.minBasketCents,
      maxDiscountCents: c.maxDiscountCents,
      currency: c.currency,
      startsAt: iso(c.startsAt),
      endsAt: iso(c.endsAt),
      timeStart: c.timeStart,
      timeEnd: c.timeEnd,
      days: (c.days ?? []) as number[],
      status: c.status,
      moderationStatus: c.moderationStatus,
      isSponsored: c.isSponsored,
      qrEnabled: c.qrEnabled,
      eligibleItems: (c.eligibleItems ?? []) as string[],
      exclusions: (c.exclusions ?? []) as string[],
      terms: c.terms,
      imageUrl: c.imageUrl,
      views: c.views,
      clicks: c.clicks,
      perCustomerLimit: c.perCustomerLimit,
      usageLimit: c.usageLimit,
      scans: scanned.filter((u) => u.campaignId === c.id).length,
      verifiedCount: verified.filter((u) => u.campaignId === c.id).length,
    })),
    qrCodes: qr.map((q) => ({ id: q.id, code: q.code, campaignId: q.campaignId, status: q.status, createdAt: iso(q.createdAt) })),
    usages: usages.map((u) => ({
      id: u.id,
      campaignId: u.campaignId,
      campaignTitle: camps.find((c) => c.id === u.campaignId)?.title ?? "—",
      status: u.status,
      channel: u.channel,
      scannedAt: iso(u.scannedAt),
      verifiedAt: iso(u.verifiedAt),
      // §19 gizlilik: işletme personeline müşteri kimliği açılmaz; takma etiket gösterilir.
      customerLabel: u.customerId
        ? `Müşteri ${String(customerRows.find((c) => c.id === u.customerId)?.name ?? "").trim().split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toLocaleUpperCase("tr-TR") || "•"}·${u.customerId.slice(0, 4)}`
        : "Misafir",
      reportedBasketCents: u.reportedBasketCents,
      reportedDiscountCents: u.reportedDiscountCents,
      currency: u.currency,
      note: u.note,
      idempotencyKey: u.idempotencyKey,
    })),
    staff: staff.map((s) => ({ id: s.id, name: s.name, email: s.email, role: s.role, active: s.active })),
    ads: ads.map((a) => ({
      id: a.id,
      name: a.name,
      placement: a.placement,
      district: a.district,
      category: a.category,
      budgetCents: a.budgetCents,
      currency: "TRY",
      status: a.status,
      impressions: a.impressions,
      clicks: a.clicks,
      startsAt: iso(a.startsAt),
      endsAt: iso(a.endsAt),
    })),
    contents: contents.map((c) => ({
      id: c.id,
      kind: c.kind,
      platform: c.platform,
      title: c.title,
      body: c.body,
      cta: c.cta,
      variant: c.variant,
      status: c.status,
      createdAt: iso(c.createdAt),
    })),
    plan: plans[0]
      ? {
          id: plans[0].id,
          title: plans[0].title,
          goal: plans[0].goal,
          status: plans[0].status,
          days: planDays.map((d) => ({
            id: d.id,
            day: d.day,
            theme: d.theme,
            task: d.task,
            channel: d.channel,
            caption: d.caption,
            cta: d.cta,
            done: d.done,
          })),
        }
      : null,
    packages: pkgs.map((p) => ({
      code: p.code,
      name: p.name,
      priceMonthlyCents: p.priceMonthlyCents,
      features: (p.features ?? []) as string[],
      aiQuotaMonthly: p.aiQuotaMonthly,
      active: p.active,
    })),
    invoices: invs.map((i) => ({
      id: i.id,
      number: i.number,
      periodStart: iso(i.periodStart),
      periodEnd: iso(i.periodEnd),
      currency: i.currency,
      subtotalCents: i.subtotalCents,
      taxRate: i.taxRate,
      taxCents: i.taxCents,
      totalCents: i.totalCents,
      status: i.status,
      issuedAt: iso(i.issuedAt),
      dueDate: iso(i.dueDate),
      paidAt: iso(i.paidAt),
      note: i.note,
      items: items
        .filter((it) => it.invoiceId === i.id)
        .map((it) => ({
          id: it.id,
          serviceType: it.serviceType,
          description: it.description,
          quantity: it.quantity,
          unitPriceCents: it.unitPriceCents,
          appliedRate: it.appliedRate,
          amountCents: it.amountCents,
        })),
    })),
    feeRules: feeRules.map((f) => ({
      id: f.id,
      serviceType: f.serviceType,
      kind: f.kind,
      amountCents: f.amountCents,
      rate: f.rate,
      calculationBase: f.calculationBase,
      currency: f.currency,
      validFrom: iso(f.validFrom),
      validTo: iso(f.validTo),
      active: f.active,
    })),
    bonusGrants: bonusRows.map((b) => ({
      id: b.id,
      status: b.status,
      valueCents: b.valueCents,
      currency: b.currency,
      createdAt: iso(b.createdAt),
      // §19 gizlilik: işletmeye müşteri kimliği verilmez, takma etiket üretilir.
      userName: `Müşteri ·${b.userId.slice(0, 4)}`,
    })),
    rangeDays: days,
    metrics: {
      impressions: evCount("ad_impression") + camps.reduce((s, c) => s + c.views, 0),
      clicks: evCount("campaign_click") + camps.reduce((s, c) => s + c.clicks, 0),
      campaignViews: evInRange.filter((e) => e.kind === "campaign_view").length,
      pageVisits: evInRange.filter((e) => e.kind === "business_view").length,
      qrScans: scanned.length,
      verifiedUsage: verified.length,
      pendingVerification: pending.length,
      referralTraffic: usages.filter((u) => u.channel === "REFERRAL").length,
      uniqueCustomers: customersIds.length,
      series14: byDay(usages.map((u) => new Date(u.scannedAt))),
      clicks14: byDay(evInRange.filter((e) => e.kind === "campaign_click").map((e) => new Date(e.createdAt))),
      views14: byDay(evInRange.filter((e) => e.kind === "campaign_view").map((e) => new Date(e.createdAt))),
      // AI pazarlama hunisi: yalnızca gerçekten kaydedilmiş içerik durumları
      contentCreated: contents.length,
      contentApproved: contents.filter((c) => ["APPROVED", "PUBLISHED"].includes(c.status)).length,
      contentPublished: contents.filter((c) => c.status === "PUBLISHED").length,
      contentRejected: contents.filter((c) => c.status === "REJECTED").length,
    },
    referralsIn: refRows.length,
  };
}

/* ================================================================== *
 * ADMİN
 * ================================================================== */

export async function getAdminData() {
  await ensureSeeded();
  const [bizRows, usersRows, camps, usages, refs, bonuses, policies, pkgs, feeRules, invs, ads, fraud, audit, aiSet, contents, events] =
    await Promise.all([
      db.select().from(businesses).orderBy(desc(businesses.createdAt)),
      db.select().from(users).orderBy(desc(users.createdAt)),
      db.select().from(campaigns).orderBy(desc(campaigns.createdAt)),
      db.select().from(campaignUsages).orderBy(desc(campaignUsages.scannedAt)).limit(60),
      db.select().from(referrals).orderBy(desc(referrals.createdAt)),
      db.select().from(bonusGrants).orderBy(desc(bonusGrants.createdAt)),
      db.select().from(bonusPolicies),
      db.select().from(packages),
      db.select().from(serviceFeeRules),
      db.select().from(invoices).orderBy(desc(invoices.periodEnd)),
      db.select().from(adCampaigns),
      db.select().from(fraudReviews).orderBy(desc(fraudReviews.createdAt)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(25),
      db.select().from(aiSettings),
      db.select().from(aiContents).orderBy(desc(aiContents.createdAt)).limit(20),
      db.select().from(analyticsEvents).limit(2000),
    ]);

  const evCount = (k: string) => events.filter((e) => e.kind === k).length;

  return {
    counts: {
      businesses: bizRows.length,
      customers: usersRows.filter((u) => u.role === "CUSTOMER").length,
      campaigns: camps.length,
      pendingModeration: camps.filter((c) => c.moderationStatus === "PENDING").length,
      qrScans: usages.filter((u) => u.status !== "CANCELLED").length,
      verifiedUsage: usages.filter((u) => u.status === "VERIFIED").length,
      pendingVerification: usages.filter((u) => u.status === "SUBMITTED").length,
      referrals: refs.length,
      bonusAvailable: bonuses.filter((b) => b.status === "AVAILABLE").length,
      bonusPending: bonuses.filter((b) => b.status === "PENDING_VERIFICATION").length,
      invoicesOpen: invs.filter((i) => ["ISSUED", "SENT", "OVERDUE"].includes(i.status)).length,
      revenue: invs.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalCents, 0),
      billed: invs.reduce((s, i) => s + i.totalCents, 0),
      fraudOpen: fraud.filter((f) => f.status === "OPEN").length,
      events: {
        campaign_view: evCount("campaign_view"),
        campaign_click: evCount("campaign_click"),
        business_view: evCount("business_view"),
        qr_scanned: evCount("qr_scanned"),
        referral_click: evCount("referral_click"),
        ad_impression: evCount("ad_impression"),
        ad_click: evCount("ad_click"),
      },
    },
    businesses: bizRows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      category: b.category,
      district: b.district,
      city: b.city,
      country: b.country,
      currency: b.currency,
      planCode: b.planCode,
      verified: b.verified,
      featured: b.featured,
      rating: b.rating,
      reviewCount: b.reviewCount,
      campaigns: camps.filter((c) => c.businessId === b.id).length,
    })),
    customers: usersRows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      district: u.district,
      country: u.country,
      lang: u.lang,
      currency: u.currency,
      referralCode: u.referralCode,
      createdAt: iso(u.createdAt),
      usages: usages.filter((x) => x.customerId === u.id).length,
    })),
    campaigns: camps.map((c) => ({
      id: c.id,
      code: c.code,
      slug: c.slug,
      title: c.title,
      status: c.status,
      moderationStatus: c.moderationStatus,
      isSponsored: c.isSponsored,
      discountPercent: c.discountPercent,
      currency: c.currency,
      endsAt: iso(c.endsAt),
      businessName: bizRows.find((b) => b.id === c.businessId)?.name ?? "—",
      businessId: c.businessId,
      views: c.views,
      clicks: c.clicks,
    })),
    usages: usages.map((u) => ({
      id: u.id,
      status: u.status,
      channel: u.channel,
      scannedAt: iso(u.scannedAt),
      verifiedAt: iso(u.verifiedAt),
      businessName: bizRows.find((b) => b.id === u.businessId)?.name ?? "—",
      campaignTitle: camps.find((c) => c.id === u.campaignId)?.title ?? "—",
      customerName: usersRows.find((x) => x.id === u.customerId)?.name ?? "Misafir",
      reportedDiscountCents: u.reportedDiscountCents,
      currency: u.currency,
    })),
    referrals: refs.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      createdAt: iso(r.createdAt),
      inviter: usersRows.find((u) => u.id === r.inviterId)?.name ?? "—",
      invitee: usersRows.find((u) => u.id === r.inviteeId)?.name ?? "—",
      fraudFlags: (r.fraudFlags ?? []) as string[],
    })),
    bonuses: bonuses.map((b) => ({
      id: b.id,
      status: b.status,
      valueCents: b.valueCents,
      currency: b.currency,
      businessName: bizRows.find((x) => x.id === b.businessId)?.name ?? "—",
      userName: usersRows.find((x) => x.id === b.userId)?.name ?? "—",
      expiresAt: iso(b.expiresAt),
      createdAt: iso(b.createdAt),
    })),
    policies: policies.map((p) => ({
      id: p.id,
      key: p.key,
      businessId: p.businessId,
      businessName: p.businessId ? (bizRows.find((b) => b.id === p.businessId)?.name ?? "—") : "Tüm platform",
      rewardKind: p.rewardKind,
      rewardCents: p.rewardCents,
      rewardPercent: p.rewardPercent,
      maxRewardCents: p.maxRewardCents,
      minPurchaseCents: p.minPurchaseCents,
      validDays: p.validDays,
      maxPerInviter: p.maxPerInviter,
      requiresVerification: p.requiresVerification,
      active: p.active,
    })),
    packages: pkgs.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      priceMonthlyCents: p.priceMonthlyCents,
      features: (p.features ?? []) as string[],
      aiQuotaMonthly: p.aiQuotaMonthly,
      active: p.active,
    })),
    feeRules: feeRules.map((f) => ({
      id: f.id,
      businessName: f.businessId ? (bizRows.find((b) => b.id === f.businessId)?.name ?? "—") : "Varsayılan",
      packageCode: f.packageCode,
      serviceType: f.serviceType,
      kind: f.kind,
      amountCents: f.amountCents,
      rate: f.rate,
      calculationBase: f.calculationBase,
      currency: f.currency,
      active: f.active,
      validFrom: iso(f.validFrom),
      validTo: iso(f.validTo),
    })),
    invoices: invs.map((i) => ({
      id: i.id,
      number: i.number,
      businessName: bizRows.find((b) => b.id === i.businessId)?.name ?? "—",
      businessId: i.businessId,
      periodStart: iso(i.periodStart),
      periodEnd: iso(i.periodEnd),
      currency: i.currency,
      subtotalCents: i.subtotalCents,
      taxCents: i.taxCents,
      totalCents: i.totalCents,
      status: i.status,
      dueDate: iso(i.dueDate),
      paidAt: iso(i.paidAt),
    })),
    ads: ads.map((a) => ({
      id: a.id,
      name: a.name,
      placement: a.placement,
      status: a.status,
      impressions: a.impressions,
      clicks: a.clicks,
      budgetCents: a.budgetCents,
      businessName: bizRows.find((b) => b.id === a.businessId)?.name ?? "—",
    })),
    fraud: fraud.map((f) => ({
      id: f.id,
      reason: f.reason,
      status: f.status,
      signals: (f.signals ?? []) as string[],
      createdAt: iso(f.createdAt),
      userName: usersRows.find((u) => u.id === f.userId)?.name ?? "—",
    })),
    audit: audit.map((a) => ({
      id: a.id,
      actor: a.actor,
      role: a.role,
      action: a.action,
      entityType: a.entityType,
      createdAt: iso(a.createdAt),
    })),
    aiSettings: aiSet.map((s) => ({ id: s.id, key: s.key, value: s.value, description: s.description })),
    contents: contents.map((c) => ({
      id: c.id,
      kind: c.kind,
      title: c.title,
      status: c.status,
      businessName: bizRows.find((b) => b.id === c.businessId)?.name ?? "—",
      createdAt: iso(c.createdAt),
    })),
  };
}

/* ================================================================== *
 * OLAY TAKİBİ
 * ================================================================== */

export const EVENT_KINDS = [
  "business_view",
  "campaign_view",
  "campaign_click",
  "offer_view",
  "qr_generated",
  "qr_scanned",
  "usage_submitted",
  "usage_verified",
  "usage_rejected",
  "usage_cancelled",
  "referral_click",
  "referral_signup",
  "referral_qualified",
  "bonus_granted",
  "bonus_redeemed",
  "ad_impression",
  "ad_click",
  "filter_used",
  "campaign_saved",
  "business_followed",
  "affiliate_impression",
  "affiliate_click",
  "affiliate_outbound",
  "conversion_reported",
  "commission_status_changed",
  "video_played",
  "video_completed",
] as const;

export async function trackEvent(
  kind: string,
  opts: { businessId?: string | null; campaignId?: string | null; userId?: string | null; meta?: Record<string, unknown> } = {}
) {
  await db
    .insert(analyticsEvents)
    .values({
      kind,
      businessId: opts.businessId ?? null,
      campaignId: opts.campaignId ?? null,
      userId: opts.userId ?? null,
      meta: opts.meta ?? {},
    })
    .catch(() => undefined);
}

export async function logAudit(
  actor: string,
  role: string,
  action: string,
  entityType: string,
  entityId: string | null,
  meta: Record<string, unknown> = {}
) {
  await db
    .insert(auditLogs)
    .values({ actor, role, action, entityType, entityId, meta })
    .catch(() => undefined);
}

export async function unusedQrCodes(businessId: string) {
  return await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.businessId, businessId), eq(qrCodes.status, "ACTIVE")))
    .limit(10);
}

export async function findBusinessById(id: string) {
  const rows = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function policiesAll() {
  return await db.select().from(bonusPolicies);
}

export async function defaultPolicy() {
  const rows = await db.select().from(bonusPolicies).where(isNull(bonusPolicies.businessId)).limit(1);
  return rows[0] ?? null;
}

/* ================================================================== *
 * AFFILIATE (ONLINE FIRSAT) SORGULARI
 * Kural: tıklama ≠ dönüşüm; bekleyen komisyon ≠ doğrulanmış gelir.
 * ================================================================== */

export type OfferCard = {
  id: string; slug: string; merchant: string; title: string; description: string | null;
  category: string; country: string; currency: string;
  priceCents: number | null; priceVerified: boolean;
  imageUrl: string | null; destinationUrl: string; disclosure: string;
  terms: string | null; exclusions: string[]; commissionTerms: string | null;
  startsAt: string | null; endsAt: string | null; lastUpdated: string | null;
  status: string; isSponsored: boolean; isSample: boolean; clicks: number; impressions: number;
  networkName: string | null; networkStatus: string | null;
};

const OFFER_SELECT = {
  id: affiliateOffers.id, slug: affiliateOffers.slug, merchant: affiliateOffers.merchant,
  title: affiliateOffers.title, description: affiliateOffers.description, category: affiliateOffers.category,
  country: affiliateOffers.country, currency: affiliateOffers.currency, priceCents: affiliateOffers.priceCents,
  priceVerified: affiliateOffers.priceVerified, imageUrl: affiliateOffers.imageUrl,
  destinationUrl: affiliateOffers.destinationUrl, disclosure: affiliateOffers.disclosure,
  terms: affiliateOffers.terms, exclusions: affiliateOffers.exclusions,
  commissionTerms: affiliateOffers.commissionTerms, startsAt: affiliateOffers.startsAt,
  endsAt: affiliateOffers.endsAt, lastUpdated: affiliateOffers.lastUpdated,
  status: affiliateOffers.status, isSponsored: affiliateOffers.isSponsored, isSample: affiliateOffers.isSample,
  clicks: affiliateOffers.clicks, impressions: affiliateOffers.impressions,
  networkName: affiliateNetworks.name, networkStatus: affiliateNetworks.status,
};

function toOffer(r: Record<string, unknown>): OfferCard {
  const o = r as unknown as OfferCard & { startsAt: unknown; endsAt: unknown; lastUpdated: unknown };
  return { ...o, startsAt: iso(o.startsAt as unknown as Date), endsAt: iso(o.endsAt as unknown as Date), lastUpdated: iso(o.lastUpdated as unknown as Date), exclusions: (o.exclusions ?? []) as string[] };
}

export async function listOffers(opts?: { limit?: number; category?: string; country?: string }) {
  await ensureSeeded();
  const rows = await db
    .select(OFFER_SELECT)
    .from(affiliateOffers)
    .leftJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(
      and(
        eq(affiliateOffers.status, "ACTIVE"),
        opts?.category ? eq(affiliateOffers.category, opts.category) : undefined,
        opts?.country ? eq(affiliateOffers.country, opts.country) : undefined
      )
    )
    .orderBy(desc(affiliateOffers.isSponsored), desc(affiliateOffers.lastUpdated))
    .limit(opts?.limit ?? 40);
  return rows.map((r) => toOffer(r as unknown as Record<string, unknown>));
}

export async function getOfferBySlug(slug: string) {
  await ensureSeeded();
  const rows = await db
    .select(OFFER_SELECT)
    .from(affiliateOffers)
    .leftJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(eq(affiliateOffers.slug, slug))
    .limit(1);
  if (!rows[0]) return null;
  const offer = toOffer(rows[0] as unknown as Record<string, unknown>);
  const related = await listOffers({ limit: 8, category: offer.category });
  const clicks = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(affiliateClicks)
    .where(eq(affiliateClicks.offerId, offer.id));
  const conversions = await db
    .select({ status: affiliateConversions.status, n: sql<number>`count(*)::int` })
    .from(affiliateConversions)
    .where(eq(affiliateConversions.offerId, offer.id))
    .groupBy(affiliateConversions.status);
  return {
    offer,
    related: related.filter((r) => r.id !== offer.id).slice(0, 4),
    stats: { clicks: Number(clicks[0]?.n ?? 0), conversions: conversions.map((c) => ({ status: c.status, n: Number(c.n) })) },
  };
}

export async function listOfferCategories() {
  await ensureSeeded();
  const rows = await db
    .select({ category: affiliateOffers.category, n: sql<number>`count(*)::int` })
    .from(affiliateOffers)
    .groupBy(affiliateOffers.category);
  return rows.map((r) => ({ category: r.category, n: Number(r.n) }));
}

export async function getAffiliateData() {
  await ensureSeeded();
  const [networks, offers, clicks, conversions] = await Promise.all([
    db.select().from(affiliateNetworks),
    db.select().from(affiliateOffers),
    db.select().from(affiliateClicks),
    db.select().from(affiliateConversions),
  ]);
  const byStatus = (s: string) => conversions.filter((c) => c.status === s);
  const sum = (list: typeof conversions) => list.reduce((a, c) => a + (c.commissionCents ?? 0), 0);
  return {
    networks: networks.map((n) => ({
      id: n.id, name: n.name, status: n.status, reportingMethod: n.reportingMethod,
      commissionModel: n.commissionModel, notes: n.notes, lastSyncAt: iso(n.lastSyncAt),
    })),
    offers: offers.map((o) => ({
      id: o.id, slug: o.slug, merchant: o.merchant, title: o.title, category: o.category,
      country: o.country, currency: o.currency, status: o.status, isSample: o.isSample,
      isSponsored: o.isSponsored, impressions: o.impressions, clicks: o.clicks,
      networkName: networks.find((n) => n.id === o.networkId)?.name ?? "—",
      networkStatus: networks.find((n) => n.id === o.networkId)?.status ?? "NOT_CONNECTED",
      commissionTerms: o.commissionTerms, endsAt: iso(o.endsAt), lastUpdated: iso(o.lastUpdated),
      conversions: conversions.filter((c) => c.offerId === o.id).length,
    })),
    clicks: clicks.map((c) => ({
      id: c.id, clickId: c.clickId, offerId: c.offerId,
      offerTitle: offers.find((o) => o.id === c.offerId)?.title ?? "—",
      merchant: offers.find((o) => o.id === c.offerId)?.merchant ?? "—",
      channel: c.channel, confirmedOutbound: c.confirmedOutbound, outboundAt: iso(c.outboundAt),
      hasConversion: conversions.some((v) => v.clickId === c.clickId),
    })),
    conversions: conversions.map((c) => ({
      id: c.id, status: c.status, source: c.source, networkReference: c.networkReference,
      commissionCents: c.commissionCents, currency: c.currency,
      offerTitle: offers.find((o) => o.id === c.offerId)?.title ?? "—",
      merchant: offers.find((o) => o.id === c.offerId)?.merchant ?? "—",
      clickId: c.clickId, reportedAt: iso(c.reportedAt), decidedAt: iso(c.decidedAt),
      paidAt: iso(c.paidAt), note: c.note,
    })),
    totals: {
      offers: offers.length,
      activeOffers: offers.filter((o) => o.status === "ACTIVE").length,
      impressions: offers.reduce((a, o) => a + o.impressions, 0),
      clicks: clicks.length,
      outbound: clicks.filter((c) => c.confirmedOutbound).length,
      reported: byStatus("REPORTED").length,
      pending: byStatus("PENDING").length,
      approved: byStatus("APPROVED").length,
      rejected: byStatus("REJECTED").length,
      reversed: byStatus("REVERSED").length,
      paid: byStatus("PAID").length,
      // DOĞRULANMIŞ gelir: yalnızca APPROVED + PAID
      confirmedCents: sum(byStatus("APPROVED")) + sum(byStatus("PAID")),
      // TAHMİNİ/BEKLEYEN: rapor + beklemede (asla gelir gibi gösterilmez)
      unconfirmedCents: sum(byStatus("REPORTED")) + sum(byStatus("PENDING")),
      paidCents: sum(byStatus("PAID")),
      demoSourced: conversions.filter((c) => c.source === "DEMO_SAMPLE").length,
    },
  };
}

/** Birleşik etkinlik akışı — kişisel veri içermeyecek şekilde soyutlanır. */
export async function getFlowStream(limit = 40, userId?: string | null) {
  await ensureSeeded();
  const [clicks, conversions, usages, offers, bizRows, events] = await Promise.all([
    db.select().from(affiliateClicks).orderBy(desc(affiliateClicks.outboundAt)).limit(limit),
    db.select().from(affiliateConversions).orderBy(desc(affiliateConversions.reportedAt)).limit(limit),
    db.select().from(campaignUsages).orderBy(desc(campaignUsages.scannedAt)).limit(limit),
    db.select().from(affiliateOffers),
    db.select({ id: businesses.id, name: businesses.name }).from(businesses),
    userId
      ? db.select().from(analyticsEvents).where(eq(analyticsEvents.userId, userId)).orderBy(desc(analyticsEvents.createdAt)).limit(limit)
      : db.select().from(analyticsEvents).orderBy(desc(analyticsEvents.createdAt)).limit(limit),
  ]);

  type Flow = {
    id: string; journey: "affiliate" | "local" | "referral" | "platform";
    kind: string; label: string; subject: string; status: string;
    verified: boolean; at: string | null; note?: string;
  };
  const out: Flow[] = [];

  for (const c of clicks) {
    const o = offers.find((x) => x.id === c.offerId);
    out.push({
      id: `click-${c.id}`, journey: "affiliate", kind: "affiliate_click",
      label: "Affiliate bağlantısına tıklandı", subject: o ? `${o.merchant} · ${o.title}` : "—",
      status: c.confirmedOutbound ? "REDIRECTED" : "CLICKED", verified: false,
      at: iso(c.outboundAt), note: "Tıklama satın alma anlamına gelmez.",
    });
  }
  for (const v of conversions) {
    const o = offers.find((x) => x.id === v.offerId);
    out.push({
      id: `conv-${v.id}`, journey: "affiliate", kind: "commission_status",
      label: "Komisyon durumu güncellendi", subject: o ? `${o.merchant} · ${o.title}` : "—",
      status: v.status, verified: v.status === "APPROVED" || v.status === "PAID",
      at: iso(v.decidedAt ?? v.reportedAt),
      note: v.source === "DEMO_SAMPLE" ? "Örnek kayıt — bağlı bir ağdan gelmedi." : `Kaynak: ${v.source}`,
    });
  }
  for (const u of usages) {
    out.push({
      id: `usage-${u.id}`, journey: "local", kind: `qr_${u.status.toLowerCase()}`,
      label: u.status === "VERIFIED" ? "Kampanya kullanımı doğrulandı" : u.status === "SUBMITTED" ? "Doğrulama bekleniyor" : u.status === "REJECTED" ? "Kullanım reddedildi" : "QR okutuldu",
      subject: bizRows.find((b) => b.id === u.businessId)?.name ?? "—",
      status: u.status, verified: u.status === "VERIFIED", at: iso(u.scannedAt),
      note: u.status === "QR_SCANNED" ? "Okutma tek başına satış kanıtı değildir." : undefined,
    });
  }
  for (const e of events) {
    if (!["referral_click", "referral_signup", "referral_qualified", "bonus_granted", "bonus_redeemed", "campaign_view"].includes(e.kind)) continue;
    out.push({
      id: `ev-${e.id}`,
      journey: e.kind.startsWith("referral") || e.kind.startsWith("bonus") ? "referral" : "platform",
      kind: e.kind,
      label:
        e.kind === "bonus_granted" ? "Mağazaya bağlı Damping Bonus oluştu"
        : e.kind === "bonus_redeemed" ? "Damping Bonus kullanıldı"
        : e.kind === "referral_qualified" ? "Davet koşulu sağlandı"
        : e.kind === "referral_signup" ? "Davet edilen kullanıcı kayıt oldu"
        : e.kind === "referral_click" ? "Davet bağlantısına tıklandı"
        : "Kampanya görüntülendi",
      subject: bizRows.find((b) => b.id === e.businessId)?.name ?? "DampingVar",
      status: e.kind === "bonus_granted" ? "AVAILABLE" : e.kind === "bonus_redeemed" ? "USED" : e.kind === "referral_qualified" ? "QUALIFIED" : "RECORDED",
      verified: e.kind === "referral_qualified" || e.kind === "bonus_granted",
      at: iso(e.createdAt),
    });
  }

  return out
    .filter((x) => x.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
}

export async function listVideos(topic?: string) {
  await ensureSeeded();
  const rows = topic
    ? await db.select().from(videoAssets).where(eq(videoAssets.topic, topic)).limit(1)
    : await db.select().from(videoAssets);
  return rows.map((v) => ({
    id: v.id, topic: v.topic, title: v.title, kind: v.kind, durationSec: v.durationSec,
    scenes: (v.scenes ?? []) as { at: string; visual: string; caption: string }[],
    captions: (v.captions ?? {}) as Record<string, string[]>,
    steps: (v.steps ?? []) as string[],
    poster: v.poster, renderStatus: v.renderStatus, status: v.status,
  }));
}
