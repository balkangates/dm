/**
 * Veri katmanı DIŞA AKTARIM NOKTASI (FAZ 6).
 *
 * Drizzle katmanı kaldırıldı; uygulamanın tek veri kaynağı Supabase'tir
 * (lib/data/supabase.ts — PostgREST + RLS + dv_* RPC'leri). Bu dosya yalnızca
 * 30+ içe aktarıcıyı bozmadan aynı imzaları yeniden dışa aktarır.
 */
export * from "@/lib/data/supabase";
export type { BusinessRow, CampaignCard, FeeRuleRow, OfferCard, PackageRow } from "@/lib/data/types";
