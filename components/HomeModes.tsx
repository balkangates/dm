import Link from "next/link";
import { Badge, Button, Card, Reveal, SectionHead, Ticker, VideoModule } from "@/components/ds";
import { Icon } from "@/components/icons";
import { CampaignCardView, SponsoredStrip } from "@/components/discovery";
import { OfferCardView } from "@/components/offers";
import HowItWorks from "@/components/HowItWorks";
import type { listBusinesses, listCampaignCards, listCategories, listDistricts, listOffers, listVideos } from "@/lib/queries";
import type { Lang } from "@/lib/money";
import type { ViewMode } from "@/lib/viewMode";

/**
 * Anasayfanın moda göre ayrılan bölümleri. Müşteri ve İşletme akışları birbirinin içeriğini taşımaz:
 *  - CustomerHome: kampanya listeleri, online fırsatlar, nasıl çalışır, QR, davet.
 *  - BusinessHome: 28 günlük program, reklam paketleri, QR doğrulama.
 * Veri çekme app/page.tsx'te kalır; bu dosya yalnızca sunum katmanıdır.
 */

type Campaigns = Awaited<ReturnType<typeof listCampaignCards>>;
type Businesses = Awaited<ReturnType<typeof listBusinesses>>;
type Categories = Awaited<ReturnType<typeof listCategories>>;
type Districts = Awaited<ReturnType<typeof listDistricts>>;
type Offers = Awaited<ReturnType<typeof listOffers>>;
type Videos = Awaited<ReturnType<typeof listVideos>>;
export type Brand = { merchant: string; category: string; slug: string; count: number; image: string | null };

/* ------------------------------ ticker -------------------------------- */

const TICKER: Record<ViewMode, string[]> = {
  musteri: [
    "Alışverişten önce DampingVar'a bak",
    "Online fırsatlar",
    "Yakınındaki kampanyalar",
    "QR ile mağazada geçerli",
    "Davet et, mağazaya bağlı bonus kazan",
  ],
  isletme: [
    "İşletmeni DampingVar'a ekle",
    "28 günde dijitalde büyüt",
    "İşletme reklam paketleri",
    "QR ile kampanya doğrulama",
    "Kampanyanı yayınla, sonucu ölç",
  ],
};

export function ModeTicker({ mode }: { mode: ViewMode }) {
  return <Ticker items={TICKER[mode]} />;
}

/* ----------------------- finansal sınır (iki modda) -------------------- */

export function FinancialBoundary({ mode }: { mode: ViewMode }) {
  const body =
    mode === "isletme"
      ? "DampingVar müşteri ödemelerini tahsil etmez ve aktarmaz; yalnızca sunduğu platform hizmetlerini (reklam, kampanya yönetimi, görünürlük, AI) sözleşmeye uygun olarak faturalandırır. Paketler gelir veya müşteri garantisi sunmaz."
      : "DampingVar doğrudan ödeme almaz. Ödeme, müşteri ile işletme arasında gerçekleşir; online fırsatlarda ise satıcının kendi sitesinde tamamlanır.";
  return (
    <section className="mx-auto mt-16 max-w-[1280px] px-4 sm:px-6" aria-label="Finansal sınır">
      <div className="rounded-[4px] border border-line bg-surface p-5">
        <p className="flex items-center gap-2 text-[0.86rem] font-semibold text-ink">
          <Icon.shield size={15} className="text-accent" /> Finansal sınır
        </p>
        <p className="mt-1.5 max-w-[110ch] text-[0.86rem] leading-relaxed text-muted">{body}</p>
      </div>
    </section>
  );
}

/* ----------------------------- MÜŞTERİ MODU --------------------------- */

export function CustomerHome({
  lang, campaigns, businesses, categories, districts, offers, brands, videos,
}: {
  lang: Lang;
  campaigns: Campaigns;
  businesses: Businesses;
  categories: Categories;
  districts: Districts;
  offers: Offers;
  brands: Brand[];
  videos: Videos;
}) {
  const howVideo = videos.find((v) => v.topic === "HOW_DAMPINGVAR_WORKS") ?? videos[0];
  const featured = campaigns.filter((c) => c.isSponsored).slice(0, 6);
  const newest = [...campaigns].sort((a, b) => String(b.startsAt ?? "").localeCompare(String(a.startsAt ?? ""))).slice(0, 3);
  const qrLocal = campaigns.filter((c) => c.qrEnabled).slice(0, 4);

  return (
    <>
      {/* ------------------------------ KATEGORİLER -------------------------- */}
      <section id="kategoriler" className="mx-auto max-w-[1280px] scroll-mt-28 px-4 py-12 sm:px-6">
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
        <SponsoredStrip items={featured} lang={lang} />
        <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.slice(0, 6).map((c, i) => (
            <Reveal key={c.id} delay={i * 50}><CampaignCardView c={c} lang={lang} /></Reveal>
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
              <OfferCardView o={o} lang={lang} />
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
      <section id="nasil-calisir" className="mt-16 scroll-mt-28 border-y-2 border-line bg-surface">
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
                lang={lang}
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

      {/* ---------------------------- ARKADAŞINI DAVET ET --------------------- */}
      <section className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-stretch">
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
          <BusinessLinkStrip />
        </div>
      </section>
    </>
  );
}

/** Müşteri modunda işletme içeriğinin tek izi: paket/AI28 detayı olmayan bağlantı şeridi. */
export function BusinessLinkStrip() {
  return (
    <Reveal delay={80} className="h-full">
      <div className="flex h-full flex-col justify-center rounded-[4px] border border-line bg-surface p-6">
        <p className="font-display text-[1.2rem] font-bold">İşletme misin?</p>
        <p className="mt-2 max-w-[56ch] text-[0.9rem] leading-relaxed text-muted">
          İşletmeler için ayrı bir görünüm var. Oraya geçip işletmeni ekleyebilirsin.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button href="/?mod=isletme" size="sm" icon={<Icon.store size={15} />}>İşletme görünümüne geç</Button>
          <Button href="/kayit?tip=isletme" size="sm" variant="ghost">İşletmeni ekle</Button>
        </div>
      </div>
    </Reveal>
  );
}

/* ----------------------------- İŞLETME MODU --------------------------- */

export const BUSINESS_STEPS: [string, string][] = [
  ["Başvuruyu doldur", "İşletme adı, kategori ve konumunla kısa bir kayıt formu."],
  ["Başvurun incelensin", "Bilgilerin kontrol edilir; onaylanınca işletme panelin açılır."],
  ["Kampanyanı yayınla", "Panelden kampanya oluştur, QR'ı etkinleştir ve sonucu izle."],
];

/** Hero sağ paneli: işletme akışı (3 adım) ve iki ana buton. `id` = kartın "akış başı" çapası. */
export function BusinessFlowPanel() {
  return (
    <div id="isletme-akisi" className="card scroll-mt-28 p-6 text-ink">
      <p className="font-display text-[1.25rem] font-bold leading-snug">İşletmeni DampingVar&apos;a ekle</p>
      <ol className="mt-5 space-y-4">
        {BUSINESS_STEPS.map(([h, d], i) => (
          <li key={h} className="flex gap-3.5">
            <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[0.8rem] font-bold text-white">{i + 1}</span>
            <div>
              <p className="font-display text-[0.98rem] font-bold">{h}</p>
              <p className="mt-0.5 text-[0.84rem] leading-relaxed text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button href="/kayit?tip=isletme" iconRight={<Icon.arrowRight size={16} />}>İşletmemi ekle</Button>
        <Button href="/fiyatlar" variant="secondary">Paketleri incele</Button>
      </div>
    </div>
  );
}

export function BusinessHome() {
  return (
    <>
      {/* ----------------------------- 28 GÜNLÜK PROGRAM ------------------------ */}
      <section id="ai-program" className="mx-auto max-w-[1280px] scroll-mt-28 px-4 py-16 sm:px-6">
        <SectionHead
          eyebrow="AI destekli program"
          title="28 Günde İşletmeni Dijitalde Büyüt"
          desc="Profil analizi, hedef kitle, kampanya metni, reklam başlıkları, görsel/video senaryosu, içerik takvimi ve haftalık performans önerileri — 4 haftalık programda."
          action={<Button href="/panel?s=growth" variant="secondary" size="sm" iconRight={<Icon.arrowRight size={14} />}>Programı incele</Button>}
        />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Hafta 1", "Analiz et ve planla", "İşletme profilin ve hedef kitlen çıkarılır."],
            ["Hafta 2", "İçerik üret", "Kampanya metni, reklam başlıkları ve senaryolar hazırlanır."],
            ["Hafta 3", "Yayınla ve müşteri çek", "İçerik takvimine göre yayın planı uygulanır."],
            ["Hafta 4", "Ölç ve optimize et", "Haftalık performans önerileriyle plan güncellenir."],
          ].map(([w, h, d], i) => (
            <Reveal key={w} delay={i * 50} as="li">
              <Card className="h-full">
                <p className="flex items-center gap-2 text-[0.8rem] font-semibold text-accent"><Icon.calendar size={14} /> {w}</p>
                <p className="mt-2 font-display text-[1.05rem] font-bold leading-snug">{h}</p>
                <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">{d}</p>
              </Card>
            </Reveal>
          ))}
        </ol>
        <p className="mt-4 text-[0.8rem] text-muted">
          Program gelir veya müşteri garantisi vermez. Sosyal medya yayınlama API&apos;si doğrulanmadan otomatik yayın yapılmaz.
        </p>
      </section>

      {/* ----------------------------- REKLAM PAKETLERİ ------------------------- */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <SectionHead eyebrow="Reklam paketleri" title="İşletme reklam paketleri" />
            <p className="-mt-3 max-w-[60ch] text-[0.94rem] leading-relaxed text-muted">
              Ücretsiz işletme profili, kampanya promosyonu, öne çıkan yerleşim, bölgesel reklam, QR kampanya yönetimi,
              AI içerik paketi ve aylık görünürlük planı.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button href="/fiyatlar" iconRight={<Icon.arrowRight size={15} />}>Paketleri karşılaştır</Button>
              <Button href="/kayit?tip=isletme" variant="ghost">İşletmeni ekle</Button>
            </div>
          </div>
          <Card className="border-accent/30">
            <span className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-accent text-white"><Icon.megaphone size={19} /></span>
            <p className="mt-4 text-[0.9rem] leading-relaxed text-ink-700">
              DampingVar, işletmelere sunduğu hizmetleri sözleşmeye göre <strong>faturalandırır</strong>. Müşteri ödemesi
              alınmaz, cashback yoktur, işletmeler arası mahsup yapılmaz.
            </p>
            <p className="mt-3 text-[0.8rem] text-muted">Paket fiyatları ve kapsamı Paketler sayfasında yapılandırılmış haliyle gösterilir.</p>
          </Card>
        </div>
      </section>

      {/* ----------------------------- QR DOĞRULAMA ----------------------------- */}
      <section id="qr-dogrulama" className="mx-auto max-w-[1280px] scroll-mt-28 px-4 py-16 sm:px-6">
        <SectionHead
          eyebrow="QR doğrulama"
          title="Okutmayı değil, doğrulanmış kullanımı say."
          desc="Müşteri mağazada QR'ı okuttuğunda kayıt QR_SCANNED olur; bu tek başına satış kanıtı değildir. Yetkili personel uygun kullanımı onayladığında kayıt VERIFIED olur."
          action={<Button href="/panel?s=qr" variant="secondary" size="sm" icon={<Icon.qr size={14} />}>QR kampanyalarım</Button>}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["QR okutulur", "Müşteri mağazada kampanya QR'ını okutur ve koşulları görür."],
            ["Personel doğrular", "Kasadaki yetkili personel koşulların sağlandığını onaylar."],
            ["Kayıt VERIFIED olur", "Yalnızca doğrulanmış kullanımlar ölçümde ayrı gösterilir."],
          ].map(([h, d], i) => (
            <Reveal key={h} delay={i * 50}>
              <Card className="h-full">
                <Icon.qr size={20} className="text-ink-500" />
                <p className="mt-3 font-display text-[1.02rem] font-bold">{h}</p>
                <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">{d}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------- CTA ---------------------------------- */}
      <section className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[4px] bg-ink px-6 py-12 text-white sm:px-12">
          <div className="grain absolute inset-0" />
          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <h2 className="font-display text-[clamp(1.7rem,3.6vw,2.6rem)] font-extrabold leading-[1.06] tracking-[-0.03em]">
                Müşteri arama. Müşterinin seni bulmasını sağla.
              </h2>
              <p className="mt-4 max-w-[62ch] text-[0.96rem] leading-relaxed text-white/70">
                Kampanyanı yayınla, QR ile mağaza trafiğini ölç, AI ile içerik üret. Ödeme ve indirim işletme ile müşteri arasında kalır.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button href="/kayit?tip=isletme" size="lg" className="w-full">İşletmemi ekle</Button>
              <Button href="/fiyatlar" size="lg" variant="secondary" className="!w-full !bg-surface/10 !text-white !border-white/25">Paketleri incele</Button>
              <p className="text-center text-[0.78rem] text-white/55">Kurulum ücretsiz · Paket fiyatları yapılandırılabilir</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
