/**
 * FAZ 6 — Supabase veri katmanı (TEK veri katmanı; Drizzle kaldırıldı).
 *
 * Kurallar:
 *  * Şekiller eski çıktı sözleşmesiyle BİREBİR aynıdır (lib/data/types.ts);
 *    tarih alanları ISO string veya Date (raw satır mapping'inde) döner.
 *  * Roller KÜÇÜK harf saklanır, ekran/sınır noktalarında UPPERCASE'e eşlenir.
 *  * Gizlilik: müşteri kimliği işletmeye etiket olarak verilir (§19) — RPC'ler.
 *  * Yazma işlemleri bu dosyada DEĞİLDİR: onlar lib/data/supabase-actions.ts
 *    + dv_* RPC'leri üzerindendir (RLS istemci yazmalarını kapatır).
 *  * Olay/bildirim eklemeleri append-only RLS ile sınırlıdır; hatalar yutulur
 *    (sayfa render'ını engellemez).
 */
import { createClient } from "@/lib/supabase/server";
import type { BusinessRow, FeeRuleRow, PackageRow } from "./types";

type Row = Record<string, unknown>;

const iso = (v: unknown): string | null =>
  v == null ? null : typeof v === "string" ? v : new Date(v as string | number | Date).toISOString();
const n = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => String(v ?? "");
const nul = (v: unknown) => (v == null ? null : String(v));
/** Row[] üzerinde find+alan okuması: null/unknown → string (fallback ile). */
const pickStr = (rows: Row[], id: unknown, field: string, fallback = "—"): string => {
  const row = rows.find((r) => str(r.id) === str(id));
  const v = row?.[field];
  return v == null || v === "" ? fallback : String(v);
};

async function sb() {
  return await createClient();
}

/* --------------------------- satır eşleyicileri --------------------------- */

function mapBusiness(b: Row): BusinessRow {
  return {
    id: str(b.id),
    slug: str(b.slug),
    name: str(b.name),
    category: str(b.category),
    subCategory: nul(b.sub_category),
    sectorKey: str(b.sector_key ?? "magaza"),
    district: str(b.district),
    city: str(b.city),
    address: str(b.address),
    lat: b.lat == null ? null : Number(b.lat),
    lng: b.lng == null ? null : Number(b.lng),
    phone: nul(b.phone),
    whatsapp: nul(b.whatsapp),
    website: nul(b.website),
    instagram: nul(b.instagram),
    description: nul(b.description),
    story: nul(b.story),
    logoText: nul(b.logo_text),
    coverImage: nul(b.cover_image),
    planCode: str(b.plan_code ?? "FREE"),
    currency: str(b.currency ?? "TRY"),
    country: str(b.country ?? "TR"),
    rating: n(b.rating),
    reviewCount: n(b.review_count),
    verified: Boolean(b.verified),
    featured: Boolean(b.featured),
    createdAt: new Date(str(b.created_at)),
  } as BusinessRow;
}

const CARD_SELECT = "*, businesses!inner(*)";

function toCard(c: Row) {
  const b = (c.businesses ?? {}) as Row;
  return {
    id: str(c.id),
    slug: nul(c.slug),
    code: str(c.code),
    title: str(c.title),
    description: nul(c.description),
    type: str(c.type),
    discountPercent: n(c.discount_percent),
    discountAmountCents: n(c.discount_amount_cents),
    minBasketCents: n(c.min_basket_cents),
    currency: str(c.currency),
    startsAt: iso(c.starts_at),
    endsAt: iso(c.ends_at),
    timeStart: nul(c.time_start),
    timeEnd: nul(c.time_end),
    status: str(c.status),
    moderationStatus: str(c.moderation_status),
    // FAZ 12B — kampanya kapsamı: gel-al (işletme içi) / paket servis (adrese teslim).
    serviceMode: str(c.service_mode) || "ALL",
    isSponsored: Boolean(c.is_sponsored),
    imageUrl: nul(c.image_url),
    qrEnabled: Boolean(c.qr_enabled),
    businessId: str(b.id ?? c.business_id),
    businessName: str(b.name ?? "—"),
    businessSlug: str(b.slug ?? ""),
    district: str(b.district ?? ""),
    city: str(b.city ?? ""),
    country: str(b.country ?? "TR"),
    category: str(b.category ?? ""),
    sectorKey: str(b.sector_key ?? "magaza"),
    rating: n(b.rating),
    reviewCount: n(b.review_count),
    coverImage: nul(b.cover_image),
    verified: Boolean(b.verified),
  };
}

function mapCampaignFull(c: Row) {
  return {
    id: str(c.id),
    businessId: str(c.business_id),
    code: str(c.code),
    title: str(c.title),
    description: nul(c.description),
    type: str(c.type),
    discountPercent: n(c.discount_percent),
    discountAmountCents: n(c.discount_amount_cents),
    minBasketCents: n(c.min_basket_cents),
    maxDiscountCents: n(c.max_discount_cents),
    usageLimit: c.usage_limit == null ? null : n(c.usage_limit),
    perCustomerLimit: n(c.per_customer_limit),
    startsAt: new Date(str(c.starts_at)),
    endsAt: c.ends_at == null ? null : new Date(str(c.ends_at)),
    timeStart: nul(c.time_start),
    timeEnd: nul(c.time_end),
    days: (c.days as number[]) ?? [],
    status: str(c.status),
    moderationStatus: str(c.moderation_status),
    isSponsored: Boolean(c.is_sponsored),
    slug: nul(c.slug),
    currency: str(c.currency),
    imageUrl: nul(c.image_url),
    eligibleItems: (c.eligible_items as string[]) ?? [],
    exclusions: (c.exclusions as string[]) ?? [],
    terms: nul(c.terms),
    qrEnabled: Boolean(c.qr_enabled),
    views: n(c.views),
    clicks: n(c.clicks),
    redemptions: n(c.redemptions),
    createdAt: new Date(str(c.created_at)),
  };
}

const toHour = (h: Row) => ({
  id: str(h.id),
  businessId: str(h.business_id),
  dayOfWeek: n(h.day_of_week),
  opensAt: str(h.opens_at),
  closesAt: str(h.closes_at),
  closed: Boolean(h.closed),
});

/* ================================================================== *
 * KEŞİF
 * ================================================================== */

/** Supabase modunda tohum verisi yoktur; içerik SQL ile sağlanır (bilinçli no-op). */
export async function ensureSeeded() {}

/** İzin verilen olay türleri (analytics_events.kind — DB'de CHECK ile de korunur). */
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

/** Fiyatlandırma sayfası: paketler (herkese açık RLS). */
export async function listPackagesPublic(): Promise<PackageRow[]> {
  const client = await sb();
  const { data } = await client.from("packages").select("*").order("code");
  return ((data ?? []) as Row[]).map((p) => ({
    id: str(p.id),
    code: str(p.code),
    name: str(p.name),
    priceMonthlyCents: n(p.price_monthly_cents),
    features: (p.features as string[]) ?? [],
    aiQuotaMonthly: n(p.ai_quota_monthly),
    active: Boolean(p.active),
  }));
}

/** Fiyatlandırma sayfası: aktif hizmet bedeli kuralları (herkese açık RLS). */
export async function listFeeRulesPublic(): Promise<FeeRuleRow[]> {
  const client = await sb();
  const { data } = await client.from("service_fee_rules").select("*").eq("active", true).limit(20);
  return ((data ?? []) as Row[]).map((f) => ({
    id: str(f.id),
    serviceType: str(f.service_type),
    packageCode: nul(f.package_code),
    kind: str(f.kind),
    amountCents: n(f.amount_cents),
    rate: n(f.rate),
    calculationBase: str(f.calculation_base),
    currency: str(f.currency),
    active: Boolean(f.active),
  }));
}

export async function listCampaignCards(opts?: { limit?: number; district?: string; category?: string }) {
  const client = await sb();
  let q = client
    .from("campaigns")
    .select(CARD_SELECT)
    .eq("status", "PUBLISHED")
    .eq("moderation_status", "APPROVED")
    .filter("businesses.suspended_at", "is", null);
  if (opts?.district) q = q.eq("businesses.district", opts.district);
  if (opts?.category) q = q.eq("businesses.category", opts.category);
  const { data } = await q
    .order("is_sponsored", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 60);
  return (data ?? []).map((r) => toCard(r as Row));
}

export async function getCampaignBySlug(slug: string) {
  const client = await sb();
  const { data: rows } = await client
    .from("campaigns")
    .select(CARD_SELECT)
    .filter("businesses.suspended_at", "is", null)
    .or(`slug.eq.${slug},code.eq.${slug}`)
    .limit(1);
  if (!rows?.[0]) return null;
  const card = toCard(rows[0] as Row);

  const [{ data: full }, { data: biz }, { data: hours }, { data: qr }, usage, related] = await Promise.all([
    client.from("campaigns").select("*").eq("id", card.id).maybeSingle(),
    client.from("businesses").select("*").eq("id", card.businessId).maybeSingle(),
    client.from("business_hours").select("*").eq("business_id", card.businessId),
    client.from("qr_codes").select("code").eq("campaign_id", card.id).limit(1).maybeSingle(),
    client.rpc("dv_campaign_usage_counts", { p_campaign_id: card.id }),
    listCampaignCards({ limit: 12, district: card.district }),
  ]);
  const u = (usage.data ?? {}) as Row;
  return {
    card,
    campaign: full ? mapCampaignFull(full as Row) : null,
    business: biz ? mapBusiness(biz as Row) : null,
    hours: ((hours ?? []) as Row[]).map(toHour).sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    qrCode: (qr?.code as string | undefined) ?? null,
    usage: { scanned: n(u.scanned), verified: n(u.verified) },
    related: related.filter((r) => r.id !== card.id).slice(0, 4),
  };
}

export async function getBusinessBySlug(slug: string) {
  const client = await sb();
  const { data: biz } = await client.from("businesses").select("*").eq("slug", slug).is("suspended_at", null).maybeSingle();
  if (!biz) return null;
  const businessId = str(biz.id);
  const [hours, prods, media, revs, camps, staff] = await Promise.all([
    client.from("business_hours").select("*").eq("business_id", businessId),
    client.from("products").select("*").eq("business_id", businessId),
    client.from("business_media").select("*").eq("business_id", businessId),
    client.from("reviews").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    client.from("campaigns").select(CARD_SELECT).eq("business_id", businessId).eq("status", "PUBLISHED"),
    client.from("business_staff").select("*").eq("business_id", businessId),
  ]);
  return {
    biz: mapBusiness(biz as Row),
    hours: ((hours.data ?? []) as Row[]).map(toHour).sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    products: ((prods.data ?? []) as Row[]).map((p) => ({
      id: str(p.id),
      businessId: str(p.business_id),
      name: str(p.name),
      description: nul(p.description),
      priceCents: n(p.price_cents),
      discountPriceCents: p.discount_price_cents == null ? null : n(p.discount_price_cents),
      // FAZ 12B — adrese teslim (paket servis) fiyatı; boşsa işletme içi fiyat geçerli.
      deliveryPriceCents: p.delivery_price_cents == null ? null : n(p.delivery_price_cents),
      category: nul(p.category),
      imageUrl: nul(p.image_url),
      active: Boolean(p.active),
    })),
    media: ((media.data ?? []) as Row[]).map((m) => ({
      id: str(m.id),
      businessId: str(m.business_id),
      kind: str(m.kind),
      url: nul(m.url),
      caption: nul(m.caption),
      sortOrder: n(m.sort_order),
    })),
    reviews: ((revs.data ?? []) as Row[]).map((r) => ({
      id: str(r.id),
      businessId: str(r.business_id),
      authorName: str(r.author_name),
      rating: n(r.rating),
      comment: nul(r.comment),
      createdAt: new Date(str(r.created_at)),
    })),
    campaigns: ((camps.data ?? []) as Row[]).map((c) => toCard(c)),
    // §19 gizlilik: personel listesi işletme içindir; e-postalar herkese açık sayfaya GİTMEZ.
    staff: ((staff.data ?? []) as Row[]).map((s) => ({
      id: str(s.id),
      businessId: str(s.business_id),
      name: str(s.name),
      email: str(s.email),
      role: str(s.role),
      active: Boolean(s.active),
    })),
  };
}

export async function listBusinesses() {
  const client = await sb();
  const { data } = await client
    .from("businesses")
    .select("*")
    .is("suspended_at", null)
    .order("featured", { ascending: false })
    .order("rating", { ascending: false });
  return ((data ?? []) as Row[]).map(mapBusiness);
}

export async function listDistricts() {
  const client = await sb();
  const { data } = await client.rpc("dv_districts");
  return (Array.isArray(data) ? data : []) as { district: string; city: string; n: number }[];
}

export async function listCategories() {
  const client = await sb();
  const { data } = await client.rpc("dv_categories");
  return (Array.isArray(data) ? data : []) as { category: string; n: number }[];
}

/* ================================================================== *
 * MÜŞTERİ
 * ================================================================== */

export async function getCustomerData(userId: string) {
  const client = await sb();
  const [saved, followed, refs, bonuses, usages, notifs, viewed, learning, discovery, invitees, ordQ] =
    await Promise.all([
      client.from("saved_campaigns").select("id, campaign_id, created_at").eq("user_id", userId),
      client.from("followed_businesses").select("business_id").eq("user_id", userId),
      client.from("referrals").select("*").eq("inviter_id", userId).order("created_at", { ascending: false }),
      client.from("bonus_grants").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      client.from("campaign_usages").select("*").eq("customer_id", userId).order("scanned_at", { ascending: false }).limit(30),
      client.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      client.from("analytics_events").select("business_id, created_at").eq("user_id", userId).eq("kind", "business_view").order("created_at", { ascending: false }).limit(8),
      client.from("analytics_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "video_played"),
      // Not: PostgREST satır sınırı (1000) — eski SQL count(distinct) ile aynı sonuç küçük veride.
      client.from("analytics_events").select("campaign_id").eq("user_id", userId).eq("kind", "campaign_view").limit(1000),
      client.rpc("dv_referral_invitees"),
      // FAZ 12A — kendi siparişlerim (sesli asistan/web); işletme adı join ile.
      client.from("orders").select("*, businesses!inner(name, district)").eq("customer_id", userId).order("created_at", { ascending: false }).limit(20),
    ]);

  const savedRows = (saved.data ?? []) as Row[];
  const followedRows = (followed.data ?? []) as Row[];
  const refRows = (refs.data ?? []) as Row[];
  const bonusRows = (bonuses.data ?? []) as Row[];
  const usageRows = (usages.data ?? []) as Row[];
  const viewedRows = (viewed.data ?? []) as Row[];
  const inviteeRows = (Array.isArray(invitees.data) ? invitees.data : []) as Row[];

  const savedIds = savedRows.map((s) => str(s.campaign_id));
  const followedIds = followedRows.map((f) => str(f.business_id));
  const bizIds = Array.from(
    new Set([
      ...followedIds,
      ...viewedRows.map((v) => str(v.business_id)).filter(Boolean),
      ...bonusRows.map((b) => str(b.business_id)),
    ])
  );

  const [savedCards, bizRows, usageCampaigns] = await Promise.all([
    savedIds.length
      ? client.from("campaigns").select(CARD_SELECT).in("id", savedIds)
      : Promise.resolve({ data: [] as Row[] }),
    bizIds.length
      ? client.from("businesses").select("*").is("suspended_at", null).in("id", bizIds)
      : Promise.resolve({ data: [] as Row[] }),
    (async () => {
      const ids = Array.from(new Set(usageRows.map((u) => nul(u.campaign_id)).filter(Boolean) as string[]));
      if (!ids.length) return [] as Row[];
      const { data } = await client.from("campaigns").select("*").in("id", ids);
      return (data ?? []) as Row[];
    })(),
  ]);

  const businesses = ((bizRows.data ?? []) as Row[]).map(mapBusiness);
  const disCampaignIds = new Set(((discovery.data ?? []) as Row[]).map((d) => str(d.campaign_id)).filter(Boolean));

  return {
    savedIds,
    followedIds,
    savedCampaigns: ((savedCards.data ?? []) as Row[]).map((c) => toCard(c)),
    businesses: businesses.map((b) => ({
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
    referrals: refRows.map((r) => ({
      id: str(r.id),
      code: str(r.code),
      status: str(r.status),
      createdAt: iso(r.created_at),
      registeredAt: iso(r.registered_at),
      inviteeName: pickStr(inviteeRows, r.id, "label"),
      fraudFlags: (r.fraud_flags as string[]) ?? [],
    })),
    // FAZ 12A — sesli asistan/web siparişlerim (kapıda ödeme; DampingVar tahsil etmez).
    orders: ((ordQ.data ?? []) as Row[]).map((o) => {
      const ob = (o.businesses ?? {}) as Row;
      return {
        id: str(o.id),
        businessName: nul(ob.name) ?? "İşletme",
        businessDistrict: nul(ob.district),
        items: (o.items as Array<{ name?: string; qty?: number; unitPriceCents?: number }>) ?? [],
        totalCents: n(o.total_cents),
        paymentMethod: str(o.payment_method),
        deliveryType: str(o.delivery_type) || "PAKET_SERVIS",
        source: str(o.source),
        status: str(o.status),
        createdAt: iso(o.created_at) ?? "",
      };
    }),
    bonuses: bonusRows.map((b) => ({
      id: str(b.id),
      businessId: str(b.business_id),
      businessName: businesses.find((x) => x.id === b.business_id)?.name ?? "—",
      businessSlug: businesses.find((x) => x.id === b.business_id)?.slug ?? "",
      valueCents: n(b.value_cents),
      currency: str(b.currency),
      minPurchaseCents: n(b.min_purchase_cents),
      status: str(b.status),
      expiresAt: iso(b.expires_at),
      createdAt: iso(b.created_at),
      redeemedAt: iso(b.redeemed_at),
    })),
    activity: usageRows.map((u) => ({
      id: str(u.id),
      status: str(u.status),
      channel: str(u.channel),
      scannedAt: iso(u.scanned_at),
      verifiedAt: iso(u.verified_at),
      businessName: businesses.find((x) => x.id === u.business_id)?.name ?? "—",
      campaignTitle: pickStr(usageCampaigns, u.campaign_id, "title"),
      reportedDiscountCents: u.reported_discount_cents == null ? null : n(u.reported_discount_cents),
      currency: str(u.currency),
    })),
    notifications: ((notifs.data ?? []) as Row[]).map((x) => ({
      id: str(x.id),
      kind: str(x.kind),
      title: str(x.title),
      body: nul(x.body),
      link: nul(x.link),
      read: Boolean(x.read),
      createdAt: iso(x.created_at),
    })),
    progress: {
      discoveryCount: disCampaignIds.size,
      savedCount: savedIds.length,
      invitedCount: refRows.length,
      verifiedReferrals: refRows.filter((r) =>
        ["QUALIFIED", "BONUS_AVAILABLE", "BONUS_USED"].includes(str(r.status))
      ).length,
      verifiedUsages: usageRows.filter((u) => str(u.status) === "VERIFIED").length,
      bonusEarned: bonusRows.filter((b) => ["AVAILABLE", "USED"].includes(str(b.status))).length,
      learningCount: n(learning.count),
    },
    recentlyViewed: viewedRows
      .map((v) => businesses.find((b) => b.id === str(v.business_id)))
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
  const client = await sb();
  const since = Date.now() - days * 86400000;
  const { data: biz } = await client.from("businesses").select("*").eq("id", businessId).maybeSingle();
  if (!biz) return null;

  const [hours, camps, qr, usages, staff, ads, contents, plans, pkgs, invs, feeRules, bonusRows, events, labels, refTotal, prods, svcs, growthRows, videoCount, orderRows] =
    await Promise.all([
      client.from("business_hours").select("*").eq("business_id", businessId),
      client.from("campaigns").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
      client.from("qr_codes").select("*").eq("business_id", businessId),
      client.from("campaign_usages").select("*").eq("business_id", businessId).order("scanned_at", { ascending: false }),
      client.from("business_staff").select("*").eq("business_id", businessId),
      client.from("ad_campaigns").select("*").eq("business_id", businessId),
      client.from("ai_contents").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
      client.from("marketing_plans").select("*").eq("business_id", businessId).limit(1),
      client.from("packages").select("*"),
      client.from("invoices").select("*").eq("business_id", businessId).order("period_end", { ascending: false }),
      client.from("service_fee_rules").select("*").eq("business_id", businessId),
      client.from("bonus_grants").select("*").eq("business_id", businessId),
      // Not: PostgREST varsayılan satır sınırı (1000); metrikler bu pencere üzerinden hesaplanır.
      client.from("analytics_events").select("*").eq("business_id", businessId).limit(1000),
      client.rpc("dv_customer_labels", { p_business_id: businessId }),
      client.rpc("dv_referral_total_count"),
      // AI içeriği işletme profili + ÜRÜN/HİZMET verisine göre uyarlanır (istek: c).
      client.from("products").select("name, price_cents, discount_price_cents, image_url").eq("business_id", businessId).eq("active", true).limit(50),
      client.from("business_services").select("name, price_cents").eq("business_id", businessId).eq("active", true).limit(50),
      // AI Büyüme Asistanı — öneriler (20.10.2026 isteği); migration 0010.
      client.from("growth_recommendations").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(30),
      client.from("video_assets").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      // FAZ 12A — sesli asistan/web siparişleri (kapıda ödeme akışı).
      client.from("orders").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(60),
    ]);

  const planRow = ((plans.data ?? []) as Row[])[0] ?? null;
  const planDays = planRow
    ? await client.from("marketing_plan_days").select("*").eq("plan_id", str(planRow.id)).order("day", { ascending: true })
    : { data: [] as Row[] };
  const invRows = (invs.data ?? []) as Row[];
  const itemRows = invRows.length
    ? (
        await client.from("invoice_items").select("*").in("invoice_id", invRows.map((i) => str(i.id)))
      ).data ?? []
    : [];

  // AI Büyüme Asistanı bildirimleri — MEVCUT notifications altyapısı (personel kullanıcıları).
  const staffUserIds = Array.from(
    new Set(((staff.data ?? []) as Row[]).map((s) => nul(s.user_id)).filter(Boolean) as string[])
  );
  const notifRows: Row[] = staffUserIds.length
    ? ((await client.from("notifications").select("*").in("user_id", staffUserIds).order("created_at", { ascending: false }).limit(30)).data ?? [])
    : [];

  const campRows = (camps.data ?? []) as Row[];
  const usageRows = (usages.data ?? []) as Row[];
  const eventRows = (events.data ?? []) as Row[];
  const contentRows = (contents.data ?? []) as Row[];
  const labelRows = (Array.isArray(labels.data) ? labels.data : []) as Row[];

  const scanned = usageRows.filter((u) => str(u.status) !== "CANCELLED");
  const verified = usageRows.filter((u) => str(u.status) === "VERIFIED");
  const pending = usageRows.filter((u) => str(u.status) === "SUBMITTED");
  const customerIds = Array.from(new Set(usageRows.map((u) => nul(u.customer_id)).filter(Boolean) as string[]));

  const evCount = (kind: string) => eventRows.filter((e) => str(e.kind) === kind).length;
  const byDay = (arr: Date[]) => {
    const out = Array.from({ length: days }, () => 0);
    arr.forEach((d) => {
      const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
      if (diff >= 0 && diff < days) out[days - 1 - diff] += 1;
    });
    return out;
  };
  const evInRange = eventRows.filter((e) => {
    const t = new Date(str(e.created_at)).getTime();
    return t >= since;
  });

  return {
    biz: mapBusiness(biz as Row),
    // AI motorunun işletme profil/ürün/hizmetlere göre uyumlu içerik üretmesi için (istek c).
    products: ((prods.data ?? []) as Row[]).map((p) => ({
      id: str(p.id),
      businessId: str(p.business_id),
      name: str(p.name),
      description: nul(p.description),
      priceCents: n(p.price_cents),
      discountPriceCents: p.discount_price_cents == null ? null : n(p.discount_price_cents),
      // FAZ 12B — adrese teslim fiyatı (boşsa işletme içi fiyat geçerlidir).
      deliveryPriceCents: p.delivery_price_cents == null ? null : n(p.delivery_price_cents),
      category: nul(p.category),
      imageUrl: nul(p.image_url),
      active: Boolean(p.active),
    })),
    services: ((svcs.data ?? []) as Row[]).map((s) => ({ name: str(s.name), priceCents: n(s.price_cents) })),
    // FAZ 12A — sesli asistan/web siparişleri (kapıda ödeme; DampingVar tahsil etmez).
    orders: ((orderRows.data ?? []) as Row[]).map((o) => ({
      id: str(o.id),
      customerName: str(o.customer_name),
      customerPhone: str(o.customer_phone),
      customerDistrict: nul(o.customer_district),
      address: nul(o.address),
      note: nul(o.note),
      items: (o.items as Array<{ name?: string; qty?: number; unitPriceCents?: number }>) ?? [],
      totalCents: n(o.total_cents),
      paymentMethod: str(o.payment_method),
      deliveryType: str(o.delivery_type) || "PAKET_SERVIS",
      source: str(o.source),
      status: str(o.status),
      createdAt: iso(o.created_at) ?? "",
    })),
    // AI Büyüme Asistanı — öneriler + görev listeleri (tasks jsonb) + işletme bildirimleri.
    videosCount: videoCount.count ?? 0,
    growth: ((growthRows.data ?? []) as Row[]).map((r) => ({
      id: str(r.id),
      area: str(r.area),
      title: str(r.title),
      problem: str(r.problem),
      why: str(r.why),
      benefit: str(r.benefit),
      cost: str(r.cost),
      materials: str(r.materials),
      steps: (r.steps as string[]) ?? [],
      plan: (r.plan as Record<string, unknown>) ?? {},
      status: str(r.status),
      rejectedReason: nul(r.rejected_reason),
      alternativeFor: nul(r.alternative_for),
      tasks: (r.tasks as Array<Record<string, unknown>>) ?? [],
      createdAt: iso(r.created_at),
      answeredAt: iso(r.answered_at),
    })),
    notifications: notifRows.map((x) => ({
      id: str(x.id),
      kind: str(x.kind),
      title: str(x.title),
      body: nul(x.body),
      link: nul(x.link),
      read: Boolean(x.read),
      createdAt: iso(x.created_at),
    })),
    hours: ((hours.data ?? []) as Row[]).map(toHour).sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    campaigns: campRows.map((c) => ({
      id: str(c.id),
      slug: nul(c.slug),
      code: str(c.code),
      title: str(c.title),
      description: nul(c.description),
      type: str(c.type),
      discountPercent: n(c.discount_percent),
      discountAmountCents: n(c.discount_amount_cents),
      minBasketCents: n(c.min_basket_cents),
      maxDiscountCents: n(c.max_discount_cents),
      currency: str(c.currency),
      startsAt: iso(c.starts_at),
      endsAt: iso(c.ends_at),
      timeStart: nul(c.time_start),
      timeEnd: nul(c.time_end),
      days: (c.days as number[]) ?? [],
      status: str(c.status),
      moderationStatus: str(c.moderation_status),
      // FAZ 12B — kapsam: gel-al (işletme içi) / paket servis (adrese teslim) / ikisi.
      serviceMode: str(c.service_mode) || "ALL",
      isSponsored: Boolean(c.is_sponsored),
      qrEnabled: Boolean(c.qr_enabled),
      eligibleItems: (c.eligible_items as string[]) ?? [],
      exclusions: (c.exclusions as string[]) ?? [],
      terms: nul(c.terms),
      imageUrl: nul(c.image_url),
      views: n(c.views),
      clicks: n(c.clicks),
      perCustomerLimit: n(c.per_customer_limit),
      usageLimit: c.usage_limit == null ? null : n(c.usage_limit),
      scans: scanned.filter((u) => u.campaign_id === c.id).length,
      verifiedCount: verified.filter((u) => u.campaign_id === c.id).length,
    })),
    qrCodes: ((qr.data ?? []) as Row[]).map((q) => ({
      id: str(q.id),
      code: str(q.code),
      campaignId: nul(q.campaign_id),
      status: str(q.status),
      createdAt: iso(q.created_at),
    })),
    usages: usageRows.map((u) => ({
      id: str(u.id),
      campaignId: nul(u.campaign_id),
      campaignTitle: pickStr(campRows, u.campaign_id, "title"),
      status: str(u.status),
      channel: str(u.channel),
      scannedAt: iso(u.scanned_at),
      verifiedAt: iso(u.verified_at),
      // §19 gizlilik: takma etiket (RPC), gerçek ad değil.
      customerLabel: u.customer_id
        ? str(labelRows.find((l) => str(l.customerId) === str(u.customer_id))?.label ?? `Müşteri ·${str(u.customer_id).slice(0, 4)}`)
        : "Misafir",
      reportedBasketCents: u.reported_basket_cents == null ? null : n(u.reported_basket_cents),
      reportedDiscountCents: u.reported_discount_cents == null ? null : n(u.reported_discount_cents),
      currency: str(u.currency),
      note: nul(u.note),
      idempotencyKey: str(u.idempotency_key),
    })),
    staff: ((staff.data ?? []) as Row[]).map((s) => ({
      id: str(s.id),
      name: str(s.name),
      email: str(s.email),
      // UI sözleşmesi BÜYÜK harf roller; veritabanında küçük harf saklanır.
      role: str(s.role).toUpperCase() as "OWNER" | "MANAGER" | "CASHIER",
      active: Boolean(s.active),
    })),
    ads: ((ads.data ?? []) as Row[]).map((a) => ({
      id: str(a.id),
      name: str(a.name),
      placement: str(a.placement),
      district: nul(a.district),
      category: nul(a.category),
      budgetCents: n(a.budget_cents),
      currency: "TRY",
      status: str(a.status),
      brief: nul(a.brief),
      impressions: n(a.impressions),
      clicks: n(a.clicks),
      startsAt: iso(a.starts_at),
      endsAt: iso(a.ends_at),
    })),
    contents: contentRows.map((c) => ({
      id: str(c.id),
      kind: str(c.kind),
      platform: nul(c.platform),
      title: str(c.title),
      body: str(c.body),
      cta: nul(c.cta),
      variant: nul(c.variant),
      status: str(c.status),
      createdAt: iso(c.created_at),
    })),
    plan: planRow
      ? {
          id: str(planRow.id),
          title: str(planRow.title),
          goal: str(planRow.goal),
          status: str(planRow.status),
          days: ((planDays.data ?? []) as Row[]).map((d) => ({
            id: str(d.id),
            day: n(d.day),
            theme: str(d.theme),
            task: str(d.task),
            channel: str(d.channel),
            caption: nul(d.caption),
            cta: nul(d.cta),
            done: Boolean(d.done),
          })),
        }
      : null,
    packages: ((pkgs.data ?? []) as Row[]).map((p) => ({
      code: str(p.code),
      name: str(p.name),
      priceMonthlyCents: n(p.price_monthly_cents),
      features: (p.features as string[]) ?? [],
      aiQuotaMonthly: n(p.ai_quota_monthly),
      active: Boolean(p.active),
    })),
    invoices: invRows.map((i) => ({
      id: str(i.id),
      number: str(i.number),
      periodStart: iso(i.period_start),
      periodEnd: iso(i.period_end),
      currency: str(i.currency),
      subtotalCents: n(i.subtotal_cents),
      taxRate: n(i.tax_rate),
      taxCents: n(i.tax_cents),
      totalCents: n(i.total_cents),
      status: str(i.status),
      issuedAt: iso(i.issued_at),
      dueDate: iso(i.due_date),
      paidAt: iso(i.paid_at),
      note: nul(i.note),
      items: (itemRows as Row[])
        .filter((it) => str(it.invoice_id) === str(i.id))
        .map((it) => ({
          id: str(it.id),
          serviceType: str(it.service_type),
          description: str(it.description),
          quantity: n(it.quantity),
          unitPriceCents: n(it.unit_price_cents),
          appliedRate: it.applied_rate == null ? null : n(it.applied_rate),
          amountCents: n(it.amount_cents),
        })),
    })),
    feeRules: ((feeRules.data ?? []) as Row[]).map((f) => ({
      id: str(f.id),
      serviceType: str(f.service_type),
      kind: str(f.kind),
      amountCents: n(f.amount_cents),
      rate: n(f.rate),
      calculationBase: str(f.calculation_base),
      currency: str(f.currency),
      validFrom: iso(f.valid_from),
      validTo: iso(f.valid_to),
      active: Boolean(f.active),
    })),
    bonusGrants: ((bonusRows.data ?? []) as Row[]).map((b) => ({
      id: str(b.id),
      status: str(b.status),
      valueCents: n(b.value_cents),
      currency: str(b.currency),
      createdAt: iso(b.created_at),
      // §19 gizlilik: işletmeye müşteri kimliği verilmez.
      userName: `Müşteri ·${str(b.user_id).slice(0, 4)}`,
    })),
    rangeDays: days,
    metrics: {
      impressions: evCount("ad_impression") + campRows.reduce((s, c) => s + n(c.views), 0),
      clicks: evCount("campaign_click") + campRows.reduce((s, c) => s + n(c.clicks), 0),
      campaignViews: evInRange.filter((e) => str(e.kind) === "campaign_view").length,
      pageVisits: evInRange.filter((e) => str(e.kind) === "business_view").length,
      qrScans: scanned.length,
      verifiedUsage: verified.length,
      pendingVerification: pending.length,
      referralTraffic: usageRows.filter((u) => str(u.channel) === "REFERRAL").length,
      uniqueCustomers: customerIds.length,
      series14: byDay(scanned.map((u) => new Date(str(u.scanned_at)))),
      clicks14: byDay(evInRange.filter((e) => str(e.kind) === "campaign_click").map((e) => new Date(str(e.created_at)))),
      views14: byDay(evInRange.filter((e) => str(e.kind) === "campaign_view").map((e) => new Date(str(e.created_at)))),
      contentCreated: contentRows.length,
      contentApproved: contentRows.filter((c) => ["APPROVED", "PUBLISHED"].includes(str(c.status))).length,
      contentPublished: contentRows.filter((c) => str(c.status) === "PUBLISHED").length,
      contentRejected: contentRows.filter((c) => str(c.status) === "REJECTED").length,
    },
    referralsIn: n(refTotal.data),
  };
}

/* ================================================================== *
 * ADMİN
 * ================================================================== */

export async function getAdminData() {
  const client = await sb();
  const [biz, profiles, camps, usages, refs, bonuses, policies, pkgs, feeRules, invs, ads, fraud, audit, aiSet, contents, events, reqs, staff, ords] =
    await Promise.all([
      client.from("businesses").select("*").order("created_at", { ascending: false }),
      client.from("profiles").select("*").order("created_at", { ascending: false }),
      client.from("campaigns").select("*").order("created_at", { ascending: false }),
      client.from("campaign_usages").select("*").order("scanned_at", { ascending: false }).limit(60),
      client.from("referrals").select("*").order("created_at", { ascending: false }),
      client.from("bonus_grants").select("*").order("created_at", { ascending: false }),
      client.from("bonus_policies").select("*"),
      client.from("packages").select("*"),
      client.from("service_fee_rules").select("*"),
      client.from("invoices").select("*").order("period_end", { ascending: false }),
      client.from("ad_campaigns").select("*"),
      client.from("fraud_reviews").select("*").order("created_at", { ascending: false }),
      client.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(25),
      client.from("ai_settings").select("*"),
      client.from("ai_contents").select("*").order("created_at", { ascending: false }).limit(20),
      client.from("analytics_events").select("*").limit(2000),
      client.from("business_requests").select("*").eq("status", "pending"),
      client.from("business_staff").select("*"),
      // FAZ 12A — platform geneli sipariş izleme (sesli/web).
      client.from("orders").select("*").order("created_at", { ascending: false }).limit(200),
    ]);

  const bizRows = (biz.data ?? []) as Row[];
  const userRows = (profiles.data ?? []) as Row[];
  const campRows = (camps.data ?? []) as Row[];
  const usageRows = (usages.data ?? []) as Row[];
  const refRows = (refs.data ?? []) as Row[];
  const bonusRows = (bonuses.data ?? []) as Row[];
  const invRows = (invs.data ?? []) as Row[];
  const fraudRows = (fraud.data ?? []) as Row[];
  const eventRows = (events.data ?? []) as Row[];
  const reqRows = (reqs.data ?? []) as Row[];
  const staffRows = (staff.data ?? []) as Row[];
  const evCount = (k: string) => eventRows.filter((e) => str(e.kind) === k).length;

  return {
    // FAZ 12A — platform siparişleri (sesli asistan/web; ödeme kapıda, DampingVar tahsil etmez).
    orders: ((ords.data ?? []) as Row[]).map((o) => ({
      id: str(o.id),
      businessId: str(o.business_id),
      businessName: str(bizRows.find((x) => str(x.id) === str(o.business_id))?.name ?? "—"),
      customerName: str(o.customer_name),
      customerPhone: str(o.customer_phone),
      items: (o.items as Array<{ name?: string; qty?: number }>) ?? [],
      totalCents: n(o.total_cents),
      paymentMethod: str(o.payment_method),
      deliveryType: str(o.delivery_type) || "PAKET_SERVIS",
      source: str(o.source),
      status: str(o.status),
      createdAt: iso(o.created_at) ?? "",
    })),
    counts: {
      businesses: bizRows.length,
      customers: userRows.filter((u) => str(u.role).toUpperCase() === "CUSTOMER").length,
      campaigns: campRows.length,
      // "Yayındaki kampanya" KPI'ı için görünürlük kuralı listCampaignCards ile
      // aynıdır (PUBLISHED + APPROVED); toplam sayı reports'ta kullanılır.
      campaignsLive: campRows.filter((c) => str(c.status) === "PUBLISHED" && str(c.moderation_status) === "APPROVED").length,
      pendingModeration: campRows.filter((c) => str(c.moderation_status) === "PENDING").length,
      qrScans: usageRows.filter((u) => str(u.status) !== "CANCELLED").length,
      verifiedUsage: usageRows.filter((u) => str(u.status) === "VERIFIED").length,
      pendingVerification: usageRows.filter((u) => str(u.status) === "SUBMITTED").length,
      referrals: refRows.length,
      bonusAvailable: bonusRows.filter((b) => str(b.status) === "AVAILABLE").length,
      bonusPending: bonusRows.filter((b) => str(b.status) === "PENDING_VERIFICATION").length,
      invoicesOpen: invRows.filter((i) => ["ISSUED", "SENT", "OVERDUE"].includes(str(i.status))).length,
      revenue: invRows.filter((i) => str(i.status) === "PAID").reduce((s, i) => s + n(i.total_cents), 0),
      billed: invRows.reduce((s, i) => s + n(i.total_cents), 0),
      fraudOpen: fraudRows.filter((f) => str(f.status) === "OPEN").length,
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
      id: str(b.id),
      name: str(b.name),
      slug: str(b.slug),
      category: str(b.category),
      district: str(b.district),
      city: str(b.city),
      country: str(b.country),
      currency: str(b.currency),
      planCode: str(b.plan_code),
      verified: Boolean(b.verified),
      featured: Boolean(b.featured),
      suspended: Boolean(b.suspended_at),
      rating: n(b.rating),
      reviewCount: n(b.review_count),
      campaigns: campRows.filter((c) => str(c.business_id) === str(b.id)).length,
    })),
    customers: userRows.map((u) => ({
      id: str(u.id),
      name: str(u.name),
      email: str(u.email ?? ""),
      // UI sözleşmesi: rol UPPERCASE gösterilir.
      role: str(u.role).toUpperCase(),
      district: nul(u.district),
      country: str(u.country),
      lang: str(u.lang),
      currency: str(u.currency),
      referralCode: str(u.referral_code),
      createdAt: iso(u.created_at),
      usages: usageRows.filter((x) => str(x.customer_id) === str(u.id)).length,
    })),
    // FAZ 10 — bekleyen "İşletme Aç" talepleri (userId → talep özeti)
    pendingApprovals: Object.fromEntries(
      reqRows.map((r) => {
        const p = (r.payload ?? {}) as Row;
        return [
          str(r.user_id),
          {
            name: str(p.name ?? ""),
            category: str(p.category ?? ""),
            district: str(p.district ?? ""),
            city: str(p.city ?? ""),
            address: str(p.address ?? ""),
            phone: nul(p.phone),
            createdAt: iso(r.created_at),
          },
        ];
      })
    ),
    // FAZ 10 (geri alma) — personel bağlantıları (userId → işletme).
    // Aktif bağlantı tercih edilir; pasif (askıya alınmış) bağlantı da
    // gösterilir ki yönetici "Askıdan al"abilsin.
    owners: Object.fromEntries(
      Object.values(
        staffRows
          .filter((s) => nul(s.user_id))
          .reduce<Record<string, Row>>((acc, s) => {
            const uid = str(s.user_id);
            const prev = acc[uid];
            if (!prev || (Boolean(s.active) && !prev.active)) acc[uid] = s;
            return acc;
          }, {})
      ).map((s) => [
        str(s.user_id),
        {
          businessId: str(s.business_id),
          businessName: pickStr(bizRows, s.business_id, "name"),
          staffRole: str(s.role),
          active: Boolean(s.active),
        },
      ])
    ),
    campaigns: campRows.map((c) => ({
      id: str(c.id),
      code: str(c.code),
      slug: nul(c.slug),
      title: str(c.title),
      status: str(c.status),
      moderationStatus: str(c.moderation_status),
      // FAZ 12B — moderasyon listesinde kapsam rozeti için.
      serviceMode: str(c.service_mode) || "ALL",
      isSponsored: Boolean(c.is_sponsored),
      discountPercent: n(c.discount_percent),
      currency: str(c.currency),
      endsAt: iso(c.ends_at),
      businessName: pickStr(bizRows, c.business_id, "name"),
      businessId: str(c.business_id),
      views: n(c.views),
      clicks: n(c.clicks),
    })),
    usages: usageRows.map((u) => ({
      id: str(u.id),
      status: str(u.status),
      channel: str(u.channel),
      scannedAt: iso(u.scanned_at),
      verifiedAt: iso(u.verified_at),
      businessName: pickStr(bizRows, u.business_id, "name"),
      campaignTitle: pickStr(campRows, u.campaign_id, "title"),
      customerName: pickStr(userRows, u.customer_id, "name", "Misafir"),
      reportedDiscountCents: u.reported_discount_cents == null ? null : n(u.reported_discount_cents),
      currency: str(u.currency),
    })),
    referrals: refRows.map((r) => ({
      id: str(r.id),
      code: str(r.code),
      status: str(r.status),
      createdAt: iso(r.created_at),
      inviter: pickStr(userRows, r.inviter_id, "name"),
      invitee: pickStr(userRows, r.invitee_id, "name"),
      fraudFlags: (r.fraud_flags as string[]) ?? [],
    })),
    bonuses: bonusRows.map((b) => ({
      id: str(b.id),
      status: str(b.status),
      valueCents: n(b.value_cents),
      currency: str(b.currency),
      businessName: pickStr(bizRows, b.business_id, "name"),
      userName: pickStr(userRows, b.user_id, "name"),
      expiresAt: iso(b.expires_at),
      createdAt: iso(b.created_at),
    })),
    policies: ((policies.data ?? []) as Row[]).map((p) => ({
      id: str(p.id),
      key: str(p.key),
      businessId: nul(p.business_id),
      businessName: p.business_id ? pickStr(bizRows, p.business_id, "name") : "Tüm platform",
      rewardKind: str(p.reward_kind),
      rewardCents: n(p.reward_cents),
      rewardPercent: n(p.reward_percent),
      maxRewardCents: n(p.max_reward_cents),
      minPurchaseCents: n(p.min_purchase_cents),
      validDays: n(p.valid_days),
      maxPerInviter: n(p.max_per_inviter),
      requiresVerification: Boolean(p.requires_verification),
      active: Boolean(p.active),
    })),
    packages: ((pkgs.data ?? []) as Row[]).map((p) => ({
      id: str(p.id),
      code: str(p.code),
      name: str(p.name),
      priceMonthlyCents: n(p.price_monthly_cents),
      features: (p.features as string[]) ?? [],
      aiQuotaMonthly: n(p.ai_quota_monthly),
      active: Boolean(p.active),
    })),
    feeRules: ((feeRules.data ?? []) as Row[]).map((f) => ({
      id: str(f.id),
      businessName: f.business_id ? pickStr(bizRows, f.business_id, "name") : "Varsayılan",
      packageCode: nul(f.package_code),
      serviceType: str(f.service_type),
      kind: str(f.kind),
      amountCents: n(f.amount_cents),
      rate: n(f.rate),
      calculationBase: str(f.calculation_base),
      currency: str(f.currency),
      active: Boolean(f.active),
      validFrom: iso(f.valid_from),
      validTo: iso(f.valid_to),
    })),
    invoices: invRows.map((i) => ({
      id: str(i.id),
      number: str(i.number),
      businessName: pickStr(bizRows, i.business_id, "name"),
      businessId: str(i.business_id),
      periodStart: iso(i.period_start),
      periodEnd: iso(i.period_end),
      currency: str(i.currency),
      subtotalCents: n(i.subtotal_cents),
      taxCents: n(i.tax_cents),
      totalCents: n(i.total_cents),
      status: str(i.status),
      dueDate: iso(i.due_date),
      paidAt: iso(i.paid_at),
    })),
    ads: ((ads.data ?? []) as Row[]).map((a) => ({
      id: str(a.id),
      name: str(a.name),
      placement: str(a.placement),
      status: str(a.status),
      impressions: n(a.impressions),
      clicks: n(a.clicks),
      budgetCents: n(a.budget_cents),
      businessName: pickStr(bizRows, a.business_id, "name"),
    })),
    fraud: fraudRows.map((f) => ({
      id: str(f.id),
      reason: str(f.reason),
      status: str(f.status),
      signals: (f.signals as string[]) ?? [],
      createdAt: iso(f.created_at),
      userName: pickStr(userRows, f.user_id, "name"),
    })),
    audit: ((audit.data ?? []) as Row[]).map((a) => ({
      id: str(a.id),
      actor: str(a.actor),
      role: str(a.role),
      action: str(a.action),
      entityType: nul(a.entity_type),
      createdAt: iso(a.created_at),
    })),
    aiSettings: ((aiSet.data ?? []) as Row[]).map((s) => ({
      id: str(s.id),
      key: str(s.key),
      value: str(s.value),
      description: nul(s.description),
    })),
    contents: contentRowsMap((contents.data ?? []) as Row[], bizRows),
  };
}

function contentRowsMap(rows: Row[], bizRows: Row[]) {
  return rows.map((c) => ({
    id: str(c.id),
    kind: str(c.kind),
    title: str(c.title),
    status: str(c.status),
    businessName: pickStr(bizRows, c.business_id, "name"),
    createdAt: iso(c.created_at),
  }));
}

/* ================================================================== *
 * OLAY TAKİBİ (append-only; hata sayfayı engellemez)
 * ================================================================== */

export async function trackEvent(
  kind: string,
  opts: { businessId?: string | null; campaignId?: string | null; userId?: string | null; meta?: Record<string, unknown> } = {}
) {
  const client = await sb();
  // append-only RLS: anon yalnızca user_id olmayan satır ekler; oturumlu yalnızca kendi satırını.
  const { error } = await client
    .from("analytics_events")
    .insert({
      kind,
      business_id: opts.businessId ?? null,
      campaign_id: opts.campaignId ?? null,
      user_id: opts.userId ?? null,
      meta: opts.meta ?? {},
    });
  // Eski davranış: olay takibi hatası sayfa/istek akışını ENGELLEMEZ.
  if (error) console.debug("[DampingVar] olay kaydı atlandı:", error.message);
}

export async function logAudit(
  actor: string,
  role: string,
  action: string,
  entityType: string,
  entityId: string | null,
  meta: Record<string, unknown> = {}
) {
  const client = await sb();
  const { error } = await client
    .from("audit_logs")
    .insert({ actor, role, action, entity_type: entityType, entity_id: entityId, meta });
  if (error) console.error("[DampingVar] audit log yazılamadı:", error.message);
}

export async function unusedQrCodes(businessId: string) {
  const client = await sb();
  const { data } = await client
    .from("qr_codes")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "ACTIVE")
    .limit(10);
  return (data ?? []) as Row[];
}

export async function findBusinessById(id: string) {
  const client = await sb();
  const { data } = await client.from("businesses").select("*").eq("id", id).maybeSingle();
  return data ? mapBusiness(data as Row) : null;
}

/** Yalnızca yönetici görür (RLS). */
export async function policiesAll() {
  const client = await sb();
  const { data } = await client.from("bonus_policies").select("*");
  return (data ?? []) as Row[];
}

export async function defaultPolicy() {
  const client = await sb();
  const { data } = await client.from("bonus_policies").select("*").is("business_id", null).limit(1);
  return ((data ?? [])[0] as Row | undefined) ?? null;
}

/* ================================================================== *
 * AFFILIATE
 * ================================================================== */

function toOffer(r: Row) {
  const net = (r.networks ?? r.affiliate_networks ?? {}) as Row;
  return {
    id: str(r.id),
    slug: str(r.slug),
    merchant: str(r.merchant),
    title: str(r.title),
    description: nul(r.description),
    category: str(r.category),
    country: str(r.country),
    currency: str(r.currency),
    priceCents: r.price_cents == null ? null : n(r.price_cents),
    priceVerified: Boolean(r.price_verified),
    imageUrl: nul(r.image_url),
    destinationUrl: str(r.destination_url),
    disclosure: str(r.disclosure),
    terms: nul(r.terms),
    exclusions: (r.exclusions as string[]) ?? [],
    commissionTerms: nul(r.commission_terms),
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    lastUpdated: iso(r.last_updated),
    status: str(r.status),
    isSponsored: Boolean(r.is_sponsored),
    isSample: Boolean(r.is_sample),
    clicks: n(r.clicks),
    impressions: n(r.impressions),
    networkName: nul(net.name) ?? "—",
    networkStatus: nul(net.status) ?? null,
  };
}

const OFFER_EMBED_NOTE = "Fırsat sorguları ağ bilgisini ayrı sorguda alır (network_id).";

export async function listOffers(opts?: { limit?: number; category?: string; country?: string }) {
  const client = await sb();
  let q = client.from("affiliate_offers").select("*").eq("status", "ACTIVE");
  if (opts?.category) q = q.eq("category", opts.category);
  if (opts?.country) q = q.eq("country", opts.country);
  const { data } = await q
    .order("is_sponsored", { ascending: false })
    .order("last_updated", { ascending: false })
    .limit(opts?.limit ?? 40);
  return ((data ?? []) as Row[]).map((r) => toOffer(r));
}

export async function getOfferBySlug(slug: string) {
  const client = await sb();
  const { data: row } = await client.from("affiliate_offers").select("*").eq("slug", slug).maybeSingle();
  if (!row) return null;
  const offer = toOffer(row as Row);
  // Ağ adı/durumu ayrı sorgu (embedsiz).
  if ((row as Row).network_id) {
    const { data: net } = await client.from("affiliate_networks").select("name, status").eq("id", str((row as Row).network_id)).maybeSingle();
    if (net) {
      offer.networkName = str((net as Row).name);
      offer.networkStatus = str((net as Row).status);
    }
  } else {
    offer.networkName = "—";
  }
  const [related, stats] = await Promise.all([
    listOffers({ limit: 8, category: offer.category }),
    client.rpc("dv_offer_stats", { p_offer_id: offer.id }),
  ]);
  const s = (stats.data ?? {}) as Row;
  return {
    offer,
    related: related.filter((r) => r.id !== offer.id).slice(0, 4),
    stats: {
      clicks: n(s.clicks),
      conversions: (Array.isArray(s.conversions) ? s.conversions : []) as { status: string; n: number }[],
    },
  };
}

export async function listOfferCategories() {
  const client = await sb();
  const { data } = await client.rpc("dv_offer_categories");
  return (Array.isArray(data) ? data : []) as { category: string; n: number }[];
}

export async function getAffiliateData() {
  const client = await sb();
  const [networks, offers, clicks, conversions] = await Promise.all([
    client.from("affiliate_networks").select("*"),
    client.from("affiliate_offers").select("*"),
    client.from("affiliate_clicks").select("*"),
    client.from("affiliate_conversions").select("*"),
  ]);
  const netRows = (networks.data ?? []) as Row[];
  const offerRows = (offers.data ?? []) as Row[];
  const clickRows = (clicks.data ?? []) as Row[];
  const convRows = (conversions.data ?? []) as Row[];
  const byStatus = (s: string) => convRows.filter((c) => str(c.status) === s);
  const sum = (list: Row[]) => list.reduce((a, c) => a + n(c.commission_cents), 0);

  return {
    networks: netRows.map((x) => ({
      id: str(x.id),
      name: str(x.name),
      status: str(x.status),
      reportingMethod: nul(x.reporting_method),
      commissionModel: nul(x.commission_model),
      notes: nul(x.notes),
      lastSyncAt: iso(x.last_sync_at),
    })),
    offers: offerRows.map((o) => ({
      id: str(o.id),
      slug: str(o.slug),
      merchant: str(o.merchant),
      title: str(o.title),
      category: str(o.category),
      country: str(o.country),
      currency: str(o.currency),
      status: str(o.status),
      isSample: Boolean(o.is_sample),
      isSponsored: Boolean(o.is_sponsored),
      impressions: n(o.impressions),
      clicks: n(o.clicks),
      networkName: pickStr(netRows, o.network_id, "name"),
      networkStatus: pickStr(netRows, o.network_id, "status", "NOT_CONNECTED"),
      commissionTerms: nul(o.commission_terms),
      endsAt: iso(o.ends_at),
      lastUpdated: iso(o.last_updated),
      conversions: convRows.filter((c) => str(c.offer_id) === str(o.id)).length,
    })),
    clicks: clickRows.map((c) => ({
      id: str(c.id),
      clickId: str(c.click_id),
      offerId: str(c.offer_id),
      offerTitle: pickStr(offerRows, c.offer_id, "title"),
      merchant: pickStr(offerRows, c.offer_id, "merchant"),
      channel: str(c.channel),
      confirmedOutbound: Boolean(c.confirmed_outbound),
      outboundAt: iso(c.outbound_at),
      hasConversion: convRows.some((v) => str(v.click_id) === str(c.click_id)),
    })),
    conversions: convRows.map((c) => ({
      id: str(c.id),
      status: str(c.status),
      source: str(c.source),
      networkReference: nul(c.network_reference),
      commissionCents: c.commission_cents == null ? null : n(c.commission_cents),
      currency: str(c.currency),
      offerTitle: pickStr(offerRows, c.offer_id, "title"),
      merchant: pickStr(offerRows, c.offer_id, "merchant"),
      clickId: nul(c.click_id),
      reportedAt: iso(c.reported_at),
      decidedAt: iso(c.decided_at),
      paidAt: iso(c.paid_at),
      note: nul(c.note),
    })),
    totals: {
      offers: offerRows.length,
      activeOffers: offerRows.filter((o) => str(o.status) === "ACTIVE").length,
      impressions: offerRows.reduce((a, o) => a + n(o.impressions), 0),
      clicks: clickRows.length,
      outbound: clickRows.filter((c) => Boolean(c.confirmed_outbound)).length,
      reported: byStatus("REPORTED").length,
      pending: byStatus("PENDING").length,
      approved: byStatus("APPROVED").length,
      rejected: byStatus("REJECTED").length,
      reversed: byStatus("REVERSED").length,
      paid: byStatus("PAID").length,
      // DOĞRULANMIŞ gelir: yalnızca APPROVED + PAID
      confirmedCents: sum(byStatus("APPROVED")) + sum(byStatus("PAID")),
      // BEKLEYEN: rapor + beklemede (gelir gibi gösterilmez)
      unconfirmedCents: sum(byStatus("REPORTED")) + sum(byStatus("PENDING")),
      paidCents: sum(byStatus("PAID")),
      demoSourced: convRows.filter((c) => str(c.source) === "DEMO_SAMPLE").length,
    },
  };
}

/** Birleşik etkinlik akışı — RPC (gizlilik filtresi SQL içinde). */
export async function getFlowStream(limit = 40, userId?: string | null) {
  const client = await sb();
  const { data } = await client.rpc("dv_flow_stream", { p_limit: limit, p_user_id: userId ?? null });
  return (Array.isArray(data) ? data : []) as {
    id: string;
    journey: "affiliate" | "local" | "referral" | "platform";
    kind: string;
    label: string;
    subject: string;
    status: string;
    verified: boolean;
    at: string | null;
    note?: string;
  }[];
}

export async function listVideos(topic?: string) {
  const client = await sb();
  const { data } = topic
    ? await client.from("video_assets").select("*").eq("topic", topic).limit(1)
    : await client.from("video_assets").select("*");
  return ((data ?? []) as Row[]).map((v) => ({
    id: str(v.id),
    topic: str(v.topic),
    title: str(v.title),
    kind: str(v.kind),
    durationSec: n(v.duration_sec),
    scenes: (v.scenes as { at: string; visual: string; caption: string }[]) ?? [],
    captions: (v.captions as Record<string, string[]>) ?? {},
    steps: (v.steps as string[]) ?? [],
    poster: nul(v.poster),
    storagePath: nul(v.storage_path),
    renderStatus: str(v.render_status),
    status: str(v.status),
  }));
}
