/**
 * FAZ 6 — Oturum/rol yardımcısı (yalnızca Supabase; Drizzle/özel oturum yok).
 *
 *  * UI sözleşmesi: roller UPPERCASE ("ADMIN"|"BUSINESS"|"CUSTOMER"; personel
 *    "OWNER"|"MANAGER"|"CASHIER"). Veritabanında roller KÜÇÜK harftir; eşleme
 *    burada, sınır noktasında yapılır.
 *  * Kimlik auth.getUser() ile Auth sunucusunda doğrulanır; profil RLS ile
 *    (yalnızca kendi satırı) okunur. Rol istemciden GELMEZ.
 *  * İşletme bağlantısı: profiles.business_id YOKTUR → business_staff.user_id
 *    (veya e-posta eşleşmesi) üzerinden çözülür.
 */
import { createClient } from "@/lib/supabase/server";

export type RoleUppercase = "ADMIN" | "BUSINESS" | "CUSTOMER";
export type StaffRoleUppercase = "OWNER" | "MANAGER" | "CASHIER";

export type SessionUserLite = {
  id: string;
  name: string;
  email: string;
  role: RoleUppercase;
  businessId: string | null;
  referralCode: string;
  district: string | null;
  lang: string;
  currency: string;
  country: string;
};

const asRole = (v: unknown): RoleUppercase => {
  const r = String(v ?? "").toUpperCase();
  return r === "ADMIN" || r === "BUSINESS" ? r : "CUSTOMER";
};

const asStaffRole = (v: unknown): StaffRoleUppercase => {
  const r = String(v ?? "").toUpperCase();
  return r === "OWNER" || r === "MANAGER" ? r : "CASHIER";
};

/** Oturum sahibi kullanıcı. Yoksa null. */
export async function getSessionUser(): Promise<SessionUserLite | null> {
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data: p } = await sb.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
  if (!p) return null;

  const role = asRole(p.role);
  let businessId: string | null = null;
  if (role === "BUSINESS") {
    const { data: staff } = await sb
      .from("business_staff")
      .select("business_id")
      .eq("user_id", auth.user.id)
      .eq("active", true)
      .limit(1);
    businessId = (staff?.[0]?.business_id as string | undefined) ?? null;
    if (!businessId) {
      // Eski personel kayıtları: user_id boş olabilir → e-posta eşleşmesi.
      const { data: byEmail } = await sb
        .from("business_staff")
        .select("business_id")
        .eq("email", auth.user.email ?? "")
        .eq("active", true)
        .limit(1);
      businessId = (byEmail?.[0]?.business_id as string | undefined) ?? null;
    }
  }

  return {
    id: auth.user.id,
    name: String(p.name ?? ""),
    email: String(p.email ?? auth.user.email ?? ""),
    role,
    businessId,
    referralCode: String(p.referral_code ?? ""),
    district: (p.district as string | null) ?? null,
    lang: String(p.lang ?? "tr"),
    currency: String(p.currency ?? "TRY"),
    country: String(p.country ?? "TR"),
  };
}

export type BusinessActorLite = {
  userId: string;
  email: string;
  businessId: string;
  staffRole: StaffRoleUppercase;
  role: RoleUppercase;
};

/**
 * İşletme yetkisi SUNUCUDA doğrulanır:
 *  * ADMIN → denetim için ilk işletme (staff satırı) — OWNER muamelesi.
 *  * BUSINESS → business_staff satırı (user_id veya e-posta eşleşmesi); yoksa null.
 * İstemciden rol/businessId KABUL EDİLMEZ.
 */
export async function businessActorLite(): Promise<BusinessActorLite | null> {
  const u = await getSessionUser();
  if (!u) return null;
  const sb = await createClient();

  if (u.role === "ADMIN") {
    const { data } = await sb.from("business_staff").select("business_id").limit(1);
    const bid = (data?.[0]?.business_id as string | undefined) ?? u.businessId ?? "";
    if (!bid) return null;
    return { userId: u.id, email: u.email, businessId: bid, staffRole: "OWNER", role: u.role };
  }

  if (u.role !== "BUSINESS" || !u.businessId) return null;
  const { data: rows } = await sb.from("business_staff").select("*").eq("business_id", u.businessId);
  const staff = (rows ?? []).filter((s) => Boolean(s.active));
  if (!staff.length) return null;
  const email = u.email.toLowerCase();
  const mine =
    staff.find((s) => String(s.user_id ?? "") === u.id || String(s.email ?? "").toLowerCase() === email) ?? staff[0];
  return { userId: u.id, email: u.email, businessId: u.businessId, staffRole: asStaffRole(mine?.role), role: u.role };
}
