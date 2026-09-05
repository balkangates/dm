// lib/store-referral.ts — Faz 12: herhangi bir müşterinin herhangi bir
// mağaza için aldığı, sürekli %5 cashback kazandıran referans linki.
// fix_phase12_referral_cashback.sql'deki RPC'lere bağlı. Faz 11
// (lib/referral.ts, sadece bayinin kendi linki) ile bağımsız çalışır.
import { supabase, SITE_URL } from './supabase';

export interface StoreReferralLink {
  referral_code: string;
  store_id: string;
  commission_rate: number;
  click_count: number;
  signup_count: number;
}

export interface Partnership {
  store_id: string;
  store_name: string;
  logo_url: string | null;
  referral_code: string;
  commission_rate: number;
  click_count: number;
  signup_count: number;
  held_amount: number;
  released_amount: number;
  paid_amount: number;
}

export interface EarningHistoryRow {
  id: string;
  store_name: string;
  order_amount: number;
  commission_amount: number;
  status: 'HELD' | 'RELEASED' | 'PAID' | 'REFUNDED';
  created_at: string;
}

export function storeReferralLinkUrl(code: string, storeId: string): string {
  return `${SITE_URL}/store/${storeId}?ref=${code}`;
}

export async function getOrCreateStoreReferralLink(storeId: string): Promise<StoreReferralLink | null> {
  const { data, error } = await supabase.rpc('get_or_create_store_referral_link', { p_store_id: storeId });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getMyReferralPartnerships(): Promise<Partnership[]> {
  const { data, error } = await supabase.rpc('get_my_referral_partnerships');
  if (error) throw error;
  return data ?? [];
}

export async function getMyReferralEarningsHistory(limit = 50): Promise<EarningHistoryRow[]> {
  const { data, error } = await supabase.rpc('get_my_referral_earnings_history', { p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

export async function searchActiveStores(query: string): Promise<{ id: string; name: string; logo_url: string | null }[]> {
  let q = supabase.from('stores').select('id, name, logo_url').eq('status', 'active').limit(8);
  if (query.trim()) q = q.ilike('name', `%${query.trim()}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function updateMyPayoutIban(iban: string, bankName: string) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('NOT_AUTHENTICATED');
  const { error } = await supabase
    .from('profiles')
    .update({ iban, bank_name: bankName })
    .eq('id', userData.user.id);
  if (error) throw error;
}
