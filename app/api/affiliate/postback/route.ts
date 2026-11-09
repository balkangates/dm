import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Affiliate ağ POSTBACK uç noktası (ağ sunucusu → DampingVar).
 *
 *   GET|POST /api/affiliate/postback
 *     ?token=<ağ token'ı>        (Admin → Affiliate Ağ Durumu'ndan üretilir)
 *     &click_id=<dv-…>           (çıkışta bağlantıya eklenen kimlik)
 *     &ref=<ağ işlem referansı>  (zorunlu; tekrar gelen rapor çoğaltılmaz)
 *     &status=<pending|approved|rejected|reversed>
 *     &commission=<tutar>        (ondalıklı, para biriminde; örn. 12.50)
 *     &currency=<TRY|USD|GEL|EUR>
 *
 * Güvenlik/dürüstlük:
 *  - Token doğrulaması ve yazma dv_affiliate_postback RPC'sindedir (service_role yok).
 *  - Ağ "approved" dese bile kayıt REPORTED başlar; gelir olarak yalnızca admin
 *    onayından (APPROVED) sonra sayılır. Tıklama/rapor satın alma kanıtı değildir.
 */
async function handle(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  let body: Record<string, unknown> = {};
  if (req.method === "POST") body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const get = (k: string) => String(body[k] ?? p.get(k) ?? "").trim();

  const token = get("token");
  if (!token) return Response.json({ ok: false, error: "token gerekli" }, { status: 401 });

  const raw = get("commission").replace(",", ".");
  const commission = raw === "" ? null : Number(raw);
  if (commission !== null && (!Number.isFinite(commission) || commission < 0 || commission > 1_000_000)) {
    return Response.json({ ok: false, error: "commission geçersiz" }, { status: 400 });
  }

  const client = await createClient();
  const { data, error } = await client.rpc("dv_affiliate_postback", {
    p_token: token,
    p_click_id: get("click_id") || null,
    p_status: get("status") || "pending",
    p_commission_cents: commission === null ? null : Math.round(commission * 100),
    p_currency: get("currency") || "TRY",
    p_reference: get("ref"),
  });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json(data ?? { ok: true });
}

export const GET = handle;
export const POST = handle;
