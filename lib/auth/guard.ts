import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { normalizeRole, routeDecision, type Role } from "@/lib/roles";

export type AuthContext = { userId: string; email: string; role: Role | null };

/**
 * Sunucu tarafı kimlik + rol doğrulaması (Server Component, Server Action, Route Handler).
 *  - Oturum `auth.getUser()` ile Auth sunucusunda doğrulanır (çerezdeki oturuma güvenilmez).
 *  - Rol `public.profiles` tablosundan okunur (RLS: kullanıcı yalnızca kendi satırını görür).
 *  - Hata veya erişilemezlik → null (kapalı kalır).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    return { userId: data.user.id, email: data.user.email ?? "", role: normalizeRole(profile?.role) };
  } catch {
    return null;
  }
}

/**
 * Sayfa koruması: middleware ile AYNI karar fonksiyonunu kullanır (ikinci doğrulama katmanı).
 * Yetkisizse yönlendirir (redirect() fırlatır), yetkiliyse bağlamı döndürür.
 */
export async function requirePageAccess(pathname: string): Promise<AuthContext> {
  const ctx = await getAuthContext();
  const decision = routeDecision(pathname, "", { user: !!ctx, role: ctx?.role ?? null });
  if (decision.type === "redirect") redirect(decision.to);
  // Korumasız yolda çağrılırsa ctx null olabilir; çağıranlar yalnızca korumalı yollarda kullanmalıdır.
  if (!ctx) redirect("/giris");
  return ctx;
}

/** Route Handler için: yetki yoksa JSON hata (401/403), varsa bağlam. */
export async function requireApiRole(roles: readonly Role[]): Promise<{ ctx: AuthContext } | { error: Response }> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: Response.json({ ok: false, error: "Oturum gerekli." }, { status: 401 }) };
  if (!ctx.role || !roles.includes(ctx.role)) return { error: Response.json({ ok: false, error: "Bu işlem için yetkiniz yok." }, { status: 403 }) };
  return { ctx };
}
