import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  followedBusinesses,
  notifications,
  savedCampaigns,
  users,
} from "@/db/schema";
import { currentUser, jsonError } from "@/lib/auth-actions";
import { logAudit, trackEvent } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionUser } from "@/lib/authz";
import {
  ActionError,
  accountPreferences,
  accountReadAll,
  accountReadNotification,
  accountReportCampaign,
  accountToggleFollow,
  accountToggleSave,
} from "@/lib/data/supabase-actions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  /* --------------------- SUPABASE MODU (FAZ 5) ------------------------ */
  if (isSupabaseConfigured()) {
    const user = await getSessionUser();
    if (!user) return jsonError(401, "Giriş yapmalısınız.");
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    try {
      if (action === "save" || action === "unsave") {
        const campaignId = String(body.campaignId ?? "");
        if (!campaignId) return jsonError(400, "campaignId gerekli.");
        return await accountToggleSave(user, campaignId, action === "save");
      }
      if (action === "follow" || action === "unfollow") {
        const businessId = String(body.businessId ?? "");
        if (!businessId) return jsonError(400, "businessId gerekli.");
        return await accountToggleFollow(user, businessId, action === "follow");
      }
      if (action === "read-notification") return await accountReadNotification(user, String(body.id ?? ""));
      if (action === "read-all-notifications") return await accountReadAll(user);
      if (action === "preferences") return await accountPreferences(user, body as Record<string, unknown>);
      if (action === "report-campaign")
        return await accountReportCampaign(user, String(body.campaignId ?? ""), String(body.reason ?? "").slice(0, 300));
      return jsonError(400, "Bilinmeyen işlem.");
    } catch (e) {
      if (e instanceof ActionError) return jsonError(e.status, e.message);
      throw e;
    }
  }

  const user = await currentUser();
  if (!user) return jsonError(401, "Giriş yapmalısınız.");
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "save" || action === "unsave") {
    const campaignId = String(body.campaignId ?? "");
    if (!campaignId) return jsonError(400, "campaignId gerekli.");
    if (action === "save") {
      const exists = await db
        .select()
        .from(savedCampaigns)
        .where(and(eq(savedCampaigns.userId, user.id), eq(savedCampaigns.campaignId, campaignId)))
        .limit(1);
      if (!exists[0]) await db.insert(savedCampaigns).values({ userId: user.id, campaignId });
      await trackEvent("campaign_saved", { campaignId, userId: user.id });
      return Response.json({ ok: true, saved: true });
    }
    await db
      .delete(savedCampaigns)
      .where(and(eq(savedCampaigns.userId, user.id), eq(savedCampaigns.campaignId, campaignId)));
    return Response.json({ ok: true, saved: false });
  }

  if (action === "follow" || action === "unfollow") {
    const businessId = String(body.businessId ?? "");
    if (!businessId) return jsonError(400, "businessId gerekli.");
    if (action === "follow") {
      const exists = await db
        .select()
        .from(followedBusinesses)
        .where(and(eq(followedBusinesses.userId, user.id), eq(followedBusinesses.businessId, businessId)))
        .limit(1);
      if (!exists[0]) await db.insert(followedBusinesses).values({ userId: user.id, businessId });
      await trackEvent("business_followed", { businessId, userId: user.id });
      return Response.json({ ok: true, following: true });
    }
    await db
      .delete(followedBusinesses)
      .where(and(eq(followedBusinesses.userId, user.id), eq(followedBusinesses.businessId, businessId)));
    return Response.json({ ok: true, following: false });
  }

  if (action === "read-notification") {
    const id = String(body.id ?? "");
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
    return Response.json({ ok: true });
  }

  if (action === "read-all-notifications") {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, user.id));
    return Response.json({ ok: true });
  }

  if (action === "preferences") {
    const patch: Record<string, string> = {};
    if (typeof body.name === "string" && body.name.trim().length >= 3) patch.name = body.name.trim().slice(0, 120);
    if (typeof body.phone === "string") patch.phone = body.phone.slice(0, 40);
    if (typeof body.district === "string") patch.district = body.district.slice(0, 80);
    if (["tr", "en", "ka"].includes(String(body.lang))) patch.lang = String(body.lang);
    if (["TRY", "USD", "GEL", "EUR"].includes(String(body.currency))) patch.currency = String(body.currency);
    if (typeof body.country === "string" && body.country.length === 2) patch.country = body.country.toUpperCase();
    if (!Object.keys(patch).length) return jsonError(400, "Güncellenecek alan yok.");
    const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
    await logAudit(user.email, user.role, "PROFILE_UPDATED", "users", user.id, { fields: Object.keys(patch) });
    return Response.json({ ok: true, user: updated });
  }

  if (action === "report-campaign") {
    const campaignId = String(body.campaignId ?? "");
    const reason = String(body.reason ?? "").slice(0, 300);
    await db.insert(notifications).values({
      userId: user.id,
      kind: "SYSTEM",
      title: "Bildirim alındı",
      body: "Kampanya bildirimin moderasyon ekibine iletildi. Sonuç e-posta ile paylaşılır.",
      link: "/kampanyalar",
    });
    await logAudit(user.email, user.role, "CAMPAIGN_REPORTED", "campaigns", campaignId, { reason });
    return Response.json({ ok: true });
  }

  return jsonError(400, "Bilinmeyen işlem.");
}
