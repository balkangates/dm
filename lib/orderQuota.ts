/**
 * Sipariş kotası ve bakiye — saf yardımcılar (sunucu, panel ve testler ortak kullanır).
 *
 * Kural özeti (kaynak doğruluk: supabase/migrations/20261109000001_order_quota_packages.sql):
 *  - Paket dönem (UTC ayı) başına `orderQuotaMonthly` sipariş içerir; Ücretsiz Profil de aynıdır.
 *  - Her sipariş (gel-al, paket servis, rezerve) önce dönem kotasından, kota bitince bakiyeden düşer.
 *  - Bakiye, paketin `orderTopupMinQty` adedi ve katları olarak, `orderUnitPriceCents` birim fiyatıyla eklenir.
 *  - Kota veya birim fiyat tanımsızsa (null) sınırlama / bakiye ekleme yoktur.
 */

export type OrderQuotaState = {
  period: string;
  packageCode: string;
  packageName: string;
  /** Paket için sipariş limiti tanımsız → sınırlama uygulanmaz. */
  unlimited: boolean;
  quota: number | null;
  used: number;
  quotaRemaining: number | null;
  /** Satın alınmış (eklenmiş) sipariş bakiyesi; dönem sonunda silinmez. */
  balance: number;
  unitPriceCents: number | null;
  topupMinQty: number;
};

const int = (v: unknown, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.trunc(x) : d;
};
const intOrNull = (v: unknown) => (v == null || v === "" ? null : int(v, 0));

/** RPC çıktısını (jsonb) güvenli biçimde OrderQuotaState'e çevirir; geçersizse null. */
export function parseOrderQuota(raw: unknown): OrderQuotaState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.period !== "string") return null;
  return {
    period: r.period,
    packageCode: String(r.packageCode ?? ""),
    packageName: String(r.packageName ?? r.packageCode ?? ""),
    unlimited: r.unlimited === true,
    quota: intOrNull(r.quota),
    used: Math.max(0, int(r.used)),
    quotaRemaining: intOrNull(r.quotaRemaining),
    balance: Math.max(0, int(r.balance)),
    unitPriceCents: intOrNull(r.unitPriceCents),
    topupMinQty: Math.max(1, int(r.topupMinQty, 1)),
  };
}

/** Bu durumda yeni sipariş alınabilir mi? */
export function canTakeOrder(s: OrderQuotaState): boolean {
  if (s.unlimited) return true;
  return (s.quotaRemaining ?? 0) > 0 || s.balance > 0;
}

/** Bakiye ekleme geçerli mi? Adet ≥ minimum ve minimumun katı olmalı. */
export function validTopupQty(qty: number, minQty: number): boolean {
  return Number.isInteger(qty) && minQty >= 1 && qty >= minQty && qty % minQty === 0;
}

/** Toplam hizmet bedeli (kuruş) = adet × birim fiyat. */
export function topupAmountCents(qty: number, unitPriceCents: number): number {
  return qty * unitPriceCents;
}

/** Panelde hızlı seçim: minimum ve katları (1×, 2×, 5×, 10×). */
export function topupChoices(minQty: number): number[] {
  return [1, 2, 5, 10].map((k) => k * Math.max(1, minQty));
}
