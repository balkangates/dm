/**
 * FAZ 12C — Sipariş fiyat dökümü (SAF fonksiyonlar; sunucu + istemci ortak).
 *
 * Kural (kullanıcı kararı):
 *   1) matrah  = Σ (adet × mod-fiyatı)            [KDV hariç]
 *   2) kampanya indirimi matrahdan DÜŞER           [yalnız PERCENT/FIXED;
 *      min-sepet, tarih aralığı ve mod kapsamı sağlanan EN İYİ tek kampanya]
 *   3) KDV     = indirim düşülmüş her kaleme, ürünün kdv oranı
 *      (yoksa işletme varsayılanı) üzerinden eklenir
 *   4) ödenecek toplam = matrah − indirim + KDV
 *
 * Dürüstlük: indirim, kapora/kasa uygulaması değil sipariş ÖZETİNDE gösterilir
 * ve tutardan düşülür; ürün bazlı KDV oranı girilmemişse işletme oranı geçerlidir.
 */

export const KDV_RATES = [0, 1, 10, 18, 20] as const;
export type KdvRate = (typeof KDV_RATES)[number];

export type PriceItem = {
  name: string;
  qty: number;
  unitPriceCents: number;
  /** Ürün bazlı KDV oranı (%); null/undefined → işletme varsayılanı. */
  kdvRate?: number | null;
};

export type PriceCampaign = {
  title: string;
  discountPercent?: number | null;
  discountAmountCents?: number | null;
  minBasketCents?: number | null;
  serviceMode?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type OrderMode = "GEL_AL" | "REZERVE" | "PAKET_SERVIS";

export type PriceBreakdown = {
  subtotalCents: number;
  discountCents: number;
  kdvCents: number;
  totalCents: number;
  campaignTitle: string | null;
};

const cents = (n: unknown) => Math.max(0, Math.round(Number(n ?? 0)));

export function normalizeKdv(rate: unknown, fallback: number): number {
  const r = Number(rate);
  return (KDV_RATES as readonly number[]).includes(r) ? r : fallback;
}

/** Kampanya mod kapsamı: ALL (veya boş) her modda; daraltılmışsa yalnız kendi modunda. */
export function campaignCoversMode(campaign: PriceCampaign, mode: OrderMode | null): boolean {
  const m = String(campaign.serviceMode ?? "ALL");
  if (m === "ALL" || !m) return true;
  if (!mode) return true; // mod henüz bilinmiyorsa kapsam ihlali sayılmaz
  return m === mode;
}

function campaignActiveNow(c: PriceCampaign, now: Date): boolean {
  const start = c.startsAt ? new Date(c.startsAt).getTime() : null;
  const end = c.endsAt ? new Date(c.endsAt).getTime() : null;
  const t = now.getTime();
  if (start != null && Number.isFinite(start) && t < start) return false;
  if (end != null && Number.isFinite(end) && t > end) return false;
  return true;
}

/** Verilen satırlara uygulanabilir EN İYİ tek kampanyayı seçer (yoksa null). */
export function bestCampaign(
  items: PriceItem[],
  campaigns: PriceCampaign[],
  mode: OrderMode | null,
  now: Date = new Date(),
): PriceCampaign | null {
  const subtotal = items.reduce((s, it) => s + cents(it.qty) * cents(it.unitPriceCents), 0);
  let best: PriceCampaign | null = null;
  let bestDiscount = 0;
  for (const c of campaigns) {
    if (!campaignCoversMode(c, mode)) continue;
    if (!campaignActiveNow(c, now)) continue;
    const minB = c.minBasketCents == null ? 0 : cents(c.minBasketCents);
    if (subtotal < minB) continue;
    if (!(c.discountPercent || c.discountAmountCents)) continue;
    const d =
      c.discountPercent && c.discountPercent > 0
        ? Math.min(subtotal, Math.round((subtotal * Number(c.discountPercent)) / 100))
        : Math.min(subtotal, cents(c.discountAmountCents));
    if (d > bestDiscount) {
      bestDiscount = d;
      best = c;
    }
  }
  return best;
}

/**
 * Dökümü hesaplar. Kampanya verilmezse `bestCampaign` ile seçilir.
 * İndirim satırlara ORANSAL dağıtılır; her satıra KDV kendi oranıyla eklenir.
 */
export function computeTotals(input: {
  items: PriceItem[];
  businessKdvRate: number;
  campaign?: PriceCampaign | null;
  mode?: OrderMode | null;
  now?: Date;
}): PriceBreakdown {
  const items = input.items.map((it) => ({
    name: it.name,
    qty: Math.max(1, Math.min(99, Math.round(Number(it.qty ?? 1)))),
    unitPriceCents: cents(it.unitPriceCents),
    kdvRate: it.kdvRate,
  }));
  const subtotalCents = items.reduce((s, it) => s + it.qty * it.unitPriceCents, 0);
  const campaign =
    input.campaign === undefined ? bestCampaign(items, [], input.mode ?? null, input.now ?? new Date()) : input.campaign;
  const rawDiscount = campaign
    ? campaign.discountPercent && campaign.discountPercent > 0
      ? Math.round((subtotalCents * Number(campaign.discountPercent)) / 100)
      : cents(campaign.discountAmountCents)
    : 0;
  const discountCents = Math.min(subtotalCents, Math.max(0, rawDiscount));

  let kdvCents = 0;
  let allocated = 0;
  items.forEach((it, i) => {
    const line = it.qty * it.unitPriceCents;
    // Son satıra yuvarlama artığı düşülür (toplamda indirim = discountCents birebir).
    const share =
      i === items.length - 1
        ? discountCents - allocated
        : subtotalCents > 0
          ? Math.round((discountCents * line) / subtotalCents)
          : 0;
    allocated += share;
    const rate = normalizeKdv(it.kdvRate, input.businessKdvRate);
    kdvCents += Math.round(((line - share) * rate) / 100);
  });

  const totalCents = subtotalCents - discountCents + kdvCents;
  return {
    subtotalCents,
    discountCents,
    kdvCents,
    totalCents,
    campaignTitle: campaign ? campaign.title : null,
  };
}

/** İnsan-okur döküm satırları (widget/panel/fiş ortak). */
export function breakdownLines(b: PriceBreakdown): Array<{ label: string; value: string; tone?: "discount" | "kdv" }> {
  const money = (c: number) => `${(c / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
  const out: Array<{ label: string; value: string; tone?: "discount" | "kdv" }> = [
    { label: "Matrah (KDV hariç)", value: money(b.subtotalCents) },
  ];
  if (b.discountCents > 0) {
    out.push({
      label: `Kampanya indirimi${b.campaignTitle ? ` (${b.campaignTitle})` : ""}`,
      value: `−${money(b.discountCents)}`,
      tone: "discount",
    });
  }
  out.push({ label: "KDV", value: `+${money(b.kdvCents)}`, tone: "kdv" });
  return out;
}
