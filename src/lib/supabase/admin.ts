import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role istemcisi: RLS'yi AŞAR. Yalnızca sunucuda, yetki kontrolünden SONRA kullanılır.
 * `server-only` import'u sayesinde bir Client Component bu dosyayı içe aktarırsa build düşer.
 * Anahtar asla NEXT_PUBLIC_* olmaz.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlı olmalı.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
