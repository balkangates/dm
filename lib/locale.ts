import { cookies } from "next/headers";
import { isCurrency, isLang, type Currency, type Lang } from "@/lib/money";
import { COUNTRIES } from "@/lib/i18n";

export const LANG_COOKIE = "dv_lang";
export const CURRENCY_COOKIE = "dv_currency";
export const COUNTRY_COOKIE = "dv_country";

export type Locale = { lang: Lang; currency: Currency; country: string };

export const DEFAULT_LOCALE: Locale = { lang: "tr", currency: "TRY", country: "TR" };

/** Ülke, dil, konum ve para birimi AYRI ayarlardır. */
export async function getLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const lang = store.get(LANG_COOKIE)?.value;
    const currency = store.get(CURRENCY_COOKIE)?.value;
    const country = store.get(COUNTRY_COOKIE)?.value;
    return {
      lang: isLang(lang) ? lang : DEFAULT_LOCALE.lang,
      currency: isCurrency(currency) ? currency : DEFAULT_LOCALE.currency,
      country: COUNTRIES.some((c) => c.code === country) ? (country as string) : DEFAULT_LOCALE.country,
    };
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function localeCookieOptions() {
  return {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
