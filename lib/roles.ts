/**
 * Rol ve rota kuralları — TEK KAYNAK (middleware, Server Component ve testler ortak kullanır).
 * Saf fonksiyonlar: next/headers veya Supabase içe aktarmaz.
 *
 * Roller `public.profiles.role` ile aynıdır ve KÜÇÜK HARFTİR. Eski (Drizzle) katmandaki
 * BÜYÜK HARFLİ roller yalnızca `normalizeRole` ile okunur.
 *
 * Bu dosya yetki KARARI değildir, yalnızca "bu rol bu sayfayı açabilir mi" haritasıdır.
 * Nihai sınır RLS'tir; veri işlemleri sunucuda ayrıca doğrulanır.
 */
import { safeNextPath } from "./auth/validation";

export const ROLES = ["customer", "business", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/** "ADMIN" / "admin" → "admin"; bilinmeyen değer → null (asla varsayılan rol atanmaz). */
export function normalizeRole(v: unknown): Role | null {
  if (typeof v !== "string") return null;
  const r = v.trim().toLowerCase();
  return isRole(r) ? r : null;
}

export const ROLE_HOME: Record<Role, string> = {
  customer: "/hesabim",
  business: "/panel",
  admin: "/admin",
};

/** Korumalı rota önekleri ve bunlara girebilen roller. Her rolün kendi ana sayfası kendine AÇIK olmalıdır (döngü olmaz). */
export const PROTECTED_ROUTES: ReadonlyArray<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/panel", roles: ["business", "admin"] },
  { prefix: "/hesabim", roles: ["customer"] },
];

/** Oturum açmış kullanıcının görmemesi gereken sayfalar. */
export const AUTH_PAGES = ["/giris", "/kayit"] as const;

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

export function protectedRule(path: string) {
  return PROTECTED_ROUTES.find((r) => under(path, r.prefix)) ?? null;
}

export function isAuthPage(path: string): boolean {
  return AUTH_PAGES.some((p) => under(path, p));
}

/** Rol, yol için izinli mi? Korumasız yol herkese açıktır. */
export function canAccess(path: string, role: Role | null): boolean {
  const rule = protectedRule(path);
  if (!rule) return true;
  return role !== null && rule.roles.includes(role);
}

export type AuthState = {
  /** Auth sunucusunda doğrulanmış kullanıcı var mı? */
  user: boolean;
  /** profiles.role; kullanıcı var ama profil yok/okunamıyorsa null. */
  role: Role | null;
};

export type RouteDecision = { type: "next" } | { type: "redirect"; to: string };

/**
 * İstek için karar. Döngü güvenceleri:
 *  - /giris ve /kayit korumasızdır; rolü olmayan (profili yok) kullanıcı orada KALIR.
 *  - Her rolün ROLE_HOME'u kendi rolüne açıktır.
 *  - Korumasız yollar (callback, statik, herkese açık sayfalar) hiçbir zaman yönlendirilmez.
 */
export function routeDecision(pathname: string, search: string, auth: AuthState): RouteDecision {
  const rule = protectedRule(pathname);

  if (!auth.user) {
    if (!rule) return { type: "next" };
    const target = safeNextPath(pathname + (search ?? ""));
    return { type: "redirect", to: target ? `/giris?next=${encodeURIComponent(target)}` : "/giris" };
  }

  if (isAuthPage(pathname)) {
    if (!auth.role) return { type: "next" };
    const next = safeNextPath(new URLSearchParams(search ?? "").get("next"));
    const nextPath = next ? next.split("?")[0] : null;
    const to = next && nextPath && canAccess(nextPath, auth.role) ? next : ROLE_HOME[auth.role];
    return { type: "redirect", to };
  }

  if (rule) {
    if (!auth.role) return { type: "redirect", to: "/giris?hata=profil" };
    if (!rule.roles.includes(auth.role)) return { type: "redirect", to: ROLE_HOME[auth.role] };
  }
  return { type: "next" };
}
