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

/** İşletmenin saat dilimi (ülke koduna göre). Sunucunun/tarayıcının yerel saati KULLANILMAZ. */
export function businessZone(country?: string | null): string {
  switch ((country ?? "TR").toUpperCase()) {
    case "GE": return "Asia/Tbilisi";
    default: return "Europe/Istanbul";
  }
}

/** Verilen anın işletme saat dilimindeki günü (0 = Pazar) ve gün içi dakikası. */
export function zonedClock(now: Date, tz: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day: day < 0 ? now.getDay() : day, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

const toMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Açık mı? Kapanış dakikası KAPALI sayılır (23:00'te kapanan yer 23:00'te kapalıdır).
 *  Gece yarısını aşan vardiya (örn. 18:00–02:00) ertesi günün ilk saatlerinde de açık sayılır. */
export function isOpenAt(hours: HourRow[], now: Date, tz: string): boolean {
  const { day, minutes } = zonedClock(now, tz);
  const today = hours.find((h) => h.dayOfWeek === day);
  if (today && !today.closed) {
    const o = toMin(today.opensAt), c = toMin(today.closesAt);
    if (c > o ? minutes >= o && minutes < c : minutes >= o) return true; // c <= o: gece yarısını aşar
  }
  const prev = hours.find((h) => h.dayOfWeek === (day + 6) % 7);
  if (prev && !prev.closed) {
    const o = toMin(prev.opensAt), c = toMin(prev.closesAt);
    if (c <= o && minutes < c) return true; // dünkü vardiyanın gece taşan kısmı
  }
  return false;
}

export function isOpenNow(hours: HourRow[], now = new Date(), tz = businessZone()): boolean {
  return isOpenAt(hours, now, tz);
}

/** Bugünün satırı (işletme saat diliminde). */
export function todayHours<T extends { dayOfWeek: number }>(hours: T[], now = new Date(), tz = businessZone()): T | undefined {
  const { day } = zonedClock(now, tz);
  return hours.find((h) => h.dayOfWeek === day);
}

/** "HH:MM" (işletme saat diliminde bugün; geçtiyse yarın) → UTC ISO. */
export function zonedHmToIso(hm: string, tz: string, now = new Date()): string | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return undefined;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 23 || mm > 59) return undefined;
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); // YYYY-MM-DD
  const [Y, Mo, D] = ymd.split("-").map(Number);
  const at = (dayOffset: number) => {
    const guess = Date.UTC(Y, Mo - 1, D + dayOffset, hh, mm);
    // saat dilimi ofseti: aynı anın tz'deki duvar saati ile UTC farkı
    const z = zonedClock(new Date(guess), tz);
    const wantMin = hh * 60 + mm;
    let diff = wantMin - z.minutes;
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    return new Date(guess + diff * 60_000);
  };
  let d = at(0);
  if (d.getTime() < now.getTime() - 5 * 60_000) d = at(1);
  return d.toISOString();
}

/** Bir anın (örn. rezerve saati) o günkü çalışma saatleri içinde olup olmadığı. Satır yoksa true (engelleme). */
export function withinHoursAt(hours: HourRow[], at: Date, tz: string): boolean {
  if (!hours.length) return true;
  return isOpenAt(hours, at, tz);
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
