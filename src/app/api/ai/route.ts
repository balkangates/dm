import {
  analysePerformance,
  buildMarketingPlan,
  generateAdVariants,
  generateSocial,
  generateStory,
  generateVideoScript,
  suggestCampaign,
  weeklyReport,
} from "@/lib/ai";
import { buildSnapshot } from "@/lib/snapshot";
import { getBusinessBySlug, getBusinessStats } from "@/lib/queries";
import { resolveActor, can, deny } from "@/lib/auth";
import { logAudit } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const slug: string = body.slug;
  const action: string = body.action ?? "social";
  const actorEmail: string = body.actorEmail ?? "";

  const biz = await getBusinessBySlug(slug);
  if (!biz) return Response.json({ ok: false, error: "İşletme bulunamadı." }, { status: 404 });

  const actor = await resolveActor(biz.id, actorEmail);
  if (!actor) return Response.json({ ok: false, error: "Yetkili personel bulunamadı." }, { status: 401 });
  if (action !== "durum" && !can(actor.role, "ai.generate")) return deny(actor.role, "ai.generate");

  const snapshot = await buildSnapshot(biz);
  const goal = String(body.goal ?? "Bu hafta müşteri sayısını artırmak istiyorum.");
  const supabase = await createClient();

  if (action === "kampanya") {
    const suggestion = suggestCampaign(snapshot, goal);
    const { data: row, error } = await supabase
      .from("ai_contents")
      .insert({
        business_id: biz.id,
        kind: "CAMPAIGN",
        platform: "DampingVar",
        title: suggestion.title,
        body: `${suggestion.description}\n\nHedef kitle: ${suggestion.audience}\n\nÖlçüm gerekçesi: ${suggestion.rationale}`,
        cta: "Kampanyayı incele",
        variant: "ÖNERİ",
        meta: { ...suggestion },
        status: "DRAFT",
      })
      .select()
      .single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    await logAudit(actor.email, actor.role, "AI_CAMPAIGN_GENERATED", "ai_contents", row.id, { goal });
    return Response.json({ ok: true, suggestion, content: row });
  }

  if (action === "sosyal") {
    const platform = String(body.platform ?? "Instagram");
    const content = generateSocial(snapshot, platform);
    const { data: row, error } = await supabase
      .from("ai_contents")
      .insert({ ...content, business_id: biz.id, status: "DRAFT" })
      .select()
      .single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, content: row });
  }

  if (action === "story") {
    const content = generateStory(snapshot);
    const { data: row, error } = await supabase
      .from("ai_contents")
      .insert({ ...content, business_id: biz.id, status: "DRAFT" })
      .select()
      .single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, content: row });
  }

  if (action === "reklam") {
    const variants = generateAdVariants(snapshot);
    const rows = [];
    for (const v of variants) {
      const { data: row, error } = await supabase
        .from("ai_contents")
        .insert({
          business_id: biz.id,
          kind: "AD",
          platform: "DampingVar Reklam Ağı",
          title: `${v.variant} — ${v.angle}`,
          body: `${v.headline}\n\n${v.body}`,
          cta: "Kampanyayı incele",
          variant: v.variant,
          meta: { angle: v.angle, headline: v.headline },
          status: "DRAFT",
        })
        .select()
        .single();
      if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
      rows.push(row);
    }
    return Response.json({ ok: true, variants: rows });
  }

  if (action === "video") {
    const script = generateVideoScript(snapshot, body.focus ? String(body.focus) : undefined);
    const { data: row, error } = await supabase
      .from("ai_contents")
      .insert({
        business_id: biz.id,
        kind: "VIDEO",
        platform: "Instagram Reels / TikTok",
        title: script.title,
        body: script.scenes.map((s) => `${s.time} — ${s.visual}\nSeslendirme: ${s.voiceover}`).join("\n\n"),
        cta: script.cta,
        meta: { durationSec: script.durationSec, scenes: script.scenes },
        status: "DRAFT",
      })
      .select()
      .single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, script, content: row });
  }

  if (action === "plan") {
    const { data: existing } = await supabase
      .from("marketing_plans")
      .select("*")
      .eq("business_id", biz.id);
    if (existing && existing[0]) {
      await supabase.from("marketing_plan_days").delete().eq("plan_id", existing[0].id);
      await supabase.from("marketing_plans").delete().eq("id", existing[0].id);
    }
    const { data: plan, error: planError } = await supabase
      .from("marketing_plans")
      .insert({
        business_id: biz.id,
        title: `28 Günlük DampingVar Pazarlama Planı — ${biz.district}`,
        goal,
        sector_key: biz.sector_key,
        status: "ACTIVE",
      })
      .select()
      .single();
    if (planError) return Response.json({ ok: false, error: planError.message }, { status: 500 });

    const days = buildMarketingPlan(snapshot);
    for (const d of days) {
      const { error: dayError } = await supabase.from("marketing_plan_days").insert({
        plan_id: plan.id,
        day: d.day,
        theme: d.theme,
        task: d.task,
        channel: d.channel,
        caption: `${d.theme} — ${biz.name}, ${biz.district}`,
        cta: d.cta,
        done: false,
      });
      if (dayError) return Response.json({ ok: false, error: dayError.message }, { status: 500 });
    }
    await logAudit(actor.email, actor.role, "AI_PLAN_GENERATED", "marketing_plans", plan.id, { goal });
    return Response.json({ ok: true, plan, days });
  }

  if (action === "analiz") {
    return Response.json({ ok: true, bullets: analysePerformance(snapshot) });
  }

  if (action === "rapor") {
    return Response.json({ ok: true, report: weeklyReport(snapshot) });
  }

  if (action === "onayla" || action === "yayinla" || action === "reddet") {
    const id = String(body.contentId);
    const status = action === "onayla" ? "APPROVED" : action === "yayinla" ? "PUBLISHED" : "REJECTED";
    if (!can(actor.role, "content.approve")) return deny(actor.role, "content.approve");
    const { data: row, error } = await supabase
      .from("ai_contents")
      .update({ status, approved_at: action === "reddet" ? null : new Date() })
      .eq("id", id)
      .select()
      .single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    await logAudit(actor.email, actor.role, `AI_CONTENT_${status}`, "ai_contents", id, {});
    return Response.json({ ok: true, content: row });
  }

  if (action === "sil") {
    const { error } = await supabase.from("ai_contents").delete().eq("id", String(body.contentId));
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    await logAudit(actor.email, actor.role, "AI_CONTENT_DELETED", "ai_contents", String(body.contentId), {});
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: "Bilinmeyen AI işlemi." }, { status: 400 });
}

export async function GET() {
  return Response.json({
    ok: true,
    provider: "local-template-engine",
    model: "dampingvar-marketing-v1",
    note: "API anahtarları yalnızca sunucu tarafında okunur.",
  });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const biz = await getBusinessBySlug(String(body.slug ?? ""));
  if (!biz) return Response.json({ ok: false, error: "İşletme bulunamadı." }, { status: 404 });
  const stats = await getBusinessStats(biz.id);
  return Response.json({ ok: true, stats });
}
