import "server-only";

/**
 * Yalnızca sunucuda okunabilen gizli değerler. `server-only` import'u sayesinde
 * bu dosya bir Client Component'ten import edilirse BUILD HATASI verir —
 * service role key'in tarayıcıya sızması yapısal olarak engellenir.
 *
 * Uygulama runtime'ı yalnızca Supabase değişkenlerine bağlıdır:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
export function getServerEnv() {
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    nodeEnv: process.env.NODE_ENV,
  };
}

export function requireServiceRoleKey(): string {
  const { serviceRoleKey } = getServerEnv();
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY tanımlı değil (yalnızca sunucu ortamında).");
  return serviceRoleKey;
}
