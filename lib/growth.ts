/**
 * DampingVar AI Büyüme Asistanı — öneri motoru (istek: 20.10.2026).
 *
 * Saf ve deterministik: getBusinessData + lib/ai snapshot'ı üzerinden
 * GERÇEK verilere dayalı en fazla 3 öneri üretir. Kurallar:
 *  * Her önerinin "why" metni gerçek ölçümleri (sayfa/kampanya görüntüleme,
 *    QR, doğrulanmış kullanım, ürün sayısı...) kullanır.
 *  * Fayda nitel olarak yazılır; satış/artış GARANTİSİ verilmez.
 *  * Veri yoksa öneri "veri/materyal iste" odaklıdır; uydurma satış verisi yok.
 *  * Aynı başlıklı öneri açıkken tekrar üretilmez; REDDEDİLEN öneri aynı
 *    başlıkla tekrar sunulmaz (yalnızca alternatif önerilir).
 * Sunucu katmanı (app/api/ai/route.ts) bu taslakları DB'ye yazar; hiçbir
 * öneri otomatik olarak kampanya/reklam YARATMAZ — yalnızca sahibin
 * "Evet, uygula" dediği öneri görev oluşturur ve mevcut formları doldurur.
 */
import { suggestCampaign, type BusinessSnapshot, type CampaignSuggestion } from "./ai";

export type GrowthArea = "GROWTH" | "VISIBILITY" | "ACQUISITION" | "SALES";

export type GrowthPlan =
  | { kind: "campaign"; aiAction: "campaign"; goal: string; fields: Record<string, string | number> }
  | {
      kind: "ad";
      aiAction: null;
      draft: { name: string; placement: string; district: string; budgetCents: number; endsAt: string; brief: string };
    }
  | { kind: "content"; aiAction: "social" | "ads" | "video" | "plan" | "story"; goal: string }
  | { kind: "data"; aiAction: null; focus: string };

export type GrowthRecommendationDraft = {
  area: GrowthArea;
  title: string;
  problem: string;
  why: string;
  benefit: string;
  cost: string;
  materials: string;
  steps: string[];
  plan: GrowthPlan;
};

export type GrowthTaskStatus =
  | "NEW" | "IN_PROGRESS" | "WAITING_OWNER" | "WAITING_APPROVAL" | "WAITING_PUBLISH" | "DONE" | "CANCELLED";

export type GrowthTask = {
  step: number;
  title: string;
  status: GrowthTaskStatus;
  owner: string;
  due: string | null;
  sourceTable: string | null;
  sourceId: string | null;
};

/** Analiz anında bilinen gerçek işletme durumu (sunucudan gelir). */
export type GrowthExtras = {
  publishedCampaigns: number;
  adRequests: number;
  contentsCount: number;
  videosCount: number;
};

export type ExistingRec = { title: string; status: string };

export const AREA_LABEL: Record<GrowthArea, string> = {
  GROWTH: "Büyüme",
  VISIBILITY: "Görünürlük",
  ACQUISITION: "Müşteri kazanımı",
  SALES: "Satış",
};

/** Kampanya form alanları — /api/ai campaign aksiyonunun "fields" çıktısıyla aynı sözleşmedir. */
export function campaignFieldsFromSuggestion(sug: CampaignSuggestion, snapshot: BusinessSnapshot): Record<string, string | number> {
  return {
    title: sug.title,
    description: sug.description,
    terms: `${sug.audience} için geçerlidir. ${sug.timeStart ?? "10:00"}–${sug.timeEnd ?? "22:00"} arasında, QR doğrulaması sonrası kasada uygulanır. Minimum sepet ${Math.round(sug.minBasketCents / 100)} TL. Diğer kampanyalarla birleştirilemez; stoklarla sınırlıdır.`,
    type: "PERCENT",
    discountPercent: sug.discountPercent,
    minBasketCents: Math.round(sug.minBasketCents / 100),
    timeStart: sug.timeStart ?? "",
    timeEnd: sug.timeEnd ?? "",
    eligibleItems: [...snapshot.products.slice(0, 3).map((p) => p.name), ...snapshot.services.slice(0, 2).map((s) => s.name)]
      .filter(Boolean)
      .join(", "),
  };
}

const statsLine = (s: BusinessSnapshot, extras: GrowthExtras) =>
  `Gerçek ölçümler (son 14 gün): ${s.stats.pageViews} sayfa görüntüleme, ${s.stats.campaignViews} kampanya görüntüleme, ` +
  `${s.stats.qrGenerated} QR okutma, ${s.stats.qrRedeemed} doğrulanmış kullanım` +
  `${s.stats.newCustomers ? `, ${s.stats.newCustomers} yeni müşteri` : ""}. ` +
  `Durum: ${extras.publishedCampaigns} yayında kampanya, ${extras.adRequests} reklam talebi, ${extras.contentsCount} AI içerik kaydı, ${extras.videosCount} video.`;

const iso = (dt: Date) => dt.toISOString().slice(0, 10);

type Candidate = { weight: number; draft: GrowthRecommendationDraft };

function candCampaign(snapshot: BusinessSnapshot, extras: GrowthExtras): Candidate | null {
  const s = snapshot.stats;
  if (extras.publishedCampaigns > 0 && s.qrRedeemed >= 5) return null;
  const goal = extras.publishedCampaigns === 0 ? "yeni müşteri kazanmak istiyorum" : "kampanya dönüşümünü artırmak istiyorum";
  const sug = suggestCampaign(snapshot, goal);
  const fields = campaignFieldsFromSuggestion(sug, snapshot);
  const isNew = extras.publishedCampaigns === 0;
  return {
    weight: 100,
    draft: {
      area: "SALES",
      title: isNew ? "İlk DampingVar kampanyanı yayına hazırla" : "Saat bazlı damping ile kampanya dönüşümünü artır",
      problem: isNew
        ? "DampingVar'da yayında kampanyan yok; müşteriler seni indirim/fırsat listelerinde göremiyor."
        : "Yayında kampanyan var ama doğrulanmış QR kullanımı düşük; kampanya saatleri ve koşulları dönüşüme yeterince hizmet etmiyor olabilir.",
      why: statsLine(snapshot, extras) + ` Önerilen saat aralığı ${sug.timeStart}–${sug.timeEnd}, bu aralık etkileşimin en düşük olduğu bandır (gerçek veriye dayalı).`,
      benefit: `Mevcut görünürlüğünü fiili dönüşüme çevirmeye yönelik tahmini katkı: kampanya kartlarındaki trafiği QR doğrulamasına yöneltmek. Bu bir tahmindir; satış artışı garantisi değildir.`,
      cost: "Ücretsiz — kampanya oluşturma ve QR doğrulama platforma dahildir; indirim oranı size bağlıdır ve onayınız olmadan uygulanmaz.",
      materials: "Kampanya görseli (zorunlu; JPG/PNG/WebP, en fazla 5MB). İsteğe bağlı: öne çıkan ürün fotoğrafı.",
      steps: [
        "Öneriyi onaylayın — mevcut Yeni Kampanya formu AI taslağıyla dolar.",
        "Başlık, oran ve koşulları gözden geçirip düzenleyin.",
        "Kampanya görselini yükleyin (görsiz yayınlanamaz).",
        "Önizleme kontrolü sonrası yayınlayın; moderasyon onayından sonra müşteriye görünür.",
      ],
      plan: { kind: "campaign", aiAction: "campaign", goal, fields },
    },
  };
}

function candProductData(snapshot: BusinessSnapshot, extras: GrowthExtras): Candidate | null {
  if (snapshot.products.length > 0 || snapshot.services.length > 0) return null;
  return {
    weight: 90,
    draft: {
      area: "GROWTH",
      title: "Ürün ve hizmet listeni tamamla",
      problem:
        "İşletme profilinde ürün/hizmet bilgisi yok. AI içerikleri, kampanya önerileri ve reklam metinleri bu bilgilerden kişiselleştirilir; liste boşsa öneriler genel kalır.",
      why: statsLine(snapshot, extras) + " Sistemde 0 ürün, 0 hizmet kaydı var — kişiselleştirme için veri bulunmuyor.",
      benefit:
        "Öneri kalitesinde (ürün adı/fiyatı geçen içerikler, hedefli kampanya metinleri) gözle görülür iyileşme beklenir. Satış artışı garantisi değildir.",
      cost: "Ücretsiz.",
      materials: "Ürün veya hizmet adları ve fiyatları (fotoğraf isteğe bağlı). Hazır listeyi panel destek kanalından iletin.",
      steps: [
        "En çok sattığın 5 ürün veya en çok talep gören 3 hizmeti hazırlayın (ad + fiyat).",
        "Listeyi işletme adına iletin; kayıt eklendikten sonra AI önerileri yenilensin.",
        "Yeni veriyle kampanya ve içerik önerilerini tekrar üretin.",
      ],
      plan: { kind: "data", aiAction: null, focus: "products_services" },
    },
  };
}

function candVisibilityAd(snapshot: BusinessSnapshot, extras: GrowthExtras): Candidate | null {
  if (extras.adRequests > 0) return null;
  const sug = suggestCampaign(snapshot, "görünürlük artırmak istiyorum");
  const brief =
    `Amaç: ${snapshot.name} markasını ${snapshot.district} çevresinde tanıtmak ve DampingVar içinde görünürlüğü artırmak.\n` +
    `Hedef bölge: ${snapshot.district}, ${snapshot.city}. Hedef kitle: ${sug.audience}.\n` +
    `İlgili kampanya: ${extras.publishedCampaigns > 0 ? "yayındaki kampanyalar" : "ilk kampanya (yayına hazırlanıyor)"}.\n` +
    `Reklam metni (taslak): ${sug.adCopy}\n` +
    `Görsel ihtiyacı: işletme vitrin fotoğrafı (1200×628 önerilir).`;
  return {
    weight: 80,
    draft: {
      area: "VISIBILITY",
      title: "Mahallene yönelik görünürlük reklamı talebi oluştur",
      problem: `DampingVar'da ${snapshot.district} çevresine yönelik görünürlük reklam talebin yok; kategori ve bölge listelerinde öne çıkma satın alınmamış.`,
      why: statsLine(snapshot, extras) + " Görünürlük, mevcut trafiği büyütmek için DampingVar reklam ağı üzerinden yapılabilir.",
      benefit:
        "Bölgesel liste ve kategori görünürlüğünde artış beklentisi (tahmin). Reklam, yönetici onayı olmadan yayınlanmaz; onaylanmazsa ücret tahakkuk etmez.",
      cost:
        "Önerilen başlangıç bütçesi 2.500 TL / 14 gün (tahminî, bağlayıcı değil). Ücretli reklam yalnızca yönetici onayıyla yayına girer.",
      materials: "Vitrin/işletme fotoğrafı; varsa logolu görsel. Metin taslağı AI tarafından hazırlanır.",
      steps: [
        "Öneriyi onaylayın — mevcut Reklam formu AI brief'iyle dolar.",
        "Bütçe ve tarih aralığını kendiniz belirleyip onaylayın.",
        "Görseli hazırlayıp talebi gönderin (durum: onay bekliyor).",
        "Yönetici onayından sonra reklam yayına girer; onaylanmazsa ücret doğmaz.",
      ],
      plan: {
        kind: "ad",
        aiAction: null,
        draft: {
          name: `${snapshot.district} ${snapshot.category} görünürlüğü`,
          placement: "BOLGE",
          district: snapshot.district,
          budgetCents: 250000,
          endsAt: iso(new Date(Date.now() + 14 * 86400000)),
          brief,
        },
      },
    },
  };
}

function candQrConversion(snapshot: BusinessSnapshot, extras: GrowthExtras): Candidate | null {
  const s = snapshot.stats;
  const views = Math.max(s.campaignViews, 1);
  if (s.campaignViews < 10 || s.qrRedeemed / views >= 0.1) return null;
  return {
    weight: 70,
    draft: {
      area: "ACQUISITION",
      title: "Kampanya görüntülemesini QR kullanımına çevir",
      problem: `Kampanyaların ${s.campaignViews} kez görüntülendi ama yalnızca ${s.qrRedeemed} doğrulanmış kullanım var (dönüşüm ~%${Math.round((s.qrRedeemed / views) * 100)}). Müşteri kampanyayı görüp QR adımını atlıyor olabilir.`,
      why: statsLine(snapshot, extras) + " Düşük dönüşüm, iletişim ve hatırlatma eksikliğine işaret edebilir (kesin neden değildir).",
      benefit:
        "Aynı görünürlükten daha fazla doğrulanmış kullanım hedeflenir. Beklenen katkı tahminidir; garanti verilmez.",
      cost: "Ücretsiz — sosyal medya paylaşımı ve mağaza içi QR hatırlatmaları.",
      materials: "Kasa/ vitrinde QR afişi için baskı; varsa kısa telefon videosu.",
      steps: [
        "AI Pazarlama'dan sosyal medya gönderisi üretin ve onaylayıp paylaşın.",
        "Kasada ve vitrinde QR hatırlatması bulundurun.",
        "İki hafta sonra Analitik'ten dönüşümü tekrar ölçün.",
      ],
      plan: { kind: "content", aiAction: "social", goal: "kampanya görüntülemesini QR okutmaya yönlendirmek istiyorum" },
    },
  };
}

function candContentPack(snapshot: BusinessSnapshot, extras: GrowthExtras): Candidate | null {
  if (extras.contentsCount > 0) return null;
  return {
    weight: 60,
    draft: {
      area: "GROWTH",
      title: "İçerik paketi oluştur (reklam metinleri + sosyal gönderi)",
      problem: "AI Pazarlama'da tek bir içerik kaydın yok; sosyal medya ve reklam metinlerini sıfırdan yazıyorsun.",
      why: statsLine(snapshot, extras) + " Profil, ürün ve kampanya verinden otomatik taslak üretilebilir.",
      benefit: "İçerik hazırlama süresinde belirgin azalma (tahmin). Etkileşim artışı garanti edilmez.",
      cost: "Ücretsiz.",
      materials: "Yok — mevcut profil verisi yeterli; varsa ürün fotoğrafı paylaşımı güçlendirir.",
      steps: [
        "Öneriyi onaylayın — AI 5 reklam varyasyonu ve sosyal gönderi taslağını hazırlar.",
        "Taslakları AI Pazarlama listesinde gözden geçirin; beğenmediklerinizi yeniden üretin.",
        "Onaylayıp kendi hesaplarınızda paylaşın (otomatik yayınlama bağlı değildir).",
      ],
      plan: { kind: "content", aiAction: "ads", goal: "içerik paketi ile görünürlük ve dönüşüm artırmak istiyorum" },
    },
  };
}

function candVideo(snapshot: BusinessSnapshot, extras: GrowthExtras): Candidate | null {
  if (extras.videosCount > 0) return null;
  return {
    weight: 50,
    draft: {
      area: "VISIBILITY",
      title: "15 saniyelik video senaryosu ile sosyal içeriği başlat",
      problem: "Video stüdyosunda kaydın yok; Reels/TikTok tarzı kısa video DampingVar trafiğinin önemli bir dilimi.",
      why: statsLine(snapshot, extras) + " Sektörüne uygun sahne planı AI tarafından üretilebilir.",
      benefit: "Kısa video, ürün/hizmetini görsel olarak anlatır; etkileşim katkısı tahminidir, garanti değildir.",
      cost: "Ücretsiz (senaryo + sahne planı). Gerçek video RENDERİ bağlı değildir; kendi telefon çekiminizi stüdyoya yükleyebilirsiniz.",
      materials: "Telefonla kısa ürün/işletme videosu (15 sn, dikey) — isteğe bağlı; senaryo yeterli.",
      steps: [
        "Öneriyi onaylayın — AI 15 sn senaryo ve sahne planını hazırlar.",
        "Senaryoya göre telefonunuzla çekin veya hazır videoyu Video Stüdyosu'na yükleyin.",
        "Onaylayıp sosyal hesaplarınızda paylaşın.",
      ],
      plan: { kind: "content", aiAction: "video", goal: "kısa video ile tanıtım yapmak istiyorum" },
    },
  };
}

const CANDIDATES: Array<(s: BusinessSnapshot, e: GrowthExtras) => Candidate | null> = [
  candCampaign,
  candProductData,
  candVisibilityAd,
  candQrConversion,
  candContentPack,
  candVideo,
];

function knownTitles(existing: ExistingRec[]): { skip: Set<string>; rejected: Set<string> } {
  const skip = new Set<string>();
  const rejected = new Set<string>();
  for (const r of existing) {
    const key = r.title.trim().toLocaleLowerCase("tr-TR");
    if (r.status === "REJECTED") rejected.add(key);
    else skip.add(key); // PROPOSED / ACCEPTED / COMPLETED / CANCELLED — tekrar sunma
  }
  return { skip, rejected };
}

/** En fazla 3 öncelikli öneri (ayrı kartlar için). Reddedilen başlıklar tekrar SUNULMAZ. */
export function growthAnalyse(
  snapshot: BusinessSnapshot,
  extras: GrowthExtras,
  existing: ExistingRec[]
): GrowthRecommendationDraft[] {
  const { skip, rejected } = knownTitles(existing);
  const out: GrowthRecommendationDraft[] = [];
  const cands: Candidate[] = [];
  for (const fn of CANDIDATES) {
    const c = fn(snapshot, extras);
    if (!c) continue;
    const key = c.draft.title.trim().toLocaleLowerCase("tr-TR");
    if (skip.has(key) || rejected.has(key)) continue;
    cands.push(c);
  }
  cands.sort((a, b) => b.weight - a.weight);
  for (const c of cands) {
    if (out.length >= 3) break;
    if (out.some((d) => d.title === c.draft.title)) continue;
    out.push(c.draft);
  }
  return out;
}

/**
 * Ret sonrası alternatif: reddedilen başlık HARİÇ en uygun kalan aday.
 * (Ret nedeni metni sunucuda öneri satırında saklanır; motor alternatifi
 * nedeni dikkate alacak şekilde farklı bir alandan/aksiyondan seçer.)
 */
export function growthAlternative(
  snapshot: BusinessSnapshot,
  extras: GrowthExtras,
  existing: ExistingRec[],
  rejectedTitle: string
): GrowthRecommendationDraft | null {
  const blocked = knownTitles([...existing, { title: rejectedTitle, status: "REJECTED" }]);
  const cands: Candidate[] = [];
  for (const fn of CANDIDATES) {
    const c = fn(snapshot, extras);
    if (!c) continue;
    const key = c.draft.title.trim().toLocaleLowerCase("tr-TR");
    if (blocked.skip.has(key) || blocked.rejected.has(key)) continue;
    cands.push(c);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.weight - a.weight);
  return cands[0].draft;
}

const DAY = 86400000;
const dueIn = (days: number) => iso(new Date(Date.now() + days * DAY));

/** Kabul edilen öneri için 11 adımlık görev listesi (istek §7). */
export function growthTaskTemplate(plan: GrowthPlan, contentsGenerated: boolean): GrowthTask[] {
  const owner = "İşletme sahibi";
  const kindLabel = plan.kind === "campaign" ? "kampanya" : plan.kind === "ad" ? "reklam" : plan.kind === "content" ? "içerik" : "veri";
  const fillTitle =
    plan.kind === "campaign"
      ? "Kampanya formunu AI taslağıyla gözden geçir ve gönder"
      : plan.kind === "ad"
        ? "Reklam formunu AI brief'iyle gözden geçir ve gönder"
        : plan.kind === "content"
          ? "İçerik taslaklarını gözden geçir"
          : "Eksik işletme bilgisini hazırla ve ilet";
  const t = (step: number, title: string, status: GrowthTaskStatus, due: string | null = null, sourceTable: string | null = null): GrowthTask => ({
    step,
    title,
    status,
    owner,
    due,
    sourceTable,
    sourceId: null,
  });
  const base: GrowthTask[] = [
    t(1, "İşletme verilerini analiz et", "DONE"),
    t(2, `Öneriyi işletme sahibine sun (${kindLabel})`, "DONE"),
    t(3, "Evet/Hayır cevabını kaydet", "DONE"),
    t(4, fillTitle, "WAITING_OWNER", dueIn(3)),
    t(5, "Eksik bilgi ve materyalleri iste/yükle (görsel, video, liste)", "WAITING_OWNER", dueIn(5)),
    t(6, "İçerik taslağını hazırla", contentsGenerated ? "DONE" : "NEW", dueIn(2)),
    t(7, "İşletme sahibinden içerik onayı al", "WAITING_OWNER", dueIn(5)),
    t(8, plan.kind === "data" ? "Talebi tamamla (yayın adımı yok)" : "Kampanya veya reklam talebini gönder", plan.kind === "data" ? "CANCELLED" : "NEW", plan.kind === "data" ? null : dueIn(5)),
    t(9, "Gerekli yönetici/moderasyon onayını bekle", plan.kind === "data" ? "CANCELLED" : "WAITING_APPROVAL"),
    t(10, "Uygun yayın mekanizmasıyla yayınla", plan.kind === "data" ? "CANCELLED" : "WAITING_PUBLISH"),
    t(11, "Sonuçları ölç ve raporla", "NEW", dueIn(14)),
  ];
  return base;
}
