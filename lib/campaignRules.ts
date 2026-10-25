/**
 * FAZ 1 — KAMPANYA İŞ KURALLARI (TEK KAYNAK)
 *
 * Kampanya formunun payload'ını üreten ve doğrulayan tek modül. Üç yol aynı
 * fonksiyonları paylaşır:
 *
 *   1) Manuel form  → components/business.tsx  (validate + save)
 *   2) Sunucu kayıt → lib/data/supabase-actions.ts `campaignUpsert`
 *                     (ek olarak yetki `campaign.write`, RLS, profil/zorunlu görsel kapıları)
 *   3) AI taslağı   → app/api/ai/route.ts `campaign` action'ı da bu kurallardan geçer
 *
 * KURALLAR (FAZ 1 onayı):
 *   - Yeni form, ikinci kayıt sistemi veya paralel kampanya modülü YOKTUR;
 *     burası yalnızca doğrulamayı/ payload üretimini tekilleştirir.
 *   - Manuel kullanıcının mevcut davranışı DEĞİŞMEZ (aynı alanlar, aynı mesajlar).
 *   - AI, bu doğrulamayı ve `campaign.write` yetkisini ATLAYAMAZ.
 *
 * BİRİM UYARISI: form alanları para tutarını BİRİM (ör. TL) tutar; payload'a
 * geçerken ×100 ile kuruşa çevrilir — mevcut save() davranışıyla birebir aynı.
 */

/** Formun başlangıç değerleri — business.tsx EMPTY ile aynı kaynaktır. */
export const CAMPAIGN_FORM_EMPTY = {
  title: "",
  description: "",
  terms: "",
  type: "PERCENT",
  discountPercent: 15,
  discountAmountCents: 0,
  minBasketCents: 0,
  currency: "TRY",
  startsAt: "",
  endsAt: "",
  timeStart: "",
  timeEnd: "",
  eligibleItems: "",
  exclusions: "",
  imageUrl: "",
  perCustomerLimit: 2,
  usageLimit: 500,
  qrEnabled: true,
  // FAZ 12C-3 — kapsam ÇOKLU: her sipariş tipi ve ödeme yöntemi ayrı ayrı işaretlenir
  // (boş kalamaz — doğrulama en az birini şart koşar; varsayılan: hepsi).
  serviceModes: ["GEL_AL", "REZERVE", "PAKET_SERVIS"] as string[],
  paymentScope: ["CASH_DOOR", "CARD_DOOR"] as string[],
};

export type CampaignFormState = typeof CAMPAIGN_FORM_EMPTY;

export type PayloadOptions = {
  /** Düzenlenen kampanyanın id'si (yoksa oluşturma). */
  id?: string | null;
  /** true → yayınlama isteği (görsel zorunlu). */
  publish: boolean;
};

/**
 * Form durumundan POST /api/campaigns gövdesini üretir.
 * Manuel `save()` ve AI taslak doğrulaması bu aynı fonksiyonu kullanır.
 */
export function campaignPayloadFromForm(f: CampaignFormState, opts: PayloadOptions): Record<string, unknown> {
  return {
    action: "upsert",
    id: opts.id ?? undefined,
    publish: opts.publish,
    ...f,
    // form birimi (TL) → kuruş
    discountAmountCents: Math.round(Number(f.discountAmountCents) * 100),
    minBasketCents: Math.round(Number(f.minBasketCents) * 100),
    eligibleItems: String(f.eligibleItems)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    exclusions: String(f.exclusions)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    startsAt: f.startsAt || undefined,
    endsAt: f.endsAt || undefined,
  };
}

const ORDER_MODES = ["GEL_AL", "REZERVE", "PAKET_SERVIS"] as const;
const PAYMENT_MODES = ["CASH_DOOR", "CARD_DOOR"] as const;

/**
 * Kampanya payload doğrulaması — istemci ve sunucu için TEK gerçek kaynak.
 * Dönen kayıt: alan adı → hata mesajı. Boş kayıt = geçerli.
 *
 * `opts.existingImageUrl`: düzenlerken mevcut görseli gösterir; böylece payload'da
 * görsel taşımasa bile mevcut görselle yayınlama engellenmez (eski davranışla aynı).
 */
export function validateCampaignPayload(
  body: Record<string, unknown>,
  opts: { existingImageUrl?: string | null } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};

  const title = String(body.title ?? "").trim();
  if (title.length < 5) errors.title = "Başlık en az 5 karakter olmalı.";

  const type = String(body.type ?? "PERCENT");
  const discountPercent = Number(body.discountPercent);
  // Eski istemci kuralıyla birebir (<=0 veya >70 hata); NaN da hata — eskiden
  // NaN sunucuda sessizce %0'a düşüyordu (yanlış indirim kaydı).
  if (type === "PERCENT" && (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 70))
    errors.discountPercent = "%1–70 aralığında olmalı.";
  const discountAmountCents = Number(body.discountAmountCents);
  if ((type === "FIXED" || type === "PRODUCT") && (!Number.isFinite(discountAmountCents) || discountAmountCents <= 0))
    errors.discountAmountCents = "Sabit indirim tutarı 0'dan büyük olmalı.";

  const description = String(body.description ?? "").trim();
  if (description.length < 10) errors.description = "Açıklama en az 10 karakter olmalı.";

  const terms = String(body.terms ?? "").trim();
  if (terms.length < 20) errors.terms = "Kampanya koşulları en az 20 karakter olmalı (müşteriye gösterilir).";

  const startsAt = body.startsAt ? new Date(String(body.startsAt)) : new Date();
  const endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
  if (Number.isNaN(startsAt.getTime())) errors.startsAt = "Geçersiz başlangıç tarihi.";
  if (endsAt && Number.isNaN(endsAt.getTime())) errors.endsAt = "Geçersiz bitiş tarihi.";
  if (endsAt && !Number.isNaN(endsAt.getTime()) && !Number.isNaN(startsAt.getTime()) && endsAt <= startsAt)
    errors.endsAt = "Bitiş tarihi başlangıçtan sonra olmalı.";

  // FAZ 12C-3 — kapsam: en az bir sipariş tipi (çoklu; eski tekli alanla geriye uyum).
  const rawModes =
    Array.isArray(body.serviceModes) && body.serviceModes.length
      ? body.serviceModes.map(String)
      : body.serviceMode
        ? [String(body.serviceMode)]
        : [];
  const modes = [...new Set(rawModes.flatMap((v) => (v === "ALL" ? [...ORDER_MODES] : (ORDER_MODES as readonly string[]).includes(v) ? [v] : [])))];
  if (!modes.length)
    errors.serviceModes = "Kapsam seç: gel-al, rezerve ve/veya paket servis (en az biri işaretli olmalı).";

  // Ödeme kapsamı: alan yoksa varsayılan her ikisidir (mevcut davranış).
  const rawPay = Array.isArray(body.paymentScope) && body.paymentScope.length ? body.paymentScope.map(String) : [...PAYMENT_MODES];
  const paymentScope = [...new Set(rawPay.filter((v) => (PAYMENT_MODES as readonly string[]).includes(v)))];
  if (!paymentScope.length)
    errors.paymentScope = "Ödeme kapsamı seç: kapıda/iş yerinde nakit ve/veya kart (en az biri).";

  // İSTEK (d): görsel olmadan yayınlama YOK — istemcide ve sunucuda aynı kural.
  const hasImage = Boolean(String(body.imageUrl ?? "").trim()) || Boolean(opts.existingImageUrl);
  if (body.publish === true && !hasImage)
    errors.imageUrl = "Yayınlamak için kampanya görseli gerekli. Görsel yükle veya bağlantısını gir.";

  return errors;
}
