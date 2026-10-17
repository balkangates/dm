import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, qrCodes } from "@/db/schema";
import { businessActor, jsonError, staffCan } from "@/lib/auth-actions";
import { logAudit, trackEvent } from "@/lib/queries";
import { slugify } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId");
  const rows = businessId
    ? await db.select().from(campaigns).where(eq(campaigns.businessId, businessId)).orderBy(desc(campaigns.createdAt))
    : await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(50);
  return Response.json({ ok: true, campaigns: rows });
}

function clamp(n: unknown, min: number, max: number, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Kampanya oluşturma / düzenleme / durum değişikliği.
 * Finansal değerler (indirim oranı, minimum sepet) sunucuda sınırlanır;
 * istemciden gelen ham değerlere güvenilmez.
 */
export async function POST(req: Request) {
  const actor = await businessActor();
  if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
  if (!staffCan(actor.staffRole, "campaign.write"))
    return jsonError(403, `${actor.staffRole} rolü kampanya oluşturamaz veya düzenleyemez.`);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "create");

  if (action === "status") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!["DRAFT", "PUBLISHED", "PAUSED", "ENDED"].includes(status)) return jsonError(400, "Geçersiz durum.");
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!row) return jsonError(404, "Kampanya bulunamadı.");
    if (row.businessId !== actor.businessId) return jsonError(403, "Bu kampanya size ait değil.");
    const [updated] = await db.update(campaigns).set({ status }).where(eq(campaigns.id, id)).returning();
    await logAudit(actor.user.email, actor.staffRole, `CAMPAIGN_${status}`, "campaigns", id, { title: row.title });
    return Response.json({ ok: true, campaign: updated });
  }

  // create / update
  const title = String(body.title ?? "").trim();
  const errors: Record<string, string> = {};
  if (title.length < 5) errors.title = "Başlık en az 5 karakter olmalı.";

  const type = String(body.type ?? "PERCENT");
  const discountPercent = clamp(body.discountPercent, 0, 70);
  const discountAmountCents = clamp(body.discountAmountCents, 0, 5_000_000);
  if (type === "PERCENT" && discountPercent <= 0) errors.discountPercent = "Yüzde 0'dan büyük olmalı.";
  if ((type === "FIXED" || type === "PRODUCT") && discountAmountCents <= 0)
    errors.discountAmountCents = "Sabit indirim tutarı 0'dan büyük olmalı.";

  const description = String(body.description ?? "").trim();
  if (description.length < 10) errors.description = "Açıklama en az 10 karakter olmalı.";
  const terms = String(body.terms ?? "").trim();
  if (terms.length < 20) errors.terms = "Kampanya koşulları en az 20 karakter olmalı (müşteriye gösterilir).";

  const startsAt = body.startsAt ? new Date(String(body.startsAt)) : new Date();
  const endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
  if (Number.isNaN(startsAt.getTime())) errors.startsAt = "Geçersiz başlangıç tarihi.";
  if (endsAt && Number.isNaN(endsAt.getTime())) errors.endsAt = "Geçersiz bitiş tarihi.";
  if (endsAt && endsAt <= startsAt) errors.endsAt = "Bitiş tarihi başlangıçtan sonra olmalı.";

  const minBasketCents = clamp(body.minBasketCents, 0, 10_000_000);
  const currency = ["TRY", "USD", "GEL", "EUR"].includes(String(body.currency)) ? String(body.currency) : "TRY";
  if (Object.keys(errors).length) return Response.json({ ok: false, errors }, { status: 422 });

  const id = body.id ? String(body.id) : null;
  const values = {
    businessId: actor.businessId,
    title,
    description,
    terms,
    type,
    discountPercent,
    discountAmountCents,
    minBasketCents,
    maxDiscountCents: clamp(body.maxDiscountCents, 0, 5_000_000),
    currency,
    startsAt,
    endsAt,
    timeStart: body.timeStart ? String(body.timeStart) : null,
    timeEnd: body.timeEnd ? String(body.timeEnd) : null,
    days: Array.isArray(body.days) ? body.days.map((d: unknown) => clamp(d, 0, 6)).slice(0, 7) : [],
    perCustomerLimit: clamp(body.perCustomerLimit, 1, 100, 1),
    usageLimit: body.usageLimit ? clamp(body.usageLimit, 1, 1_000_000) : null,
    eligibleItems: Array.isArray(body.eligibleItems) ? body.eligibleItems.map(String).slice(0, 20) : [],
    exclusions: Array.isArray(body.exclusions) ? body.exclusions.map(String).slice(0, 20) : [],
    imageUrl: body.imageUrl ? String(body.imageUrl).slice(0, 400) : null,
    qrEnabled: body.qrEnabled !== false,
    // Yeni kampanyalar taslak başlar; yayın kararı işletmenin onayıyla verilir.
    status: body.publish === true ? "PUBLISHED" : "DRAFT",
    moderationStatus: "PENDING",
    isSponsored: false,
  };

  if (id) {
    const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!existing) return jsonError(404, "Kampanya bulunamadı.");
    if (existing.businessId !== actor.businessId) return jsonError(403, "Bu kampanya size ait değil.");
    const [updated] = await db
      .update(campaigns)
      // Koşullar değiştiyse moderasyon yeniden gerekir; geçmiş kullanım kayıtları etkilenmez.
      .set({ ...values, businessId: existing.businessId, moderationStatus: "PENDING" })
      .where(eq(campaigns.id, id))
      .returning();
    await logAudit(actor.user.email, actor.staffRole, "CAMPAIGN_UPDATED", "campaigns", id, { title });
    return Response.json({ ok: true, campaign: updated });
  }

  const code = `DMP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const [created] = await db
    .insert(campaigns)
    .values({ ...values, code, slug: `${slugify(title)}-${code.toLowerCase()}` })
    .returning();

  await db.insert(qrCodes).values({
    code: `QR-${created.code}`,
    businessId: actor.businessId,
    campaignId: created.id,
    customerId: null,
    status: "ACTIVE",
  });

  await trackEvent("qr_generated", { businessId: actor.businessId, campaignId: created.id, meta: { code } });
  await logAudit(actor.user.email, actor.staffRole, "CAMPAIGN_CREATED", "campaigns", created.id, { title, code });
  return Response.json({ ok: true, campaign: created });
}

/** İşletmenin kendi kampanya sayacı (görüntülenme/tıklama) */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const field = body.field === "clicks" ? "clicks" : "views";
  await db
    .update(campaigns)
    .set({ [field]: sql`${campaigns[field]} + 1` } as never)
    .where(eq(campaigns.id, id));
  return Response.json({ ok: true });
}
