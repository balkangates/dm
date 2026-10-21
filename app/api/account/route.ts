import { jsonError } from "@/lib/auth-actions";
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

/** FAZ 12C-3 — profil alanlarını oku (cep/adres formu önceden doldurmak için).
 *  RLS: yalnızca kendi satırı okunur. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Giriş yapmalısınız.");
  const { createClient } = await import("@/lib/supabase/server");
  const client = await createClient();
  const { data } = await client.from("profiles").select("phone, district, address").eq("id", user.id).maybeSingle();
  return Response.json({
    ok: true,
    phone: (data?.phone as string | null) ?? null,
    district: (data?.district as string | null) ?? null,
    address: (data?.address as string | null) ?? null,
  });
}

/** Hesap işlemleri (FAZ 6 — Supabase: RLS ile yalnızca kendi satırları). */
export async function POST(req: Request) {
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
