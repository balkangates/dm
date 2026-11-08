import Link from "next/link";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Button, Reveal } from "@/components/ds";
import { Icon } from "@/components/icons";
import HomeSearch from "@/components/HomeSearch";
import { ModeCards } from "@/components/ModeSwitch";
import {
  BusinessFlowPanel, BusinessHome, CustomerHome, FinancialBoundary, ModeTicker, type Brand,
} from "@/components/HomeModes";
import {
  ensureSeeded, listBusinesses, listCampaignCards, listCategories, listDistricts, listOffers, listVideos,
} from "@/lib/queries";
import { makeT } from "@/lib/i18n";
import { num } from "@/lib/money";
import { MODE_PARAM, resolveViewMode } from "@/lib/viewMode";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

/** ModeSwitch/ModeCards için sorgu dizesi: yalnızca ilk değerler, diğer parametreler korunur. */
function searchString(sp: SP): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string") p.set(k, first);
  }
  return p.toString();
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await ensureSeeded();
  const [user, locale] = await Promise.all([currentUser(), getLocale()]);

  // Öncelik: URL (?mod=) > oturum rolü > varsayılan müşteri.
  const mode = resolveViewMode({ param: sp[MODE_PARAM], role: user?.role });
  const isBusiness = mode === "isletme";

  const t = makeT(locale.lang);
  const session: SessionLite = user
    ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }
    : null;

  // Kampanya/işletme/fırsat verisi yalnızca müşteri modunda çekilir (işletme modunda kampanya listesi yoktur).
  const data = isBusiness
    ? null
    : await Promise.all([
        listCampaignCards({ limit: 24 }), listBusinesses(), listCategories(), listDistricts(), listOffers({ limit: 6 }), listVideos(),
      ]);
  const [campaigns, businesses, categories, districts, offers, videos] = data ?? [[], [], [], [], [], []];

  const brands = offers.reduce<Brand[]>((acc, o) => {
    const found = acc.find((b) => b.merchant === o.merchant);
    if (found) found.count += 1;
    else acc.push({ merchant: o.merchant, category: o.category, slug: o.slug, count: 1, image: o.imageUrl });
    return acc;
  }, []);
  const trending = [...campaigns].sort((a, b) => b.rating - a.rating).slice(0, 3);

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      {/* ------------------------------- HERO ------------------------------- */}
      <section className="relative overflow-hidden border-b border-line bg-ink text-white">
        <div className="grain absolute inset-0" />
        <div className="hero-grid absolute inset-0" />
        <div className="relative mx-auto max-w-[1280px] px-4 py-14 sm:px-6 lg:py-20">
          <div className="grid gap-12 lg:grid-cols-[1.08fr_0.92fr]">
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-surface/5 px-3 py-1.5 text-[0.74rem] font-semibold text-white/80">
                  <span className="pulse-ring h-1.5 w-1.5 rounded-full bg-accent" />
                  {t(isBusiness ? "hero.b.eyebrow" : "hero.eyebrow")}
                </span>
              </Reveal>

              <h1 className="mt-6 font-display text-[clamp(2.5rem,6.4vw,4.6rem)] font-extrabold leading-[0.98] tracking-[-0.04em]">
                <span className="line-mask"><span style={{ animationDelay: "40ms" }}>{t(isBusiness ? "hero.b.title1" : "hero.title1")}</span></span>
                <span className="line-mask"><span style={{ animationDelay: "150ms" }} className="text-accent">{t(isBusiness ? "hero.b.title2" : "hero.title2")}</span></span>
              </h1>

              <Reveal delay={180}>
                <p className="mt-6 max-w-[54ch] text-[1.02rem] leading-relaxed text-white/70">{t(isBusiness ? "hero.b.sub" : "hero.sub")}</p>
              </Reveal>

              {isBusiness ? null : (
                <>
                  <Reveal delay={260}>
                    <div id="kesfet" className="mt-8 scroll-mt-28">
                      <HomeSearch placeholder={t("hero.search")} districts={districts.map((d) => d.district)} categories={categories.map((c) => c.category)} />
                    </div>
                  </Reveal>

                  <Reveal delay={340}>
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <Button href="/kampanyalar" size="lg" iconRight={<Icon.arrowRight size={17} />}>{t("hero.cta1")}</Button>
                    </div>
                  </Reveal>

                  <Reveal delay={420}>
                  <dl className="mt-12 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-[4px] border border-white/15 bg-surface/10">
                    {[
                      [num(campaigns.length, locale.lang), "aktif kampanya"],
                      [num(businesses.length, locale.lang), "işletme & marka"],
                      [num(districts.length, locale.lang), "şehir / ilçe"],
                    ].map(([v, l]) => (
                      <div key={l} className="bg-ink px-4 py-4">
                        <dt className="tabular text-[1.5rem] font-semibold leading-none">{v}</dt>
                        <dd className="mt-1.5 text-[0.72rem] uppercase tracking-[0.12em] text-white/50">{l}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[0.74rem] text-white/45">Bu ortamda gösterilen işletme ve kampanyalar örnek/demo içeriktir.</p>
                </Reveal>
                </>
              )}
            </div>

            {isBusiness ? (
              <Reveal delay={200}><BusinessFlowPanel /></Reveal>
            ) : (
            <Reveal delay={200} className="relative hidden lg:block">
            <div className="relative mx-auto h-[430px] max-w-[430px]">
              {trending.map((c, i) => (
                <Link
                  key={c.id}
                  href={`/kampanya/${c.slug ?? c.code}`}
                  className="card hover-lift absolute w-[330px] overflow-hidden p-0"
                  style={{ top: i * 92, left: i * 34, transform: `rotate(${i === 1 ? 2.4 : i === 2 ? -1.8 : -3.2}deg)`, zIndex: 10 - i }}
                >
                  <div className="flex gap-3 p-3">
                    <img src={c.imageUrl ?? c.coverImage ?? "/images/magaza-ic.jpg"} alt="" className="h-20 w-20 shrink-0 rounded-[3px] object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-[0.74rem] font-semibold text-accent">{c.businessName}</p>
                      <p className="mt-0.5 line-clamp-2 font-display text-[0.95rem] font-bold leading-snug text-ink">{c.title}</p>
                      <p className="mt-1.5 text-[0.74rem] text-muted">{c.district} · min. sepet {c.minBasketCents / 100} {c.currency}</p>
                    </div>
                    <span className="tabular ml-auto shrink-0 self-start rounded-[3px] bg-accent px-2 py-1 text-[0.86rem] font-bold text-white">
                      %{c.discountPercent || 10}
                    </span>
                  </div>
                </Link>
              ))}
              <div className="card absolute bottom-0 right-0 w-[240px] p-4" style={{ transform: "rotate(1.6deg)" }}>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">QR ile mağazada</p>
                {/* Kart krem (--color-surface) zeminli; hero'daki text-white mirası kırılmazsa
                    metin beyaz üstünde beyaz kalır ve okunmaz — açık zeminde daima ink. */}
                <p className="mt-1.5 font-display text-[1rem] font-bold leading-snug text-ink">Okut, koşulları gör, indirimi işletme uygulasın.</p>
                <Link href="/qr" className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-accent">QR deneyimi <Icon.arrowRight size={14} /></Link>
              </div>
            </div>
          </Reveal>
            )}
          </div>

          <div className="mt-12">
            <ModeCards
              mode={mode}
              search={searchString(sp)}
              activeLabel={t("mode.active")}
              cards={{
                musteri: { title: t("card.c.title"), desc: t("card.c.desc"), icon: "👤" },
                isletme: { title: t("card.b.title"), desc: t("card.b.desc"), icon: "🏢" },
              }}
            />
          </div>
        </div>
      </section>

      <ModeTicker mode={mode} />

      {isBusiness ? (
        <BusinessHome />
      ) : (
        <CustomerHome
          lang={locale.lang}
          campaigns={campaigns}
          businesses={businesses}
          categories={categories}
          districts={districts}
          offers={offers}
          brands={brands}
          videos={videos}
        />
      )}

      <FinancialBoundary mode={mode} />
    </PublicShell>
  );
}
