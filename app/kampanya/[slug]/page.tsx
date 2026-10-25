import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Badge, Button, Card, Notice, QrPanel, SectionHead } from "@/components/ds";
import { Icon } from "@/components/icons";
import { CampaignActions } from "@/components/CampaignActions";
import { CampaignCardView } from "@/components/discovery";
import { ensureSeeded, getCampaignBySlug, trackEvent } from "@/lib/queries";
import { businessZone, DAY_NAMES, daysUntil, isOpenNow, money, shortDate, todayHours, type Currency } from "@/lib/money";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const d = await getCampaignBySlug(slug);
  if (!d) return { title: "Kampanya bulunamadı" };
  const title = `${d.card.title} — ${d.card.businessName} ${d.card.district}`;
  return {
    title,
    description: `${d.card.description ?? ""} Minimum sepet ${(d.card.minBasketCents / 100).toLocaleString("tr-TR")} ${d.card.currency}. ${d.card.endsAt ? `${shortDate(d.card.endsAt)} tarihine kadar geçerli.` : ""}`,
    alternates: { canonical: `/kampanya/${d.card.slug ?? d.card.code}` },
    keywords: [`${d.card.district} kampanya`, `${d.card.district} indirim`, d.card.businessName, d.card.category],
  };
}

export default async function CampaignDetail({ params }: P) {
  await ensureSeeded();
  const { slug } = await params;
  const d = await getCampaignBySlug(slug);
  if (!d || !d.campaign) notFound();
  const [user, locale] = await Promise.all([currentUser(), getLocale()]);
  await trackEvent("campaign_view", { businessId: d.card.businessId, campaignId: d.card.id, userId: user?.id ?? null });

  const c = d.campaign;
  const cur = (c.currency ?? "TRY") as Currency;
  const left = daysUntil(c.endsAt);
  const tz = businessZone(d.business?.country);
  const open = isOpenNow(d.hours, new Date(), tz);
  const todayRow = todayHours(d.hours, new Date(), tz);
  const session: SessionLite = user
    ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Offer",
    name: c.title,
    description: c.description,
    url: `/kampanya/${c.slug ?? c.code}`,
    priceCurrency: cur,
    validThrough: c.endsAt ? new Date(c.endsAt).toISOString() : undefined,
    offeredBy: {
      "@type": "LocalBusiness",
      name: d.business?.name,
      address: { "@type": "PostalAddress", streetAddress: d.business?.address, addressLocality: d.business?.district, addressRegion: d.business?.city, addressCountry: d.business?.country ?? "TR" },
      telephone: d.business?.phone,
    },
  };

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <nav className="mb-5 flex items-center gap-2 text-[0.8rem] text-muted">
          <Link href="/" className="hover:text-accent">Ana sayfa</Link><Icon.chevronRight size={13} />
          <Link href="/kampanyalar" className="hover:text-accent">Kampanyalar</Link><Icon.chevronRight size={13} />
          <Link href={`/isletme/${d.card.businessSlug}`} className="hover:text-accent">{d.card.businessName}</Link>
          <Icon.chevronRight size={13} /><span className="truncate text-ink">{c.title}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          {/* SOL */}
          <div>
            <div className="card overflow-hidden p-0">
              <div className="relative h-[280px] sm:h-[380px]">
                <img src={c.imageUrl ?? d.business?.coverImage ?? "/images/magaza-ic.jpg"} alt={c.title} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent" />
                <div className="absolute left-5 top-5 flex flex-col items-start gap-2">
                  {c.isSponsored ? <Badge tone="neutral" className="!bg-surface/95">Sponsorlu</Badge> : null}
                  {left !== null && left >= 0 && left <= 5 ? <Badge tone="warning">{left} gün kaldı</Badge> : null}
                </div>
                <div className="absolute inset-x-5 bottom-5">
                  <span className="inline-block rounded-[3px] bg-accent px-4 py-2.5 font-display text-[1.6rem] font-extrabold leading-none text-white">
                    {c.discountPercent > 0 ? `%${c.discountPercent} İndirim` : `${money(c.discountAmountCents, cur, locale.lang)} indirim`}
                  </span>
                </div>
              </div>

              <div className="p-6">
                <Link href={`/isletme/${d.card.businessSlug}`} className="group inline-flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[3px] bg-ink font-display text-[0.82rem] font-bold text-white">
                    {(d.business?.logoText ?? d.card.businessName.slice(0, 2)).slice(0, 3)}
                  </span>
                  <span>
                    <span className="block font-display text-[1rem] font-bold group-hover:text-accent">{d.card.businessName}</span>
                    <span className="block text-[0.82rem] text-muted">{d.card.district}, {d.card.city} · ★ {d.card.rating.toFixed(1)} ({d.card.reviewCount})</span>
                  </span>
                </Link>

                <h1 className="mt-5 font-display text-[clamp(1.6rem,3.4vw,2.3rem)] font-extrabold leading-tight tracking-[-0.03em]">{c.title}</h1>
                <p className="mt-3 max-w-[76ch] text-[0.98rem] leading-relaxed text-ink-500">{c.description}</p>

                <dl className="mt-6 grid gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-3">
                  {[
                    ["Minimum sepet", c.minBasketCents ? money(c.minBasketCents, cur, locale.lang) : "Yok"],
                    ["Başlangıç", c.startsAt ? shortDate(c.startsAt, locale.lang) : "—"],
                    ["Bitiş", c.endsAt ? shortDate(c.endsAt, locale.lang) : "Süresiz"],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-surface px-4 py-3.5">
                      <dt className="text-[0.72rem] uppercase tracking-[0.1em] text-muted">{k}</dt>
                      <dd className="tabular mt-1 text-[1rem] font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-positive">Geçerli ürün / hizmetler</p>
                    <ul className="mt-2.5 space-y-1.5">
                      {((c.eligibleItems ?? []) as string[]).length ? (c.eligibleItems as string[]).map((x) => (
                        <li key={x} className="flex gap-2 text-[0.88rem] text-ink-700"><Icon.check size={14} className="mt-0.5 shrink-0 text-positive" />{x}</li>
                      )) : <li className="text-[0.88rem] text-muted">Tüm ürünlerde geçerli.</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-danger">Kampanya dışı</p>
                    <ul className="mt-2.5 space-y-1.5">
                      {((c.exclusions ?? []) as string[]).length ? (c.exclusions as string[]).map((x) => (
                        <li key={x} className="flex gap-2 text-[0.88rem] text-ink-700"><Icon.x size={14} className="mt-0.5 shrink-0 text-danger" />{x}</li>
                      )) : <li className="text-[0.88rem] text-muted">İstisna belirtilmedi.</li>}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 rounded-[4px] border border-line bg-canvas p-5">
                  <p className="text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-ink">Kampanya koşulları</p>
                  <p className="mt-2 whitespace-pre-line text-[0.9rem] leading-relaxed text-ink-700">{c.terms ?? "Koşul metni eklenmemiş."}</p>
                  <ul className="mt-4 grid gap-2 text-[0.84rem] text-muted sm:grid-cols-2">
                    {c.timeStart ? <li>Saat: <strong className="tabular text-ink">{c.timeStart}–{c.timeEnd}</strong></li> : null}
                    {((c.days ?? []) as number[]).length ? <li>Günler: <strong className="text-ink">{(c.days as number[]).map((x) => DAY_NAMES.tr[x]).join(", ")}</strong></li> : null}
                    <li>Müşteri başına: <strong className="tabular text-ink">{c.perCustomerLimit} kullanım</strong></li>
                    <li>Toplam limit: <strong className="tabular text-ink">{c.usageLimit ?? "sınırsız"}</strong></li>
                  </ul>
                </div>

                <Notice tone="info" icon={<Icon.info size={16} />} className="mt-5">
                  QR okutulması tek başına alışverişin gerçekleştiğini kanıtlamaz. İndirim, kampanya koşulları
                  sağlandığında <strong>işletme tarafından</strong> kasada uygulanır. Ödeme doğrudan işletmeye yapılır;
                  DampingVar ödeme almaz.
                </Notice>

                <div className="mt-6">
                  <CampaignActions
                    campaignId={c.id}
                    businessId={d.card.businessId}
                    businessSlug={d.card.businessSlug}
                    code={c.code}
                    qrCode={d.qrCode}
                    lang={locale.lang}
                    userId={user?.id ?? null}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SAĞ — yapışkan panel */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Mağazada kullan</p>
              <div className="mt-4 flex justify-center">
                <QrPanel value={d.qrCode ?? `QR-${c.code}`} caption={d.qrCode ?? c.code} size={182} />
              </div>
              <p className="mt-4 text-[0.82rem] leading-relaxed text-muted">
                Bu QR&apos;ı mağazada okut veya kampanya kodunu kasada söyle. Okutma kaydı tutulur; doğrulanmış kullanım
                işletme onayıyla oluşur.
              </p>
              <div className="mt-4 grid gap-2">
                <Button href={`/qr?kod=${encodeURIComponent(d.qrCode ?? c.code)}`} icon={<Icon.qr size={16} />}>QR akışını aç</Button>
                <Button href={`/isletme/${d.card.businessSlug}`} variant="secondary" icon={<Icon.store size={16} />}>İşletmeye git</Button>
              </div>
            </Card>

            <Card className="mt-5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Mağaza bilgileri</p>
              <p className="mt-2 font-display text-[1rem] font-bold">{d.business?.name}</p>
              <p className="mt-1 text-[0.86rem] leading-relaxed text-muted">{d.business?.address}</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge tone={open ? "positive" : "neutral"}>{open ? "Şimdi açık" : "Kapalı"}</Badge>
                <span className="tabular text-[0.8rem] text-muted">{todayRow?.opensAt}–{todayRow?.closesAt}</span>
              </div>
              <div className="mt-4 grid gap-2">
                <Button href={`tel:${d.business?.phone ?? ""}`} variant="secondary" size="sm" icon={<Icon.store size={14} />}>Ara</Button>
                <Button href={`https://maps.google.com/?q=${encodeURIComponent(`${d.business?.name} ${d.business?.address}`)}`} variant="ghost" size="sm" icon={<Icon.pin size={14} />}>Yol tarifi</Button>
              </div>
            </Card>

            <Card className="mt-5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Bu kampanyanın etkinliği</p>
              <dl className="mt-3 space-y-2 text-[0.86rem]">
                <div className="flex justify-between"><dt className="text-muted">QR okutma</dt><dd className="tabular font-semibold">{d.usage.scanned}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Doğrulanmış kullanım</dt><dd className="tabular font-semibold text-positive">{d.usage.verified}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Gösterim</dt><dd className="tabular font-semibold">{c.views}</dd></div>
              </dl>
              <p className="mt-3 text-[0.74rem] leading-relaxed text-muted">Bu sayılar DampingVar tarafından toplanan olaylardır; işletmenin cirosu değildir.</p>
            </Card>
          </aside>
        </div>

        {d.related.length ? (
          <div className="mt-14">
            <SectionHead eyebrow="Benzer kampanyalar" title="İlgili fırsatlar" />
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {d.related.map((r) => <CampaignCardView key={r.id} c={r} lang={locale.lang} compact />)}
            </div>
          </div>
        ) : null}
      </div>
    </PublicShell>
  );
}
