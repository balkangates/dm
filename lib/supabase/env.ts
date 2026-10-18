/**
 * Supabase ortam değişkeni doğrulaması (tarayıcı + sunucu + middleware ortak kullanır).
 *
 * Yalnızca herkese açık iki değişken okunur:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * NOT: Next.js, NEXT_PUBLIC_* değerlerini derleme anında yalnızca
 * `process.env.NEXT_PUBLIC_...` biçimindeki DOĞRUDAN erişimlerde istemci
 * paketine gömer. Bu yüzden aşağıda dinamik anahtar okuması kullanılmaz.
 *
 * Ayrıcalıklı (service_role / secret) anahtar bu projede kullanılmaz;
 * yanlışlıkla buraya konursa uygulama bilinçli olarak hata verir.
 */

export type SupabaseEnv = { url: string; anonKey: string };

function decodeJwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(globalThis.atob(padded)) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** Ortam eksik/hatalıysa null değil, açıklayıcı hata verir. Anahtar değerini asla yazmaz. */
export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL tanımlı değil. .env.example dosyasına bakın.");
  }
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı değil. .env.example dosyasına bakın.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL geçerli bir URL değil.");
  }
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL https:// ile başlamalı (yalnızca yerel geliştirmede http:// olabilir).");
  }

  // Gizli anahtarın tarayıcıya sızmasını engelle.
  if (anonKey.startsWith("sb_secret_") || decodeJwtRole(anonKey) === "service_role") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY olarak ayrıcalıklı bir anahtar verilmiş görünüyor. Yalnızca anon/publishable anahtar kullanılmalı."
    );
  }

  return { url, anonKey };
}

/** Proxy gibi, Supabase henüz yapılandırılmamışken uygulamayı bozmaması gereken yerler için. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}
