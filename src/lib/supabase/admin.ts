// SERVICE ROLE istemcisi — RLS'i BYPASS eder.
// Yalnızca kontrollü sunucu işlemlerinde (webhook, job, admin işlemleri,
// sunucuda yetkisi doğrulanmış finansal işlemler) kullanılır.
// `server-only` bu dosyanın bir Client Component'e import edilmesini build'de engeller.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/lib/env";
import { requireServiceRoleKey } from "@/lib/env.server";

export function createAdminClient() {
  const { url } = getPublicSupabaseEnv();
  return createClient(url, requireServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
