// lib/dealer-performance.ts — Faz 10: bayi performans + sıralama.
// fix_phase10_dealer_performance.sql'deki get_my_dealer_performance /
// get_dealer_leaderboard RPC'lerine bağlı.
import { supabase } from './supabase';

export interface DealerPerformanceRow {
  period_year: number;
  period_month: number;
  sales_count: number;
  gross_revenue: number;
  net_earnings: number;
  rank_by_sales: number;
  total_dealers_that_month: number;
}

export interface LeaderboardRow {
  store_id: string;
  store_name: string;
  logo_url: string | null;
  sales_count: number;
  rank_by_sales: number;
}

export async function loadMyDealerPerformance(): Promise<DealerPerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_my_dealer_performance');
  if (error) throw error;
  return data ?? [];
}

export async function loadDealerLeaderboard(limit = 10): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_dealer_leaderboard', {
    p_year: null,
    p_month: null,
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}
