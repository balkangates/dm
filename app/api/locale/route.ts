import { cookies } from "next/headers";
import { COUNTRIES } from "@/lib/i18n";
import { isCurrency, isLang } from "@/lib/money";
import { COUNTRY_COOKIE, CURRENCY_COOKIE, LANG_COOKIE, localeCookieOptions } from "@/lib/locale";
import { currentUser } from "@/lib/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Ülke, dil ve para birimi AYRI ayarlardır; hiçbiri diğerini değiştirmez. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const store = await cookies();
  const opts = localeCookieOptions();
  const changed: Record<string, string> = {};

  if (isLang(body.lang)) {
    store.set(LANG_COOKIE, body.lang, opts);
    changed.lang = body.lang;
  }
  if (isCurrency(body.currency)) {
    store.set(CURRENCY_COOKIE, body.currency, opts);
    changed.currency = body.currency;
  }
  if (typeof body.country === "string" && COUNTRIES.some((c) => c.code === body.country)) {
    store.set(COUNTRY_COOKIE, body.country, opts);
    changed.country = body.country;
  }

  // Giriş yapılmışsa tercihler hesapta da saklanır
  const user = await currentUser();
  if (user && Object.keys(changed).length) {
    await db
      .update(users)
      .set({
        lang: changed.lang ?? user.lang,
        currency: changed.currency ?? user.currency,
        country: changed.country ?? user.country,
      })
      .where(eq(users.id, user.id));
  }

  return Response.json({ ok: true, changed });
}
