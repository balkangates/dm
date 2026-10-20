import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Badge, Button, Card, Notice, SectionHead } from "@/components/ds";
import { Icon } from "@/components/icons";
import { CampaignCardView } from "@/components/discovery";
import VoiceAssistant from "@/components/voice";
import { ensureSeeded, getBusinessBySlug, trackEvent } from "@/lib/queries";
import { DAY_NAMES, isOpenNow, money, type Currency } from "@/lib/money";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const d = await getBusinessBySlug(slug);
  if (!d) return { title: "İşletme bulunamadı" };
  const b = d.biz;
  const title = `${b.name} — ${b.district} ${b.subCategory ?? b.category} · Kampanyalar`;
  return {
    title,
    description: `${b.name}, ${b.district} ${b.city}. ${b.description ?? ""} Aktif kampanyalar, ürünler, çalışma saatleri ve müşteri yorumları.`,
    keywords: [`${b.district} ${b.category}`, `${b.district} kampanya`, `${b.district} indirim`, b.name],
    alternates: { canonical: `/isletme/${b.slug}` },
  };
}

export default async function BusinessPage({ params }: P) {
  await ensureSeeded();
  const { slug } = await params;
  const d = await getBusinessBySlug(slug);
  if (!d) notFound();
  const [user, locale] = await Promise.all([currentUser(), getLocale()]);
  await trackEvent("business_view", { businessId: d.biz.id, userId: user?.id ?? null, meta: { slug } });

  const b = d.biz;
  const cur = (b.currency ?? "TRY") as Currency;
  const open = isOpenNow(d.hours);
  const today = d.hours.find((h) => h.dayOfWeek === new Date().getDay());
  const session: SessionLite = user ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode } : null;

  const jsonLd = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: b.name, description: b.description,
    image: b.coverImage, telephone: b.phone,
    address: { "@type": "PostalAddress", streetAddress: b.address, addressLocality: b.district, addressRegion: b.city, addressCountry: b.country },
    aggregateRating: b.reviewCount ? { "@type": "AggregateRating", ratingValue: b.rating, reviewCount: b.reviewCount } : undefined,
  };

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative border-b border-line">
        <div className="relative h-[300px] w-full overflow-hidden sm:h-[380px]">
          <img src={b.coverImage ?? "/images/magaza-ic.jpg"} alt={b.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-transparent" />
          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto max-w-[1280px] px-4 pb-7 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="positive">{b.verified ? "Doğrulanmış işletme" : "İşletme"}</Badge>
                <Badge tone="neutral">{b.subCategory ?? b.category}</Badge>
                <Badge tone={open ? "positive" : "neutral"}>{open ? "Şimdi açık" : "Kapalı"}</Badge>
                {b.featured ? <Badge tone="accent">Öne çıkan</Badge> : null}
              </div>
              <h1 className="mt-3 max-w-[20ch] font-display text-[clamp(2rem,5.4vw,3.6rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-white">{b.name}</h1>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.92rem] text-white/75">
                <span className="inline-flex items-center gap-1.5"><Icon.pin size={15} className="text-accent" />{b.district}, {b.city}</span>
                <span>★ {b.rating.toFixed(1)} ({b.reviewCount} değerlendirme)</span>
                {today ? <span className="tabular">Bugün {today.closed ? "kapalı" : `${today.opensAt}–${today.closesAt}`}</span> : null}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.55fr_1fr]">
          <div>
            <SectionHead eyebrow="Aktif kampanyalar" title="Bu işletmenin fırsatları"
              desc="İndirim, koşullar sağlandığında işletme tarafından kasada uygulanır. DampingVar ödeme almaz." />
            {d.campaigns.length ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {d.campaigns.map((c) => <CampaignCardView key={c.id} c={c} lang={locale.lang} />)}
              </div>
            ) : <Notice tone="neutral">Şu an aktif kampanya yok.</Notice>}

            {d.products.length ? (
              <div className="mt-12">
                <SectionHead eyebrow="Ürünler" title="Öne çıkanlar" />
                <div className="card divide-y divide-line-soft p-0">
                  {d.products.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-[220px] flex-1">
                        <p className="font-display text-[1rem] font-bold">{p.name}</p>
                        <p className="mt-1 text-[0.85rem] text-muted">{p.description}</p>
                      </div>
                      <div className="text-right">
                        {p.discountPriceCents ? <p className="tabular text-[0.8rem] text-muted line-through">{money(p.priceCents, cur, locale.lang)}</p> : null}
                        <p className="tabular text-[1.1rem] font-semibold">{money(p.discountPriceCents ?? p.priceCents, cur, locale.lang)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {d.media.length ? (
              <div className="mt-12">
                <SectionHead eyebrow="Galeri" title="İşletmeden kareler" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {d.media.map((mm) => (
                    <figure key={mm.id} className="group relative aspect-[4/3] overflow-hidden rounded-[4px] border border-line">
                      <img src={mm.url ?? "/images/magaza-ic.jpg"} alt={mm.caption ?? b.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent px-3 py-2 text-[0.76rem] text-white">{mm.caption}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-12">
              <SectionHead eyebrow="Müşteri yorumları" title={`${b.reviewCount} değerlendirme`} />
              <div className="space-y-4">
                {d.reviews.map((r) => (
                  <Card key={r.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display text-[0.98rem] font-bold">{r.authorName}</p>
                      <span className="tabular text-[0.82rem] text-accent">★ {r.rating}.0</span>
                    </div>
                    <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">{r.comment}</p>
                  </Card>
                ))}
              </div>
            </div>

            <div className="mt-10 rounded-[4px] border border-line bg-surface p-5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-accent">{b.district} rehberi</p>
              <p className="mt-2.5 max-w-[86ch] text-[0.9rem] leading-relaxed text-muted">
                <strong className="text-ink">{b.name}</strong>, {b.district} bölgesinde {b.subCategory ?? b.category} arayan
                müşteriler için DampingVar&apos;da listelenir. {b.district} kampanyaları ve {b.district} indirimleri bu sayfada
                gerçek işletme verilerinden oluşur. {b.description}
              </p>
              {b.story ? <p className="mt-3 max-w-[86ch] text-[0.9rem] leading-relaxed text-muted">{b.story}</p> : null}
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">İletişim</p>
              <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-700">{b.address}</p>
              <div className="mt-4 grid gap-2">
                <Button href={`tel:${b.phone ?? ""}`} icon={<Icon.store size={15} />}>Ara</Button>
                <Button href={`https://wa.me/${b.whatsapp ?? ""}`} variant="secondary" icon={<Icon.share size={15} />}>WhatsApp</Button>
                <Button href={`https://maps.google.com/?q=${encodeURIComponent(`${b.name} ${b.address}`)}`} variant="secondary" icon={<Icon.pin size={15} />}>Yol tarifi</Button>
              </div>
              <div className="mt-5 border-t border-line-soft pt-4">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Çalışma saatleri</p>
                <ul className="mt-2 space-y-1.5">
                  {d.hours.map((h) => (
                    <li key={h.id} className={`flex items-center justify-between text-[0.84rem] ${h.dayOfWeek === new Date().getDay() ? "font-semibold text-accent" : "text-muted"}`}>
                      <span>{DAY_NAMES.tr[h.dayOfWeek]}</span>
                      <span className="tabular">{h.closed ? "Kapalı" : `${h.opensAt}–${h.closesAt}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {(b.website || b.instagram) && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line-soft pt-4 text-[0.84rem]">
                  {b.website ? <Link href={`https://${b.website}`} className="link-sweep text-accent">{b.website}</Link> : null}
                  {b.instagram ? <Link href={`https://instagram.com/${b.instagram}`} className="link-sweep text-accent">@{b.instagram}</Link> : null}
                </div>
              )}
            </Card>
            <Card className="mt-5">
              <p className="font-display text-[1rem] font-bold">Bu işletme senin mi?</p>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted">
                Kampanyalarını yönet, QR ile mağaza trafiğini ölç ve AI pazarlama hizmetlerini kullan.
              </p>
              <Button href="/panel" variant="secondary" size="sm" className="mt-4" icon={<Icon.chart size={14} />}>İşletme paneli</Button>
            </Card>
          </aside>
        </div>
      </div>

      {/* FAZ 12A — Ücretsiz Sesli Asistan (tarayıcı Web Speech API; anahtarsız). */}
      <VoiceAssistant
        business={{ id: b.id, name: b.name, district: b.district }}
        products={d.products.filter((p) => p.active).map((p) => ({ name: p.name, priceCents: p.priceCents, discountPriceCents: p.discountPriceCents }))}
        campaigns={d.campaigns.map((c) => ({ title: c.title, discountPercent: c.discountPercent, discountAmountCents: c.discountAmountCents, endsAt: c.endsAt ? String(c.endsAt) : null }))}
        user={user ? { name: user.name } : null}
      />
    </PublicShell>
  );
}
