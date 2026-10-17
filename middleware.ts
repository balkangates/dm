import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Next.js 15 middleware (Next 16'da adı proxy.ts olur; bu proje Next 15 hedefler).
 *
 * FAZ 2 kapsamı: YALNIZCA Supabase oturumunu yenilemek.
 *  - Yönlendirme / rota koruması YOKTUR (FAZ 4).
 *  - Yetki kararı burada verilmez; Server Component / Action / Route Handler
 *    oturumu ayrıca doğrular ve nihai sınır RLS'tir.
 *  - Supabase ortam değişkenleri tanımlı değilse hiçbir şey yapmaz; mevcut
 *    (özel oturumlu) uygulama olduğu gibi çalışmaya devam eder.
 */
export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

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

    // Token yenileme için gerekli; çağrı ile oturum Auth sunucusunda doğrulanır.
    await supabase.auth.getUser();
  } catch {
    // Ortam hatalı veya Auth erişilemez: isteği engelleme, oturumsuz devam et.
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
