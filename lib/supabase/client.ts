import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Tarayıcı (Client Component) için Supabase istemcisi.
 * Yalnızca herkese açık anon/publishable anahtar kullanır; yetkiyi RLS belirler.
 */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
