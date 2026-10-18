import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bonusGrants,
  bonusPolicies,
  businesses,
  campaignUsages,
  campaigns,
  notifications,
  qrCodes,
  referrals,
  users,
} from "@/db/schema";
import { businessActor, currentUser, jsonError, staffCan } from "@/lib/auth-actions";
import { logAudit, trackEvent } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionUser, businessActorLite } from "@/lib/authz";
import {
  ActionError,
  bonusRedeem,
  qrCancel,
  qrGet,
  qrScan,
  qrSubmit,
  qrVerifyReject,
} from "@/lib/data/supabase-actions";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * QR / kampanya kullanım akışı.
 *
 *  QR okutma  ≠  doğrulanmış kampanya kullanımı
 *  QR_SCANNED → SUBMITTED → VERIFIED (işletme onayıyla)
 *
 * DampingVar ödeme almaz; reportedBasket/reportedDiscount alanları işletmenin
 * BİLDİRDİĞİ bilgilerdir ve platform geliri olarak yorumlanmaz.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "scan");

  /* --------------------- SUPABASE MODU (FAZ 5) ------------------------ */
  if (isSupabaseConfigured()) {
    try {
      if (action === "scan") {
        const code = String(body.code ?? "").trim();
        if (!code) return jsonError(400, "QR veya kampanya kodu gerekli.");
        return await qrScan(code);
      }
      if (action === "submit") {
        const user = await getSessionUser();
        if (!user) return jsonError(401, "Bu işlem için giriş yapmalısınız.");
        const basket =
          body.reportedBasketCents != null ? Math.max(0, Math.round(Number(body.reportedBasketCents))) : null;
        return await qrSubmit(String(body.usageId ?? ""), basket);
      }
      if (action === "verify" || action === "reject") {
        const actor = await businessActorLite();
        if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
        if (!staffCan(actor.staffRole, "usage.verify"))
          return jsonError(403, `${actor.staffRole} rolü kampanya kullanımını doğrulayamaz.`);
        return await qrVerifyReject(actor, {
          usageId: String(body.usageId ?? ""),
          action,
          basket: body.reportedBasketCents != null ? Math.max(0, Math.round(Number(body.reportedBasketCents))) : null,
          discount: body.reportedDiscountCents != null ? Math.max(0, Math.round(Number(body.reportedDiscountCents))) : null,
          note: body.note ? String(body.note).slice(0, 500) : null,
        });
      }
      if (action === "cancel") {
        const actor = await businessActorLite();
        if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
        if (!staffCan(actor.staffRole, "usage.verify")) return jsonError(403, "Yetkiniz yok.");
        return await qrCancel(actor, String(body.usageId ?? ""), String(body.note ?? "İşletme iptal etti."));
      }
      if (action === "redeem-bonus") {
        const user = await getSessionUser();
        if (!user) return jsonError(401, "Giriş yapmalısınız.");
        return await bonusRedeem(user, String(body.bonusId ?? ""), body.usageId ? String(body.usageId) : null);
      }
      return jsonError(400, "Bilinmeyen işlem.");
    } catch (e) {
      if (e instanceof ActionError) return jsonError(e.status, e.message);
      throw e;
    }
  }

  /* ------------------------------- 1) OKUTMA ------------------------------ */
  if (action === "scan") {
    const code = String(body.code ?? "").trim();
    if (!code) return jsonError(400, "QR veya kampanya kodu gerekli.");

    const qrRows = await db.select().from(qrCodes).where(eq(qrCodes.code, code)).limit(1);
    const qr = qrRows[0] ?? null;
    let campaign = qr?.campaignId
      ? (await db.select().from(campaigns).where(eq(campaigns.id, qr.campaignId)).limit(1))[0] ?? null
      : (await db.select().from(campaigns).where(eq(campaigns.code, code)).limit(1))[0] ?? null;

    if (!campaign) return jsonError(404, "Kod bulunamadı. QR'ın bu işletmeye ait olduğunu kontrol edin.");

    const biz = (await db.select().from(businesses).where(eq(businesses.id, campaign.businessId)).limit(1))[0];
    if (!biz) return jsonError(404, "İşletme bulunamadı.");

    // kampanya geçerlilik kontrolü (sunucu tarafı)
    const now = new Date();
    const problems: string[] = [];
    if (campaign.status !== "PUBLISHED") problems.push("Kampanya şu anda yayında değil.");
    if (campaign.moderationStatus !== "APPROVED") problems.push("Kampanya moderasyon onayı bekliyor.");
    if (new Date(campaign.startsAt) > now) problems.push("Kampanya henüz başlamadı.");
    if (campaign.endsAt && new Date(campaign.endsAt) < now) problems.push("Kampanyanın süresi doldu.");
    if (campaign.days && (campaign.days as number[]).length && !(campaign.days as number[]).includes(now.getDay()))
      problems.push("Kampanya bugün geçerli değil.");

    const user = await currentUser();
    const idemKey = `SCAN:${campaign.id}:${user?.id ?? "anon"}:${today()}`;

    // Idempotency: aynı gün, aynı kampanya, aynı kullanıcı için AÇIK bir kayıt varsa
    // yeni kayıt üretilmez. Kapanmış (VERIFIED/REJECTED/CANCELLED) kayıtlar yeni bir
    // okutmayı engellemez — müşteri aynı gün tekrar alışveriş yapabilir.
    const sameDay = await db
      .select()
      .from(campaignUsages)
      .where(sql`${campaignUsages.idempotencyKey} like ${`${idemKey}%`}`);
    const open = sameDay.find((u) => ["QR_SCANNED", "SUBMITTED"].includes(u.status));
    if (open) {
      return Response.json({
        ok: true,
        duplicate: true,
        usage: serializeUsage(open, biz.name, campaign.title),
        campaign: serializeCampaign(campaign, biz),
        problems,
      });
    }
    const uniqueKey = sameDay.length ? `${idemKey}#${sameDay.length}` : idemKey;

    const [usage] = await db
      .insert(campaignUsages)
      .values({
        businessId: biz.id,
        campaignId: campaign.id,
        qrCodeId: qr?.id ?? null,
        customerId: user?.id ?? null,
        status: "QR_SCANNED",
        channel: qr ? "IN_STORE" : "LINK",
        currency: campaign.currency ?? biz.currency ?? "TRY",
        idempotencyKey: uniqueKey,
        scannedAt: new Date(),
      })
      .returning();

    await trackEvent("qr_scanned", { businessId: biz.id, campaignId: campaign.id, userId: user?.id ?? null, meta: { code } });
    await logAudit(user?.email ?? "anonim", user?.role ?? "GUEST", "QR_SCANNED", "campaign_usages", usage.id, { code });

    return Response.json({
      ok: true,
      usage: serializeUsage(usage, biz.name, campaign.title),
      campaign: serializeCampaign(campaign, biz),
      problems,
      notice:
        "QR okutulması tek başına alışverişin gerçekleştiğini kanıtlamaz. İndirim, kampanya koşulları sağlandığında işletme tarafından kasada uygulanır.",
    });
  }

  /* ------------------- 2) MÜŞTERİ KULLANIMI DOĞRULAMAYA GÖNDERİR ------------ */
  if (action === "submit") {
    const user = await currentUser();
    if (!user) return jsonError(401, "Bu işlem için giriş yapmalısınız.");
    const usageId = String(body.usageId ?? "");
    const basket = body.reportedBasketCents != null ? Math.max(0, Math.round(Number(body.reportedBasketCents))) : null;

    const rows = await db.select().from(campaignUsages).where(eq(campaignUsages.id, usageId)).limit(1);
    const usage = rows[0];
    if (!usage) return jsonError(404, "Kayıt bulunamadı.");
    if (usage.customerId !== user.id) return jsonError(403, "Bu kayıt size ait değil.");
    if (!["QR_SCANNED", "SUBMITTED"].includes(usage.status)) return jsonError(400, "Bu kayıt zaten işlenmiş.");

    const [updated] = await db
      .update(campaignUsages)
      .set({ status: "SUBMITTED", reportedBasketCents: basket ?? usage.reportedBasketCents })
      .where(eq(campaignUsages.id, usageId))
      .returning();

    await trackEvent("usage_submitted", { businessId: usage.businessId, campaignId: usage.campaignId, userId: user.id });
    await db
      .update(referrals)
      .set({ status: "PURCHASE_PENDING_VERIFICATION", sourceUsageId: usageId })
      .where(and(eq(referrals.inviteeId, user.id), inArray(referrals.status, ["INVITED", "REGISTERED", "QUALIFIED"])));

    return Response.json({ ok: true, usage: updated });
  }

  /* ------------------- 3) İŞLETME KULLANIMI DOĞRULAR / REDDEDER ------------- */
  if (action === "verify" || action === "reject") {
    const actor = await businessActor();
    if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
    if (!staffCan(actor.staffRole, "usage.verify"))
      return jsonError(403, `${actor.staffRole} rolü kampanya kullanımını doğrulayamaz.`);

    const usageId = String(body.usageId ?? "");
    const basket = body.reportedBasketCents != null ? Math.max(0, Math.round(Number(body.reportedBasketCents))) : null;
    const discount = body.reportedDiscountCents != null ? Math.max(0, Math.round(Number(body.reportedDiscountCents))) : null;
    const note = body.note ? String(body.note).slice(0, 500) : null;

    return await db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`select id, status, business_id, campaign_id, customer_id, currency, reported_basket_cents from campaign_usages where id = ${usageId} for update`
      );
      const row = (locked.rows ?? [])[0] as
        | { id: string; status: string; business_id: string; campaign_id: string | null; customer_id: string | null; currency: string; reported_basket_cents: number | null }
        | undefined;
      if (!row) return jsonError(404, "Kayıt bulunamadı.");
      if (row.business_id !== actor.businessId) return jsonError(403, "Bu kayıt başka bir işletmeye ait.");
      if (row.status === "VERIFIED") return jsonError(400, "Bu kullanım zaten doğrulanmış.");
      if (row.status === "CANCELLED") return jsonError(400, "İptal edilmiş kayıt doğrulanamaz.");

      if (action === "reject") {
        await tx.update(campaignUsages).set({ status: "REJECTED", note }).where(eq(campaignUsages.id, usageId));
        await tx.insert(notifications).values({
          userId: row.customer_id ?? "",
          kind: "SYSTEM",
          title: "Kampanya kullanımı doğrulanamadı",
          body: note ?? "İşletme, kampanya koşullarının sağlanmadığını bildirdi.",
          link: "/hesabim?s=activity",
        }).catch(() => undefined);
        await trackEvent("usage_rejected", { businessId: row.business_id, campaignId: row.campaign_id, userId: row.customer_id });
        return Response.json({ ok: true, status: "REJECTED" });
      }

      await tx
        .update(campaignUsages)
        .set({
          status: "VERIFIED",
          verifiedAt: new Date(),
          reportedBasketCents: basket ?? row.reported_basket_cents,
          reportedDiscountCents: discount,
          note,
        })
        .where(eq(campaignUsages.id, usageId));

      await trackEvent("usage_verified", { businessId: row.business_id, campaignId: row.campaign_id, userId: row.customer_id });

      let bonus: Record<string, unknown> | null = null;
      const skipReasons: string[] = [];

      if (row.customer_id) {
        const refRows = await tx
          .select()
          .from(referrals)
          // Her DOĞRULANMIŞ alışveriş ayrı bir bonus hakkı doğurabilir; aynı alışverişten
          // ikinci ödül üretilmesi bonus_grants.source_usage_id UNIQUE ile engellenir.
          .where(
            and(
              eq(referrals.inviteeId, row.customer_id),
              inArray(referrals.status, ["INVITED", "REGISTERED", "PURCHASE_PENDING_VERIFICATION", "QUALIFIED"])
            )
          )
          .limit(1);
        const ref = refRows[0];
        if (!ref) skipReasons.push("Davet ilişkisi yok.");
        else if (ref.inviterId === row.customer_id) skipReasons.push("Kendi kendini davet.");
        else {
          const [policy] = await tx
            .select()
            .from(bonusPolicies)
            .where(and(eq(bonusPolicies.key, "DEFAULT"), eq(bonusPolicies.active, true)))
            .limit(1);
          if (!policy) skipReasons.push("Aktif bonus politikası yok.");
          else {
            const basketValue = basket ?? row.reported_basket_cents ?? 0;
            if (basketValue < policy.minPurchaseCents) skipReasons.push("Minimum alışveriş koşulu sağlanmadı.");

            const already = await tx.execute(
              sql`select count(*)::int as n from bonus_grants where user_id = ${ref.inviterId}`
            );
            const ownedCount = Number((already.rows ?? [])[0]?.n ?? 0);
            if (ownedCount >= policy.maxPerInviter) skipReasons.push("Davet eden için bonus limiti doldu.");

            if (!skipReasons.length) {
              const value =
                policy.rewardKind === "PERCENT_OF_BASKET"
                  ? Math.min(policy.maxRewardCents || Number.MAX_SAFE_INTEGER, Math.round((basketValue * policy.rewardPercent) / 1))
                  : policy.rewardCents;
              const capped = policy.maxRewardCents > 0 ? Math.min(value, policy.maxRewardCents) : value;
              if (capped <= 0) skipReasons.push("Hesaplanan bonus değeri sıfır.");
              else {
                const [grant] = await tx
                  .insert(bonusGrants)
                  .values({
                    userId: ref.inviterId,
                    businessId: row.business_id, // ← MAĞAZA KISITI
                    sourceReferralId: ref.id,
                    sourceUsageId: row.id, // ← unique: aynı alışverişten ikinci ödül üretilemez
                    policyId: policy.id,
                    valueCents: capped,
                    currency: row.currency,
                    minPurchaseCents: policy.minPurchaseCents,
                    status: "AVAILABLE",
                    expiresAt: new Date(Date.now() + policy.validDays * 86400000),
                  })
                  .returning();
                bonus = {
                  id: grant.id,
                  valueCents: grant.valueCents,
                  currency: grant.currency,
                  businessId: grant.businessId,
                  expiresAt: grant.expiresAt,
                };
                await tx.update(referrals).set({ status: "BONUS_AVAILABLE", sourceUsageId: row.id }).where(eq(referrals.id, ref.id));
                const [inviter] = await tx.select().from(users).where(eq(users.id, ref.inviterId)).limit(1);
                await tx.insert(notifications).values({
                  userId: ref.inviterId,
                  kind: "BONUS",
                  title: "Damping Bonus kazandın",
                  body: `Davetin doğrulandı. ${(capped / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${row.currency} indirim hakkı yalnızca bu mağazada geçerli.`,
                  link: "/hesabim?s=bonus",
                });
                await trackEvent("bonus_granted", {
                  businessId: row.business_id,
                  campaignId: row.campaign_id,
                  userId: ref.inviterId,
                  meta: { valueCents: capped, inviter: inviter?.name ?? "" },
                });
              }
            }
          }
        }
      }

      await logAudit(actor.user.email, actor.staffRole, "USAGE_VERIFIED", "campaign_usages", usageId, {
        basket,
        discount,
        bonusCreated: !!bonus,
        skipReasons,
      });

      return Response.json({ ok: true, status: "VERIFIED", bonus, skipReasons });
    });
  }

  /* ------------------------------ 4) İPTAL -------------------------------- */
  if (action === "cancel") {
    const actor = await businessActor();
    if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
    if (!staffCan(actor.staffRole, "usage.verify")) return jsonError(403, "Yetkiniz yok.");
    const usageId = String(body.usageId ?? "");
    const [usage] = await db.select().from(campaignUsages).where(eq(campaignUsages.id, usageId)).limit(1);
    if (!usage) return jsonError(404, "Kayıt bulunamadı.");
    if (usage.businessId !== actor.businessId) return jsonError(403, "Bu kayıt başka bir işletmeye ait.");
    const [updated] = await db
      .update(campaignUsages)
      .set({ status: "CANCELLED", note: String(body.note ?? "İşletme iptal etti.") })
      .where(eq(campaignUsages.id, usageId))
      .returning();
    // Doğrulanmış kullanım iptal edildiyse bonus da iptal edilir (geri alınabilir kayıt).
    await db.update(bonusGrants).set({ status: "CANCELLED" }).where(eq(bonusGrants.sourceUsageId, usageId));
    await trackEvent("usage_cancelled", { businessId: usage.businessId, campaignId: usage.campaignId });
    await logAudit(actor.user.email, actor.staffRole, "USAGE_CANCELLED", "campaign_usages", usageId, {});
    return Response.json({ ok: true, usage: updated });
  }

  /* ------------------- 5) MAĞAZAYA BAĞLI BONUS KULLANIMI -------------------- */
  if (action === "redeem-bonus") {
    const user = await currentUser();
    if (!user) return jsonError(401, "Giriş yapmalısınız.");
    const bonusId = String(body.bonusId ?? "");
    const usageId = body.usageId ? String(body.usageId) : null;

    return await db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`select id, user_id, business_id, status, expires_at, value_cents from bonus_grants where id = ${bonusId} for update`
      );
      const row = (locked.rows ?? [])[0] as
        | { id: string; user_id: string; business_id: string; status: string; expires_at: Date | null; value_cents: number }
        | undefined;
      if (!row) return jsonError(404, "Bonus bulunamadı.");
      if (row.user_id !== user.id) return jsonError(403, "Bu bonus size ait değil. Bonus devredilemez.");
      if (row.status === "USED") return jsonError(400, "Bu bonus zaten kullanılmış.");
      if (row.status !== "AVAILABLE") return jsonError(400, `Bonus şu an kullanılamaz (durum: ${row.status}).`);
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        await tx.update(bonusGrants).set({ status: "EXPIRED" }).where(eq(bonusGrants.id, bonusId));
        return jsonError(400, "Bonus süresi dolmuş.");
      }

      let targetBusiness = row.business_id;
      if (usageId) {
        const [usage] = await tx.select().from(campaignUsages).where(eq(campaignUsages.id, usageId)).limit(1);
        if (!usage) return jsonError(404, "Kullanım kaydı bulunamadı.");
        if (usage.businessId !== row.business_id)
          return jsonError(400, "Bonus yalnızca kazanıldığı mağazada kullanılabilir.");
        targetBusiness = usage.businessId;
      }

      await tx
        .update(bonusGrants)
        .set({ status: "USED", redeemedAt: new Date(), redeemedUsageId: usageId })
        .where(eq(bonusGrants.id, bonusId));

      await trackEvent("bonus_redeemed", { businessId: targetBusiness, userId: user.id, meta: { bonusId } });
      await logAudit(user.email, user.role, "BONUS_REDEEMED", "bonus_grants", bonusId, { businessId: targetBusiness });
      return Response.json({ ok: true, status: "USED", valueCents: row.value_cents, businessId: targetBusiness });
    });
  }

  return jsonError(400, "Bilinmeyen işlem.");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return jsonError(400, "code parametresi gerekli.");
  if (isSupabaseConfigured()) {
    try {
      return await qrGet(code);
    } catch (e) {
      if (e instanceof ActionError) return jsonError(e.status, e.message);
      throw e;
    }
  }
  const qr = (await db.select().from(qrCodes).where(eq(qrCodes.code, code)).limit(1))[0] ?? null;
  const campaign = qr?.campaignId
    ? (await db.select().from(campaigns).where(eq(campaigns.id, qr.campaignId)).limit(1))[0]
    : (await db.select().from(campaigns).where(eq(campaigns.code, code)).limit(1))[0];
  if (!campaign) return jsonError(404, "Kod bulunamadı.");
  const biz = (await db.select().from(businesses).where(eq(businesses.id, campaign.businessId)).limit(1))[0];
  return Response.json({ ok: true, campaign: serializeCampaign(campaign, biz!), qrCode: qr?.code ?? code });
}

/* ------------------------------------------------------------------ */

function serializeCampaign(c: typeof campaigns.$inferSelect, b: typeof businesses.$inferSelect) {
  return {
    id: c.id,
    code: c.code,
    slug: c.slug,
    title: c.title,
    description: c.description,
    terms: c.terms,
    type: c.type,
    discountPercent: c.discountPercent,
    discountAmountCents: c.discountAmountCents,
    minBasketCents: c.minBasketCents,
    maxDiscountCents: c.maxDiscountCents,
    currency: c.currency,
    startsAt: c.startsAt?.toISOString?.() ?? null,
    endsAt: c.endsAt?.toISOString?.() ?? null,
    timeStart: c.timeStart,
    timeEnd: c.timeEnd,
    days: (c.days ?? []) as number[],
    eligibleItems: (c.eligibleItems ?? []) as string[],
    exclusions: (c.exclusions ?? []) as string[],
    perCustomerLimit: c.perCustomerLimit,
    usageLimit: c.usageLimit,
    businessName: b.name,
    businessSlug: b.slug,
    district: b.district,
    city: b.city,
    address: b.address,
  };
}

function serializeUsage(u: typeof campaignUsages.$inferSelect, businessName: string, campaignTitle: string) {
  return {
    id: u.id,
    status: u.status,
    channel: u.channel,
    businessName,
    campaignTitle,
    currency: u.currency,
    reportedBasketCents: u.reportedBasketCents,
    reportedDiscountCents: u.reportedDiscountCents,
    scannedAt: u.scannedAt?.toISOString?.() ?? null,
    verifiedAt: u.verifiedAt?.toISOString?.() ?? null,
  };
}
