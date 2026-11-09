/**
 * Affiliate yardımcıları — sunucu ve istemci ortak (saf fonksiyonlar, I/O yok).
 *
 *  * buildOutboundUrl: tracking_url şablonundan çıkış bağlantısını üretir.
 *  * validateOfferInput / validateNetworkInput: admin formunun sunucu doğrulaması.
 *  * videoEmbed: YouTube/Vimeo/doğrudan video bağlantısını güvenli gömme şekline çevirir.
 *
 * Güvenlik: yalnızca http(s) şemaları kabul edilir (javascript:, data: reddedilir).
 */

export const INTEGRATION_TYPES = ["NETWORK", "DIRECT_BRAND", "REFERRAL"] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

export const INTEGRATION_LABEL: Record<IntegrationType, string> = {
  NETWORK: "Affiliate ağı (iadeal vb. platform)",
  DIRECT_BRAND: "Doğrudan marka sitesi",
  REFERRAL: "Referral / partner bağlantısı",
};

export const NETWORK_KINDS = ["PLATFORM", "DIRECT_BRAND"] as const;
export const REPORTING_METHODS = ["API", "POSTBACK", "CSV", "MANUAL"] as const;
export const COMMISSION_MODELS = ["CPS", "CPA", "CPL", "HYBRID"] as const;
export const CURRENCIES = ["TRY", "USD", "GEL", "EUR"] as const;

export const PLACEHOLDERS = ["{click_id}", "{user_id}", "{offer_id}", "{url}"] as const;

const PARAM_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function slugifyTr(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type OutboundInput = {
  destinationUrl: string;
  trackingUrl?: string | null;
  clickParam?: string | null;       // fırsat düzeyi
  networkClickParam?: string | null; // ağ düzeyi (varsayılan)
  clickId: string;
  userId?: string | null;
  offerId: string;
};

/**
 * Çıkış bağlantısı:
 *  1) tracking_url varsa şablon olarak kullanılır; {click_id} {user_id} {offer_id}
 *     {url} (kodlanmış hedef) yer tutucuları doldurulur. Hiç {click_id} yoksa
 *     click_param ile sorgu parametresi olarak eklenir.
 *  2) tracking_url yoksa destination_url'e click_param=click_id eklenir.
 * Kullanıcı kimliği yalnızca şablonda AÇIKÇA {user_id} varsa gönderilir.
 */
export function buildOutboundUrl(i: OutboundInput): string {
  const param = [i.clickParam, i.networkClickParam].find((p) => p && PARAM_RE.test(p)) ?? "subid";
  const enc = encodeURIComponent;
  const base = (i.trackingUrl && i.trackingUrl.trim()) || i.destinationUrl;
  const hasClickPlaceholder = base.includes("{click_id}");

  let out = base
    .replaceAll("{click_id}", enc(i.clickId))
    .replaceAll("{offer_id}", enc(i.offerId))
    .replaceAll("{user_id}", enc(i.userId ?? ""))
    .replaceAll("{url}", enc(i.destinationUrl));

  if (!hasClickPlaceholder) {
    try {
      const u = new URL(out);
      u.searchParams.set(param, i.clickId);
      out = u.toString();
    } catch {
      /* geçersiz şablon: doğrulamada zaten reddedilir */
    }
  }
  return out;
}

export type VideoEmbed =
  | { kind: "iframe"; src: string; provider: "youtube" | "vimeo" }
  | { kind: "file"; src: string }
  | null;

export function videoEmbed(url: string | null | undefined): VideoEmbed {
  if (!url || !isHttpUrl(url)) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return /^[\w-]{6,20}$/.test(id) ? { kind: "iframe", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : "");
      return id && /^[\w-]{6,20}$/.test(id) ? { kind: "iframe", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^\d+$/.test(id) ? { kind: "iframe", provider: "vimeo", src: `https://player.vimeo.com/video/${id}` } : null;
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { kind: "file", src: url };
  } catch {
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Doğrulama
 * ------------------------------------------------------------------ */

type Raw = Record<string, unknown>;
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const sn = (v: unknown, max: number) => { const x = s(v, max); return x === "" ? null : x; };

export type OfferInput = {
  merchant: string;
  brand: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  category: string;
  country: string;
  networkId: string | null;
  integrationType: IntegrationType;
  destinationUrl: string;
  trackingUrl: string | null;
  clickParam: string | null;
  currency: (typeof CURRENCIES)[number];
  priceCents: number | null;
  priceVerified: boolean;
  commissionTerms: string | null;
  commissionRatePercent: number | null;
  commissionFixedCents: number | null;
  cookieDays: number | null;
  disclosure: string;
  terms: string | null;
  exclusions: string[];
  startsAt: string | null;
  endsAt: string | null;
  isSponsored: boolean;
  status: "ACTIVE" | "PAUSED" | "EXPIRED";
};

export const DEFAULT_DISCLOSURE =
  "Bu bağlantı üzerinden gerçekleşen uygun alışverişlerden DampingVar komisyon kazanabilir. Fiyat ve stok satıcının sitesinde geçerlidir.";

function numOrNull(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  return Math.min(max, Math.max(min, x));
}

function dateOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Hata varsa Türkçe mesaj döner; yoksa temiz OfferInput. */
export function validateOfferInput(raw: Raw): { ok: true; value: OfferInput } | { ok: false; error: string } {
  const merchant = s(raw.merchant, 120);
  const title = s(raw.title, 200);
  if (merchant.length < 2) return { ok: false, error: "Satıcı adı zorunlu." };
  if (title.length < 3) return { ok: false, error: "Fırsat başlığı en az 3 karakter olmalı." };

  const destinationUrl = s(raw.destinationUrl, 2000);
  if (!isHttpUrl(destinationUrl)) return { ok: false, error: "Hedef URL geçerli bir http(s) adresi olmalı." };

  const trackingUrl = sn(raw.trackingUrl, 2000);
  if (trackingUrl) {
    // Şablondaki yer tutucular doldurulduktan sonra da geçerli URL olmalı.
    const probe = trackingUrl.replaceAll("{click_id}", "x").replaceAll("{user_id}", "x").replaceAll("{offer_id}", "x").replaceAll("{url}", "x");
    if (!isHttpUrl(probe)) return { ok: false, error: "Referral/entegrasyon bağlantısı geçerli bir http(s) adresi olmalı." };
  }

  const imageUrl = sn(raw.imageUrl, 2000);
  if (imageUrl && !isHttpUrl(imageUrl)) return { ok: false, error: "Görsel adresi geçersiz." };
  const videoUrl = sn(raw.videoUrl, 2000);
  if (videoUrl && !isHttpUrl(videoUrl)) return { ok: false, error: "Video adresi geçersiz." };

  const clickParam = sn(raw.clickParam, 32);
  if (clickParam && !PARAM_RE.test(clickParam)) return { ok: false, error: "Tıklama parametre adı yalnızca harf, rakam, _ ve - içerebilir." };

  const country = s(raw.country, 2).toUpperCase() || "TR";
  if (country.length !== 2) return { ok: false, error: "Ülke 2 harfli kod olmalı (örn. TR)." };

  const currency = (CURRENCIES as readonly string[]).includes(String(raw.currency)) ? (String(raw.currency) as OfferInput["currency"]) : "TRY";
  const integrationType = (INTEGRATION_TYPES as readonly string[]).includes(String(raw.integrationType))
    ? (String(raw.integrationType) as IntegrationType)
    : "NETWORK";

  const startsAt = dateOrNull(raw.startsAt);
  const endsAt = dateOrNull(raw.endsAt);
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) return { ok: false, error: "Bitiş tarihi başlangıçtan önce olamaz." };

  const priceCents = numOrNull(raw.priceCents, 0, 2_000_000_000);
  const priceVerified = Boolean(raw.priceVerified) && priceCents !== null;

  const exclusions = Array.isArray(raw.exclusions)
    ? raw.exclusions.map((x) => s(x, 160)).filter(Boolean).slice(0, 20)
    : typeof raw.exclusions === "string"
      ? raw.exclusions.split("\n").map((x) => x.trim().slice(0, 160)).filter(Boolean).slice(0, 20)
      : [];

  const status = ["ACTIVE", "PAUSED", "EXPIRED"].includes(String(raw.status)) ? (String(raw.status) as OfferInput["status"]) : "ACTIVE";

  return {
    ok: true,
    value: {
      merchant,
      brand: s(raw.brand, 120) || merchant,
      title,
      description: sn(raw.description, 1200),
      imageUrl,
      videoUrl,
      category: s(raw.category, 60).toLocaleLowerCase("tr-TR") || "genel",
      country,
      networkId: sn(raw.networkId, 64),
      integrationType,
      destinationUrl,
      trackingUrl,
      clickParam,
      currency,
      priceCents: priceCents === null ? null : Math.round(priceCents),
      priceVerified,
      commissionTerms: sn(raw.commissionTerms, 400),
      commissionRatePercent: numOrNull(raw.commissionRatePercent, 0, 100),
      commissionFixedCents: (() => { const x = numOrNull(raw.commissionFixedCents, 0, 2_000_000_000); return x === null ? null : Math.round(x); })(),
      cookieDays: (() => { const x = numOrNull(raw.cookieDays, 0, 365); return x === null ? null : Math.round(x); })(),
      disclosure: s(raw.disclosure, 600) || DEFAULT_DISCLOSURE,
      terms: sn(raw.terms, 1200),
      exclusions,
      startsAt,
      endsAt,
      isSponsored: Boolean(raw.isSponsored),
      status,
    },
  };
}

export type NetworkInput = {
  name: string;
  kind: "PLATFORM" | "DIRECT_BRAND";
  reportingMethod: (typeof REPORTING_METHODS)[number] | null;
  commissionModel: (typeof COMMISSION_MODELS)[number] | null;
  baseUrl: string | null;
  clickParam: string;
  defaultCookieDays: number | null;
  notes: string | null;
};

export function validateNetworkInput(raw: Raw): { ok: true; value: NetworkInput } | { ok: false; error: string } {
  const name = s(raw.name, 120);
  if (name.length < 2) return { ok: false, error: "Ağ / marka adı zorunlu." };
  const baseUrl = sn(raw.baseUrl, 500);
  if (baseUrl && !isHttpUrl(baseUrl)) return { ok: false, error: "Panel/site adresi geçerli bir http(s) adresi olmalı." };
  const clickParam = s(raw.clickParam, 32) || "subid";
  if (!PARAM_RE.test(clickParam)) return { ok: false, error: "Tıklama parametre adı yalnızca harf, rakam, _ ve - içerebilir." };
  const rm = String(raw.reportingMethod ?? "");
  const cm = String(raw.commissionModel ?? "");
  const cookie = numOrNull(raw.defaultCookieDays, 0, 365);
  return {
    ok: true,
    value: {
      name,
      kind: raw.kind === "DIRECT_BRAND" ? "DIRECT_BRAND" : "PLATFORM",
      reportingMethod: (REPORTING_METHODS as readonly string[]).includes(rm) ? (rm as NetworkInput["reportingMethod"]) : null,
      commissionModel: (COMMISSION_MODELS as readonly string[]).includes(cm) ? (cm as NetworkInput["commissionModel"]) : null,
      baseUrl,
      clickParam,
      defaultCookieDays: cookie === null ? null : Math.round(cookie),
      notes: sn(raw.notes, 500),
    },
  };
}
