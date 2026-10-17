import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

/**
 * Supabase e-posta doğrulama / PKCE dönüş ucu.
 *  - ?code=...            → exchangeCodeForSession
 *  - ?token_hash=&type=   → verifyOtp
 * `next` yalnızca site içi yol olabilir (open redirect koruması).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next")) ?? "/";
  const fail = NextResponse.redirect(`${origin}/giris?hata=dogrulama`);
  if (!isSupabaseConfigured()) return fail;

  try {
    const supabase = await createClient();
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;
    let error: unknown = new Error("eksik parametre");
    if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
    else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
    if (error) return fail;
    return NextResponse.redirect(`${origin}${next}`);
  } catch {
    return fail;
  }
}
