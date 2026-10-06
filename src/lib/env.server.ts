import "server-only";

/**
 * Yalnızca sunucuda okunabilen gizli değerler. `server-only` import'u sayesinde
 * bu dosya bir Client Component'ten import edilirse BUILD HATASI verir —
 * service role key'in tarayıcıya sızması yapısal olarak engellenir.
 */
export function getServerEnv() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  return {
    serviceRoleKey,
    databaseUrl,
    nodeEnv: process.env.NODE_ENV,
  };
}

export function requireServiceRoleKey(): string {
  const { serviceRoleKey } = getServerEnv();
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY tanımlı değil (yalnızca sunucu ortamında).");
  return serviceRoleKey;
}

export function requireDatabaseUrl(): string {
  const { databaseUrl } = getServerEnv();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return databaseUrl;
}
