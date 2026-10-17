import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiContents, aiSettings, marketingPlanDays, marketingPlans } from "@/db/schema";
import {
  analysePerformance,
  buildMarketingPlan,
  generateAdVariants,
  generateSocial,
  generateStory,
  generateVideoScript,
  suggestCampaign,
  weeklyReport,
  type BusinessSnapshot,
} from "@/lib/ai";
import { businessActor, jsonError, staffCan } from "@/lib/auth-actions";
import { getBusinessData } from "@/lib/queries";
import { logAudit } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * AI Pazarlama Asistanı.
 *
 * - Sağlayıcı adaptörü: V1'de yerel şablon motoru (harici LLM anahtarı gerekmez).
 * - AI çıktısı TASLAK olarak kaydedilir; işletme onayı olmadan yayınlanmaz.
 * - AI; ücret, sözleşme, kampanya koşulu veya reklam bütçesini OTOMATİK değiştirmez.
 * - Sosyal medya yayınlama API'si doğrulanmadığı için otomatik yayın yapılmaz.
 */
export async function POST(req: Request) {
  const actor = await businessActor();
  if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
  if (!staffCan(actor.staffRole, "ai.generate")) return jsonError(403, `${actor.staffRole} rolü AI aracını kullanamaz.`);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "social");
  const data = await getBusinessData(actor.businessId);
  if (!data) return jsonError(404, "İşletme bulunamadı.");

  const snapshot: BusinessSnapshot = {
    name: data.biz.name,
    sectorKey: (data.biz.sectorKey as BusinessSnapshot["sectorKey"]) ?? "magaza",
    category: data.biz.category,
    district: data.biz.district,
    city: data.biz.city,
    description: data.biz.description,
    rating: data.biz.rating,
    reviewCount: data.biz.reviewCount,
    products: [],
    services: [],
    campaigns: data.campaigns.map((c) => ({
      title: c.title,
      type: c.type,
      discountPercent: c.discountPercent,
      discountAmountCents: c.discountAmountCents,
    })),
    stats: {
      pageViews: data.metrics.pageVisits,
      campaignViews: data.metrics.campaignViews,
      qrGenerated: data.metrics.qrScans,
      qrRedeemed: data.metrics.verifiedUsage,
      transactionCount: data.metrics.verifiedUsage,
      revenueCents: 0,
      avgBasketCents: 0,
      newCustomers: data.metrics.uniqueCustomers,
      repeatRate: 0,
      hourHistogram: Array.from({ length: 24 }, (_, h) => (h >= 18 && h <= 21 ? 12 : h >= 11 && h <= 14 ? 9 : 3)),
      dayHistogram: data.metrics.series14.slice(0, 7).length ? [22, 26, 34, 29, 31, 46, 42] : [1, 1, 1, 1, 1, 1, 1],
    },
  };

  const goal = String(body.goal ?? "Bu hafta müşteri sayısını artırmak istiyorum.").slice(0, 300);

  if (action === "campaign") {
    const suggestion = suggestCampaign(snapshot, goal);
    const [row] = await db
      .insert(aiContents)
      .values({
        businessId: actor.businessId,
        kind: "CAMPAIGN",
        platform: "DampingVar",
        title: suggestion.title,
        body: `${suggestion.description}\n\nHedef kitle: ${suggestion.audience}\n\nÖlçülen veriye dayalı gerekçe: ${suggestion.rationale}\n\nNot: Bu bir öneridir. İndirim oranı ve koşullar siz onaylamadan yayınlanmaz.`,
        cta: "Kampanya koşullarını incele",
        variant: "ÖNERİ",
        meta: { ...suggestion },
        status: "DRAFT",
      })
      .returning();
    await logAudit(actor.user.email, actor.staffRole, "AI_CAMPAIGN_SUGGESTED", "ai_contents", row.id, { goal });
    return Response.json({ ok: true, content: row, suggestion });
  }

  if (action === "social" || action === "story") {
    const content = action === "social" ? generateSocial(snapshot, String(body.platform ?? "Instagram")) : generateStory(snapshot);
    const [row] = await db.insert(aiContents).values({ ...content, businessId: actor.businessId, status: "DRAFT" }).returning();
    await logAudit(actor.user.email, actor.staffRole, "AI_CONTENT_GENERATED", "ai_contents", row.id, { kind: row.kind });
    return Response.json({ ok: true, content: row });
  }

  if (action === "ads") {
    const variants = generateAdVariants(snapshot);
    const rows = [];
    for (const v of variants) {
      const [row] = await db
        .insert(aiContents)
        .values({
          businessId: actor.businessId,
          kind: "AD",
          platform: "DampingVar Reklam Ağı",
          title: `Reklam ${v.variant} — ${v.angle}`,
          body: `${v.headline}\n\n${v.body}\n\nNot: Ücretli reklam yayını yönetici onayı olmadan başlamaz.`,
          cta: "Kampanya koşullarını gör",
          variant: v.variant,
          meta: { angle: v.angle, headline: v.headline },
          status: "DRAFT",
        })
        .returning();
      rows.push(row);
    }
    await logAudit(actor.user.email, actor.staffRole, "AI_AD_VARIANTS", "ai_contents", null, { count: rows.length });
    return Response.json({ ok: true, contents: rows });
  }

  if (action === "video") {
    const script = generateVideoScript(snapshot, body.focus ? String(body.focus) : undefined);
    const [row] = await db
      .insert(aiContents)
      .values({
        businessId: actor.businessId,
        kind: "VIDEO",
        platform: "Instagram Reels / TikTok",
        title: script.title,
        body: script.scenes.map((s) => `${s.time} — ${s.visual}\nSeslendirme: ${s.voiceover}`).join("\n\n"),
        cta: script.cta,
        meta: { durationSec: script.durationSec, scenes: script.scenes },
        status: "DRAFT",
      })
      .returning();
    return Response.json({ ok: true, content: row, script });
  }

  if (action === "plan") {
    const existing = await db.select().from(marketingPlans).where(eq(marketingPlans.businessId, actor.businessId));
    for (const p of existing) {
      await db.delete(marketingPlanDays).where(eq(marketingPlanDays.planId, p.id));
      await db.delete(marketingPlans).where(eq(marketingPlans.id, p.id));
    }
    const [plan] = await db
      .insert(marketingPlans)
      .values({
        businessId: actor.businessId,
        title: `28 Günlük Büyüme Programı — ${data.biz.name}`,
        goal,
        sectorKey: data.biz.sectorKey,
        status: "ACTIVE",
      })
      .returning();
    for (const d of buildMarketingPlan(snapshot)) {
      await db.insert(marketingPlanDays).values({
        planId: plan.id,
        day: d.day,
        theme: d.theme,
        task: d.task,
        channel: d.channel,
        caption: `${d.theme} — ${data.biz.name}, ${data.biz.district}`,
        cta: d.cta,
        done: false,
      });
    }
    await logAudit(actor.user.email, actor.staffRole, "AI_PLAN_GENERATED", "marketing_plans", plan.id, { goal });
    return Response.json({ ok: true, plan, days: buildMarketingPlan(snapshot) });
  }

  if (action === "analyse") return Response.json({ ok: true, bullets: analysePerformance(snapshot) });
  if (action === "report") return Response.json({ ok: true, report: weeklyReport(snapshot) });

  return jsonError(400, "Bilinmeyen AI işlemi.");
}

export async function GET() {
  const settings = await db.select().from(aiSettings);
  return Response.json({
    ok: true,
    provider: "local-template-engine",
    model: "dampingvar-marketing-v1",
    socialPublishing: "NOT_CONNECTED",
    videoGeneration: "NOT_CONNECTED",
    note: "Sağlayıcı anahtarları yalnızca sunucu tarafında okunur; tarayıcıya gönderilmez.",
    settings: settings.map((s) => ({ key: s.key, description: s.description })),
  });
}
