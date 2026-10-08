import { createClient } from "@/lib/supabase/server";
import { resolveActor, can, deny } from "@/lib/auth";
import { logAudit } from "@/lib/finance";

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
  "sub_category",
  "logo_text",
] as const;

export async function POST(req: Request) {
  const body = await req.json();
  const businessId: string = body.businessId;
  const actor = await resolveActor(businessId, body.actorEmail ?? "");
  if (!actor) return Response.json({ ok: false, error: "Yetkili personel bulunamadı." }, { status: 401 });
  if (!can(actor.role, "settings.write")) return deny(actor.role, "settings.write");

  const patch: Record<string, string> = {};
  for (const key of EDITABLE) {
    if (typeof body[key] === "string") patch[key] = body[key].slice(0, 1200);
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("businesses")
    .update(patch)
    .eq("id", businessId)
    .select()
    .single();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  await logAudit(actor.email, actor.role, "BUSINESS_UPDATED", "businesses", businessId, { fields: Object.keys(patch) });
  return Response.json({ ok: true, business: row });
}
