// Oturum yenileme yardımcısı (src/proxy.ts tarafından kullanılır).
// Faz 1: yalnızca oturum çerezini tazeler. Rol/route yetkilendirmesi Faz 3'te eklenecek.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseEnv, hasPublicSupabaseEnv } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Supabase tanımlı değilse (yerel geliştirme / henüz bağlanmamış ortam) sessizce geç.
  if (!hasPublicSupabaseEnv()) return response;

  // Oturum çerezi yoksa ağ çağrısı yapma — public sayfalar etkilenmesin.
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!hasAuthCookie) return response;

  const { url, anonKey } = getPublicSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() token'ı Supabase Auth sunucusunda doğrular (getSession() gibi çerezi körlemesine
  // güvenmez) ve gerekirse yenilenmiş çerezi setAll ile yazar.
  try {
    await supabase.auth.getUser();
  } catch {
    // Supabase geçici olarak erişilemezse siteyi düşürme; sayfa oturumsuz devam eder.
  }
  return response;
}
