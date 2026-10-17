/**
 * Kimlik doğrulama girdi doğrulaması (saf fonksiyonlar; sunucu ve test için ortak).
 * İstemci doğrulaması yalnızca kullanım kolaylığıdır; asıl doğrulama sunucuda ve Supabase Auth'tadır.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 120;
export const PASSWORD_MIN = 8;
// bcrypt (Supabase Auth) 72 bayttan sonrasını yok sayar; sessizce kesilmesin diye üst sınır koyuyoruz.
export const PASSWORD_MAX_BYTES = 72;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  if (email.length > 254 || !EMAIL_RE.test(email)) return "Geçerli bir e-posta girin.";
  return null;
}

export function validateName(name: string): string | null {
  if (name.length < NAME_MIN) return `Ad soyad en az ${NAME_MIN} karakter olmalı.`;
  if (name.length > NAME_MAX) return "Ad soyad çok uzun.";
  return null;
}

export function validatePasswordForSignUp(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Şifre en az ${PASSWORD_MIN} karakter olmalı.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "Şifre çok uzun (en fazla 72 bayt).";
  return null;
}

/** Davet kodu: yalnızca harf/rakam, 3–20 karakter; aksi halde boş kabul edilir (kayıt engellenmez). */
export function normalizeReferral(v: unknown): string {
  const code = String(v ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{3,20}$/.test(code) ? code : "";
}

/**
 * Açık yönlendirme (open redirect) koruması: yalnızca site içi, tek eğik çizgiyle başlayan yollar.
 * "//evil.com", "/\\evil.com", "https://..." ve kontrol karakterleri reddedilir.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return null;
  if (next.startsWith("/auth/")) return null; // callback üzerinden döngü oluşmasın
  return next;
}
