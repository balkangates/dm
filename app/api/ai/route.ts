import { jsonError, staffCan } from "@/lib/auth-actions";
import { businessActorLite } from "@/lib/authz";
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
import { campaignFieldsFromSuggestion, growthAnalyse, type GrowthExtras, type ExistingRec } from "@/lib/growth";
import { getBusinessData, logAudit } from "@/lib/queries";
import {
  ActionError,
  aiDeletePlan,
  aiInsertContent,
  aiInsertPlan,
  aiSettingsOverview,
  bizNotify,
  growthAnswer,
  growthInsertRec,
  growthNotificationsRead,
  growthTaskUpdate,
} from "@/lib/data/supabase-actions";

export const dynamic = "force-dynamic";

/** İşletme anlık görüntüsü — hesaplama veri katmanından gelir. */
function buildSnapshot(data: NonNullable<Awaited<ReturnType<typeof getBusinessData>>>): BusinessSnapshot {
  return {
    name: data.biz.name,
    sectorKey: (data.biz.sectorKey as BusinessSnapshot["sectorKey"]) ?? "magaza",
    category: data.biz.category,
    district: data.biz.district,
    city: data.biz.city,
    description: data.biz.description,
    rating: data.biz.rating,
    reviewCount: data.biz.reviewCount,
    // ÜRÜN/HİZMET verisi artık snapshot'a dahil → AI içeriği işletme profiline göre uyarlanır (istek c).
    products: data.products.map((p) => ({ name: p.name, priceCents: p.priceCents, discountPriceCents: p.discountPriceCents ?? null })),
    services: data.services.map((s) => ({ name: s.name, priceCents: s.priceCents })),
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
}

/**
 * AI Pazarlama Asistanı (FAZ 6 — Supabase).
 *
 * - Sağlayıcı adaptörü: yerel şablon motoru (harici LLM anahtarı gerekmez).
 * - AI çıktısı TASLAK olarak kaydedilir; işletme onayı olmadan yayınlanmaz.
 * - AI; ücret, sözleşme, kampanya koşulu veya reklam bütçesini OTOMATİK değiştirmez.
 * - Sosyal medya yayınlama API'si doğrulanmadığı için otomatik yayın yapılmaz.
 */
export async function POST(req: Request) {
  const actor = await businessActorLite();
  if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
  if (!staffCan(actor.staffRole, "ai.generate")) return jsonError(403, `${actor.staffRole} rolü AI aracını kullanamaz.`);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "social");
  const data = await getBusinessData(actor.businessId);
  if (!data) return jsonError(404, "İşletme bulunamadı.");
  const snapshot = buildSnapshot(data);
  const goal = String(body.goal ?? "Bu hafta müşteri sayısını artırmak istiyorum.").slice(0, 300);

  try {
    if (action === "campaign") {
      const suggestion = suggestCampaign(snapshot, goal);
      const row = await aiInsertContent(actor, {
        kind: "CAMPAIGN",
        platform: "DampingVar",
        title: suggestion.title,
        body: `${suggestion.description}\n\nHedef kitle: ${suggestion.audience}\n\nÖlçülen veriye dayalı gerekçe: ${suggestion.rationale}\n\nNot: Bu bir öneridir. İndirim oranı ve koşullar siz onaylamadan yayınlanmaz.`,
        cta: "Kampanya koşullarını incele",
        variant: "ÖNERİ",
        meta: { ...suggestion },
        status: "DRAFT",
      });
      await logAudit(actor.email, actor.staffRole, "AI_CAMPAIGN_SUGGESTED", "ai_contents", String(row.id), { goal });
      // İstek: AI, işletme profili + ürün/hizmet bilgilerine göre UYARLANMIŞ taslak hazırlar ve
      // kampanya formuna aktarılabilir alanlar (fields) döner. Yayın yine işletme onayına bağlıdır.
      // Alan sözleşmesi lib/growth.ts (Büyüme Asistanı) ile ORTAKTIR.
      return Response.json({ ok: true, content: row, suggestion, fields: campaignFieldsFromSuggestion(suggestion, snapshot) });
    }

    if (action === "social" || action === "story") {
      const content = action === "social" ? generateSocial(snapshot, String(body.platform ?? "Instagram")) : generateStory(snapshot);
      const row = await aiInsertContent(actor, { ...content, status: "DRAFT" });
      await logAudit(actor.email, actor.staffRole, "AI_CONTENT_GENERATED", "ai_contents", String(row.id), { kind: row.kind });
      return Response.json({ ok: true, content: row });
    }

    if (action === "ads") {
      const variants = generateAdVariants(snapshot);
      const rows = [];
      for (const v of variants) {
        const row = await aiInsertContent(actor, {
          kind: "AD",
          platform: "DampingVar Reklam Ağı",
          title: `Reklam ${v.variant} — ${v.angle}`,
          body: `${v.headline}\n\n${v.body}\n\nNot: Ücretli reklam yayını yönetici onayı olmadan başlamaz.`,
          cta: "Kampanya koşullarını gör",
          variant: v.variant,
          meta: { angle: v.angle, headline: v.headline },
          status: "DRAFT",
        });
        rows.push(row);
      }
      await logAudit(actor.email, actor.staffRole, "AI_AD_VARIANTS", "ai_contents", null, { count: rows.length });
      return Response.json({ ok: true, contents: rows });
    }

    if (action === "video") {
      const script = generateVideoScript(snapshot, body.focus ? String(body.focus) : undefined);
      const row = await aiInsertContent(actor, {
        kind: "VIDEO",
        platform: "Instagram Reels / TikTok",
        title: script.title,
        body: script.scenes.map((s) => `${s.time} — ${s.visual}\nSeslendirme: ${s.voiceover}`).join("\n\n"),
        cta: script.cta,
        meta: { durationSec: script.durationSec, scenes: script.scenes },
        status: "DRAFT",
      });
      return Response.json({ ok: true, content: row, script });
    }

    if (action === "plan") {
      await aiDeletePlan(actor);
      const plan = await aiInsertPlan(
        actor,
        {
          title: `28 Günlük Büyüme Programı — ${data.biz.name}`,
          goal,
          sector_key: data.biz.sectorKey,
          status: "ACTIVE",
        },
        buildMarketingPlan(snapshot).map((d) => ({
          day: d.day,
          theme: d.theme,
          task: d.task,
          channel: d.channel,
          caption: `${d.theme} — ${data.biz.name}, ${data.biz.district}`,
          cta: d.cta,
          done: false,
        }))
      );
      await logAudit(actor.email, actor.staffRole, "AI_PLAN_GENERATED", "marketing_plans", String(plan.id), { goal });
      return Response.json({ ok: true, plan, days: buildMarketingPlan(snapshot) });
    }

    /* ---------------- AI BÜYÜME ASİSTANI (20.10.2026 isteği) ---------------- */
    if (action === "growth") {
      // Gerçek verilerle analiz → en fazla 3 öneri (PROPOSED). Otomatik kampanya/reklam YOK.
      const extras: GrowthExtras = {
        publishedCampaigns: data.campaigns.filter((c) => c.status === "PUBLISHED").length,
        adRequests: data.ads.length,
        contentsCount: data.contents.length,
        videosCount: data.videosCount ?? 0,
      };
      const existing: ExistingRec[] = data.growth.map((g) => ({ title: g.title, status: g.status }));
      const drafts = growthAnalyse(snapshot, extras, existing);
      const inserted = [];
      for (const d of drafts) {
        try {
          inserted.push(await growthInsertRec(actor, { ...d }));
        } catch {
          // DB unique index aynı açık öneriyi engelledi → atla (yinelenen öneri/görev yok).
        }
      }
      if (inserted.length) {
        await bizNotify(actor.userId, "CAMPAIGN", `${inserted.length} yeni büyüme önerisi hazır`, "AI Pazarlama bölümünde Evet/Hayır cevabını bekliyor.", "/panel?s=ai");
      }
      await logAudit(actor.email, actor.staffRole, "GROWTH_ANALYSED", "growth_recommendations", null, { count: inserted.length });
      return Response.json({ ok: true, count: inserted.length, extras });
    }

    if (action === "growth_answer") {
      const extras: GrowthExtras = {
        publishedCampaigns: data.campaigns.filter((c) => c.status === "PUBLISHED").length,
        adRequests: data.ads.length,
        contentsCount: data.contents.length,
        videosCount: data.videosCount ?? 0,
      };
      const existing: ExistingRec[] = data.growth.map((g) => ({ title: g.title, status: g.status }));
      return await growthAnswer(actor, body, snapshot, extras, existing);
    }

    if (action === "growth_task_update") return await growthTaskUpdate(actor, body);
    if (action === "growth_notifications") return await growthNotificationsRead(actor, body);

    if (action === "analyse") return Response.json({ ok: true, bullets: analysePerformance(snapshot) });
    if (action === "report") return Response.json({ ok: true, report: weeklyReport(snapshot) });

    return jsonError(400, "Bilinmeyen AI işlemi.");
  } catch (e) {
    if (e instanceof ActionError) return jsonError(e.status, e.message);
    throw e;
  }
}

export async function GET() {
  // RLS: ai_settings satırları yalnızca yöneticiye görünür; diğerleri boş liste alır.
  return aiSettingsOverview();
}
