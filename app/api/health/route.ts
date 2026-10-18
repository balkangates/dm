import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Sağlık kontrolü (FAZ 6): Supabase bağlantısı + RLS'li en hafif okuma. */
export async function GET() {
  if (!getSupabaseEnv()) return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  try {
    const sb = await createClient();
    const { error } = await sb.from("packages").select("id", { count: "exact", head: true });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
