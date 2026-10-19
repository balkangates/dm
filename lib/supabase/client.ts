import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

let browserClient: SupabaseClient | null = null;

/**
 * Tarayıcı (client component) için Supabase istemcisi — FAZ 11 Storage.
 *
 * Anahtar: NEXT_PUBLIC anon/publishable (env.ts doğrular; service_role
 * bilinçli olarak reddedilir). Oturum: kullanıcının auth çerezleri.
 *
 * Kullanım amacı: dosya yüklemeleri tarayıcıdan DOĞRUDAN Supabase
 * Storage'a gider (Vercel serverless gövde limiti ~4.5MB nedeniyle
 * sunucu route'undan geçirilemez). Yetkinin son sınırı RLS'tir;
 * politikalar dosya yolundaki işletme id'si ile üyeliği doğrular.
 *
 * Yalnızca "use client" bileşenlerinden çağrın.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;
  const { url, anonKey } = getSupabaseEnv();
  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
