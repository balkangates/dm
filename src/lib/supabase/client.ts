import { createBrowserClient } from "@supabase/ssr";

/**
 * Tarayıcı (Client Component) Supabase istemcisi — yalnızca anon anahtar.
 * Env, import anında değil ÇAĞRI anında doğrulanır (build'i kırmaz).
 * NEXT_PUBLIC_* değişkenleri Next tarafından derleme anında satır içine alındığı için
 * doğrudan `process.env.NEXT_PUBLIC_...` biçiminde okunmalıdır.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı olmalı.");
  }
  return createBrowserClient(url, key);
}
