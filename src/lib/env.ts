/**
 * Ortam değişkenleri — TEK kaynak.
 *
 * Kural: SUPABASE_SERVICE_ROLE_KEY ve DATABASE_URL yalnızca sunucuda okunur
 * (bkz. env.server.ts). Bu dosya yalnızca NEXT_PUBLIC_* değerlerini içerir ve
 * istemci bundle'ına girebilir.
 *
 * NOT: NEXT_PUBLIC_* değerleri Next.js tarafından derleme anında statik olarak
 * yerine konur; bu yüzden `process.env[name]` yerine açık erişim kullanılır.
 */
export function getPublicSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı olmalı (.env.example dosyasına bakın)."
    );
  }
  return { url, anonKey };
}

/** Supabase ortamı tanımlı mı? (proxy gibi, yokken sessizce geçmesi gereken yerler için) */
export function hasPublicSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
