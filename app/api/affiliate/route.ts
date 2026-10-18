import { jsonError } from "@/lib/auth-actions";
import { getSessionUser } from "@/lib/authz";
import { getAffiliateData } from "@/lib/queries";
import {
  ActionError,
  affiliateActiveCount,
  affiliateAdminAction,
  affiliateClick,
  affiliateConfirmOutbound,
} from "@/lib/data/supabase-actions";

export const dynamic = "force-dynamic";

/**
 * Affiliate akışı (FAZ 6 — Supabase).
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
  const user = await getSessionUser();

  try {
    if (action === "click") {
      const offerId = String(body.offerId ?? "");
      if (!offerId) return jsonError(400, "offerId gerekli.");
      return await affiliateClick(user, offerId, String(body.channel ?? "WEB"));
    }
    if (action === "confirm-outbound") return await affiliateConfirmOutbound(user, String(body.clickId ?? ""));
    // Aşağıdaki işlemler yalnızca yöneticidir.
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("scope") === "admin") {
    const user = await getSessionUser();
    if (!user || user.role !== "ADMIN") return jsonError(403, "Yönetici erişimi gerekli.");
    return Response.json({ ok: true, data: await getAffiliateData() });
  }
  return affiliateActiveCount();
}
