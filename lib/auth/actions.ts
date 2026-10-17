"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  normalizeEmail,
  normalizeReferral,
  safeNextPath,
  validateEmail,
  validateName,
  validatePasswordForSignUp,
} from "@/lib/auth/validation";

export type AuthResult =
  | { ok: true; redirectTo: string; needsConfirmation?: boolean; message?: string }
  | { ok: false; error: string };

const GENERIC = "İşlem tamamlanamadı. Lütfen tekrar dene.";

function mapAuthError(err: { code?: string; status?: number; message?: string } | null): string {
  const code = err?.code ?? "";
  if (code === "invalid_credentials") return "E-posta veya şifre hatalı.";
  if (code === "email_not_confirmed") return "E-posta adresini doğrulaman gerekiyor. Gelen kutunu kontrol et.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || err?.status === 429)
    return "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.";
  if (code === "weak_password") return "Şifre yeterince güçlü değil.";
  if (code === "signup_disabled") return "Yeni kayıtlar şu an kapalı.";
  if (code === "user_already_exists" || code === "email_exists")
    return "Bu e-posta ile kayıt tamamlanamadı. Giriş yapmayı dene.";
  if (err?.status === 0 || /fetch failed|network/i.test(err?.message ?? "")) return "Sunucuya ulaşılamadı. Bağlantını kontrol et.";
  return GENERIC;
}

async function siteOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signInAction(input: { email: string; password: string; next?: string }): Promise<AuthResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Kimlik doğrulama yapılandırılmamış." };
  const email = normalizeEmail(input?.email);
  const password = String(input?.password ?? "");
  if (validateEmail(email) || !password) return { ok: false, error: "E-posta ve şifre gerekli." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, error: mapAuthError(error) };

    // Profil (public.profiles) trigger ile oluşur; yoksa tutarsız hesaptır → oturumu kapat.
    const { data: profile, error: pErr } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (pErr || !profile) {
      await supabase.auth.signOut();
      return { ok: false, error: "Hesap profili hazır değil. Lütfen destekle iletişime geç." };
    }
    return { ok: true, redirectTo: safeNextPath(input?.next) ?? "/" };
  } catch {
    return { ok: false, error: mapAuthError({ status: 0 }) };
  }
}

export async function signUpAction(input: {
  name: string;
  email: string;
  password: string;
  referralCode?: string;
  lang?: string;
  next?: string;
}): Promise<AuthResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Kimlik doğrulama yapılandırılmamış." };
  const name = String(input?.name ?? "").trim();
  const email = normalizeEmail(input?.email);
  const password = String(input?.password ?? "");
  const bad = validateName(name) ?? validateEmail(email) ?? validatePasswordForSignUp(password);
  if (bad) return { ok: false, error: bad };

  // Rol GÖNDERİLMEZ: handle_new_user trigger'ı rolü her zaman CUSTOMER yapar (kendini yükseltme yok).
  const data = {
    name,
    referral_code: normalizeReferral(input?.referralCode),
    lang: ["tr", "en", "ka"].includes(String(input?.lang)) ? String(input?.lang) : "tr",
  };

  try {
    const supabase = await createClient();
    const origin = await siteOrigin();
    const next = safeNextPath(input?.next);
    const emailRedirectTo = origin ? `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}` : undefined;
    const { data: res, error } = await supabase.auth.signUp({ email, password, options: { data, emailRedirectTo } });
    if (error) return { ok: false, error: mapAuthError(error) };

    // Oturum yoksa e-posta doğrulaması bekleniyor. Var olan e-posta için de aynı yanıt döner
    // (hesap varlığı sızdırılmaz).
    if (!res.session) {
      return {
        ok: true,
        needsConfirmation: true,
        redirectTo: "/giris",
        message: "Kayıt alındı. E-posta kutunu kontrol et; doğrulama bağlantısına tıkladıktan sonra giriş yapabilirsin.",
      };
    }
    return { ok: true, redirectTo: next ?? "/" };
  } catch {
    return { ok: false, error: mapAuthError({ status: 0 }) };
  }
}

export async function signOutAction(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    /* çıkış her durumda başarılı sayılır */
  }
}
