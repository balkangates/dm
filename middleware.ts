// middleware.ts
// ─────────────────────────────────────────────────────────────────────────
// Eski sistemde rol kontrolü sadece client-side'da (App.tsx içinde
// `profile?.role === 'customer' ? ... : ...`) yapılıyordu — yani bir
// kullanıcı URL'yi bilse /dealer içeriğini (kısa süreliğine, veri
// gelene kadar) görebilirdi. Next.js middleware ile bu artık SUNUCU
// TARAFINDA, sayfa render edilmeden önce kontrol ediliyor.
// ─────────────────────────────────────────────────────────────────────────
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { roleHome } from '@/lib/roles';

// Faz 9: profiles.role artık TEK başına yeterli değil — bir kullanıcı
// role='dealer' olsa da ayrıca is_supplier=true ile tedarikçi paneline de
// erişebilir (çift rol desteği, bkz. fix_phase9_public_application_dedup.sql).
// Bu yüzden erişim artık statik bir role->prefix eşlemesi değil, fonksiyon.
function canAccess(prefix: string, profile: { role: string; is_dealer?: boolean; is_supplier?: boolean } | null) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  switch (prefix) {
    case '/dealer':
      return profile.role === 'dealer' || !!profile.is_dealer;
    case '/supplier':
      return profile.role === 'supplier' || !!profile.is_supplier;
    case '/admin':
      return profile.role === 'admin';
    case '/logistics':
      return profile.role === 'logistics';
    default:
      return false;
  }
}

const ROUTE_PREFIXES = ['/dealer', '/supplier', '/admin', '/logistics'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const matchedPrefix = ROUTE_PREFIXES.find((p) => path.startsWith(p));

  if (matchedPrefix) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirectTo', path);
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_dealer, is_supplier')
      .eq('id', user.id)
      .single();

    if (!canAccess(matchedPrefix, profile)) {
      const url = request.nextUrl.clone();
      url.pathname = roleHome(profile?.role);
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Zaten giriş yapmış bir kullanıcı /login veya /register'a giderse
  // (ör. sekmede eski bir link, geri tuşu vb.) formu tekrar göstermek yerine
  // doğrudan kendi paneline yönlendir. login/page.tsx zaten başarılı
  // girişten sonra aynı yere gönderiyor — bu, "zaten oturum açık" durumunu
  // sunucu tarafında kapatıyor.
  if ((path === '/login' || path === '/register') && user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const url = request.nextUrl.clone();
    url.pathname = roleHome(profile?.role);
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/dealer/:path*',
    '/supplier/:path*',
    '/admin/:path*',
    '/logistics/:path*',
    '/login',
    '/register',
  ],
};
