/**
 * Anasayfa görünüm modu (Müşteri / İşletme) — TEK KAYNAK.
 * Saf fonksiyonlar: next/headers, Supabase veya React içe aktarmaz; sunucu, istemci ve testler ortak kullanır.
 *
 * Öncelik sırası:
 *   1. URL parametresi  ?mod=isletme | ?mod=musteri   (açık seçim; geri tuşu ve paylaşılabilir bağlantı uyumlu)
 *   2. Oturum rolü      (giriş yapmışsa profiles.role → işletme/bayi/business = işletme; musteri/customer = müşteri)
 *   3. Varsayılan       müşteri (misafir / ilk ziyaret)
 *
 * Bu dosya yetki KARARI değildir; yalnızca hangi anasayfa akışının gösterileceğini belirler.
 */

export const MODE_PARAM = "mod";

export const VIEW_MODES = ["musteri", "isletme"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const DEFAULT_VIEW_MODE: ViewMode = "musteri";

/** Params'taki değer (string | string[] | null | undefined) → geçerli mod, aksi halde null. */
export function parseMode(v: unknown): ViewMode | null {
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  return (VIEW_MODES as readonly string[]).includes(s) ? (s as ViewMode) : null;
}

const BUSINESS_ROLES = new Set(["isletme", "bayi", "business"]);
const CUSTOMER_ROLES = new Set(["musteri", "customer"]);

/**
 * Oturum rolü → mod. Hem veritabanı rolleri (customer | business | admin, küçük harf)
 * hem de arayüz sözleşmesi (CUSTOMER | BUSINESS | ADMIN) hem de Türkçe takma adlar okunur.
 * Bilinmeyen / yönetici / boş rol → null (mod rolden çıkarılamaz, varsayılana düşer).
 */
export function modeFromRole(role: unknown): ViewMode | null {
  if (typeof role !== "string") return null;
  const r = role.trim().toLowerCase();
  if (BUSINESS_ROLES.has(r)) return "isletme";
  if (CUSTOMER_ROLES.has(r)) return "musteri";
  return null;
}

export type ModeSource = "url" | "role" | "default";

export function resolveViewModeDetailed(input: { param?: unknown; role?: unknown }): { mode: ViewMode; source: ModeSource } {
  const fromUrl = parseMode(input.param);
  if (fromUrl) return { mode: fromUrl, source: "url" };
  const fromRole = modeFromRole(input.role);
  if (fromRole) return { mode: fromRole, source: "role" };
  return { mode: DEFAULT_VIEW_MODE, source: "default" };
}

export function resolveViewMode(input: { param?: unknown; role?: unknown }): ViewMode {
  return resolveViewModeDetailed(input).mode;
}

/** "/yol?a=1#kesfet" → { path, query, hash } (mutlak URL gerekmez; yalnızca site içi bağlantılar). */
function splitHref(href: string): { path: string; query: string; hash: string } {
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const noHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const qAt = noHash.indexOf("?");
  return {
    path: qAt >= 0 ? noHash.slice(0, qAt) : noHash,
    query: qAt >= 0 ? noHash.slice(qAt + 1) : "",
    hash,
  };
}

/**
 * Site içi bağlantıya ?mod=… ekler/günceller; sorgunun geri kalanını ve #hash'i korur.
 * mode null ise bağlantı olduğu gibi döner.
 */
export function withMode(href: string, mode: ViewMode | null): string {
  if (!mode) return href;
  const { path, query, hash } = splitHref(href);
  const p = new URLSearchParams(query);
  p.set(MODE_PARAM, mode);
  return `${path}?${p.toString()}${hash}`;
}

/**
 * Geçerli sayfada modu değiştiren hedef URL. Diğer sorgu parametreleri korunur,
 * #hash atılır (iki modun çapa kümeleri farklıdır).
 */
export function hrefForMode(pathname: string, search: string | URLSearchParams, mode: ViewMode): string {
  const p = new URLSearchParams(typeof search === "string" ? search : search.toString());
  p.set(MODE_PARAM, mode);
  return `${pathname}?${p.toString()}`;
}
