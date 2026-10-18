/**
 * FAZ 6 — Uyum katmanı (Drizzle ve özel çerez oturumu KALDIRILDI).
 *
 * 17+ sayfa "currentUser" adını kullanıyordu; bu ad artık Supabase oturum
 * yardımcısını (lib/authz.ts) gösterir. Parola hashleme, imzalı çerez ve
 * users tablosu okuması silinmiştir: kimlik doğrulama yalnızca Supabase Auth.
 */
export { getSessionUser as currentUser } from "@/lib/authz";
export type { SessionUserLite as SessionUser } from "@/lib/authz";
