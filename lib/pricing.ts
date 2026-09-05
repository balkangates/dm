// lib/pricing.ts — Faz 15: "satış fiyatı otomatik oluşmalı" hesaplayıcısı.
//
// BULGU: lib/dealer-catalog.ts'teki selectCatalogProduct() şu ana kadar
// `price: catalogProduct.suggested_price || 0` yapıyordu — yani bayinin
// satış fiyatı, tedarikçinin fiyatına BİREBİR eşitleniyordu, SIFIR kâr
// payı ile. Sonra sipariş anında handle_store_order_finance() bu fiyattan
// platform komisyonu + (varsa) referral komisyonu + kargo düşüyor — yani
// bayi mevcut haliyle HER SATIŞTA ZARAR ediyordu. Hiçbir yerde fiyat
// düzenleme arayüzü de yoktu.
//
// Bu modül, ters yönden (maliyet + giderler + hedef kâr → satış fiyatı)
// hesaplama yapar. Backend'in KENDİ KDV yaklaşımıyla tutarlı olsun diye
// (bkz. fix_phase2: net_price = round(total_price / 1.20, 2)) aynı %20
// KDV varsayımını kullanır.

export interface PricingInput {
  supplierCost: number; // tedarikçi teklif/onaylı fiyatı
  platformCommissionPct: number; // categories.commission_pct
  includeReferral: boolean; // bu ürün referans programına dahil mi
  referralCommissionPct: number; // store_referral_partners.commission_rate (varsayılan 5)
  shippingCost: number; // birim başına tahmini kargo payı (TL)
  otherCost: number; // diğer giderler (TL)
  marginPct: number; // tedarikçi maliyeti üzerine hedeflenen kâr yüzdesi
  vatRate?: number; // varsayılan 20 — backend'in kendi varsayımıyla aynı
}

export interface PricingBreakdown {
  supplierCost: number;
  desiredProfit: number;
  targetNet: number; // supplierCost + desiredProfit + shipping + other (bayinin eline geçmesi gereken)
  suggestedPrice: number; // müşteriye gösterilecek KDV dahil nihai fiyat
  netBase: number; // suggestedPrice / (1+KDV) — komisyon tabanı
  platformCommissionAmount: number;
  referralCommissionAmount: number;
  vatAmount: number;
  dealerNetProceeds: number; // suggestedPrice - komisyon - referral - kargo - diğer (gerçekte eline geçen)
}

/**
 * P/(1+vat) * (1 - c - r) - shipping - other = supplierCost * (1 + margin)
 * => P = (1+vat) * [supplierCost*(1+margin) + shipping + other] / (1 - c - r)
 */
export function calculatePricing(input: PricingInput): PricingBreakdown {
  const vat = (input.vatRate ?? 20) / 100;
  const c = input.platformCommissionPct / 100;
  const r = input.includeReferral ? input.referralCommissionPct / 100 : 0;

  const desiredProfit = input.supplierCost * (input.marginPct / 100);
  const targetNet = input.supplierCost + desiredProfit + input.shippingCost + input.otherCost;

  const denominator = 1 - c - r;
  const suggestedPriceRaw = denominator > 0 ? ((1 + vat) * targetNet) / denominator : targetNet * (1 + vat);
  const suggestedPrice = Math.round(suggestedPriceRaw * 100) / 100;

  const netBase = suggestedPrice / (1 + vat);
  const platformCommissionAmount = Math.round(netBase * c * 100) / 100;
  const referralCommissionAmount = Math.round(netBase * r * 100) / 100;
  const vatAmount = Math.round((suggestedPrice - netBase) * 100) / 100;
  const dealerNetProceeds =
    suggestedPrice - platformCommissionAmount - referralCommissionAmount - input.shippingCost - input.otherCost - vatAmount;

  return {
    supplierCost: input.supplierCost,
    desiredProfit: Math.round(desiredProfit * 100) / 100,
    targetNet: Math.round(targetNet * 100) / 100,
    suggestedPrice,
    netBase: Math.round(netBase * 100) / 100,
    platformCommissionAmount,
    referralCommissionAmount,
    vatAmount,
    dealerNetProceeds: Math.round(dealerNetProceeds * 100) / 100,
  };
}

export const DEFAULT_REFERRAL_PCT = 5;
export const DEFAULT_MARGIN_PCT = 20;
