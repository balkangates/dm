import Link from "next/link";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Badge, Button, Card, Journey, Reveal, SectionHead, Ticker, VideoModule } from "@/components/ds";
import { Icon } from "@/components/icons";
import { CampaignCardView, SponsoredStrip } from "@/components/discovery";
import { OfferCardView } from "@/components/offers";
import HomeSearch from "@/components/HomeSearch";
import HowItWorks from "@/components/HowItWorks";
import {
  ensureSeeded, listBusinesses, listCampaignCards, listCategories, listDistricts, listOffers, listVideos,
} from "@/lib/queries";
import { makeT } from "@/lib/i18n";
import { num } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSeeded();
  const [user, locale, campaigns, businesses, categories, districts, offers, videos] = await Promise.all([
    currentUser(), getLocale(), listCampaignCards({ limit: 24 }), listBusinesses(), listCategories(), listDistricts(),
    listOffers({ limit: 6 }), listVideos(),
  ]);
  const howVideo = videos.find((v) => v.topic === "HOW_DAMPINGVAR_WORKS") ?? videos[0];
  const t = makeT(locale.lang);
  const session: SessionLite = user
    ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }
    : null;

  const featured = campaigns.filter((c) => c.isSponsored).slice(0, 6);
  const newest = [...campaigns].sort((a, b) => String(b.startsAt ?? "").localeCompare(String(a.startsAt ?? ""))).slice(0, 3);
  const brands = offers.reduce<{ merchant: string; category: string; slug: string; count: number; image: string | null }[]>((acc, o) => {
    const found = acc.find((b) => b.merchant === o.merchant);
    if (found) found.count += 1;
    else acc.push({ merchant: o.merchant, category: o.category, slug: o.slug, count: 1, image: o.imageUrl });
    return acc;
  }, []);
  const qrLocal = campaigns.filter((c) => c.qrEnabled).slice(0, 4);
  const trending = [...campaigns].sort((a, b) => b.rating - a.rating).slice(0, 3);

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      {/* ------------------------------- HERO ------------------------------- */}
      <section className="relative overflow-hidden border-b border-line bg-ink text-white">
        <div className="grain absolute inset-0" />
        <div className="hero-grid absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1280px] gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:py-24">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-surface/5 px-3 py-1.5 text-[0.74rem] font-semibold text-white/80">
                <span className="pulse-ring h-1.5 w-1.5 rounded-full bg-accent" />
                {t("hero.eyebrow")}
              </span>
            </Reveal>

            <h1 className="mt-6 font-display text-[clamp(2.5rem,6.4vw,4.6rem)] font-extrabold leading-[0.98] tracking-[-0.04em]">
              <span className="line-mask"><span style={{ animationDelay: "40ms" }}>{t("hero.title1")}</span></span>
              <span className="line-mask"><span style={{ animationDelay: "150ms" }} className="text-accent">{t("hero.title2")}</span></span>
            </h1>

            <Reveal delay={180}>
              <p className="mt-6 max-w-[54ch] text-[1.02rem] leading-relaxed text-white/70">{t("hero.sub")}</p>
            </Reveal>

            <Reveal delay={260}>
              <div className="mt-8">
                <HomeSearch placeholder={t("hero.search")} districts={districts.map((d) => d.district)} categories={categories.map((c) => c.category)} />
              </div>
            </Reveal>

            <Reveal delay={340}>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button href="/kampanyalar" size="lg" iconRight={<Icon.arrowRight size={17} />}>{t("hero.cta1")}</Button>
                <Button href="/kayit?tip=isletme" size="lg" variant="secondary" className="!bg-surface/10 !text-white !border-white/25 hover:!bg-surface/20">
                  {t("hero.cta2")}
                </Button>
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
          </div>

          {/* istiflenmiş kampanya kartları */}
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
                <p className="mt-1.5 font-display text-[1rem] font-bold leading-snug">Okut, koşulları gör, indirimi işletme uygulasın.</p>
                <Link href="/qr" className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-accent">QR deneyimi <Icon.arrowRight size={14} /></Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Ticker
        items={[
          "Alışverişten önce DampingVar'a bak",
          "Online fırsatlar",
          "Yakınındaki kampanyalar",
          "QR ile mağazada geçerli",
          "Davet et, mağazaya bağlı bonus kazan",
          "28 günde dijitalde büyüt",
          "İşletme reklam paketleri",
        ]}
      />

      {/* ------------------------------ KATEGORİLER -------------------------- */}
      <section id="kategoriler" className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {categories.map((c) => (
            <Link key={c.category} href={`/kampanyalar?kategori=${encodeURIComponent(c.category)}`}
              className="card hover-lift flex shrink-0 items-center gap-2.5 px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-[3px] bg-accent-soft text-accent-700"><Icon.tag size={15} /></span>
              <span>
                <span className="block text-[0.86rem] font-semibold capitalize text-ink">{c.category}</span>
                <span className="tabular block text-[0.72rem] text-muted">{c.n} işletme</span>
              </span>
            </Link>
          ))}
          {districts.map((d) => (
            <Link key={d.district} href={`/kampanyalar?konum=${encodeURIComponent(d.district)}`}
              className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-[0.84rem] font-medium text-ink-700 hover:border-ink-500">
              <Icon.pin size={14} className="text-accent" /> {d.district}
            </Link>
          ))}
        </div>
      </section>

      {/* --------------------------- ÖNE ÇIKANLAR ---------------------------- */}
      <section className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <SectionHead eyebrow="Öne çıkan kampanyalar" title="Bugün geçerli fırsatlar"
          desc="Sponsorlu yerleşimler etiketle gösterilir. İndirim, koşullar sağlandığında işletme tarafından uygulanır."
          action={<Button href="/kampanyalar" variant="secondary" size="sm" iconRight={<Icon.arrowRight size={14} />}>Tüm kampanyalar</Button>} />
        <SponsoredStrip items={featured} lang={locale.lang} />
        <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.slice(0, 6).map((c, i) => (
            <Reveal key={c.id} delay={i * 50}><CampaignCardView c={c} lang={locale.lang} /></Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------- POPÜLER İŞLETMELER ------------------------ */}
      <section className="mx-auto mt-16 max-w-[1280px] px-4 sm:px-6">
        <SectionHead eyebrow="Yerel işletmeler" title="Popüler mağaza ve markalar" desc="Doğrulanmış işletme profilleri, çalışma saatleri ve aktif kampanyaları." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.slice(0, 6).map((b, i) => (
            <Reveal key={b.id} delay={i * 45}>
              <Link href={`/isletme/${b.slug}`} className="card hover-lift group flex gap-4 p-4">
                <img src={b.coverImage ?? "/images/magaza-ic.jpg"} alt="" className="h-20 w-20 shrink-0 rounded-[3px] object-cover" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-display text-[1rem] font-bold">{b.name}</p>
                    {b.verified ? <Icon.verified size={14} className="shrink-0 text-positive" /> : null}
                  </div>
                  <p className="mt-0.5 truncate text-[0.8rem] text-muted">{b.subCategory ?? b.category} · {b.district}, {b.city}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone="neutral">★ {b.rating.toFixed(1)}</Badge>
                    <Badge tone="accent">{b.planCode}</Badge>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------- ONLINE FIRSATLAR -------------------------- */}
      <section className="mx-auto mt-16 max-w-[1280px] px-4 sm:px-6">
        <SectionHead
          eyebrow="Online fırsatlar · affiliate"
          title="Marka ve mağazaların online teklifleri"
          desc="Yerel işletme kampanyalarından ayrı bir alan. Teklifler izlenen bağlantıyla satıcının kendi sitesine yönlendirir; alışveriş ve ödeme orada tamamlanır."
          action={
            <Button href="/online-firsatlar" variant="secondary" size="sm" iconRight={<Icon.arrowRight size={14} />}>
              Tüm online fırsatlar
            </Button>
          }
        />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {offers.map((o, i) => (
            <Reveal key={o.id} delay={i * 50}>
              <OfferCardView o={o} lang={locale.lang} />
            </Reveal>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 text-[0.8rem] leading-relaxed text-muted">
          <Icon.info size={14} className="mt-0.5 shrink-0" />
          Bu bağlantı üzerinden gerçekleşen uygun alışverişlerden DampingVar komisyon kazanabilir. Bağlantıya
          tıklamanız satın alma anlamına gelmez; dönüşüm yalnızca ilgili ağ raporladığında kaydedilir.
        </p>
      </section>

      {/* ------------------------ NASIL ÇALIŞIR (etkileşimli) ---------------- */}
      <section className="mt-16 border-y-2 border-line bg-surface">
        <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6">
          <SectionHead
            eyebrow="DampingVar nasıl çalışır?"
            title="Üç ayrı akış, tek bir söz."
            desc="Online fırsat, yerel QR kampanya ve davet/bonus akışları birbirinden ayrıdır. Hiçbiri tek bir satın alma süreci gibi birleştirilmez."
          />
          <HowItWorks />
          {howVideo ? (
            <div className="mt-10 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-start">
              <VideoModule
                title={howVideo.title}
                durationSec={howVideo.durationSec}
                scenes={howVideo.scenes}
                captions={howVideo.captions}
                lang={locale.lang}
                poster={howVideo.poster ?? undefined}
                steps={howVideo.steps}
              />
              <div className="space-y-4">
                <Card>
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-accent">İşlem akışı merkezi</p>
                  <p className="mt-2 font-display text-[1.15rem] font-bold leading-snug">
                    Her adımın ne olduğunu, neyin doğrulandığını ve sıradaki adımı gör.
                  </p>
                  <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">
                    Tıklama, QR okutma, doğrulanmış kullanım ve komisyon durumu ayrı olaylardır. Animasyonlar
                    gerçek durum değişimlerini anlatır; sahte canlı işlem üretilmez.
                  </p>
                  <Button href="/islem-akisi" className="mt-4" size="sm" icon={<Icon.layers size={14} />}>
                    DampingVar İşlem Akışı
                  </Button>
                </Card>
                <Card>
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-accent">Video anlatımlar</p>
                  <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">
                    10 kısa storyboard anlatımı; TR/EN/KA altyazı (çevirisi olanlarda) ve yazılı adım alternatifi.
                    Gerçek video üretimi bağlı değil — bu açıkça etiketlenir.
                  </p>
                  <Button href="/videolar" variant="secondary" className="mt-4" size="sm" icon={<Icon.video size={14} />}>
                    Video kütüphanesi
                  </Button>
                </Card>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* --------------------------- ÖNE ÇIKAN MARKALAR ---------------------- */}
      <section className="mx-auto mt-16 max-w-[1280px] px-4 sm:px-6">
        <SectionHead
          eyebrow="Öne çıkan markalar"
          title="Online teklifleri olan markalar"
          desc="Marka sayfaları izlenen bağlantıyla satıcının kendi sitesine gider. Tüm içerik örnek/demo olarak etiketlidir."
          action={
            <Button href="/online-firsatlar" variant="secondary" size="sm" iconRight={<Icon.arrowRight size={14} />}>
              Marka teklifleri
            </Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b, i) => (
            <Reveal key={b.merchant} delay={i * 45}>
              <Link href={`/firsat/${b.slug}`} className="card hover-lift group flex items-center gap-4 p-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-ink bg-canvas font-display text-[0.82rem] font-extrabold text-ink">
                  {b.merchant.slice(0, 2).toLocaleUpperCase("tr-TR")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[0.98rem] font-bold group-hover:text-accent">{b.merchant}</span>
                  <span className="mt-0.5 block text-[0.8rem] text-muted">{b.category} · {b.count} teklif</span>
                </span>
                <Icon.external size={16} className="shrink-0 text-muted-2" />
              </Link>
            </Reveal>
          ))}
        </div>
        <p className="mt-3 text-[0.78rem] text-muted">
          Affiliate ağ bağlantısı kurulmadığı için komisyon koşulları uydurulmaz; yalnızca ağ tarafından sağlanan
          bilgiler gösterilir.
        </p>
      </section>

      {/* ------------------------- YENİ İŞLETME KAMPANYALARI ------------------ */}
      <section className="mx-auto mt-16 max-w-[1280px] px-4 sm:px-6">
        <SectionHead
          eyebrow="Yeni eklendi"
          title="Yeni işletme kampanyaları"
          desc="Yakın zamanda yayınlanan yerel kampanyalar. İndirim, koşullar sağlandığında işletme tarafından uygulanır."
          action={
            <Button href="/kampanyalar" variant="ghost" size="sm" iconRight={<Icon.arrowRight size={14} />}>
              Tümünü gör
            </Button>
          }
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {newest.map((c, i) => (
            <Reveal key={c.id} delay={i * 55}>
              <Link href={`/kampanya/${c.slug ?? c.code}`} className="card hover-lift flex gap-4 p-4">
                <img src={c.imageUrl ?? c.coverImage ?? "/images/magaza-ic.jpg"} alt="" className="h-20 w-20 shrink-0 rounded-[3px] object-cover" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <Badge tone="positive">yeni</Badge>
                    <span className="tabular text-[0.72rem] text-muted">{c.code}</span>
                  </span>
                  <span className="mt-1.5 block truncate font-display text-[1rem] font-bold">{c.title}</span>
                  <span className="mt-1 block truncate text-[0.82rem] text-muted">{c.businessName} · {c.district}</span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------- QR YEREL ------------------------------- */}
      <section className="mt-16 border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionHead eyebrow="Mağaza içi QR" title="Rafa değil, kasaya giden yol."
              desc="Kampanyayı DampingVar'da bul, mağazaya git, QR'ı okut ve koşulları gör. Ödeme ve indirim doğrudan işletme ile senin aranda." />
            <ol className="space-y-4">
              {[
                ["Kampanyayı keşfet", "Konum, kategori veya arama ile sana uygun fırsatı bul."],
                ["Mağazaya git", "Adres, çalışma saatleri ve yol tarifi işletme sayfasında."],
                ["QR'ı okut", "Okutma kaydı QR_SCANNED olarak tutulur; bu tek başına satış kanıtı değildir."],
                ["İşletme doğrulasın", "Yetkili personel uygun kullanımı onayladığında kayıt VERIFIED olur."],
              ].map(([h, d], i) => (
                <li key={h} className="flex gap-4">
                  <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[0.8rem] font-bold text-white">{i + 1}</span>
                  <div><p className="font-display text-[1rem] font-bold">{h}</p><p className="mt-1 text-[0.86rem] leading-relaxed text-muted">{d}</p></div>
                </li>
              ))}
            </ol>
            <Button href="/qr" className="mt-6" icon={<Icon.qr size={16} />}>QR deneyimini aç</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {qrLocal.map((c) => (
              <Link key={c.id} href={`/kampanya/${c.slug ?? c.code}`} className="card hover-lift p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.76rem] font-semibold text-accent">{c.businessName}</p>
                    <p className="mt-1 line-clamp-2 font-display text-[0.98rem] font-bold leading-snug">{c.title}</p>
                  </div>
                  <Icon.qr size={20} className="shrink-0 text-ink-500" />
                </div>
                <p className="mt-2.5 text-[0.78rem] text-muted">{c.district} · {c.timeStart ? `${c.timeStart}–${c.timeEnd}` : "tüm gün"}</p>
                <p className="tabular mt-2 text-[0.74rem] text-muted-2">{c.code}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------- REFERRAL + AI + PAKET --------------------- */}
      <section id="ai-program" className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Reveal><Card className="h-full">
            <span className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-accent-soft text-accent-700"><Icon.users size={19} /></span>
            <h3 className="mt-4 font-display text-[1.2rem] font-bold">Arkadaşını davet et</h3>
            <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">
              Davet ettiğin arkadaşın bir mağazadan alışveriş yapar ve işletme bunu doğrularsa, o mağazaya bağlı
              <strong className="text-ink"> Damping Bonus</strong> kazanırsın.
            </p>
            <ul className="mt-4 space-y-1.5 text-[0.82rem] text-muted">
              <li className="flex gap-2"><Icon.x size={13} className="mt-1 shrink-0 text-danger" /> Nakit, cashback veya cüzdan bakiyesi değildir</li>
              <li className="flex gap-2"><Icon.x size={13} className="mt-1 shrink-0 text-danger" /> Başka mağazada kullanılamaz, devredilemez</li>
              <li className="flex gap-2"><Icon.check size={13} className="mt-1 shrink-0 text-positive" /> Yalnızca kazanıldığı mağazada indirim hakkıdır</li>
            </ul>
            <Button href="/hesabim?s=referrals" variant="secondary" size="sm" className="mt-5">Davet bağlantım</Button>
          </Card></Reveal>

          <Reveal delay={80}><Card className="h-full">
            <span className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-ink text-accent"><Icon.spark size={19} /></span>
            <h3 className="mt-4 font-display text-[1.2rem] font-bold">28 Günde İşletmeni Dijitalde Büyüt</h3>
            <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">
              Profil analizi, hedef kitle, kampanya metni, reklam başlıkları, görsel/video senaryosu, içerik takvimi ve
              haftalık performans önerileri — 4 haftalık programda.
            </p>
            <ol className="mt-4 space-y-1.5 text-[0.82rem] text-ink-700">
              {["Hafta 1 — Analiz et ve planla", "Hafta 2 — İçerik üret", "Hafta 3 — Yayınla ve müşteri çek", "Hafta 4 — Ölç ve optimize et"].map((w) => (
                <li key={w} className="flex gap-2"><Icon.calendar size={13} className="mt-0.5 shrink-0 text-accent" />{w}</li>
              ))}
            </ol>
            <p className="mt-3 text-[0.76rem] text-muted">Program gelir veya müşteri garantisi vermez. Sosyal medya yayınlama API&apos;si doğrulanmadan otomatik yayın yapılmaz.</p>
            <Button href="/panel?s=growth" variant="secondary" size="sm" className="mt-4">Programı incele</Button>
          </Card></Reveal>

          <Reveal delay={160}><Card className="h-full border-accent/30">
            <span className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-accent text-white"><Icon.megaphone size={19} /></span>
            <h3 className="mt-4 font-display text-[1.2rem] font-bold">İşletme reklam paketleri</h3>
            <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">
              Ücretsiz işletme profili, kampanya promosyonu, öne çıkan yerleşim, bölgesel reklam, QR kampanya yönetimi,
              AI içerik paketi ve aylık görünürlük planı.
            </p>
            <p className="mt-4 rounded-[3px] bg-canvas p-3 text-[0.82rem] leading-relaxed text-ink-700">
              DampingVar, işletmelere sunduğu hizmetleri sözleşmeye göre <strong>faturalandırır</strong>. Müşteri ödemesi
              alınmaz, cashback yoktur, işletmeler arası mahsup yapılmaz.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button href="/fiyatlar" size="sm">Paketleri karşılaştır</Button>
              <Button href="/kayit?tip=isletme" variant="ghost" size="sm">İşletmeni ekle</Button>
            </div>
          </Card></Reveal>
        </div>
      </section>

      {/* -------------------------------- CTA -------------------------------- */}
      <section className="mx-auto max-w-[1280px] px-4 pb-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[4px] bg-ink px-6 py-14 text-white sm:px-12">
          <div className="grain absolute inset-0" />
          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.04] tracking-[-0.035em]">
                Müşteri arama.<br /><span className="text-accent">DampingVar müşterisinin seni bulmasını sağla.</span>
              </h2>
              <p className="mt-5 max-w-[62ch] text-[0.98rem] leading-relaxed text-white/70">
                Kampanyanı yayınla, QR ile mağaza trafiğini ölç, AI ile içerik üret ve hangi kampanyanın gerçekten
                müşteri getirdiğini gör. Ödeme ve indirim işletme ile müşteri arasında kalır.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button href="/kayit?tip=isletme" size="lg" className="w-full">{t("hero.cta2")}</Button>
              <Button href="/giris" size="lg" variant="secondary" className="!w-full !bg-surface/10 !text-white !border-white/25">{t("nav.login")}</Button>
              <p className="text-center text-[0.78rem] text-white/55">Kurulum ücretsiz · Paket fiyatları yapılandırılabilir</p>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
