import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { adCampaigns, aiContents, businessHours, businesses, marketingPlanDays } from "@/db/schema";
import { businessActor, jsonError, staffCan } from "@/lib/auth-actions";
import { logAudit } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { businessActorLite } from "@/lib/authz";
import { ActionError, businessAction } from "@/lib/data/supabase-actions";

export const dynamic = "force-dynamic";

const EDITABLE = [
  "name",
  "description",
  "story",
  "phone",
  "whatsapp",
  "instagram",
  "website",
  "address",
  "subCategory",
  "logoText",
  "coverImage",
] as const;

export async function POST(req: Request) {
  /* --------------------- SUPABASE MODU (FAZ 5) ------------------------ */
  if (isSupabaseConfigured()) {
    const actor = await businessActorLite();
    if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "profile");
    // Yetki kontrolleri SUNUCUDA (eski rotayla aynı kural).
    if (action === "profile" && !staffCan(actor.staffRole, "profile.write"))
      return jsonError(403, `${actor.staffRole} rolü işletme profilini düzenleyemez.`);
    if (action === "hours" && !staffCan(actor.staffRole, "profile.write")) return jsonError(403, "Yetkiniz yok.");
    if ((action === "content_decision" || action === "content_delete") && !staffCan(actor.staffRole, "content.approve"))
      return jsonError(403, "İçerik onayı için yetkiniz yok.");
    if (action === "ad_request" && !staffCan(actor.staffRole, "ads.write"))
      return jsonError(403, "Reklam talebi için yetkiniz yok.");
    try {
      return await businessAction(actor, body as Record<string, unknown>);
    } catch (e) {
      if (e instanceof ActionError) return jsonError(e.status, e.message);
      throw e;
    }
  }

  const actor = await businessActor();
  if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "profile");

  if (action === "profile") {
    if (!staffCan(actor.staffRole, "profile.write"))
      return jsonError(403, `${actor.staffRole} rolü işletme profilini düzenleyemez.`);
    const patch: Record<string, string> = {};
    for (const key of EDITABLE) {
      if (typeof body[key] === "string") patch[key] = String(body[key]).slice(0, 1500);
    }
    if (!Object.keys(patch).length) return jsonError(400, "Güncellenecek alan yok.");
    const [row] = await db.update(businesses).set(patch).where(eq(businesses.id, actor.businessId)).returning();
    await logAudit(actor.user.email, actor.staffRole, "BUSINESS_PROFILE_UPDATED", "businesses", actor.businessId, {
      fields: Object.keys(patch),
    });
    return Response.json({ ok: true, business: row });
  }

  if (action === "hours") {
    if (!staffCan(actor.staffRole, "profile.write")) return jsonError(403, "Yetkiniz yok.");
    const rows = Array.isArray(body.hours) ? body.hours : [];
    for (const h of rows.slice(0, 7)) {
      const id = String(h.id ?? "");
      if (!id) continue;
      // Yalnızca bu işletmeye ait saat kaydı güncellenebilir (çapraz işletme yazımı engellenir).
      const [existing] = await db
        .select()
        .from(businessHours)
        .where(and(eq(businessHours.id, id), eq(businessHours.businessId, actor.businessId)))
        .limit(1);
      if (!existing) continue;
      await db
        .update(businessHours)
        .set({
          opensAt: /^\d{2}:\d{2}$/.test(String(h.opensAt ?? "")) ? String(h.opensAt) : "09:00",
          closesAt: /^\d{2}:\d{2}$/.test(String(h.closesAt ?? "")) ? String(h.closesAt) : "22:00",
          closed: h.closed === true,
        })
        .where(eq(businessHours.id, id));
    }
    await logAudit(actor.user.email, actor.staffRole, "BUSINESS_HOURS_UPDATED", "businesses", actor.businessId, {});
    return Response.json({ ok: true });
  }

  if (action === "content_decision") {
    if (!staffCan(actor.staffRole, "content.approve")) return jsonError(403, "İçerik onayı için yetkiniz yok.");
    const decision = String(body.decision ?? "");
    const status = decision === "publish" ? "PUBLISHED" : decision === "reject" ? "REJECTED" : "APPROVED";
    const [row] = await db
      .update(aiContents)
      .set({ status, approvedAt: status === "REJECTED" ? null : new Date() })
      .where(eq(aiContents.id, String(body.id ?? "")))
      .returning();
    if (!row) return jsonError(404, "İçerik bulunamadı.");
    if (row.businessId !== actor.businessId) return jsonError(403, "Bu içerik size ait değil.");
    await logAudit(actor.user.email, actor.staffRole, `AI_CONTENT_${status}`, "ai_contents", row.id, {});
    return Response.json({ ok: true, content: row });
  }

  if (action === "content_delete") {
    if (!staffCan(actor.staffRole, "content.approve")) return jsonError(403, "Yetkiniz yok.");
    const id = String(body.id ?? "");
    const [row] = await db.select().from(aiContents).where(eq(aiContents.id, id)).limit(1);
    if (!row || row.businessId !== actor.businessId) return jsonError(404, "İçerik bulunamadı.");
    await db.delete(aiContents).where(eq(aiContents.id, id));
    await logAudit(actor.user.email, actor.staffRole, "AI_CONTENT_DELETED", "ai_contents", id, {});
    return Response.json({ ok: true });
  }

  if (action === "plan_day_toggle") {
    const [row] = await db
      .update(marketingPlanDays)
      .set({ done: body.done === true })
      .where(eq(marketingPlanDays.id, String(body.id ?? "")))
      .returning();
    if (!row) return jsonError(404, "Görev bulunamadı.");
    await logAudit(actor.user.email, actor.staffRole, "PLAN_DAY_TOGGLED", "marketing_plan_days", row.id, {
      done: row.done,
    });
    return Response.json({ ok: true, day: row });
  }

  if (action === "video_request") {
    // Video düzenleme/üretim servisi bağlı değil: yalnızca HİZMET TALEBİ kaydı oluşturulur.
    const [row] = await db
      .insert(aiContents)
      .values({
        businessId: actor.businessId,
        kind: "VIDEO_EDIT_REQUEST",
        platform: "DampingVar Video Hizmeti",
        title: `Video düzenleme talebi — ${String(body.fileName ?? "belirtilmedi").slice(0, 120)}`,
        body: `${String(body.note ?? "").slice(0, 600)}\n\nDurum: üretim servisi bağlı değil. Talep, hizmet bedeli kurallarına göre fiyatlandırılıp faturalandırılır.`,
        cta: "Talebi değerlendir",
        status: "DRAFT",
        meta: { fileName: String(body.fileName ?? ""), renderStatus: "NOT_RENDERED", integration: "NOT_CONNECTED" },
      })
      .returning();
    await logAudit(actor.user.email, actor.staffRole, "VIDEO_SERVICE_REQUESTED", "ai_contents", row.id, {});
    return Response.json({ ok: true, content: row });
  }

  if (action === "ad_request") {
    if (!staffCan(actor.staffRole, "ads.write")) return jsonError(403, "Reklam talebi için yetkiniz yok.");
    const [row] = await db
      .insert(adCampaigns)
      .values({
        businessId: actor.businessId,
        name: String(body.name ?? "Yeni reklam kampanyası").slice(0, 140),
        placement: String(body.placement ?? "KATEGORI"),
        city: String(body.city ?? "İstanbul"),
        district: String(body.district ?? "").slice(0, 80) || null,
        category: String(body.category ?? "").slice(0, 80) || null,
        budgetCents: Math.max(0, Math.min(100_000_000, Math.round(Number(body.budgetCents ?? 0)))),
        // Reklam, yönetici onayı olmadan yayına girmez.
        status: "PENDING_APPROVAL",
        startsAt: body.startsAt ? new Date(String(body.startsAt)) : new Date(),
        endsAt: body.endsAt ? new Date(String(body.endsAt)) : null,
      })
      .returning();
    await logAudit(actor.user.email, actor.staffRole, "AD_REQUESTED", "ad_campaigns", row.id, {
      placement: row.placement,
      budgetCents: row.budgetCents,
    });
    return Response.json({ ok: true, ad: row });
  }

  return jsonError(400, "Bilinmeyen işlem.");
}
