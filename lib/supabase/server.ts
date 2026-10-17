import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Sunucu (Server Component, Server Action, Route Handler) için Supabase istemcisi.
 * İstek başına YENİ bir istemci oluşturun; modül düzeyinde saklamayın.
 *
 * Kullanıcıya özel yetki kararlarında oturumu `supabase.auth.getUser()` ile
 * doğrulayın (çerezdeki oturuma doğrudan güvenmeyin). Son güvenlik sınırı RLS'tir.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component içinden çerez yazılamaz. Oturum yenilemeyi middleware.ts yapar;
          // bu bağlamda hatayı yok saymak güvenlidir.
        }
      },
    },
  });
}
