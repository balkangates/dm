export type Currency = "TRY" | "USD" | "GEL" | "EUR";
export type Lang = "tr" | "en" | "ka";

export const CURRENCIES: { code: Currency; symbol: string; label: string }[] = [
  { code: "TRY", symbol: "₺", label: "Türk Lirası" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "GEL", symbol: "₾", label: "Georgian Lari" },
  { code: "EUR", symbol: "€", label: "Euro" },
];

const LOCALE_MAP: Record<Lang, string> = { tr: "tr-TR", en: "en-US", ka: "ka-GE" };

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && ["TRY", "USD", "GEL", "EUR"].includes(v);
}

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && ["tr", "en", "ka"].includes(v);
}

/**
 * Kuruş -> yerel biçimli para. Para birimi HER ZAMAN açıktır.
 * DampingVar kur dönüşümü yapmaz: kampanya hangi para biriminde tanımlandıysa o gösterilir.
 */
export function money(cents: number | null | undefined, currency: Currency = "TRY", lang: Lang = "tr"): string {
  const value = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(LOCALE_MAP[lang] ?? "tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "TRY" || currency === "GEL" ? 2 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Sembol olmadan, tabular gösterim için */
export function amount(cents: number | null | undefined, lang: Lang = "tr"): string {
  return new Intl.NumberFormat(LOCALE_MAP[lang] ?? "tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents ?? 0) / 100);
}

export function num(n: number | null | undefined, lang: Lang = "tr"): string {
  return new Intl.NumberFormat(LOCALE_MAP[lang] ?? "tr-TR").format(Math.round(n ?? 0));
}

export function pct(rate: number | null | undefined, digits = 0, lang: Lang = "tr"): string {
  const v = (rate ?? 0) * 100;
  return `${lang === "en" ? "" : "%"}${v.toFixed(digits).replace(".", lang === "tr" || lang === "ka" ? "," : ".")}${lang === "en" ? "%" : ""}`;
}

export function shortDate(d: Date | string, lang: Lang = "tr"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE_MAP[lang] ?? "tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function dateTime(d: Date | string, lang: Lang = "tr"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE_MAP[lang] ?? "tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relative(d: Date | string, lang: Lang = "tr"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const rtf = new Intl.RelativeTimeFormat(LOCALE_MAP[lang] ?? "tr-TR", { numeric: "auto" });
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(-days, "day");
}

export function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

export const DAY_NAMES: Record<Lang, string[]> = {
  tr: ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ka: ["კვირა", "ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი"],
};

export type HourRow = { dayOfWeek: number; opensAt: string; closesAt: string; closed: boolean };

export function isOpenNow(hours: HourRow[], now = new Date()): boolean {
  const row = hours.find((h) => h.dayOfWeek === now.getDay());
  if (!row || row.closed) return false;
  const [oh, om] = row.opensAt.split(":").map(Number);
  const [ch, cm] = row.closesAt.split(":").map(Number);
  const open = oh * 60 + om;
  let close = ch * 60 + cm;
  if (close <= open) close += 24 * 60;
  const mins = now.getHours() * 60 + now.getMinutes();
  const m = mins < open ? mins + 24 * 60 : mins;
  return m >= open && m <= close;
}

export function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
    ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i",
    კ: "k", ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "zh", რ: "r", ს: "s",
    ტ: "t", უ: "u", ფ: "f", ქ: "q", ღ: "gh", ყ: "y", შ: "sh", ჩ: "ch", ც: "ts",
    ძ: "dz", წ: "ts", ჭ: "ch", ხ: "kh", ჯ: "j", ჰ: "h",
  };
  return input
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
