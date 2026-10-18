import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { affiliateClicks, affiliateConversions, affiliateNetworks, affiliateOffers } from "@/db/schema";
import { currentUser, jsonError } from "@/lib/auth-actions";
import { getAffiliateData, logAudit, trackEvent } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionUser } from "@/lib/authz";
import {
  ActionError,
  affiliateActiveCount,
  affiliateAdminAction,
  affiliateClick,
  affiliateConfirmOutbound,
} from "@/lib/data/supabase-actions";

export const dynamic = "force-dynamic";

/**
 * Affiliate akışı.
 *
 *  tıklama → dış satıcıya çıkış → (ağ raporu) → komisyon durumu
 *
 *  Tıklama ASLA satın alma sayılmaz. Komisyon yalnızca bir rapor kaynağına
 *  (ağ raporu, manuel giriş veya işaretli demo örneği) dayanır ve bekleyen
 *  komisyon doğrulanmış gelir olarak sunulmaz.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  /* --------------------- SUPABASE MODU (FAZ 5) ------------------------ */
  if (isSupabaseConfigured()) {
    const user = await getSessionUser();
    try {
      if (action === "click") {
        const offerId = String(body.offerId ?? "");
        if (!offerId) return jsonError(400, "offerId gerekli.");
        return await affiliateClick(user, offerId, String(body.channel ?? "WEB"));
      }
      if (action === "confirm-outbound") return await affiliateConfirmOutbound(user, String(body.clickId ?? ""));
      // Aşağıdaki üç işlem yalnızca yöneticidir.
      if (["report-conversion", "conversion-status", "network-status", "offer-status"].includes(action)) {
        if (!user || user.role !== "ADMIN") return jsonError(403, "Bu işlem yalnızca platform yöneticileri içindir.");
        return await affiliateAdminAction(user, body as Record<string, unknown>);
      }
      return jsonError(400, "Bilinmeyen işlem.");
    } catch (e) {
      if (e instanceof ActionError) return jsonError(e.status, e.message);
      throw e;
    }
  }

  const user = await currentUser();

  /* ------------------------- 1) İZLENEN TIKLAMA ------------------------- */
  if (action === "click") {
    const offerId = String(body.offerId ?? "");
    const offer = (await db.select().from(affiliateOffers).where(eq(affiliateOffers.id, offerId)).limit(1))[0];
    if (!offer) return jsonError(404, "Fırsat bulunamadı.");

    const clickId = `dv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(affiliateClicks).values({
      offerId,
      userId: user?.id ?? null,
      clickId,
      channel: String(body.channel ?? "WEB"),
      confirmedOutbound: false,
    });
    await db
      .update(affiliateOffers)
      .set({ clicks: sql`${affiliateOffers.clicks} + 1` })
      .where(eq(affiliateOffers.id, offerId));
    await trackEvent("affiliate_click", { userId: user?.id ?? null, meta: { offerId, clickId, merchant: offer.merchant } });

    return Response.json({
      ok: true,
      clickId,
      destinationUrl: offer.destinationUrl,
      merchant: offer.merchant,
      disclosure: offer.disclosure,
      notice:
        "DampingVar'dan ayrılıyorsun. Alışveriş, ödeme ve teslimat tamamen satıcının sitesinde gerçekleşir.",
    });
  }

  /* -------------------- 2) ÇIKIŞIN KULLANICI ONAYI ---------------------- */
  if (action === "confirm-outbound") {
    const clickId = String(body.clickId ?? "");
    const [row] = await db
      .update(affiliateClicks)
      .set({ confirmedOutbound: true })
      .where(eq(affiliateClicks.clickId, clickId))
      .returning();
    if (!row) return jsonError(404, "Tıklama kaydı bulunamadı.");
    await trackEvent("affiliate_outbound", { userId: user?.id ?? null, meta: { clickId } });
    return Response.json({ ok: true, clickId });
  }

  /* ------------- 3) AĞ RAPORU / MANUEL DÖNÜŞÜM KAYDI (ADMIN) ------------ */
  if (action === "report-conversion") {
    if (!user || user.role !== "ADMIN") return jsonError(403, "Bu işlem yalnızca platform yöneticileri içindir.");
    const offerId = String(body.offerId ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!idempotencyKey) return jsonError(400, "Idempotency anahtarı zorunlu (tekrarlanan raporlar çoğaltılmaz).");

    const existing = await db
      .select()
      .from(affiliateConversions)
      .where(eq(affiliateConversions.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing[0]) {
      return Response.json({ ok: true, duplicate: true, conversion: existing[0] });
    }

    const commission = body.commissionCents == null ? null : Math.max(0, Math.round(Number(body.commissionCents)));
    const [row] = await db
      .insert(affiliateConversions)
      .values({
        offerId: offerId || null,
        clickId: body.clickId ? String(body.clickId) : null,
        networkId: body.networkId ? String(body.networkId) : null,
        status: "REPORTED",
        commissionCents: commission,
        currency: ["TRY", "USD", "GEL", "EUR"].includes(String(body.currency)) ? String(body.currency) : "TRY",
        source: body.source === "MANUAL_ENTRY" ? "MANUAL_ENTRY" : "NETWORK_REPORT",
        networkReference: body.networkReference ? String(body.networkReference).slice(0, 120) : null,
        idempotencyKey,
        reportedAt: new Date(),
        note: body.note ? String(body.note).slice(0, 400) : null,
      })
      .returning();

    await trackEvent("conversion_reported", { userId: null, meta: { offerId, source: row.source } });
    await logAudit(user.email, "ADMIN", "AFFILIATE_CONVERSION_REPORTED", "affiliate_conversions", row.id, {
      source: row.source,
      commissionCents: row.commissionCents,
    });
    return Response.json({ ok: true, conversion: row });
  }

  /* ------------------- 4) KOMİSYON DURUM DEĞİŞİMİ ----------------------- */
  if (action === "conversion-status") {
    if (!user || user.role !== "ADMIN") return jsonError(403, "Bu işlem yalnızca platform yöneticileri içindir.");
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    const allowed = ["PENDING", "APPROVED", "REJECTED", "REVERSED", "PAID"];
    if (!allowed.includes(status)) return jsonError(400, "Geçersiz komisyon durumu.");

    const [row] = await db
      .update(affiliateConversions)
      .set({
        status,
        decidedAt: status === "PENDING" ? null : new Date(),
        paidAt: status === "PAID" ? new Date() : null,
        note: body.note ? String(body.note).slice(0, 400) : undefined,
      })
      .where(eq(affiliateConversions.id, id))
      .returning();
    if (!row) return jsonError(404, "Komisyon kaydı bulunamadı.");

    await trackEvent("commission_status_changed", { meta: { id, status } });
    await logAudit(user.email, "ADMIN", `COMMISSION_${status}`, "affiliate_conversions", id, {
      commissionCents: row.commissionCents,
    });
    return Response.json({ ok: true, conversion: row });
  }

  /* ---------------------- 5) AĞ BAĞLANTI DURUMU ------------------------- */
  if (action === "network-status") {
    if (!user || user.role !== "ADMIN") return jsonError(403, "Bu işlem yalnızca platform yöneticileri içindir.");
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!["NOT_CONNECTED", "PENDING_CREDENTIALS", "CONNECTED", "SUSPENDED"].includes(status))
      return jsonError(400, "Geçersiz ağ durumu.");
    const [row] = await db
      .update(affiliateNetworks)
      .set({
        status,
        notes: body.notes ? String(body.notes).slice(0, 500) : undefined,
        lastSyncAt: status === "CONNECTED" ? new Date() : undefined,
      })
      .where(eq(affiliateNetworks.id, id))
      .returning();
    if (!row) return jsonError(404, "Ağ bulunamadı.");
    await logAudit(user.email, "ADMIN", `AFFILIATE_NETWORK_${status}`, "affiliate_networks", id, {});
    return Response.json({ ok: true, network: row });
  }

  if (action === "offer-status") {
    if (!user || user.role !== "ADMIN") return jsonError(403, "Bu işlem yalnızca platform yöneticileri içindir.");
    const status = String(body.status ?? "");
    if (!["ACTIVE", "PAUSED", "EXPIRED"].includes(status)) return jsonError(400, "Geçersiz durum.");
    const [row] = await db
      .update(affiliateOffers)
      .set({ status, lastUpdated: new Date() })
      .where(eq(affiliateOffers.id, String(body.id ?? "")))
      .returning();
    if (!row) return jsonError(404, "Fırsat bulunamadı.");
    await logAudit(user.email, "ADMIN", `AFFILIATE_OFFER_${status}`, "affiliate_offers", row.id, {});
    return Response.json({ ok: true, offer: row });
  }

  return jsonError(400, "Bilinmeyen işlem.");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("scope") === "admin") {
    if (isSupabaseConfigured()) {
      const user = await getSessionUser();
      if (!user || user.role !== "ADMIN") return jsonError(403, "Yönetici erişimi gerekli.");
      return Response.json({ ok: true, data: await getAffiliateData() });
    }
    const user = await currentUser();
    if (!user || user.role !== "ADMIN") return jsonError(403, "Yönetici erişimi gerekli.");
    return Response.json({ ok: true, data: await getAffiliateData() });
  }
  if (isSupabaseConfigured()) return affiliateActiveCount();
  const offers = await db.select().from(affiliateOffers).where(eq(affiliateOffers.status, "ACTIVE"));
  return Response.json({ ok: true, count: offers.length });
}
