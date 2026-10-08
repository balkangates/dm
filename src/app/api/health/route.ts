import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("health_check");
    return Response.json({ ok: !error });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
