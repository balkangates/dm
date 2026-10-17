import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adCampaigns,
  aiContents,
  aiSettings,
  analyticsEvents,
  auditLogs,
  bonusGrants,
  bonusPolicies,
  businessHours,
  businessMedia,
  businessStaff,
  businesses,
  campaignUsages,
  campaigns,
  followedBusinesses,
  fraudReviews,
  invoiceItems,
  invoices,
  marketingPlanDays,
  marketingPlans,
  notifications,
  packages,
  products,
  qrCodes,
  referrals,
  reviews,
  savedCampaigns,
  serviceFeeRules,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/session";
import { buildMarketingPlan, type BusinessSnapshot, type SectorKey } from "@/lib/ai";
import { slugify } from "@/lib/money";

/**
 * DampingVar demo verisi.
 *
 * ÖNEMLİ: Bu seed müşteri cüzdanı, nakit bakiye, işletmeler arası ortak puan
 * havuzu veya mahsuplaşma ÜRETMEZ. DampingVar müşteri ödemesine aracılık etmez.
 * Oluşturulan finansal kayıtlar yalnızca işletmeye kesilen HİZMET BEDELİ
 * faturalarıdır (service_fee_rules + invoices).
 */

const DEMO_PASSWORD = "Demo1234!";

type BizSeed = {
  slug: string;
  name: string;
  category: string;
  subCategory: string;
  sectorKey: SectorKey;
  district: string;
  city: string;
  country: string;
  currency: string;
  address: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  website: string;
  description: string;
  story: string;
  logoText: string;
  coverImage: string;
  rating: number;
  reviewCount: number;
  planCode: string;
  featured: boolean;
  hours: [string, string];
  products: { name: string; description: string; priceCents: number; discountPriceCents?: number }[];
  campaign: {
    code: string;
    slug: string;
    title: string;
    description: string;
    terms: string;
    type: string;
    discountPercent: number;
    minBasketCents: number;
    currency: string;
    imageUrl: string;
    eligible: string[];
    exclusions: string[];
    sponsored?: boolean;
    moderation?: string;
    daysUntilEnd: number;
  };
  reviews: { authorName: string; rating: number; comment: string }[];
};

const BIZ: BizSeed[] = [
  {
    slug: "kadikoy-pizza-atolyesi",
    name: "Kadıköy Pizza Atölyesi",
    category: "restoran",
    subCategory: "Pizza & İtalyan",
    sectorKey: "restoran",
    district: "Kadıköy",
    city: "İstanbul",
    country: "TR",
    currency: "TRY",
    address: "Caferağa Mah. Moda Cad. No:74, Kadıköy / İstanbul",
    phone: "+90 216 348 12 34",
    whatsapp: "905321110034",
    instagram: "kadikoypizzaatolyesi",
    website: "kadikoypizzaatolyesi.com",
    description: "Taş fırında 48 saat mayalanmış hamur, günlük mozzarella ve yerel üreticiden malzemeler.",
    story: "2016'da Moda'da tek bir taş fırınla başladık. Hamurumuz 48 saat mayalanır, sosumuz her sabah taze çekilir.",
    logoText: "KPA",
    coverImage: "/images/restoran.jpg",
    rating: 4.7,
    reviewCount: 312,
    planCode: "BOOST",
    featured: true,
    hours: ["11:30", "23:30"],
    products: [
      { name: "Pizza Atölyesi Special", description: "Sucuk, mantar, taze kekik, mozzarella", priceCents: 40000, discountPriceCents: 32000 },
      { name: "Margherita Classica", description: "Domates sosu, mozzarella, fesleğen", priceCents: 32000 },
      { name: "Truffle & Mantarlı Pizza", description: "Kestane mantarı, trüf yağı, parmesan", priceCents: 48000 },
    ],
    campaign: {
      code: "KPA-20",
      slug: "kadikoy-pizza-yuzde-20",
      title: "Hafta İçi Akşam %20 Damping",
      description: "Pazartesi–Cuma akşamları tüm pizzalarda %20 indirim. İndirim işletme kasasında, kampanya koşulları sağlandığında uygulanır.",
      terms:
        "Kampanya 18:00–22:00 saatleri arasında geçerlidir. Minimum sepet tutarı 400 TL'dir. Bir müşteri kampanyadan en fazla 2 kez yararlanabilir. İndirim işletme tarafından kasada uygulanır; DampingVar ödeme almaz ve indirim tutarını finanse etmez. Kampanya başka indirimlerle birleştirilemez.",
      type: "PERCENT",
      discountPercent: 20,
      minBasketCents: 40000,
      currency: "TRY",
      imageUrl: "/images/restoran.jpg",
      eligible: ["Tüm pizzalar", "Ev yapımı makarnalar"],
      exclusions: ["İçecekler", "Tatlılar", "Paket servis"],
      sponsored: true,
      daysUntilEnd: 12,
    },
    reviews: [
      { authorName: "Elif Y.", rating: 5, comment: "Hamuru inanılmaz. Kampanya koşulunu kasada gösterdim, indirim uygulandı." },
      { authorName: "Mert K.", rating: 5, comment: "Moda'da fiyat/performans olarak en dengeli yer." },
      { authorName: "Selin A.", rating: 4, comment: "Akşam saatleri kalabalık, rezervasyon iyi oluyor." },
    ],
  },
  {
    slug: "moda-kahve-kavurma",
    name: "Moda Kahve Kavurma Atölyesi",
    category: "restoran",
    subCategory: "Kahve & Tatlı",
    sectorKey: "restoran",
    district: "Kadıköy",
    city: "İstanbul",
    country: "TR",
    currency: "TRY",
    address: "Caferağa Mah. Dr. Esat Işık Cad. No:12, Kadıköy / İstanbul",
    phone: "+90 216 337 55 21",
    whatsapp: "905321110021",
    instagram: "modakahve",
    website: "modakahve.co",
    description: "Kendi kavurduğumuz çekirdekler, günlük tatlılar ve Moda'ya bakan küçük bir teras.",
    story: "Kavurma makinemizi 2019'da dükkânın arkasına kurduk; o gün bugündür haftada iki kez kavuruyoruz.",
    logoText: "MK",
    coverImage: "/images/kahve.jpg",
    rating: 4.6,
    reviewCount: 198,
    planCode: "PRO",
    featured: true,
    hours: ["08:00", "22:00"],
    products: [
      { name: "Filtre Kahve (V60)", description: "Etiyopya Yirgacheffe, orta kavurma", priceCents: 12000, discountPriceCents: 9600 },
      { name: "San Sebastián Cheesecake", description: "Günlük hazırlanır, sınırlı sayıda", priceCents: 16500 },
    ],
    campaign: {
      code: "MK-SABAH-15",
      slug: "moda-kahve-sabah-indirimi",
      title: "Sabah 08:00–10:00 Kahve İndirimi",
      description: "Sabah saatlerinde filtre kahve ve tatlılarda %15 indirim.",
      terms: "08:00–10:00 arası geçerlidir. Minimum sepet 150 TL. Paket çekirdek satışlarında geçerli değildir.",
      type: "HOUR",
      discountPercent: 15,
      minBasketCents: 15000,
      currency: "TRY",
      imageUrl: "/images/kahve.jpg",
      eligible: ["Filtre kahve", "Espresso bazlı içecekler", "Günlük tatlılar"],
      exclusions: ["Paket çekirdek", "Ekipman"],
      daysUntilEnd: 5,
    },
    reviews: [
      { authorName: "Deniz T.", rating: 5, comment: "Kahve gerçekten taze kavrulmuş." },
      { authorName: "Burak S.", rating: 4, comment: "Teras küçük ama keyifli." },
    ],
  },
  {
    slug: "bogazici-yapi-market",
    name: "Boğaziçi Yapı Market",
    category: "yapi",
    subCategory: "Yapı Market & Hırdavat",
    sectorKey: "yapi",
    district: "Beyoğlu",
    city: "İstanbul",
    country: "TR",
    currency: "TRY",
    address: "Kaptanpaşa Mah. Piyalepaşa Bulvarı No:210, Beyoğlu / İstanbul",
    phone: "+90 212 234 78 90",
    whatsapp: "905321110090",
    instagram: "bogaziciyapi",
    website: "bogaziciyapi.com.tr",
    description: "Boya, nalbur, elektrik ve tesisat malzemelerinde 22 yıllık tedarik; ustaya özel fiyat.",
    story: "1998'de bir nalburduk. Bugün 4.500 kalem ürün ve aynı mahalledeyiz.",
    logoText: "BYM",
    coverImage: "/images/magaza-ic.jpg",
    rating: 4.5,
    reviewCount: 421,
    planCode: "BOOST",
    featured: true,
    hours: ["08:30", "19:30"],
    products: [
      { name: "Silikonlu İç Cephe Boyası 15 L", description: "Yıkanabilir, mat", priceCents: 289000, discountPriceCents: 245000 },
      { name: "Akülü Vidalama Seti", description: "2 akü, 40 parça aksesuar", priceCents: 349000 },
    ],
    campaign: {
      code: "BYM-PROJE-10",
      slug: "bogazici-proje-sepeti-indirimi",
      title: "Proje Sepetine %10 İndirim",
      description: "1.500 TL üzeri tadilat sepetlerinde %10 indirim. Usta kartı sahiplerine ek %2.",
      terms:
        "Minimum sepet 1.500 TL. Kampanya yalnızca mağazada geçerlidir, online siparişlerde uygulanmaz. Elektrikli el aletleri kampanya dışıdır. İndirim işletme tarafından uygulanır.",
      type: "PERCENT",
      discountPercent: 10,
      minBasketCents: 150000,
      currency: "TRY",
      imageUrl: "/images/magaza-ic.jpg",
      eligible: ["Boya ve yardımcı malzemeler", "Tesisat", "El aletleri"],
      exclusions: ["Akülü el aletleri", "Servis ücretleri"],
      sponsored: true,
      daysUntilEnd: 20,
    },
    reviews: [
      { authorName: "Ahmet U.", rating: 5, comment: "Usta olarak 10 yıldır buradan alıyorum, stok ciddi." },
      { authorName: "Nihal Ç.", rating: 4, comment: "Renk karışım servisi çok pratik." },
    ],
  },
  {
    slug: "nisantasi-sac-tasarim",
    name: "Nişantaşı Saç Tasarım",
    category: "hizmet",
    subCategory: "Kuaför & Güzellik",
    sectorKey: "hizmet",
    district: "Şişli",
    city: "İstanbul",
    country: "TR",
    currency: "TRY",
    address: "Teşvikiye Mah. Abdi İpekçi Cad. No:31, Şişli / İstanbul",
    phone: "+90 212 241 60 12",
    whatsapp: "905321110012",
    instagram: "nistantasisactasarim",
    website: "nistantasisactasarim.com",
    description: "Kesim, renklendirme ve bakım; randevulu çalışan üç kişilik butik ekip.",
    story: "Her saçın bir hikâyesi var. Önce dinliyoruz, sonra makası alıyoruz.",
    logoText: "NST",
    coverImage: "/images/guzellik.jpg",
    rating: 4.8,
    reviewCount: 156,
    planCode: "PRO",
    featured: false,
    hours: ["10:00", "20:00"],
    products: [],
    campaign: {
      code: "NST-ILK-25",
      slug: "nisantasi-ilk-ziyaret-indirimi",
      title: "İlk Ziyarete %25 İndirim",
      description: "DampingVar üzerinden gelen yeni müşterilerin ilk hizmetinde %25 indirim. Randevu zorunludur.",
      terms:
        "Yalnızca ilk hizmette geçerlidir. Randevu zorunludur. Minimum hizmet tutarı 750 TL. İndirim tutarı 2.500 TL'yi aşamaz. Başka kampanya ile birleştirilemez.",
      type: "FIRST",
      discountPercent: 25,
      minBasketCents: 75000,
      currency: "TRY",
      imageUrl: "/images/guzellik.jpg",
      eligible: ["Saç kesimi", "Bakım ritüelleri"],
      exclusions: ["Balyaj", "Keratin", "Ürün satışları"],
      daysUntilEnd: 8,
    },
    reviews: [
      { authorName: "Ceren B.", rating: 5, comment: "Randevu sistemi çok düzenli, sonuç tam istediğim gibi." },
      { authorName: "Aslı G.", rating: 5, comment: "İlk ziyaret indirimini uyguladılar." },
    ],
  },
  {
    slug: "bostanci-semt-market",
    name: "Bostancı Semt Market",
    category: "market",
    subCategory: "Market & Bakkal",
    sectorKey: "market",
    district: "Kadıköy",
    city: "İstanbul",
    country: "TR",
    currency: "TRY",
    address: "Bostancı Mah. Bağdat Cad. No:412, Kadıköy / İstanbul",
    phone: "+90 216 382 44 55",
    whatsapp: "905321110055",
    instagram: "bostancisemtmarket",
    website: "",
    description: "Günlük taze meyve-sebze, şarküteri ve temel gıda; mahallenin 24 yıllık marketi.",
    story: "Sabah 06:00'da halden gelen sebzeler, akşamüstü mahallenin sofrasında.",
    logoText: "BSM",
    coverImage: "/images/magaza-ic.jpg",
    rating: 4.4,
    reviewCount: 267,
    planCode: "PRO",
    featured: false,
    hours: ["07:30", "23:00"],
    products: [
      { name: "Kahvaltılık Paketi", description: "Peynir, zeytin, bal, reçel, tereyağı", priceCents: 89900, discountPriceCents: 76400 },
      { name: "Sebze Sepeti 5 kg", description: "Mevsim sebzeleri", priceCents: 45000 },
    ],
    campaign: {
      code: "BSM-OGLE-12",
      slug: "bostanci-ogleden-sonra-sepet",
      title: "Hafta İçi 14:00–17:00 Sepet İndirimi",
      description: "Öğleden sonra saatlerinde 400 TL üzeri sepetlerde %12 indirim.",
      terms: "Hafta içi 14:00–17:00 arası geçerlidir. Minimum sepet 400 TL. Tütün ve alkol ürünleri kampanya dışıdır.",
      type: "HOUR",
      discountPercent: 12,
      minBasketCents: 40000,
      currency: "TRY",
      imageUrl: "/images/magaza-ic.jpg",
      eligible: ["Gıda", "Temizlik", "Kahvaltılık"],
      exclusions: ["Tütün", "Alkol", "Kontör"],
      daysUntilEnd: 3,
    },
    reviews: [
      { authorName: "Hakan Ö.", rating: 4, comment: "Sebze gerçekten taze." },
      { authorName: "Gülay M.", rating: 5, comment: "Mahallenin en güvenilir marketi." },
    ],
  },
  {
    slug: "karakoy-lokantasi",
    name: "Karaköy Lokantası",
    category: "restoran",
    subCategory: "Ev Yemeği & Meyhane",
    sectorKey: "restoran",
    district: "Beyoğlu",
    city: "İstanbul",
    country: "TR",
    currency: "TRY",
    address: "Kemankeş Cad. No:11, Beyoğlu / İstanbul",
    phone: "+90 212 292 44 11",
    whatsapp: "905321110011",
    instagram: "karakoylokantasi",
    website: "karakoylokantasi.com",
    description: "Günlük ev yemekleri, zeytinyağlılar ve meyhane sofrası; 1954'ten beri Karaköy'de.",
    story: "Üç kuşaktır aynı mutfakta, her sabah aynı tencereler kaynıyor.",
    logoText: "KKL",
    coverImage: "/images/restoran.jpg",
    rating: 4.6,
    reviewCount: 508,
    planCode: "FREE",
    featured: false,
    hours: ["11:00", "23:00"],
    products: [
      { name: "Günün Tabağı", description: "3 çeşit ev yemeği + pilav + ayran", priceCents: 22000, discountPriceCents: 18700 },
      { name: "Zeytinyağlı Seçmece", description: "5 çeşit meze tabağı", priceCents: 26000 },
    ],
    campaign: {
      code: "KKL-OGLE-15",
      slug: "karakoy-ogle-molasi",
      title: "Öğle Molasında %15 İndirim",
      description: "12:00–15:00 arası günün tabağında %15 indirim.",
      terms: "12:00–15:00 arası geçerlidir. Minimum sepet 200 TL. Meyhane menüsünde geçerli değildir.",
      type: "PERCENT",
      discountPercent: 15,
      minBasketCents: 20000,
      currency: "TRY",
      imageUrl: "/images/restoran.jpg",
      eligible: ["Günün tabağı", "Zeytinyağlılar"],
      exclusions: ["Meyhane menüsü", "İçecekler"],
      moderation: "PENDING",
      daysUntilEnd: 16,
    },
    reviews: [
      { authorName: "Yusuf D.", rating: 5, comment: "Anneanne yemeği gibi." },
      { authorName: "Pelin E.", rating: 4, comment: "Mezeler taze, servis hızlı." },
    ],
  },
  {
    slug: "tbilisi-corner-cafe",
    name: "Tbilisi Corner Café",
    category: "restoran",
    subCategory: "Kafe & Fırın",
    sectorKey: "restoran",
    district: "Vake",
    city: "Tbilisi",
    country: "GE",
    currency: "GEL",
    address: "Chavchavadze Ave 12, Vake, Tbilisi",
    phone: "+995 32 222 10 10",
    whatsapp: "995555101010",
    instagram: "tbilisicorner",
    website: "tbilisicorner.ge",
    description: "Gürcü fırını, özel kahve ve öğle menüsü; Vake'nin mahalle kafesi.",
    story: "2020'de Vake'de küçük bir fırınla başladık; her sabah khachapuri taze çıkar.",
    logoText: "TCC",
    coverImage: "/images/kahve.jpg",
    rating: 4.5,
    reviewCount: 87,
    planCode: "PRO",
    featured: false,
    hours: ["08:00", "21:00"],
    products: [
      { name: "Khachapuri (Adjarian)", description: "Günlük hamur, yerel peynir", priceCents: 1800, discountPriceCents: 1440 },
      { name: "Öğle menüsü", description: "Çorba + ana yemek + içecek", priceCents: 2600 },
    ],
    campaign: {
      code: "TCC-LUNCH-20",
      slug: "tbilisi-corner-ogle-firsati",
      title: "Lunch Deal — 20% Off",
      description: "Öğle menüsünde hafta içi %20 indirim. Kampanya işletme kasasında uygulanır.",
      terms: "12:00–15:00, hafta içi. Minimum sepet 20 GEL. Alkollü içecekler hariçtir.",
      type: "PERCENT",
      discountPercent: 20,
      minBasketCents: 2000,
      currency: "GEL",
      imageUrl: "/images/kahve.jpg",
      eligible: ["Öğle menüsü", "Fırın ürünleri"],
      exclusions: ["Alkollü içecekler", "Teslimat"],
      daysUntilEnd: 9,
    },
    reviews: [
      { authorName: "Nino K.", rating: 5, comment: "Khachapuri çok iyi, öğle indirimi gerçekten uygulanıyor." },
      { authorName: "Giorgi B.", rating: 4, comment: "Kahve kaliteli, servis hızlı." },
    ],
  },
];

/* ------------------------------------------------------------------ */

async function upsertBusiness(b: BizSeed) {
  const existing = await db.select().from(businesses).where(eq(businesses.slug, b.slug)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(businesses)
    .values({
      slug: b.slug,
      name: b.name,
      category: b.category,
      subCategory: b.subCategory,
      sectorKey: b.sectorKey,
      district: b.district,
      city: b.city,
      country: b.country,
      currency: b.currency,
      address: b.address,
      phone: b.phone,
      whatsapp: b.whatsapp,
      instagram: b.instagram,
      website: b.website,
      description: b.description,
      story: b.story,
      logoText: b.logoText,
      coverImage: b.coverImage,
      rating: b.rating,
      reviewCount: b.reviewCount,
      planCode: b.planCode,
      verified: true,
      featured: b.featured,
    })
    .returning();

  for (let d = 0; d < 7; d++) {
    await db.insert(businessHours).values({
      businessId: row.id,
      dayOfWeek: d,
      opensAt: b.hours[0],
      closesAt: b.hours[1],
      closed: d === 0 && b.sectorKey === "yapi",
    });
  }
  for (const p of b.products) {
    await db.insert(products).values({
      businessId: row.id,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      discountPriceCents: p.discountPriceCents ?? null,
      category: b.subCategory,
      imageUrl: b.coverImage,
    });
  }
  await db.insert(businessMedia).values([
    { businessId: row.id, kind: "IMAGE", url: b.coverImage, caption: `${b.name} — ${b.district}`, sortOrder: 0 },
    { businessId: row.id, kind: "IMAGE", url: "/images/magaza-ic.jpg", caption: "İşletme içi", sortOrder: 1 },
  ]);
  for (const r of b.reviews) {
    await db.insert(reviews).values({ businessId: row.id, authorName: r.authorName, rating: r.rating, comment: r.comment });
  }
  return row;
}

async function upsertCampaign(businessId: string, c: BizSeed["campaign"]) {
  const endsAt = new Date(Date.now() + c.daysUntilEnd * 86400000);
  const values = {
    businessId,
    code: c.code,
    slug: c.slug,
    title: c.title,
    description: c.description,
    terms: c.terms,
    type: c.type,
    discountPercent: c.discountPercent,
    discountAmountCents: 0,
    minBasketCents: c.minBasketCents,
    maxDiscountCents: 0,
    currency: c.currency,
    imageUrl: c.imageUrl,
    eligibleItems: c.eligible,
    exclusions: c.exclusions,
    startsAt: new Date(Date.now() - 3 * 86400000),
    endsAt,
    timeStart: c.type === "HOUR" ? "14:00" : null,
    timeEnd: c.type === "HOUR" ? "17:00" : null,
    days: c.type === "HOUR" ? [1, 2, 3, 4, 5] : [],
    perCustomerLimit: 2,
    usageLimit: 500,
    status: "PUBLISHED",
    moderationStatus: c.moderation ?? "APPROVED",
    isSponsored: !!c.sponsored,
    qrEnabled: true,
    views: 900 + Math.round(Math.random() * 3200),
    clicks: 120 + Math.round(Math.random() * 540),
  };
  const existing = await db.select().from(campaigns).where(eq(campaigns.code, c.code)).limit(1);
  if (existing[0]) {
    const [row] = await db.update(campaigns).set(values).where(eq(campaigns.id, existing[0].id)).returning();
    return row;
  }
  const [row] = await db.insert(campaigns).values(values).returning();
  return row;
}

async function upsertUser(input: {
  email: string;
  name: string;
  role: string;
  referralCode: string;
  district?: string;
  country?: string;
  businessId?: string | null;
  referredBy?: string | null;
  hash: string;
}) {
  const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing[0]) return existing[0];

  // Davet kodu benzersiz olmalı: eski demo kayıtları aynı kodu kullanıyorsa son ek ekle.
  let code = input.referralCode;
  for (let i = 0; i < 8; i++) {
    const clash = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
    if (!clash[0]) break;
    code = `${input.referralCode}${i + 2}`;
  }

  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      role: input.role,
      referralCode: code,
      district: input.district ?? null,
      country: input.country ?? "TR",
      businessId: input.businessId ?? null,
      referredBy: input.referredBy ?? null,
      passwordHash: input.hash,
      lang: input.country === "GE" ? "ka" : "tr",
      currency: input.country === "GE" ? "GEL" : "TRY",
    })
    .returning();
  return row;
}

export async function ensureSeed(): Promise<void> {
  const adminExists = await db.select().from(users).where(eq(users.email, "admin@dampingvar.demo")).limit(1);
  const businessesCount = await db.execute(sql`select count(*)::int as n from businesses`);
  const fresh = Number((businessesCount.rows ?? [])[0]?.n ?? 0) === 0;

  /* --- platform ayarları --- */
  if ((await db.select().from(packages)).length === 0) {
    await db.insert(packages).values([
      { code: "FREE", name: "Ücretsiz İşletme Profili", priceMonthlyCents: 0, aiQuotaMonthly: 0, features: ["İşletme sayfası", "2 aktif kampanya", "Temel görünürlük", "QR kampanya bağlantısı", "Aylık temel rapor"] },
      { code: "PRO", name: "Büyüme Paketi", priceMonthlyCents: 249000, aiQuotaMonthly: 120, features: ["Sınırsız kampanya", "QR kampanya yönetimi", "AI içerik üretimi", "Kampanya performans raporu", "Öncelikli destek"] },
      { code: "BOOST", name: "Görünürlük + AI Programı", priceMonthlyCents: 699000, aiQuotaMonthly: 400, features: ["Bölgesel reklam", "Öne çıkan yerleşim", "28 günlük AI büyüme programı", "Gelişmiş analitik", "Hesap yöneticisi"] },
      { code: "AI28", name: "28 Günlük AI Pazarlama Hizmeti", priceMonthlyCents: 349000, aiQuotaMonthly: 200, features: ["28 günlük içerik takvimi", "Haftalık AI önerileri", "Reklam metni ve başlık üretimi", "Video senaryosu"] },
    ]);

  }
  if ((await db.select().from(aiSettings)).length === 0) {
    await db.insert(aiSettings).values([
      { key: "ai_provider", value: "local-template-engine", description: "İçerik üretim sağlayıcısı. Harici LLM bağlanana kadar yerel şablon motoru kullanılır." },
      { key: "ai_model", value: "dampingvar-marketing-v1", description: "Kullanılan model sürümü" },
      { key: "ai_api_key", value: "NOT_CONFIGURED", description: "Sağlayıcı anahtarı yalnızca sunucu tarafında okunur; tarayıcıya gönderilmez." },
      { key: "social_publishing", value: "NOT_CONNECTED", description: "Sosyal medya yayınlama API erişimi doğrulanmadı. Otomatik yayın kapalı." },
      { key: "video_generation", value: "NOT_CONNECTED", description: "Video üretimi sağlayıcısı bağlı değil; yalnızca senaryo ve kurgu planı üretilir." },
      { key: "ai_monthly_quota_default", value: "120", description: "Paket seçilmediğinde uygulanan aylık içerik üretim limiti" },
    ]);

  }
  if ((await db.select().from(bonusPolicies)).length === 0) {
    await db.insert(bonusPolicies).values([
      {
        key: "DEFAULT",
        businessId: null,
        rewardKind: "FIXED",
        rewardCents: 10000,
        rewardPercent: 0,
        maxRewardCents: 25000,
        minPurchaseCents: 25000,
        validDays: 60,
        maxPerInviter: 10,
        requiresVerification: true,
        active: true,
      },
      {
        key: "PERCENT_BASKET",
        businessId: null,
        rewardKind: "PERCENT_OF_BASKET",
        rewardCents: 0,
        rewardPercent: 0.05,
        maxRewardCents: 20000,
        minPurchaseCents: 40000,
        validDays: 45,
        maxPerInviter: 6,
        requiresVerification: true,
        active: false,
      },
    ]);
  }

  /* --- işletmeler + kampanyalar --- */
  const bizRows: Record<string, { id: string; name: string; slug: string; sectorKey: string; district: string }> = {};
  const campaignBySlug: Record<string, string> = {};
  for (const b of BIZ) {
    const row = await upsertBusiness(b);
    bizRows[b.slug] = { id: row.id, name: row.name, slug: row.slug, sectorKey: row.sectorKey, district: row.district };
    const camp = await upsertCampaign(row.id, b.campaign);
    campaignBySlug[b.campaign.slug] = camp.id;
    const qrExisting = await db.select().from(qrCodes).where(eq(qrCodes.code, `QR-${b.campaign.code}`)).limit(1);
    if (!qrExisting[0]) {
      await db.insert(qrCodes).values({
        code: `QR-${b.campaign.code}`,
        businessId: row.id,
        campaignId: camp.id,
        customerId: null,
        status: "ACTIVE",
      });
    }
    const staffExisting = await db.select().from(businessStaff).where(eq(businessStaff.businessId, row.id));
    if (staffExisting.length === 0) {
      await db.insert(businessStaff).values([
        { businessId: row.id, userKey: `${b.slug}-owner`, name: `${b.name} — İşletme Sahibi`, email: "isletme@dampingvar.demo", role: "OWNER" },
        { businessId: row.id, userKey: `${b.slug}-manager`, name: `${b.name} — Yönetici`, email: `yonetici@${b.slug}.demo`, role: "MANAGER" },
        { businessId: row.id, userKey: `${b.slug}-staff`, name: `${b.name} — Personel`, email: `personel@${b.slug}.demo`, role: "CASHIER" },
      ]);
    }
    if (fresh) {
      await db.insert(adCampaigns).values({
        businessId: row.id,
        name: `${b.district} bölgesel görünürlük`,
        placement: b.planCode === "BOOST" ? "ANASAYFA" : "KATEGORI",
        city: b.city,
        district: b.district,
        category: b.category,
        budgetCents: b.planCode === "BOOST" ? 2500000 : 0,
        status: b.planCode === "BOOST" ? "ACTIVE" : "DRAFT",
        startsAt: new Date(Date.now() - 10 * 86400000),
        endsAt: new Date(Date.now() + 20 * 86400000),
        impressions: 4200 + Math.round(Math.random() * 9000),
        clicks: 180 + Math.round(Math.random() * 420),
      });
    }
  }

  // Erken dönüş YOK: aşağıdaki her blok kendi idempotency korumasına sahip
  // (e-posta/unique anahtar/sayı eşiği). Böylece yarım kalmış demo verisi
  // yeniden çalıştırmada tamamlanır, mevcut kayıtlar çoğaltılmaz.
  void adminExists;
  void fresh;

  /* --- kullanıcılar --- */
  const hash = hashPassword(DEMO_PASSWORD);
  const pizza = bizRows["kadikoy-pizza-atolyesi"];
  const kahve = bizRows["moda-kahve-kavurma"];
  const yapi = bizRows["bogazici-yapi-market"];

  const ahmet = await upsertUser({ email: "musteri@dampingvar.demo", name: "Ahmet Yılmaz", role: "CUSTOMER", referralCode: "AHMET728", district: "Kadıköy", hash });
  const mehmet = await upsertUser({ email: "arkadas@dampingvar.demo", name: "Mehmet Demir", role: "CUSTOMER", referralCode: "MEHMET441", district: "Kadıköy", referredBy: ahmet.id, hash });
  const zeynep = await upsertUser({ email: "zeynep@dampingvar.demo", name: "Zeynep Kaya", role: "CUSTOMER", referralCode: "ZEYNEP913", district: "Şişli", referredBy: ahmet.id, hash });
  const owner = await upsertUser({ email: "isletme@dampingvar.demo", name: "Pizza Atölyesi — İşletme Sahibi", role: "BUSINESS", referralCode: "ISLETME01", businessId: pizza.id, hash });
  await upsertUser({ email: "admin@dampingvar.demo", name: "DampingVar Platform Yöneticisi", role: "ADMIN", referralCode: "ADMIN001", hash });

  /* --- referral ilişkileri --- */
  // Çift bazlı idempotent davet kayıtları (legacy satırlar yeni demo kullanıcılarını bağlamaz).
  async function ensureReferral(inviterId: string, inviteeId: string, code: string, status: string, flags: string[] = [], daysAgo = 5) {
    const found = await db
      .select()
      .from(referrals)
      .where(and(eq(referrals.inviterId, inviterId), eq(referrals.inviteeId, inviteeId)))
      .limit(1);
    if (found[0]) return found[0];
    const [row] = await db
      .insert(referrals)
      .values({
        inviterId,
        inviteeId,
        code,
        status,
        fraudFlags: flags,
        registeredAt: status === "INVITED" ? null : new Date(Date.now() - daysAgo * 86400000),
      })
      .returning();
    return row;
  }

  const refMehmet = await ensureReferral(ahmet.id, mehmet.id, ahmet.referralCode, "QUALIFIED", [], 9);
  const refMehmetId: string | null = refMehmet.id;
  await ensureReferral(ahmet.id, zeynep.id, ahmet.referralCode, "REGISTERED", [], 2);
  await ensureReferral(mehmet.id, zeynep.id, mehmet.referralCode, "REJECTED", ["SAME_DEVICE", "SHORT_INTERVAL"], 1);

  /* --- kampanya kullanım olayları (QR okutma ≠ doğrulanmış satış) --- */
  const usageCount = await db.execute(sql`select count(*)::int as n from campaign_usages`);
  const usageIds: string[] = [];
  // Eşik 20: az sayıda kayıt varsa demo olay seti tamamlanır (idempotent).
  if (Number((usageCount.rows ?? [])[0]?.n ?? 0) < 20) {
    const keys = Object.keys(bizRows);
    const statuses = ["VERIFIED", "VERIFIED", "VERIFIED", "QR_SCANNED", "QR_SCANNED", "SUBMITTED", "REJECTED"];
    const channels = ["IN_STORE", "IN_STORE", "LINK", "REFERRAL"];
    for (let i = 0; i < 46; i++) {
      const bKey = keys[i % keys.length];
      const b = bizRows[bKey];
      const campaignId = campaignBySlug[BIZ.find((x) => x.slug === bKey)!.campaign.slug];
      const status = statuses[i % statuses.length];
      const daysAgo = (i % 14) + 1;
      const scannedAt = new Date(Date.now() - daysAgo * 86400000 - (i % 9) * 3600000);
      const customer = i % 3 === 0 ? mehmet.id : i % 3 === 1 ? ahmet.id : null;
      const reported = status === "VERIFIED" ? 60000 + ((i * 733) % 180000) : null;
      const [row] = await db
        .insert(campaignUsages)
        .values({
          businessId: b.id,
          campaignId,
          qrCodeId: null,
          customerId: customer,
          status,
          channel: channels[i % channels.length],
          reportedBasketCents: reported,
          reportedDiscountCents: reported ? Math.round((reported * (BIZ.find((x) => x.slug === bKey)!.campaign.discountPercent || 10)) / 100) : null,
          currency: "TRY",
          idempotencyKey: `SEED-USAGE-${i}`,
          scannedAt,
          verifiedAt: status === "VERIFIED" ? new Date(scannedAt.getTime() + 45 * 60000) : null,
          note: status === "REJECTED" ? "Minimum sepet tutarı sağlanmadı (işletme bildirimi)." : null,
        })
        .returning();
      if (!usageIds.includes(row.id)) usageIds.push(row.id);
    }
  } else {
    const rows = await db.select().from(campaignUsages).limit(60);
    rows.forEach((r) => usageIds.push(r.id));
  }

  /* --- mağazaya bağlı Damping Bonus hakları --- */
  const bonusCount = await db.execute(sql`select count(*)::int as n from bonus_grants`);
  if (Number((bonusCount.rows ?? [])[0]?.n ?? 0) === 0) {
    const verifiedUsageId = usageIds[0] ?? null;
    if (refMehmetId) {
      await db.update(referrals).set({ status: "QUALIFIED", sourceUsageId: verifiedUsageId }).where(eq(referrals.id, refMehmetId));
    }
    const grants: Array<Record<string, unknown>> = [
      {
        userId: ahmet.id,
        businessId: pizza.id,
        sourceReferralId: refMehmetId,
        sourceUsageId: verifiedUsageId,
        valueCents: 10000,
        currency: "TRY",
        minPurchaseCents: 25000,
        status: "AVAILABLE",
        expiresAt: new Date(Date.now() + 42 * 86400000),
      },
      {
        userId: ahmet.id,
        businessId: kahve.id,
        sourceUsageId: usageIds[3] ?? null,
        valueCents: 5000,
        currency: "TRY",
        minPurchaseCents: 15000,
        status: "PENDING_VERIFICATION",
        expiresAt: new Date(Date.now() + 60 * 86400000),
      },
      {
        userId: ahmet.id,
        businessId: yapi.id,
        sourceUsageId: usageIds[5] ?? null,
        valueCents: 15000,
        currency: "TRY",
        minPurchaseCents: 50000,
        status: "USED",
        redeemedAt: new Date(Date.now() - 4 * 86400000),
        expiresAt: new Date(Date.now() + 10 * 86400000),
      },
      {
        userId: mehmet.id,
        businessId: pizza.id,
        sourceUsageId: usageIds[7] ?? null,
        valueCents: 7500,
        currency: "TRY",
        minPurchaseCents: 20000,
        status: "EXPIRED",
        expiresAt: new Date(Date.now() - 2 * 86400000),
      },
    ];
    for (const g of grants) {
      await db.insert(bonusGrants).values(g as never);
    }
    await db.insert(fraudReviews).values({
      userId: mehmet.id,
      reason: "Şüpheli davet davranışı",
      signals: ["SAME_DEVICE", "SHORT_INTERVAL"],
      status: "OPEN",
    });
  }

  /* --- müşteri etkileşimleri --- */
  const savedCount = await db.execute(sql`select count(*)::int as n from saved_campaigns`);
  if (Number((savedCount.rows ?? [])[0]?.n ?? 0) === 0) {
    await db.insert(savedCampaigns).values([
      { userId: ahmet.id, campaignId: campaignBySlug["kadikoy-pizza-yuzde-20"] },
      { userId: ahmet.id, campaignId: campaignBySlug["nisantasi-ilk-ziyaret-indirimi"] },
    ]);
    await db.insert(followedBusinesses).values([
      { userId: ahmet.id, businessId: pizza.id },
      { userId: ahmet.id, businessId: kahve.id },
    ]);
    await db.insert(notifications).values([
      { userId: ahmet.id, kind: "BONUS", title: "Damping Bonus hazır", body: "Kadıköy Pizza Atölyesi'nde 100,00 TL indirim hakkın var. Yalnızca bu mağazada geçerli.", link: "/hesabim?s=bonus" },
      { userId: ahmet.id, kind: "REFERRAL", title: "Davetin doğrulandı", body: "Mehmet Demir'in alışverişi işletme tarafından doğrulandı.", link: "/hesabim?s=referrals" },
      { userId: ahmet.id, kind: "CAMPAIGN", title: "Takip ettiğin işletmede yeni kampanya", body: "Moda Kahve Kavurma Atölyesi sabah indirimi yayında.", link: "/kampanyalar", read: true },
      { userId: owner.id, kind: "SYSTEM", title: "28 günlük program başladı", body: "Hafta 1 görevleri hazır: profil analizi ve hedef kitle.", link: "/panel?s=growth" },
    ]);
  }

  /* --- hizmet bedeli kuralları + faturalar (DampingVar'ın GELİRİ) --- */
  const feeCount = await db.execute(sql`select count(*)::int as n from service_fee_rules`);
  if (Number((feeCount.rows ?? [])[0]?.n ?? 0) === 0) {
    const [subRule] = await db
      .insert(serviceFeeRules)
      .values({
        businessId: pizza.id,
        packageCode: "BOOST",
        serviceType: "SUBSCRIPTION",
        kind: "FIXED",
        amountCents: 699000,
        calculationBase: "MONTHLY",
        currency: "TRY",
      })
      .returning();
    await db.insert(serviceFeeRules).values([
      { businessId: pizza.id, serviceType: "REGIONAL_ADS", kind: "FIXED", amountCents: 250000, calculationBase: "MONTHLY", currency: "TRY" },
      { businessId: pizza.id, serviceType: "GROWTH_28", kind: "FIXED", amountCents: 349000, calculationBase: "PER_CAMPAIGN", currency: "TRY" },
      { businessId: pizza.id, serviceType: "REFERRAL_SERVICE", kind: "PERCENT", rate: 0.02, calculationBase: "PER_VERIFIED_USAGE", currency: "TRY" },
      { businessId: kahve.id, packageCode: "PRO", serviceType: "SUBSCRIPTION", kind: "FIXED", amountCents: 249000, calculationBase: "MONTHLY", currency: "TRY" },
      { businessId: null, packageCode: "FREE", serviceType: "SUBSCRIPTION", kind: "FIXED", amountCents: 0, calculationBase: "MONTHLY", currency: "TRY" },
    ]);

    const now = new Date();
    const inv1 = await db
      .insert(invoices)
      .values({
        businessId: pizza.id,
        number: "DV-2025-000142",
        periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        periodEnd: new Date(now.getFullYear(), now.getMonth(), 0),
        currency: "TRY",
        subtotalCents: 1298000,
        taxRate: 0.2,
        taxCents: 259600,
        totalCents: 1557600,
        status: "PAID",
        issuedAt: new Date(now.getFullYear(), now.getMonth(), 1),
        dueDate: new Date(now.getFullYear(), now.getMonth(), 15),
        paidAt: new Date(now.getFullYear(), now.getMonth(), 9),
        note: "Sözleşme: DV-BST-2024/118 · hizmet bedeli faturası",
      })
      .returning();
    await db.insert(invoiceItems).values([
      { invoiceId: inv1[0].id, feeRuleId: subRule.id, serviceType: "SUBSCRIPTION", description: "Boost görünürlük paketi (aylık abonelik)", quantity: 1, unitPriceCents: 699000, amountCents: 699000 },
      { invoiceId: inv1[0].id, serviceType: "REGIONAL_ADS", description: "Kadıköy bölgesel reklam — ana sayfa yerleşimi", quantity: 1, unitPriceCents: 250000, amountCents: 250000 },
      { invoiceId: inv1[0].id, serviceType: "GROWTH_28", description: "28 günlük AI büyüme programı", quantity: 1, unitPriceCents: 349000, amountCents: 349000 },
    ]);

    const inv2 = await db
      .insert(invoices)
      .values({
        businessId: pizza.id,
        number: "DV-2025-000188",
        periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
        periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        currency: "TRY",
        subtotalCents: 1048000,
        taxRate: 0.2,
        taxCents: 209600,
        totalCents: 1257600,
        status: "ISSUED",
        issuedAt: new Date(),
        dueDate: new Date(Date.now() + 14 * 86400000),
        note: "Yönlendirme hizmeti bedeli doğrulanmış kullanım sayısına göre hesaplanır.",
      })
      .returning();
    await db.insert(invoiceItems).values([
      { invoiceId: inv2[0].id, serviceType: "SUBSCRIPTION", description: "Boost görünürlük paketi (aylık abonelik)", quantity: 1, unitPriceCents: 699000, amountCents: 699000 },
      { invoiceId: inv2[0].id, serviceType: "REFERRAL_SERVICE", description: "Yönlendirme hizmeti — 12 doğrulanmış kullanım × %2", quantity: 12, unitPriceCents: 29166, appliedRate: 0.02, amountCents: 349000 },
    ]);

    await db.insert(invoices).values({
      businessId: kahve.id,
      number: "DV-2025-000190",
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      currency: "TRY",
      subtotalCents: 249000,
      taxRate: 0.2,
      taxCents: 49800,
      totalCents: 298800,
      status: "OVERDUE",
      issuedAt: new Date(Date.now() - 26 * 86400000),
      dueDate: new Date(Date.now() - 6 * 86400000),
      note: "Hatırlatma gönderildi.",
    });
  }

  /* --- AI içerikleri + 28 günlük program --- */
  const contentCount = await db.execute(sql`select count(*)::int as n from marketing_plans`);
  if (Number((contentCount.rows ?? [])[0]?.n ?? 0) === 0) {
    for (const b of BIZ) {
      const id = bizRows[b.slug].id;
      const snapshot: BusinessSnapshot = {
        name: b.name,
        sectorKey: b.sectorKey,
        category: b.category,
        district: b.district,
        city: b.city,
        description: b.description,
        rating: b.rating,
        reviewCount: b.reviewCount,
        products: b.products.map((p) => ({ name: p.name, priceCents: p.priceCents, discountPriceCents: p.discountPriceCents ?? null })),
        services: [],
        campaigns: [{ title: b.campaign.title, type: b.campaign.type, discountPercent: b.campaign.discountPercent, discountAmountCents: 0 }],
        stats: {
          pageViews: 0,
          campaignViews: 0,
          qrGenerated: 0,
          qrRedeemed: 0,
          transactionCount: 0,
          revenueCents: 0,
          avgBasketCents: 0,
          newCustomers: 0,
          repeatRate: 0,
          hourHistogram: Array.from({ length: 24 }, (_, h) => (h >= 18 && h <= 21 ? 40 : h >= 11 && h <= 14 ? 30 : 8)),
          dayHistogram: [22, 26, 34, 29, 31, 46, 42],
        },
      };
      const [plan] = await db
        .insert(marketingPlans)
        .values({ businessId: id, title: `28 Günlük Büyüme Programı — ${b.name}`, goal: "Bu hafta müşteri sayısını artırmak istiyorum.", sectorKey: b.sectorKey, status: "ACTIVE" })
        .returning();
      for (const d of buildMarketingPlan(snapshot)) {
        await db.insert(marketingPlanDays).values({
          planId: plan.id,
          day: d.day,
          theme: d.theme,
          task: d.task,
          channel: d.channel,
          caption: `${d.theme} — ${b.name}, ${b.district}`,
          cta: d.cta,
          done: d.day <= 4,
        });
      }

      await db.insert(aiContents).values([
        {
          businessId: id,
          kind: "SOCIAL",
          platform: "Instagram",
          title: `${b.district}'te ${b.products[0]?.name ?? b.subCategory}`,
          body: `${b.name}, ${b.district}'te sizi bekliyor.\n\n${b.description}\n\nAktif kampanya: ${b.campaign.title}\nKoşullar: ${b.campaign.terms.slice(0, 120)}…`,
          cta: "Kampanya koşullarını incele",
          status: "DRAFT",
        },
        {
          businessId: id,
          kind: "AD",
          platform: "DampingVar Reklam Ağı",
          title: "Reklam A — Fiyat odaklı",
          body: `${b.name} — ${b.campaign.title}. ${b.district}, ${b.city}. Minimum sepet ${b.campaign.minBasketCents / 100} TL.`,
          cta: "Koşulları gör",
          variant: "A",
          status: "DRAFT",
        },
        {
          businessId: id,
          kind: "AD",
          platform: "DampingVar Reklam Ağı",
          title: "Reklam C — Lokasyon odaklı",
          body: `${b.district}'te ${b.category} arıyorsan: ${b.name}. Kampanya ${b.campaign.daysUntilEnd} gün daha geçerli.`,
          cta: "Yol tarifi al",
          variant: "C",
          status: "APPROVED",
          approvedAt: new Date(),
        },
        {
          businessId: id,
          kind: "VIDEO",
          platform: "Instagram Reels",
          title: `${b.name} — 15 saniyelik kampanya videosu`,
          body: "0–3 sn: sokak ve tabela\n3–7 sn: ürün yakın çekim\n7–11 sn: kampanya koşulları kartı\n11–15 sn: QR ve mağaza yönlendirmesi",
          cta: "Mağazada QR'ı göster",
          status: "DRAFT",
          meta: { durationSec: 15 },
        },
      ]);
    }
  }

  /* --- analitik olayları (son 14 gün) --- */
  const evCount = await db.execute(sql`select count(*)::int as n from analytics_events`);
  if (Number((evCount.rows ?? [])[0]?.n ?? 0) < 200) {
    const kinds = ["campaign_view", "campaign_view", "campaign_click", "business_view", "qr_scanned", "ad_impression", "ad_impression", "ad_click", "offer_view", "referral_click"];
    const rows: Array<Record<string, unknown>> = [];
    for (const b of BIZ) {
      const id = bizRows[b.slug].id;
      const cid = campaignBySlug[b.campaign.slug];
      for (let i = 0; i < 60; i++) {
        rows.push({
          businessId: id,
          campaignId: kinds[i % kinds.length].startsWith("campaign") || kinds[i % kinds.length] === "qr_scanned" ? cid : null,
          userId: i % 5 === 0 ? ahmet.id : null,
          kind: kinds[i % kinds.length],
          meta: { day: i % 14, hour: 9 + (i % 13), source: i % 3 === 0 ? "arama" : "ana-sayfa" },
          createdAt: new Date(Date.now() - (i % 14) * 86400000 - (i % 11) * 3600000),
        });
      }
    }
    for (const r of rows) await db.insert(analyticsEvents).values(r as never);
  }

  /* --- affiliate + video varlıkları --- */
  await seedAffiliate();

  /* --- audit --- */
  await db.insert(auditLogs).values([
    { actor: "system@dampingvar.demo", role: "SYSTEM", action: "SEED_COMPLETED", entityType: "platform", entityId: null, meta: { version: "v2-compliant" } },
    { actor: "admin@dampingvar.demo", role: "ADMIN", action: "BONUS_POLICY_UPDATED", entityType: "bonus_policies", entityId: "DEFAULT", meta: { rewardCents: 10000, validDays: 60 } },
    { actor: "isletme@dampingvar.demo", role: "BUSINESS", action: "CAMPAIGN_PUBLISHED", entityType: "campaigns", entityId: campaignBySlug["kadikoy-pizza-yuzde-20"] ?? null, meta: {} },
  ]);
}

export { DEMO_PASSWORD, slugify };

/* ================================================================== *
 * AFFILIATE (ONLINE FIRSAT) + EĞİTİM VİDEOLARI DEMO VERİSİ
 *
 * DÜRÜSTLÜK KURALLARI:
 * - Ağ bağlantısı YOK → status NOT_CONNECTED / PENDING_CREDENTIALS.
 * - Tüm teklifler isSample=true (örnek içerik; gerçek kampanya iddiası değil).
 * - Komisyon kayıtları source=DEMO_SAMPLE olarak işaretlenir; canlı ağ
 *   raporundan gelmiş gibi sunulmaz.
 * - Fiyat yalnızca priceVerified=true ise gösterilir.
 * ================================================================== */

const DISCLOSURE =
  "Bu bağlantı üzerinden gerçekleşen uygun alışverişlerden DampingVar komisyon kazanabilir. Alışverişinizi doğrudan ilgili mağazada tamamlarsınız; DampingVar ödeme almaz.";

type OfferSeed = {
  slug: string; merchant: string; title: string; description: string; category: string;
  country: string; destinationUrl: string; currency: string; priceCents: number | null;
  priceVerified: boolean; commissionTerms: string | null; terms: string; exclusions: string[];
  imageUrl: string; daysUntilEnd: number; sponsored?: boolean; network: number;
};

const OFFERS: OfferSeed[] = [
  {
    slug: "ornek-moda-kis-koleksiyonu", merchant: "Örnek Moda (demo marka)", title: "Kış Koleksiyonunda Seçili Ürünler",
    description: "Mont, triko ve botlarda seçili ürünlerde dönem sonu indirimi. Alışveriş markanın kendi sitesinde tamamlanır.",
    category: "moda", country: "TR", destinationUrl: "https://example.com/demo-modа", currency: "TRY",
    priceCents: null, priceVerified: false, commissionTerms: null,
    terms: "İndirim marka sitesinde geçerlidir. DampingVar fiyat veya stok garantisi vermez. Son güncelleme tarihinde geçerli olan koşullar esas alınır.",
    exclusions: ["Hediye çeki", "İade ürünler"], imageUrl: "/images/moda.jpg", daysUntilEnd: 18, sponsored: true, network: 0,
  },
  {
    slug: "sampletech-kulaklik", merchant: "SampleTech (demo marka)", title: "Kablosuz Kulaklık — Lanse Fiyatı",
    description: "Yeni nesil kablosuz kulaklık lansmanına özel tanıtım fiyatı. Stok ve fiyat satıcı sitesinde doğrulanır.",
    category: "elektronik", country: "TR", destinationUrl: "https://example.com/demo-sampletech", currency: "TRY",
    priceCents: 249900, priceVerified: true, commissionTerms: "Ağ tarafından sağlanmadı — bağlantı kurulunca güncellenecek",
    terms: "Fiyat satıcı tarafından değiştirilebilir. DampingVar satıcı değildir; teslimat ve garanti satıcının sorumluluğundadır.",
    exclusions: ["Yenilenmiş ürünler"], imageUrl: "/images/magaza-ic.jpg", daysUntilEnd: 9, network: 1,
  },
  {
    slug: "demo-seyahat-erken-rezervasyon", merchant: "Demo Seyahat (örnek)", title: "Erken Rezervasyon Dönemi",
    description: "Yaz sezonu için erken rezervasyon dönemi. Rezervasyon ve ödeme seyahat sitesinde yapılır.",
    category: "seyahat", country: "GE", destinationUrl: "https://example.com/demo-seyahat", currency: "GEL",
    priceCents: null, priceVerified: false, commissionTerms: null,
    terms: "İptal ve değişiklik koşulları satıcıya aittir. Kur dönüşümü yapılmaz; fiyat GEL olarak gösterilir.",
    exclusions: ["Grup rezervasyonları"], imageUrl: "/images/hero-vitrin.jpg", daysUntilEnd: 26, network: 0,
  },
  {
    slug: "ornek-kozmetik-set", merchant: "Örnek Kozmetik (demo)", title: "Cilt Bakım Seti",
    description: "Üç adımlı cilt bakım seti. Ürün içeriği ve uygunluk satıcının sitesinde belirtilir.",
    category: "kozmetik", country: "TR", destinationUrl: "https://example.com/demo-kozmetik", currency: "TRY",
    priceCents: 89900, priceVerified: true, commissionTerms: null,
    terms: "Kozmetik ürünlerde iade koşulları satıcıya göre değişir. DampingVar sağlık veya sonuç iddiası sunmaz.",
    exclusions: ["İndirimli setler"], imageUrl: "/images/guzellik.jpg", daysUntilEnd: 12, network: 1,
  },
  {
    slug: "demo-ev-yasam-mutfak", merchant: "Demo Ev & Yaşam (örnek)", title: "Mutfak Gereçlerinde Sezon İndirimi",
    description: "Tencere, bıçak ve saklama setlerinde sezon indirimi. Kargo ve teslimat satıcı tarafından yapılır.",
    category: "ev & yaşam", country: "TR", destinationUrl: "https://example.com/demo-ev", currency: "TRY",
    priceCents: null, priceVerified: false, commissionTerms: null,
    terms: "Stok tükenmesi durumunda kampanya sonlanabilir. Fiyat satıcının sitesinde geçerlidir.",
    exclusions: ["Büyük beyaz eşya"], imageUrl: "/images/magaza-ic.jpg", daysUntilEnd: 6, network: 0,
  },
  {
    slug: "ornek-yemek-teslimat", merchant: "Örnek Teslimat (demo)", title: "İlk Siparişe Özel İndirim Kodu",
    description: "Yeni kullanıcılara ilk siparişte geçerli indirim kodu. Kod satıcının uygulamasında kullanılır.",
    category: "yemek teslimat", country: "TR", destinationUrl: "https://example.com/demo-teslimat", currency: "TRY",
    priceCents: null, priceVerified: false, commissionTerms: null,
    terms: "Kod tek kullanımlıktır ve yeni hesaplarla sınırlıdır. DampingVar teslimat veya sipariş sürecinin tarafı değildir.",
    exclusions: ["Alkollü içecekler", "Kampanyalı restoranlar"], imageUrl: "/images/restoran.jpg", daysUntilEnd: 4, network: 1,
  },
];

async function seedAffiliate() {
  const { affiliateNetworks, affiliateOffers, affiliateClicks, affiliateConversions, videoAssets } =
    await import("@/db/schema");

  if ((await db.select().from(affiliateNetworks)).length === 0) {
    await db.insert(affiliateNetworks).values([
      {
        name: "Örnek Ağ A (bağlı değil)",
        status: "NOT_CONNECTED",
        reportingMethod: "API",
        commissionModel: "CPS",
        notes: "API kimlik bilgisi ve ticari sözleşme doğrulanmadı. Dönüşüm verisi çekilemiyor.",
      },
      {
        name: "Örnek Ağ B (kimlik bekleniyor)",
        status: "PENDING_CREDENTIALS",
        reportingMethod: "POSTBACK",
        commissionModel: "CPA",
        notes: "Postback uç noktası tanımlandı; kimlik bilgileri bekleniyor.",
      },
    ]);
  }
  const networks = await db.select().from(affiliateNetworks);

  for (const o of OFFERS) {
    const exists = await db.select().from(affiliateOffers).where(eq(affiliateOffers.slug, o.slug)).limit(1);
    const values = {
      slug: o.slug,
      merchant: o.merchant,
      title: o.title,
      description: o.description,
      category: o.category,
      country: o.country,
      destinationUrl: o.destinationUrl,
      currency: o.currency,
      priceCents: o.priceCents,
      priceVerified: o.priceVerified,
      commissionTerms: o.commissionTerms,
      disclosure: DISCLOSURE,
      terms: o.terms,
      exclusions: o.exclusions,
      imageUrl: o.imageUrl,
      startsAt: new Date(Date.now() - 3 * 86400000),
      endsAt: new Date(Date.now() + o.daysUntilEnd * 86400000),
      status: "ACTIVE",
      isSponsored: !!o.sponsored,
      isSample: true,
      networkId: networks[o.network]?.id ?? null,
      impressions: 600 + Math.round(Math.random() * 2400),
      clicks: 40 + Math.round(Math.random() * 180),
      lastUpdated: new Date(Date.now() - Math.round(Math.random() * 72) * 3600000),
    };
    if (exists[0]) await db.update(affiliateOffers).set(values).where(eq(affiliateOffers.id, exists[0].id));
    else await db.insert(affiliateOffers).values(values);
  }

  const offers = await db.select().from(affiliateOffers);

  if ((await db.select().from(affiliateClicks)).length === 0) {
    const cust = await db.select().from(users).where(eq(users.role, "CUSTOMER")).limit(3);
    for (let i = 0; i < 14; i++) {
      await db.insert(affiliateClicks).values({
        offerId: offers[i % offers.length].id,
        userId: cust[i % Math.max(1, cust.length)]?.id ?? null,
        clickId: `dv-click-seed-${1000 + i}`,
        outboundAt: new Date(Date.now() - (i % 10) * 7200000),
        channel: i % 4 === 0 ? "MOBILE_WEB" : "WEB",
        confirmedOutbound: i % 5 !== 4,
      });
    }
  }

  if ((await db.select().from(affiliateConversions)).length === 0) {
    const statuses = ["REPORTED", "PENDING", "PENDING", "APPROVED", "APPROVED", "REJECTED", "REVERSED", "PAID"];
    for (let i = 0; i < statuses.length; i++) {
      const offer = offers[i % offers.length];
      await db.insert(affiliateConversions).values({
        offerId: offer.id,
        clickId: `dv-click-seed-${1000 + i}`,
        networkId: offer.networkId,
        status: statuses[i],
        commissionCents: statuses[i] === "REJECTED" || statuses[i] === "REVERSED" ? null : 1500 + i * 900,
        currency: offer.currency,
        source: "DEMO_SAMPLE",
        networkReference: `DEMO-${9000 + i}`,
        idempotencyKey: `seed-conv-${i}`,
        reportedAt: new Date(Date.now() - (i + 1) * 9 * 3600000),
        decidedAt: ["APPROVED", "REJECTED", "REVERSED", "PAID"].includes(statuses[i])
          ? new Date(Date.now() - i * 5 * 3600000)
          : null,
        paidAt: statuses[i] === "PAID" ? new Date(Date.now() - 2 * 3600000) : null,
        note:
          statuses[i] === "PENDING"
            ? "Ağ onayı bekleniyor — bu tutar doğrulanmış gelir değildir."
            : statuses[i] === "REVERSED"
              ? "İade nedeniyle ağ tarafından geri alındı."
              : null,
      });
    }
  }

  /* --- eğitim / tanıtım videoları (storyboard) --- */
  if ((await db.select().from(videoAssets)).length === 0) {
    const TOPICS: { topic: string; title: string; scenes: [string, string, string][]; steps: string[]; en?: string[]; ka?: string[] }[] = [
      {
        topic: "HOW_DAMPINGVAR_WORKS", title: "DampingVar nasıl çalışır?",
        scenes: [
          ["0–4 sn", "Arama alanı ve kategori çipleri", "Alışverişten önce DampingVar'a bak: online fırsatlar ve yakınındaki kampanyalar tek yerde."],
          ["4–9 sn", "Kampanya kartı → detay sayfası", "Koşulları, minimum sepeti ve geçerlilik tarihini gör."],
          ["9–14 sn", "İki ayrı yol: harici mağaza / fiziksel işletme", "Online fırsatta satıcının sitesine gidersin; yerel kampanyada mağazaya gidersin."],
          ["14–18 sn", "Etkinlik kaydı ekranı", "Ödeme her zaman doğrudan satıcıya veya işletmeye yapılır."],
        ],
        steps: [
          "Kampanya veya online fırsat ara; kategori ve konumla filtrele.",
          "Detay sayfasında koşulları, istisnaları ve geçerlilik tarihini oku.",
          "Online fırsatta izlenen bağlantıyla satıcının sitesine git; yerel kampanyada mağazaya git.",
          "Ödemeyi doğrudan satıcıya/işletmeye yap. DampingVar ödeme almaz.",
          "Etkinlik kayıtlarını İşlem Akışı ekranından izle.",
        ],
        en: [
          "Search offers and local campaigns in one place before you shop.",
          "Read the terms, minimum basket and validity on the detail page.",
          "Online offers open the merchant site; local campaigns take you to the store.",
          "You always pay the merchant or business directly. DampingVar never collects payment.",
          "Follow your activity in the transaction flow screen.",
        ],
      },
      {
        topic: "HOW_ONLINE_OFFER_WORKS", title: "Online fırsat nasıl kullanılır?",
        scenes: [
          ["0–4 sn", "Fırsat kartı ve ifşa metni", "Fırsatı incele; komisyon ifşası kartın altında görünür."],
          ["4–8 sn", "Ayrılış ekranı", "Bağlantıya bastığında DampingVar'dan ayrıldığını gösteren bir geçiş ekranı çıkar."],
          ["8–13 sn", "Satıcının kendi sitesi", "Sepet, ödeme ve teslimat tamamen satıcının sitesinde."],
          ["13–17 sn", "Dönüşüm bekleniyor durumu", "Ağ rapor ederse komisyon kaydı oluşur; tıklama satın alma sayılmaz."],
        ],
        steps: [
          "Fırsatı aç, fiyat yalnızca doğrulanmışsa gösterilir.",
          "İfşa metnini oku: uygun alışverişlerden DampingVar komisyon kazanabilir.",
          "Bağlantıya bas, ayrılış ekranını onayla ve satıcının sitesine geç.",
          "Satın alma, ödeme ve iade süreçleri satıcıya aittir.",
          "Ağ dönüşüm rapor ettiğinde komisyon durumu panelde güncellenir.",
        ],
        en: [
          "Open the offer; prices appear only when verified.",
          "Read the affiliate disclosure before leaving.",
          "Confirm the outbound screen and continue on the merchant's site.",
          "Checkout, payment and returns belong to the merchant.",
          "Commission status updates only when the network reports a conversion.",
        ],
      },
      {
        topic: "HOW_AFFILIATE_LINK_WORKS", title: "Affiliate bağlantıları nasıl çalışır?",
        scenes: [
          ["0–5 sn", "İzleme kimliği (click id)", "Her çıkışa benzersiz bir izleme kimliği eklenir."],
          ["5–10 sn", "Ağ raporu", "Ağ, uygun dönüşümü kendi kurallarına göre raporlar."],
          ["10–15 sn", "Komisyon yaşam döngüsü", "Rapor → beklemede → onay/red → iade → ödendi."],
          ["15–18 sn", "Gelir ayrımı", "Affiliate komisyonu ile işletme hizmet bedeli ayrı raporlanır."],
        ],
        steps: [
          "Çıkışta benzersiz click id üretilir ve kaydedilir.",
          "Ağ dönüşümü rapor edene kadar gelir olarak gösterilmez.",
          "Bekleyen komisyon, doğrulanmış gelir değildir.",
          "Onay/red/iade durumları ağ raporuna göre işlenir.",
          "Affiliate geliri ile işletme faturaları ayrı tutulur.",
        ],
      },
      {
        topic: "HOW_LOCAL_DISCOUNT_WORKS", title: "Yerel indirim kampanyası nasıl kullanılır?",
        scenes: [
          ["0–4 sn", "Kampanya kartı", "İndirim oranı, minimum sepet ve geçerlilik kartta görünür."],
          ["4–9 sn", "Koşullar ve istisnalar", "Detay sayfasında geçerli ürünler ve istisnalar listelenir."],
          ["9–14 sn", "Mağazaya gidiş", "Adres, çalışma saatleri ve yol tarifi işletme sayfasında."],
          ["14–18 sn", "İndirim kasada uygulanır", "İndirimi işletme uygular; ödeme işletmeye yapılır."],
        ],
        steps: [
          "Kampanyayı kaydet veya QR'ını aç.",
          "Koşulları ve istisnaları oku.",
          "Mağazaya git, alışverişini yap.",
          "Kampanya kodunu/QR'ını kasada göster.",
          "İndirimi işletme uygular; ödeme doğrudan işletmeye yapılır.",
        ],
        en: [
          "Save the campaign or open its QR.",
          "Read terms and exclusions first.",
          "Visit the store and shop.",
          "Show the code or QR at the counter.",
          "The business applies the discount; you pay the business directly.",
        ],
        ka: [
          "შეინახე კამპანია ან გახსენი მისი QR.",
          "ჯერ წაიკითხე პირობები და გამონაკლისები.",
          "მიდი მაღაზიაში და იყიდე.",
          "სალაროში აჩვენე კოდი ან QR.",
          "ფასდაკლებას აკეთებს ბიზნესი; გადახდა პირდაპირ ბიზნესს.",
        ],
      },
      {
        topic: "HOW_QR_TRACKING_WORKS", title: "QR kampanya takibi nasıl çalışır?",
        scenes: [
          ["0–4 sn", "QR okutuldu", "Okutma QR_SCANNED olarak kaydedilir."],
          ["4–9 sn", "Koşullar ekranda", "Müşteri kampanya koşullarını görür."],
          ["9–14 sn", "Doğrulamaya gönderildi", "Müşteri kullanımı doğrulamaya gönderebilir."],
          ["14–18 sn", "İşletme doğruladı", "Yetkili personel onaylayınca VERIFIED olur."],
        ],
        steps: [
          "QR okutulur ve QR_SCANNED kaydı oluşur.",
          "Okutma tek başına satış kanıtı değildir.",
          "Müşteri kullanımı doğrulamaya gönderir (SUBMITTED).",
          "İşletme yetkilisi onaylar (VERIFIED) veya reddeder (REJECTED).",
          "İşletme bildirirse uygulanan indirim tutarı kayda eklenir.",
        ],
      },
      {
        topic: "HOW_REFERRAL_WORKS", title: "Davet ve atıf nasıl işler?",
        scenes: [
          ["0–4 sn", "Davet bağlantısı", "Kendine ait bağlantıyı paylaşırsın."],
          ["4–9 sn", "Arkadaşın kaydı", "Kayıt olduğunda davet ilişkisi doğrulanır."],
          ["9–14 sn", "Uygun alışveriş", "Arkadaşın bir mağazadan alışveriş yapar."],
          ["14–18 sn", "Doğrulama ve bonus", "İşletme doğrulayınca mağazaya bağlı bonus oluşur."],
        ],
        steps: [
          "Davet bağlantını paylaş.",
          "Arkadaşın kayıt olur; ilişki sunucuda doğrulanır.",
          "Arkadaşın uygun alışverişi yapar.",
          "İşletme kullanımı doğrular.",
          "Bonus, alışverişin yapıldığı mağazaya bağlı olarak oluşur.",
        ],
        en: [
          "Share your invite link.",
          "Your friend registers; the relation is verified server-side.",
          "Your friend makes a qualifying purchase.",
          "The business verifies the usage.",
          "The bonus is tied to the store where the purchase happened.",
        ],
      },
      {
        topic: "HOW_DAMPING_BONUS_WORKS", title: "Damping Bonus nasıl çalışır?",
        scenes: [
          ["0–5 sn", "Bonus kartı", "Bonus bir mağaza adıyla birlikte görünür."],
          ["5–10 sn", "Mağaza kısıtı", "Yalnızca o mağazada geçerlidir."],
          ["10–15 sn", "Kullanım", "Sonraki uygun alışverişte indirim olarak kullanılır."],
          ["15–18 sn", "Nakit değildir", "Çekilemez, devredilemez, ortak bakiyeye eklenemez."],
        ],
        steps: [
          "Bonus, doğrulanmış alışverişten sonra oluşur.",
          "Kazanıldığı mağazaya bağlıdır.",
          "Minimum alışveriş ve son kullanma koşulları olabilir.",
          "Nakde çevrilemez ve başka kişiye devredilemez.",
          "Başka mağazada kullanılamaz.",
        ],
      },
      {
        topic: "HOW_BUSINESS_CAMPAIGN_WORKS", title: "İşletmeler kampanyayı nasıl oluşturur?",
        scenes: [
          ["0–4 sn", "Taslak", "Kampanya taslak olarak başlar."],
          ["4–9 sn", "Koşullar ve doğrulama", "Alan bazlı doğrulama hataları gösterilir."],
          ["9–14 sn", "Önizleme ve onay", "Müşterinin göreceği hali önizlenir, onay istenir."],
          ["14–18 sn", "Yayın ve moderasyon", "Yayın sonrası moderasyon onayı beklenir."],
        ],
        steps: [
          "Kampanya taslağını oluştur.",
          "İndirim, minimum sepet, tarih, uygun ürün ve istisnaları gir.",
          "Doğrulama hatalarını düzelt.",
          "Önizle ve yayını onayla.",
          "Moderasyon onayından sonra müşterilere görünür.",
        ],
      },
      {
        topic: "HOW_TO_READ_ANALYTICS", title: "Kampanya analitiği nasıl okunur?",
        scenes: [
          ["0–5 sn", "Huni", "Gösterim → tıklama → ziyaret → QR → doğrulanmış kullanım."],
          ["5–10 sn", "Ölçülen vs tahmini", "Tahmini değerler ayrıca işaretlenir."],
          ["10–15 sn", "Affiliate hunisi", "Tıklama ile dönüşüm ayrı metriklerdir."],
          ["15–18 sn", "Gelir ayrımı", "Hizmet bedeli ile affiliate komisyonu karıştırılmaz."],
        ],
        steps: [
          "Her aşama yalnızca gerçekten toplanan olayları gösterir.",
          "Tıklama, QR okutma ve doğrulanmış kullanım aynı metrik değildir.",
          "Tahmini değerler 'tahmini' olarak işaretlenir.",
          "Affiliate hunisinde bekleyen komisyon gelir sayılmaz.",
          "Hizmet faturaları ile komisyonlar ayrı raporlanır.",
        ],
      },
      {
        topic: "HOW_AI_PROGRAM_WORKS", title: "28 günlük AI programı nasıl işler?",
        scenes: [
          ["0–5 sn", "Hafta 1: analiz", "Profil, hedef kitle ve strateji."],
          ["5–10 sn", "Hafta 2: içerik", "Metin, görsel ve video storyboard üretimi."],
          ["10–15 sn", "Hafta 3: yayın", "Onaylanan içerik yayınlanır, kampanya başlar."],
          ["15–18 sn", "Hafta 4: ölçüm", "Performans incelenir, öneriler üretilir."],
        ],
        steps: [
          "Hafta 1: işletme profili ve hedef kitle analizi.",
          "Hafta 2: kampanya metni, başlık, görsel ve video senaryosu.",
          "Hafta 3: onayladığın içerik yayınlanır; sosyal ağ bağlı değilse manuel paylaşım.",
          "Hafta 4: performans analizi ve haftalık öneriler.",
          "Program büyüme veya gelir garantisi vermez.",
        ],
      },
    ];

    for (const v of TOPICS) {
      const captions: Record<string, string[]> = { tr: v.scenes.map((s) => s[2]) };
      if (v.en) captions.en = v.en;
      if (v.ka) captions.ka = v.ka;
      await db.insert(videoAssets).values({
        businessId: null,
        kind: "STORYBOARD",
        topic: v.topic,
        title: v.title,
        durationSec: 18,
        scenes: v.scenes.map(([at, visual, caption]) => ({ at, visual, caption })),
        captions,
        steps: v.steps,
        poster: "/images/hero-vitrin.jpg",
        renderStatus: "NOT_RENDERED",
        status: "PUBLISHED",
        createdBy: "SYSTEM",
      });
    }
  }
}
