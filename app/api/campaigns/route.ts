import { jsonError, staffCan } from "@/lib/auth-actions";
import { businessActorLite } from "@/lib/authz";
import { ActionError, campaignBump, campaignUpsert, campaignsList } from "@/lib/data/supabase-actions";

export const dynamic = "force-dynamic";

/**
 * Kampanya uçları (FAZ 6 — Supabase).
 * RLS: herkes yalnızca görünür (onaylı + yayınlanan) kampanyaları; işletme
 * personeli kendi taslaklarını da görür. Sayaç artışları definer RPC ile.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId");
  try {
    return await campaignsList(businessId);
  } catch (e) {
    if (e instanceof ActionError) return jsonError(e.status, e.message);
    throw e;
  }
}

export async function POST(req: Request) {
  const actor = await businessActorLite();
  if (!actor) return jsonError(401, "İşletme hesabıyla giriş yapmalısınız.");
  if (!staffCan(actor.staffRole, "campaign.write"))
    return jsonError(403, `${actor.staffRole} rolü kampanya oluşturamaz veya düzenleyemez.`);
  const body = await req.json().catch(() => ({}));
  try {
    return await campaignUpsert(actor, body as Record<string, unknown>);
  } catch (e) {
    if (e instanceof ActionError) return jsonError(e.status, e.message);
    throw e;
  }
}

/** İşletmenin kendi kampanya sayacı (görüntülenme/tıklama). */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const field = body.field === "clicks" ? "clicks" : "views";
  try {
    return await campaignBump(id, field);
  } catch (e) {
    if (e instanceof ActionError) return jsonError(e.status, e.message);
    throw e;
  }
}
