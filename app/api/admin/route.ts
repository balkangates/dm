import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  adCampaigns,
  aiSettings,
  bonusPolicies,
  businesses,
  campaigns,
  fraudReviews,
  invoices,
  packages,
  serviceFeeRules,
} from "@/db/schema";
import { currentUser, jsonError } from "@/lib/auth-actions";
import { logAudit } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Yönetici işlemleri. Yetki SUNUCUDA doğrulanır: users.role = 'ADMIN'.
 * Gizli frontend kontrollerine dayanmaz. Her kritik işlem audit log'a yazılır.
 *
 * NOT: Bu uçta müşteri parası, cüzdan bakiyesi veya işletmeler arası
 * mahsup/transfer işlemi YOKTUR. Yalnızca hizmet bedeli, paket, kampanya
 * moderasyonu, bonus politikası ve fraud incelemesi yönetilir.
 */
export async function POST(req: Request) {
  const admin = await currentUser();
  if (!admin) return jsonError(401, "Oturum gerekli.");
  if (admin.role !== "ADMIN") return jsonError(403, "Bu işlem yalnızca platform yöneticileri içindir.");

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const id = String(body.id ?? "");
  const clampInt = (v: unknown, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(Number(v ?? 0)) || 0));

  switch (action) {
    /* --------------------------- kampanya moderasyonu -------------------------- */
    case "campaign_moderate": {
      const decision = String(body.decision ?? "");
      if (!["APPROVED", "REJECTED", "PENDING"].includes(decision)) return jsonError(400, "Geçersiz karar.");
      const [row] = await db
        .update(campaigns)
        .set({ moderationStatus: decision })
        .where(eq(campaigns.id, id))
        .returning();
      if (!row) return jsonError(404, "Kampanya bulunamadı.");
      await logAudit(admin.email, "ADMIN", `CAMPAIGN_${decision}`, "campaigns", id, { title: row.title });
      return Response.json({ ok: true, campaign: row });
    }

    case "campaign_feature": {
      const [row] = await db
        .update(campaigns)
        .set({ isSponsored: body.isSponsored === true })
        .where(eq(campaigns.id, id))
        .returning();
      if (!row) return jsonError(404, "Kampanya bulunamadı.");
      await logAudit(admin.email, "ADMIN", "CAMPAIGN_SPONSOR_TOGGLE", "campaigns", id, {
        isSponsored: row.isSponsored,
      });
      return Response.json({ ok: true, campaign: row });
    }

    /* ------------------------------ işletme ----------------------------------- */
    case "business_verify": {
      const [row] = await db
        .update(businesses)
        .set({ verified: body.verified === true, featured: body.featured === true ? true : undefined })
        .where(eq(businesses.id, id))
        .returning();
      if (!row) return jsonError(404, "İşletme bulunamadı.");
      await logAudit(admin.email, "ADMIN", "BUSINESS_VERIFY", "businesses", id, { verified: row.verified });
      return Response.json({ ok: true, business: row });
    }

    case "business_plan": {
      const planCode = String(body.planCode ?? "");
      const pkg = await db.select().from(packages).where(eq(packages.code, planCode)).limit(1);
      if (!pkg[0]) return jsonError(400, "Geçersiz paket kodu.");
      const [row] = await db.update(businesses).set({ planCode }).where(eq(businesses.id, id)).returning();
      await logAudit(admin.email, "ADMIN", "BUSINESS_PLAN_CHANGED", "businesses", id, { planCode });
      return Response.json({ ok: true, business: row });
    }

    /* ------------------------------- paketler ---------------------------------- */
    case "package_update": {
      const price = clampInt(body.priceMonthlyCents, 0, 100_000_000);
      const quota = clampInt(body.aiQuotaMonthly, 0, 100_000);
      const code = String(body.code ?? id);
      const [row] = await db
        .update(packages)
        .set({
          priceMonthlyCents: price,
          aiQuotaMonthly: quota,
          active: body.active === undefined ? true : body.active === true,
        })
        .where(eq(packages.code, code))
        .returning();
      if (!row) return jsonError(404, "Paket bulunamadı.");
      await logAudit(admin.email, "ADMIN", "PACKAGE_UPDATED", "packages", row.id, { code, price, quota });
      return Response.json({ ok: true, package: row });
    }

    /* --------------------------- hizmet bedeli kuralı --------------------------- */
    case "fee_rule_update": {
      const [row] = await db
        .update(serviceFeeRules)
        .set({
          amountCents: clampInt(body.amountCents, 0, 100_000_000),
          rate: Math.max(0, Math.min(1, Number(body.rate ?? 0) || 0)),
          active: body.active === undefined ? true : body.active === true,
          // Yeni kural ileriye dönük geçerli olur; geçmiş faturalar değişmez.
          validFrom: new Date(),
        })
        .where(eq(serviceFeeRules.id, id))
        .returning();
      if (!row) return jsonError(404, "Kural bulunamadı.");
      await logAudit(admin.email, "ADMIN", "FEE_RULE_UPDATED", "service_fee_rules", id, {
        amountCents: row.amountCents,
        rate: row.rate,
      });
      return Response.json({ ok: true, rule: row });
    }

    /* -------------------------------- fatura ----------------------------------- */
    case "invoice_status": {
      const status = String(body.status ?? "");
      if (!["DRAFT", "ISSUED", "SENT", "PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED"].includes(status))
        return jsonError(400, "Geçersiz fatura durumu.");
      const [row] = await db
        .update(invoices)
        .set({
          status,
          issuedAt: status === "ISSUED" ? new Date() : undefined,
          paidAt: status === "PAID" ? new Date() : undefined,
        })
        .where(eq(invoices.id, id))
        .returning();
      if (!row) return jsonError(404, "Fatura bulunamadı.");
      await logAudit(admin.email, "ADMIN", `INVOICE_${status}`, "invoices", id, { number: row.number });
      return Response.json({ ok: true, invoice: row });
    }

    /* --------------------------- bonus politikası ------------------------------ */
    case "bonus_policy_update": {
      const [row] = await db
        .update(bonusPolicies)
        .set({
          rewardKind: body.rewardKind === "PERCENT_OF_BASKET" ? "PERCENT_OF_BASKET" : "FIXED",
          rewardCents: clampInt(body.rewardCents, 0, 1_000_000),
          rewardPercent: Math.max(0, Math.min(0.5, Number(body.rewardPercent ?? 0) || 0)),
          maxRewardCents: clampInt(body.maxRewardCents, 0, 1_000_000),
          minPurchaseCents: clampInt(body.minPurchaseCents, 0, 10_000_000),
          validDays: clampInt(body.validDays, 1, 365),
          maxPerInviter: clampInt(body.maxPerInviter, 0, 1000),
          requiresVerification: body.requiresVerification !== false,
          active: body.active === undefined ? true : body.active === true,
          updatedAt: new Date(),
        })
        .where(eq(bonusPolicies.id, id))
        .returning();
      if (!row) return jsonError(404, "Politika bulunamadı.");
      await logAudit(admin.email, "ADMIN", "BONUS_POLICY_UPDATED", "bonus_policies", id, {
        rewardCents: row.rewardCents,
        validDays: row.validDays,
      });
      return Response.json({ ok: true, policy: row });
    }

    /* --------------------------------- fraud ----------------------------------- */
    case "fraud_resolve": {
      const status = body.status === "CLEARED" ? "CLEARED" : "BLOCKED";
      const [row] = await db.update(fraudReviews).set({ status }).where(eq(fraudReviews.id, id)).returning();
      if (!row) return jsonError(404, "Kayıt bulunamadı.");
      await logAudit(admin.email, "ADMIN", `FRAUD_${status}`, "fraud_reviews", id, {});
      return Response.json({ ok: true, fraud: row });
    }

    /* ------------------------------- reklam ------------------------------------ */
    case "ad_status": {
      const status = String(body.status ?? "");
      if (!["DRAFT", "PENDING_APPROVAL", "ACTIVE", "ENDED"].includes(status))
        return jsonError(400, "Geçersiz reklam durumu.");
      const [row] = await db.update(adCampaigns).set({ status }).where(eq(adCampaigns.id, id)).returning();
      if (!row) return jsonError(404, "Reklam bulunamadı.");
      await logAudit(admin.email, "ADMIN", `AD_${status}`, "ad_campaigns", id, { name: row.name });
      return Response.json({ ok: true, ad: row });
    }

    /* ------------------------------ AI ayarları -------------------------------- */
    case "ai_setting": {
      const key = String(body.key ?? "");
      const value = String(body.value ?? "").slice(0, 400);
      if (!key) return jsonError(400, "Anahtar gerekli.");
      const [row] = await db.update(aiSettings).set({ value }).where(eq(aiSettings.key, key)).returning();
      // Anahtar değerleri log'a yazılmaz.
      await logAudit(admin.email, "ADMIN", "AI_SETTING_UPDATED", "ai_settings", key, {
        key,
        masked: key.toLowerCase().includes("key") || key.toLowerCase().includes("secret"),
      });
      return Response.json({ ok: true, setting: row ? { key: row.key, value: row.value } : null });
    }

    default:
      return jsonError(400, "Bilinmeyen yönetici işlemi.");
  }
}

export async function GET() {
  const admin = await currentUser();
  if (!admin || admin.role !== "ADMIN") return jsonError(403, "Yönetici erişimi gerekli.");
  return Response.json({ ok: true, role: admin.role });
}
