export const productTypeLabels = {
  original: "Orijinal",
  aftermarket: "Yan Sanayi",
  equivalent: "Muadil",
} as const;

export type OfferType = keyof typeof productTypeLabels;
export const validProductTypes: OfferType[] = ["original", "aftermarket", "equivalent"];
export function isOfferType(value: string): value is OfferType {
  return validProductTypes.includes(value as OfferType);
}

export function normalizeOem(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function slugify(value: string) {
  return value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 140);
}

export function cents(value: string | number) {
  const input = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(input)) throw new Error("Geçerli bir tutar girin.");
  const [whole, fraction = ""] = input.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Tutar çok büyük.");
  return result;
}

export function money(value: number) {
  return (value / 100).toFixed(2);
}

export function formatPrice(value: string | number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(Number(value));
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

export function externalUrl(value: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function field(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}
