import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPublicSupabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Supabase foundation tanılama ucu — yalnızca boolean döner, hiçbir değer/anahtar/kullanıcı verisi sızdırmaz.
 *  env      : public env tanımlı mı
 *  session  : istek çerezindeki oturum Supabase Auth'ta doğrulandı mı (server client)
 *  admin    : service role client sunucu tarafında Supabase'e erişebiliyor mu
 */
export async function GET() {
  const result = { env: hasPublicSupabaseEnv(), session: false, admin: false };
  if (!result.env) return Response.json({ ok: false, ...result }, { status: 503 });

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    result.session = Boolean(data.user);
  } catch {
    /* oturum yok / Auth erişilemez */
  }
  try {
    const { error } = await createAdminClient().from("packages").select("code", { head: true, count: "exact" });
    result.admin = !error;
  } catch {
    /* service role yok / erişilemez */
  }
  return Response.json({ ok: result.admin, ...result }, { status: result.admin ? 200 : 503 });
}
