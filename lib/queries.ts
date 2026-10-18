/**
 * Veri katmanı DAĞITICISI (FAZ 5 — Drizzle→Supabase geçişi).
 *
 *  * Supabase yapılandırılmışsa (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY) veriler
 *    Supabase'ten (lib/data/supabase.ts, RLS + dv_* RPC'leri) gelir.
 *  * Yapılandırılmamışsa eski Drizzle katmanı (lib/data/legacy.ts) çalışır —
 *    yalnızca yerel geliştirme / geçiş dönemi içindir.
 *  * DIŞA AKTARAN SÖZLEŞME DEĞİŞMEDİ: 30+ dosya "@/lib/queries" import etmeye
 *    devam eder; tipler eski Drizzle çıktılarıyla AYNI kalır (supa sürümü
 *    derleme anında bu sözleşmeye eşlenir — `as` doğrulamalı).
 *  * FAZ 6'da legacy katman kaldırılacak; dispatcher o zaman sadeleşir.
 */
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as legacy from "@/lib/data/legacy";
import * as supa from "@/lib/data/supabase";

export type { BusinessRow, CampaignCard, OfferCard } from "@/lib/data/legacy";

export const EVENT_KINDS = legacy.EVENT_KINDS;

type L<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;

export async function ensureSeeded(): Promise<void> {
  if (isSupabaseConfigured()) return; // Supabase modunda tohum verisi SQL ile sağlanır.
  return legacy.ensureSeeded();
}

export async function listCampaignCards(
  opts?: Parameters<typeof legacy.listCampaignCards>[0]
): Promise<L<typeof legacy.listCampaignCards>> {
  if (isSupabaseConfigured()) return (await supa.listCampaignCards(opts)) as L<typeof legacy.listCampaignCards>;
  return legacy.listCampaignCards(opts);
}

export async function getCampaignBySlug(slug: string): Promise<L<typeof legacy.getCampaignBySlug>> {
  if (isSupabaseConfigured()) return (await supa.getCampaignBySlug(slug)) as L<typeof legacy.getCampaignBySlug>;
  return legacy.getCampaignBySlug(slug);
}

export async function getBusinessBySlug(slug: string): Promise<L<typeof legacy.getBusinessBySlug>> {
  if (isSupabaseConfigured()) return (await supa.getBusinessBySlug(slug)) as L<typeof legacy.getBusinessBySlug>;
  return legacy.getBusinessBySlug(slug);
}

export async function listBusinesses(): Promise<L<typeof legacy.listBusinesses>> {
  if (isSupabaseConfigured()) return (await supa.listBusinesses()) as L<typeof legacy.listBusinesses>;
  return legacy.listBusinesses();
}

export async function listDistricts(): Promise<L<typeof legacy.listDistricts>> {
  if (isSupabaseConfigured()) return (await supa.listDistricts()) as L<typeof legacy.listDistricts>;
  return legacy.listDistricts();
}

export async function listCategories(): Promise<L<typeof legacy.listCategories>> {
  if (isSupabaseConfigured()) return (await supa.listCategories()) as L<typeof legacy.listCategories>;
  return legacy.listCategories();
}

export async function getCustomerData(userId: string): Promise<L<typeof legacy.getCustomerData>> {
  if (isSupabaseConfigured()) return (await supa.getCustomerData(userId)) as L<typeof legacy.getCustomerData>;
  return legacy.getCustomerData(userId);
}

export async function getBusinessData(
  businessId: string,
  days?: number
): Promise<L<typeof legacy.getBusinessData>> {
  if (isSupabaseConfigured()) return (await supa.getBusinessData(businessId, days)) as L<typeof legacy.getBusinessData>;
  return legacy.getBusinessData(businessId, days);
}

export async function getAdminData(): Promise<L<typeof legacy.getAdminData>> {
  if (isSupabaseConfigured()) return (await supa.getAdminData()) as L<typeof legacy.getAdminData>;
  return legacy.getAdminData();
}

export async function trackEvent(
  kind: string,
  opts?: Parameters<typeof legacy.trackEvent>[1]
): Promise<void> {
  if (isSupabaseConfigured()) return supa.trackEvent(kind, opts ?? {});
  return legacy.trackEvent(kind, opts ?? {});
}

export async function logAudit(
  actor: string,
  role: string,
  action: string,
  entityType: string,
  entityId: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  if (isSupabaseConfigured()) return supa.logAudit(actor, role, action, entityType, entityId, meta ?? {});
  return legacy.logAudit(actor, role, action, entityType, entityId, meta ?? {});
}

export async function unusedQrCodes(businessId: string): Promise<L<typeof legacy.unusedQrCodes>> {
  if (isSupabaseConfigured()) return (await supa.unusedQrCodes(businessId)) as L<typeof legacy.unusedQrCodes>;
  return legacy.unusedQrCodes(businessId);
}

export async function findBusinessById(id: string): Promise<L<typeof legacy.findBusinessById>> {
  if (isSupabaseConfigured()) return (await supa.findBusinessById(id)) as L<typeof legacy.findBusinessById>;
  return legacy.findBusinessById(id);
}

export async function policiesAll(): Promise<L<typeof legacy.policiesAll>> {
  if (isSupabaseConfigured()) return (await supa.policiesAll()) as L<typeof legacy.policiesAll>;
  return legacy.policiesAll();
}

export async function defaultPolicy(): Promise<L<typeof legacy.defaultPolicy>> {
  if (isSupabaseConfigured()) return (await supa.defaultPolicy()) as L<typeof legacy.defaultPolicy>;
  return legacy.defaultPolicy();
}

export async function listOffers(
  opts?: Parameters<typeof legacy.listOffers>[0]
): Promise<L<typeof legacy.listOffers>> {
  if (isSupabaseConfigured()) return (await supa.listOffers(opts)) as L<typeof legacy.listOffers>;
  return legacy.listOffers(opts);
}

export async function getOfferBySlug(slug: string): Promise<L<typeof legacy.getOfferBySlug>> {
  if (isSupabaseConfigured()) return (await supa.getOfferBySlug(slug)) as L<typeof legacy.getOfferBySlug>;
  return legacy.getOfferBySlug(slug);
}

export async function listOfferCategories(): Promise<L<typeof legacy.listOfferCategories>> {
  if (isSupabaseConfigured()) return (await supa.listOfferCategories()) as L<typeof legacy.listOfferCategories>;
  return legacy.listOfferCategories();
}

export async function getAffiliateData(): Promise<L<typeof legacy.getAffiliateData>> {
  if (isSupabaseConfigured()) return (await supa.getAffiliateData()) as L<typeof legacy.getAffiliateData>;
  return legacy.getAffiliateData();
}

export async function getFlowStream(limit?: number, userId?: string | null): Promise<L<typeof legacy.getFlowStream>> {
  if (isSupabaseConfigured()) return (await supa.getFlowStream(limit, userId)) as L<typeof legacy.getFlowStream>;
  return legacy.getFlowStream(limit, userId);
}

export async function listVideos(topic?: string): Promise<L<typeof legacy.listVideos>> {
  if (isSupabaseConfigured()) return (await supa.listVideos(topic)) as L<typeof legacy.listVideos>;
  return legacy.listVideos(topic);
}
