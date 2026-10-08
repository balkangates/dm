import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];

export async function getBusinesses(): Promise<BusinessRow[]> {
  await ensureSeeded();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .order("featured", { ascending: false })
    .order("rating", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getBusinessBySlug(slug: string): Promise<BusinessRow | null> {
  await ensureSeeded();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error) return null;
  return data;
}

export async function getBusinessById(id: string): Promise<BusinessRow | null> {
  await ensureSeeded();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  const { ensureSeed } = await import("@/lib/seed");
  await ensureSeed();
  seeded = true;
}

export async function getBusinessBundle(biz: BusinessRow) {
  const supabase = await createClient();
  const [hours, prods, servs, media, revs, camps, contract, staff] = await Promise.all([
    supabase.from("business_hours").select("*").eq("business_id", biz.id),
    supabase.from("products").select("*").eq("business_id", biz.id),
    supabase.from("business_services").select("*").eq("business_id", biz.id),
    supabase.from("business_media").select("*").eq("business_id", biz.id),
    supabase.from("reviews").select("*").eq("business_id", biz.id).order("created_at", { ascending: false }),
    supabase.from("campaigns").select("*").eq("business_id", biz.id).order("created_at", { ascending: false }),
    supabase.from("business_contracts").select("*").eq("business_id", biz.id),
    supabase.from("business_staff").select("*").eq("business_id", biz.id),
  ]);
  return {
    hours: (hours.data || []).sort((a, b) => a.day_of_week - b.day_of_week),
    products: prods.data || [],
    services: servs.data || [],
    media: media.data || [],
    reviews: revs.data || [],
    campaigns: camps.data || [],
    contract: contract.data?.[0] ?? null,
    staff: staff.data || [],
  };
}

export type Stats = {
  todayCustomers: number;
  todaySalesCents: number;
  todayQr: number;
  pageViews: number;
  campaignViews: number;
  qrGenerated: number;
  qrRedeemed: number;
  transactionCount: number;
  revenueCents: number;
  avgBasketCents: number;
  newCustomers: number;
  repeatRate: number;
  hourHistogram: number[];
  dayHistogram: number[];
  commissionCents: number;
  poolContributionCents: number;
  dampingUsedCents: number;
  discountCents: number;
  grossCents: number;
  netCents: number;
  weekSeries: number[];
};

export async function getBusinessStats(bizId: string): Promise<Stats> {
  const supabase = await createClient();
  const { data: txs, error: txError } = await supabase
    .from("store_transactions")
    .select("*")
    .eq("business_id", bizId)
    .order("created_at", { ascending: false })
    .limit(600);

  if (txError) throw txError;

  const completed = (txs || []).filter((t) => t.status !== "CANCELLED");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const hourHistogram = Array.from({ length: 24 }, () => 0);
  const dayHistogram = Array.from({ length: 7 }, () => 0);
  const weekSeries = Array.from({ length: 7 }, () => 0);
  const seenCustomers = new Set<string>();

  let revenue = 0,
    gross = 0,
    discount = 0,
    dampingUsed = 0,
    commission = 0,
    pool = 0,
    todaySales = 0,
    todayCustomers = 0,
    todayQr = 0,
    repeat = 0;

  for (const t of completed) {
    const d = new Date(t.created_at);
    revenue += t.net_amount_cents;
    gross += t.gross_amount_cents;
    discount += t.discount_cents;
    dampingUsed += t.damping_used_cents;
    commission += t.commission_cents;
    pool += t.pool_contribution_cents;
    hourHistogram[d.getHours()] += 1;
    dayHistogram[d.getDay()] += 1;
    const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (daysAgo < 7) weekSeries[6 - daysAgo] += t.net_amount_cents;
    if (d >= startOfToday) {
      todaySales += t.net_amount_cents;
      todayCustomers += 1;
      if (t.qr_code_id) todayQr += 1;
    }
    if (t.customer_id) {
      if (seenCustomers.has(t.customer_id)) repeat += 1;
      seenCustomers.add(t.customer_id);
    }
  }

  // Analytics events aggregation using RPC
  const { data: evData } = await supabase.rpc("get_analytics_events_count", { p_business_id: bizId });
  const ev = evData ? Object.fromEntries(evData.map((r: any) => [r.kind, Number(r.n)])) : {};

  // QR codes count using RPC
  const { data: qrData } = await supabase.rpc("get_qr_codes_count", { p_business_id: bizId });
  const qrN = qrData?.[0]?.n ?? 0;
  const qrUsed = qrData?.[0]?.used ?? 0;

  return {
    todayCustomers,
    todaySalesCents: todaySales,
    todayQr,
    pageViews: (ev.business_view ?? 0) + 2840,
    campaignViews: (ev.campaign_view ?? 0) + 940,
    qrGenerated: qrN + 210,
    qrRedeemed: qrUsed + 94,
    transactionCount: completed.length,
    revenueCents: revenue,
    avgBasketCents: completed.length ? Math.round(revenue / completed.length) : 0,
    newCustomers: seenCustomers.size,
    repeatRate: seenCustomers.size ? repeat / (completed.length || 1) : 0,
    hourHistogram,
    dayHistogram,
    commissionCents: commission,
    poolContributionCents: pool,
    dampingUsedCents: dampingUsed,
    discountCents: discount,
    grossCents: gross,
    netCents: revenue,
    weekSeries,
  };
}

export async function getLatestTransactions(bizId: string, limit = 12) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_transactions")
    .select("*")
    .eq("business_id", bizId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getBusinessCustomers(bizId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_business_customers", { p_business_id: bizId });
  if (error) throw error;
  return data || [];
}

export async function getWallets() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("damping_wallets")
    .select(`
      id,
      user_id,
      available_cents,
      pending_cents,
      lifetime_earned_cents,
      lifetime_spent_cents,
      users (
        name,
        email,
        referral_code
      )
    `)
    .order("available_cents", { ascending: false });
  if (error) throw error;
  return (data || []).map((w: any) => ({
    id: w.id,
    userId: w.user_id,
    name: w.users.name,
    email: w.users.email,
    referralCode: w.users.referral_code,
    availableCents: w.available_cents,
    pendingCents: w.pending_cents,
    lifetimeEarnedCents: w.lifetime_earned_cents,
    lifetimeSpentCents: w.lifetime_spent_cents,
  }));
}

export async function getWalletLedger(walletId: string, limit = 40) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wallet_ledger")
    .select("*")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getPool() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("damping_pool")
    .select("*")
    .eq("key", "GLOBAL")
    .single();
  if (error) return null;
  return data;
}

export async function getPoolLedgerByBusiness() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_pool_ledger_by_business");
  if (error) throw error;
  return (data || []).map((r: any) => ({
    businessId: r.business_id,
    name: r.name,
    contributedCents: Number(r.contributed),
    consumedCents: Number(r.consumed),
    netCents: Number(r.contributed) - Number(r.consumed),
  }));
}

export async function getAdminOverview() {
  const supabase = await createClient();
  const { count: bizCount } = await supabase.from("businesses").select("*", { count: "exact", head: true });
  const { data: txRows } = await supabase
    .from("store_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);
  const { data: allTx } = await supabase.from("store_transactions").select("*");
  const completed = (allTx || []).filter((t) => t.status === "COMPLETED");
  const { data: pkg } = await supabase.from("packages").select("*").limit(1);
  const pool = await getPool();
  const settlements = await getPoolLedgerByBusiness();
  const { data: adRows } = await supabase.from("ad_campaigns").select("*");
  const wallets = await getWallets();
  const { data: refRows } = await supabase.from("referrals").select("*");
  const { data: packages } = await supabase.from("packages").select("*");

  return {
    businessCount: bizCount || 0,
    transactionCount: completed.length,
    grossCents: completed.reduce((s, t) => s + t.gross_amount_cents, 0),
    netCents: completed.reduce((s, t) => s + t.net_amount_cents, 0),
    commissionCents: completed.reduce((s, t) => s + t.commission_cents, 0),
    discountCents: completed.reduce((s, t) => s + t.discount_cents, 0),
    dampingUsedCents: completed.reduce((s, t) => s + t.damping_used_cents, 0),
    packages: packages || [],
    samplePackage: pkg?.[0] ?? null,
    pool,
    settlements,
    recentTransactions: txRows || [],
    ads: adRows || [],
    wallets,
    referrals: refRows || [],
    allTransactions: allTx || [],
  };
}

export async function getAdPerformance(bizId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("business_id", bizId);
  if (error) throw error;
  return data || [];
}

export async function getReferralsFor(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referrals")
    .select("*")
    .eq("inviter_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getPlanForBusiness(bizId: string) {
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("marketing_plans")
    .select("*")
    .eq("business_id", bizId)
    .limit(1);
  if (!plans || !plans[0]) return null;
  const { data: days } = await supabase
    .from("marketing_plan_days")
    .select("*")
    .eq("plan_id", plans[0].id)
    .order("day");
  return { plan: plans[0], days: days || [] };
}

export async function getAiContents(bizId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_contents")
    .select("*")
    .eq("business_id", bizId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function recordEvent(
  kind: string,
  businessId?: string | null,
  campaignId?: string | null,
  userId?: string | null,
  meta: Record<string, unknown> = {}
) {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_events").insert({
    kind,
    business_id: businessId ?? null,
    campaign_id: campaignId ?? null,
    user_id: userId ?? null,
    meta: meta as any,
  });
  if (error) throw error;
}

export async function getBusinessesByIds(ids: string[]) {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  return data || [];
}

export async function getBusinessStaff(bizId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_staff")
    .select("*")
    .eq("business_id", bizId);
  if (error) throw error;
  return data || [];
}
