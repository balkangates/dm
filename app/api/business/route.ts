import { jsonError, staffCan } from "@/lib/auth-actions";
import { businessActorLite } from "@/lib/authz";
import { ActionError, businessAction, openBusinessAction } from "@/lib/data/supabase-actions";

export const dynamic = "force-dynamic";

/**
 * İşletme paneli işlemleri (FAZ 6 — Supabase).
 * Yetki SUNUCUDA doğrulanır (staffCan); nihai sınır RLS'tir (işletme personeli
 * yalnızca kendi işletmesinin satırlarını değiştirebilir).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "profile");

  // FAZ 10 — "İşletme Aç": işletme bağlantısı OLMAYAN girişli kullanıcılar içindir
  // ve businessActorLite'ın ÖNCESİNDE değerlendirilir (çağıranın henüz işletmesi yoktur).
  if (action === "open") {
    try {
      return await openBusinessAction(body as Record<string, unknown>);
    } catch (e) {
      if (e instanceof ActionError) return jsonError(e.status, e.message);
      throw e;
    }
  }

  const actor = await businessActorLite();
  if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");

  if (action === "profile" && !staffCan(actor.staffRole, "profile.write"))
    return jsonError(403, `${actor.staffRole} rolü işletme profilini düzenleyemez.`);
  if (action === "hours" && !staffCan(actor.staffRole, "profile.write")) return jsonError(403, "Yetkiniz yok.");
  if ((action === "content_decision" || action === "content_delete") && !staffCan(actor.staffRole, "content.approve"))
    return jsonError(403, "İçerik onayı için yetkiniz yok.");
  if (action === "ad_request" && !staffCan(actor.staffRole, "ads.write"))
    return jsonError(403, "Reklam talebi için yetkiniz yok.");
  if (action === "order_status" && !staffCan(actor.staffRole, "orders.manage"))
    return jsonError(403, "Sipariş durumu için yetkiniz yok.");

  try {
    return await businessAction(actor, body as Record<string, unknown>);
  } catch (e) {
    if (e instanceof ActionError) return jsonError(e.status, e.message);
    throw e;
  }
}
