/**
 * FAZ 6 — Veri katmanı ortak tipleri (Drizzle bağımlılığı OLMADAN).
 *
 * Bu tipler eski Drizzle `$inferSelect` çıktılarıyla yapısal olarak aynıdır;
 * Supabase katmanı (lib/data/supabase.ts) aynı sözleşmeye döner, böylece
 * bileşenler ve sayfalar değişmez.
 */

export type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  subCategory: string | null;
  sectorKey: string;
  district: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  description: string | null;
  story: string | null;
  logoText: string | null;
  coverImage: string | null;
  planCode: string;
  currency: string;
  country: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  featured: boolean;
  createdAt: Date;
};

export type CampaignCard = {
  id: string;
  slug: string | null;
  code: string;
  title: string;
  description: string | null;
  type: string;
  discountPercent: number;
  discountAmountCents: number;
  minBasketCents: number;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  timeStart: string | null;
  timeEnd: string | null;
  status: string;
  moderationStatus: string;
  /** FAZ 12B — kampanya kapsamı: GEL_AL (işletme içi) / PAKET_SERVIS (adrese teslim) / ALL. */
  serviceMode: string;
  isSponsored: boolean;
  imageUrl: string | null;
  qrEnabled: boolean;
  businessId: string;
  businessName: string;
  businessSlug: string;
  district: string;
  city: string;
  country: string;
  category: string;
  sectorKey: string;
  rating: number;
  reviewCount: number;
  coverImage: string | null;
  verified: boolean;
};

export type OfferCard = {
  id: string; slug: string; merchant: string; title: string; description: string | null;
  category: string; country: string; currency: string;
  priceCents: number | null; priceVerified: boolean;
  imageUrl: string | null; destinationUrl: string; disclosure: string;
  terms: string | null; exclusions: string[]; commissionTerms: string | null;
  startsAt: string | null; endsAt: string | null; lastUpdated: string | null;
  status: string; isSponsored: boolean; isSample: boolean; clicks: number; impressions: number;
  networkName: string | null; networkStatus: string | null;
};

/** Fiyatlandırma sayfası: paket satırları (camelCase). */
export type PackageRow = {
  id: string;
  code: string;
  name: string;
  priceMonthlyCents: number;
  features: string[];
  aiQuotaMonthly: number;
  active: boolean;
};

/** Fiyatlandırma sayfası: hizmet bedeli kuralları (camelCase). */
export type FeeRuleRow = {
  id: string;
  serviceType: string;
  packageCode: string | null;
  kind: string;
  amountCents: number;
  rate: number;
  calculationBase: string;
  currency: string;
  active: boolean;
};
