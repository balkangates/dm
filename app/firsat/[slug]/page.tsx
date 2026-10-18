import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import {
  Badge, Button, Card, Journey, KeyValue, Notice, PaperHead, ReceiptShell, Stamp, ToastProvider,
} from "@/components/ds";
import { Icon } from "@/components/icons";
import { OfferCardView, OutboundCta } from "@/components/offers";
import { ensureSeeded, getOfferBySlug, trackEvent } from "@/lib/queries";
import { daysUntil, money, relative, shortDate, type Currency } from "@/lib/money";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const d = await getOfferBySlug(slug);
  if (!d) return { title: "Fırsat bulunamadı" };
  return {
    title: `${d.offer.title} — ${d.offer.merchant}`,
    description: d.offer.description ?? d.offer.title,
    alternates: { canonical: `/firsat/${d.offer.slug}` },
  };
}

export default async function OfferDetail({ params }: P) {
  await ensureSeeded();
  const { slug } = await params;
  const d = await getOfferBySlug(slug);
  if (!d) notFound();
  const [user, locale] = await Promise.all([currentUser(), getLocale()]);
  await trackEvent("affiliate_impression", { userId: user?.id ?? null, meta: { offerId: d.offer.id } });

  const o = d.offer;
  const cur = o.currency as Currency;
  const left = daysUntil(o.endsAt);
  const session: SessionLite = user
    ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }
    : null;

  const networkConnected = o.networkStatus === "CONNECTED";

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <nav className="mb-5 flex flex-wrap items-center gap-2 text-[0.8rem] text-muted">
          <Link href="/" className="hover:text-accent">Ana sayfa</Link>
          <Icon.chevronRight size={13} />
          <Link href="/online-firsatlar" className="hover:text-accent">Online fırsatlar</Link>
          <Icon.chevronRight size={13} />
          <span className="truncate text-ink">{o.title}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="card overflow-hidden p-0">
              <div className="relative h-[260px] sm:h-[360px]">
                <img src={o.imageUrl ?? "/images/magaza-ic.jpg"} alt={o.title} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
                <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                  {o.isSample ? <Stamp tone="warning">Örnek içerik</Stamp> : null}
                  {o.isSponsored ? <Stamp tone="ink">Sponsorlu</Stamp> : null}
                </div>
                <div className="absolute inset-x-4 bottom-4">
                  <p className="text-[0.74rem] font-bold uppercase tracking-[0.16em] text-surface/75">{o.merchant}</p>
                  <h1 className="mt-1.5 max-w-[24ch] font-display text-[clamp(1.6rem,4vw,2.6rem)] font-extrabold leading-[1.02] text-surface">
                    {o.title}
                  </h1>
                </div>
              </div>

              <div className="p-6">
                <p className="max-w-[78ch] text-[1rem] leading-relaxed text-ink-500">{o.description}</p>

                <div className="mt-6 grid gap-px overflow-hidden border-2 border-line bg-line sm:grid-cols-3">
                  {[
                    ["Fiyat", o.priceVerified && o.priceCents != null ? money(o.priceCents, cur, locale.lang) : "satıcı sitesinde"],
                    ["Para birimi", `${cur} (dönüştürülmez)`],
                    ["Geçerlilik", o.endsAt ? `${shortDate(o.endsAt, locale.lang)}${left !== null && left >= 0 ? ` · ${left} gün` : ""}` : "belirtilmemiş"],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-surface px-4 py-3.5">
                      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted">{k}</p>
                      <p className="tabular mt-1 text-[1rem] font-semibold text-ink">{v}</p>
                    </div>
                  ))}
                </div>

                {!o.priceVerified ? (
                  <Notice tone="neutral" icon={<Icon.info size={16} />} className="mt-4">
                    Fiyat DampingVar tarafından doğrulanmadığı için gösterilmiyor. Güncel fiyat ve stok bilgisi
                    satıcının kendi sitesinde geçerlidir.
                  </Notice>
                ) : null}

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-positive">Teklif kapsamı</p>
                    <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-700">{o.terms}</p>
                  </div>
                  <div>
                    <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-danger">Hariç olanlar</p>
                    <ul className="mt-2 space-y-1.5">
                      {(o.exclusions ?? []).length ? o.exclusions.map((x) => (
                        <li key={x} className="flex gap-2 text-[0.9rem] text-ink-700">
                          <Icon.x size={14} className="mt-0.5 shrink-0 text-danger" />{x}
                        </li>
                      )) : <li className="text-[0.9rem] text-muted">İstisna belirtilmemiş.</li>}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 border-2 border-accent bg-accent-soft/40 p-5">
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-accent-700">Affiliate ifşası</p>
                  <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-700">{o.disclosure}</p>
                </div>

                <div className="mt-6">
                  <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">Bu fırsatın akışı</p>
                  <Journey
                    steps={[
                      { label: "Fırsat görüntülendi", state: "done", note: "DampingVar'da listelendi" },
                      { label: "Bağlantıya tıklandı", state: "active", note: "İzlenen tıklama kaydı oluşur" },
                      { label: "Satıcıya yönlendirildi", state: "pending", note: "Çıkış onayından sonra" },
                      { label: "Ağ raporu bekleniyor", state: "pending", note: networkConnected ? "Ağ bağlı" : "Ağ bağlantısı kurulmadı" },
                      { label: "Komisyon durumu", state: "pending", note: "Yalnızca rapor gelirse güncellenir" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {d.related.length ? (
              <div className="mt-12">
                <PaperHead eyebrow="Benzer teklifler" title="İlgili online fırsatlar" />
                <div className="grid gap-5 sm:grid-cols-2">
                  {d.related.map((r) => <OfferCardView key={r.id} o={r} lang={locale.lang} />)}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <ToastProvider>
              <ReceiptShell>
                <div className="text-center">
                  <p className="font-display text-[1rem] font-extrabold uppercase tracking-[0.2em]">DampingVar</p>
                  <p className="mt-1 text-[0.62rem] uppercase tracking-[0.2em] text-muted">Online fırsat · yönlendirme fişi</p>
                </div>
                <div className="dashed-rule my-4" />
                <KeyValue
                  rows={[
                    ["Satıcı", o.merchant],
                    ["Kategori", o.category],
                    ["Ülke", o.country],
                    ["Fiyat", o.priceVerified && o.priceCents != null ? money(o.priceCents, cur, locale.lang) : "satıcıda"],
                    ["Son güncelleme", o.lastUpdated ? relative(o.lastUpdated, locale.lang) : "—"],
                    ["Ağ", `${o.networkName ?? "—"} · ${o.networkStatus ?? "NOT_CONNECTED"}`],
                  ]}
                />
                <div className="dashed-rule my-4" />
                <p className="text-center text-[0.66rem] leading-relaxed text-muted">
                  Bu bir DampingVar ödeme fişi değildir. Ödeme satıcıya yapılır.
                </p>
              </ReceiptShell>

              <div className="mt-5 space-y-2.5">
                <OutboundCta
                  offerId={o.id}
                  destinationUrl={o.destinationUrl}
                  merchant={o.merchant}
                  disclosure={o.disclosure}
                  lang={locale.lang}
                  label="Marka Mağazasına Git"
                />
                <Button href="/online-firsatlar" variant="secondary" className="w-full" icon={<Icon.layers size={15} />}>
                  Diğer fırsatlar
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  icon={<Icon.share size={15} />}
                  href={`/firsat/${o.slug}?paylas=1`}
                >
                  Bağlantıyı paylaş
                </Button>
              </div>

              {!networkConnected ? (
                <Card className="mt-5 border-warning/50 bg-warning-soft/40">
                  <p className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-warning">
                    <Icon.alert size={14} /> Ağ bağlantısı kurulmadı
                  </p>
                  <p className="mt-2 text-[0.84rem] leading-relaxed text-ink-700">
                    Bu teklif için affiliate ağı bağlı değil. Dönüşüm ve komisyon verisi canlı olarak alınamaz;
                    panelde kurulum durumu gösterilir, uydurma komisyon üretilmez.
                  </p>
                </Card>
              ) : null}

              <Card className="mt-5">
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">Etkinlik</p>
                <div className="mt-3 space-y-2 text-[0.86rem]">
                  <div className="flex justify-between"><span className="text-muted">Tıklama</span><span className="tabular font-semibold">{d.stats.clicks}</span></div>
                  {d.stats.conversions.map((c) => (
                    <div key={c.status} className="flex justify-between">
                      <span className="text-muted">Komisyon · {c.status}</span>
                      <span className="tabular font-semibold">{c.n}</span>
                    </div>
                  ))}
                  {d.stats.conversions.length === 0 ? (
                    <p className="text-[0.82rem] text-muted-2">Bu teklif için raporlanmış dönüşüm yok.</p>
                  ) : null}
                </div>
                <p className="mt-3 border-t-2 border-dashed border-line pt-3 text-[0.74rem] leading-relaxed text-muted">
                  Tıklama satın alma değildir. Bekleyen komisyon doğrulanmış gelir olarak gösterilmez.
                </p>
              </Card>

              <div className="mt-5 flex flex-wrap gap-2">
                <Badge tone="neutral"><Icon.shield size={12} /> Ödeme alınmaz</Badge>
                <Badge tone="neutral"><Icon.info size={12} /> Cashback yok</Badge>
              </div>
            </ToastProvider>
          </aside>
        </div>
      </div>
    </PublicShell>
  );
}
