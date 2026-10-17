import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";
import { isAuthPage, normalizeRole, protectedRule, routeDecision, type Role } from "@/lib/roles";

/**
 * Next.js 15 middleware.
 *
 * Görevi YALNIZCA: (1) Supabase oturumunu yenilemek, (2) ilk rota kontrolü.
 *  - Yetki kararının TEK kaynağı lib/roles.ts `routeDecision`'dır; sayfalar sunucuda aynı
 *    fonksiyonla ayrıca doğrular (lib/auth/guard.ts). Nihai güvenlik sınırı RLS'tir.
 *  - /giris, /kayit, /auth/callback, statik dosyalar ve herkese açık sayfalar korunmaz.
 *    Profili olmayan kullanıcı /giris'te KALIR (yönlendirme döngüsü yok).
 *  - /api/* yönlendirilmez; JSON 401/403'ü route handler kendisi döndürür.
 *  - Supabase ortam değişkenleri yoksa hiçbir şey yapmaz (eski özel oturumlu yol çalışır).
 *  - Auth/ağ hatasında korumalı rota kapalı kalır (oturumsuz sayılır); herkese açık sayfalar etkilenmez.
 */
export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const { pathname, search } = request.nextUrl;

  try {
    const { url, anonKey } = getSupabaseEnv();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          // Önbelleğe alınmış yanıtların oturum çerezini başka kullanıcıya sızdırmasını engeller.
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    });

    // Token yenileme + oturumun Auth sunucusunda doğrulanması.
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    // Rol yalnızca karar için gerekliyse okunur (ek istek maliyeti sınırlı kalsın).
    const needsRole = !!user && (isAuthPage(pathname) || protectedRule(pathname) !== null);
    let role: Role | null = null;
    if (needsRole && user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      role = normalizeRole(profile?.role);
    }

    // API uçları yönlendirilmez.
    if (pathname.startsWith("/api/")) return response;

    const decision = routeDecision(pathname, search, { user: !!user, role });
    if (decision.type === "redirect") {
      const redirectResponse = NextResponse.redirect(new URL(decision.to, request.url));
      // Yenilenen oturum çerezlerini ve önbellek başlıklarını yönlendirmeye taşı.
      for (const c of response.cookies.getAll()) redirectResponse.cookies.set(c);
      for (const h of ["cache-control", "expires", "pragma"]) {
        const v = response.headers.get(h);
        if (v) redirectResponse.headers.set(h, v);
      }
      return redirectResponse;
    }
  } catch {
    // Ortam hatalı veya Auth erişilemez: korumalı rota kapalı kalsın, diğerleri devam etsin.
    const decision = routeDecision(pathname, search, { user: false, role: null });
    if (!pathname.startsWith("/api/") && decision.type === "redirect") {
      return NextResponse.redirect(new URL(decision.to, request.url));
    }
    return NextResponse.next({ request });
  }

  return response;
}

export const config = {
  matcher: [
    // Statik dosyalar, görseller ve sağlık ucu hariç tüm istekler.
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
