import { jsonError, staffCan } from "@/lib/auth-actions";
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

/**
 * QR / kampanya kullanım akışı (FAZ 6 — tek veri katmanı: Supabase).
 *
 *  QR okutma  ≠  doğrulanmış kampanya kullanımı
 *  QR_SCANNED → SUBMITTED → VERIFIED (işletme onayıyla)
 *
 * Yazma yetkinin nihai sınırı RLS + dv_* RPC'leridir; burada yalnızca sunucu
 * doğrulaması (oturum/rol) + RPC çağrısı yapılır. DampingVar ödeme almaz;
 * reportedBasket/reportedDiscount işletmenin BİLDİRDİĞİ bilgilerdir.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "scan");

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

/** Kampanya bilgisi (herkese açık RLS). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return jsonError(400, "code parametresi gerekli.");
  try {
    return await qrGet(code);
  } catch (e) {
    if (e instanceof ActionError) return jsonError(e.status, e.message);
    throw e;
  }
}
