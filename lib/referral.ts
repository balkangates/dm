// lib/referral.ts — Faz 11: bayi → müşteri referans motoru.
// fix_phase11_dealer_referral.sql'deki RPC'lere bağlı.
import { supabase, SITE_URL } from './supabase';

const STORAGE_KEY = 'dv_ref_code';
const CLICK_SESSION_KEY_PREFIX = 'dv_ref_clicked_';

export interface MyReferralLink {
  referral_code: string;
  store_id: string | null;
  click_count: number;
  signup_count: number;
}

export interface ReferralStatsRow {
  referral_code: string;
  store_id: string | null;
  click_count: number;
  signup_count: number;
  referred_full_name: string | null;
  referred_created_at: string | null;
}

export function referralLinkUrl(code: string, storeId: string | null): string {
  return storeId ? `${SITE_URL}/store/${storeId}?ref=${code}` : `${SITE_URL}/?ref=${code}`;
}

export async function getOrCreateMyReferralLink(): Promise<MyReferralLink | null> {
  const { data, error } = await supabase.rpc('get_or_create_my_referral_link');
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getMyReferralStats(): Promise<ReferralStatsRow[]> {
  const { data, error } = await supabase.rpc('get_my_referral_stats');
  if (error) throw error;
  return data ?? [];
}

/** ?ref= linkten gelen tıklamayı bir kez sayar (sekme/oturum başına), kodu
 * localStorage'a kaydeder ki sonra kayıt/girişte kullanılabilsin.
 * Kod öneki hangi sisteme ait olduğunu belirler: 'BY' = Faz 11 (bayinin
 * kendi linki, sadece sayaç), 'PK' = Faz 12 (Paylaş&Kazan, gerçek
 * cashback). Böylece tek bir yakalama bileşeni iki bağımsız sistemi de
 * doğru RPC'ye yönlendirebiliyor. */
export async function captureReferralFromUrl() {
  if (typeof window === 'undefined') return;
  const code = new URLSearchParams(window.location.search).get('ref');
  if (!code) return;

  localStorage.setItem(STORAGE_KEY, code);

  const clickKey = CLICK_SESSION_KEY_PREFIX + code;
  if (!sessionStorage.getItem(clickKey)) {
    sessionStorage.setItem(clickKey, '1');
    try {
      if (code.startsWith('PK')) {
        await supabase.rpc('track_store_referral_click', { p_code: code });
      } else {
        await supabase.rpc('track_referral_click', { p_code: code });
      }
    } catch {
      // sessizce geç — tıklama sayacı kritik değil
    }
  }
}

export function getStoredReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function clearStoredReferralCode() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/** Giriş yapmış/yeni kayıt olmuş kullanıcıyı, localStorage'da saklı ref
 * koduna bağlar (varsa). Öneke göre doğru sisteme yönlendirir (BY/PK —
 * bkz. captureReferralFromUrl). Başarılı/başarısız sessizce döner —
 * kritik olmayan bir zenginleştirme adımı, ana akışı bloklamamalı. */
export async function applyStoredReferralIfAny(): Promise<boolean> {
  const code = getStoredReferralCode();
  if (!code) return false;
  try {
    const rpcName = code.startsWith('PK') ? 'apply_store_referral' : 'apply_referral';
    const { data, error } = await supabase.rpc(rpcName, { p_code: code });
    if (error) return false;
    if (data) clearStoredReferralCode();
    return !!data;
  } catch {
    return false;
  }
}
