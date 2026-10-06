// Tarayıcı (Client Component) Supabase istemcisi — yalnızca anon key kullanır,
// tüm erişim RLS'e tabidir.
import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@/lib/env";

export function createClient() {
  const { url, anonKey } = getPublicSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
