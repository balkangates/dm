// Tarayıcı (Client Component) Supabase istemcisi — yalnızca anon key kullanır,
// tüm erişim RLS'e tabidir.
import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function createClient() {
  const { url, anonKey } = getPublicSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
