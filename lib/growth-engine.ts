/**
 * Kampanya ve reklam ÖNERİ MOTORU — Faz 1 (kural tabanlı; harici AI gerekmez).
 * Saf ve deterministiktir (sunucu/istemci güvenli). Girdiler:
 *   - işletmenin ELLE girdiği büyüme profili (ciro, sepet, marj, saatler, rakip, platform),
 *   - konum + çevredeki aynı kategorideki DampingVar işletmelerinin kampanya özeti (pazar),
 *   - kampanya kalıpları (bu dosyadaki şablon kütüphanesi; platform metinleri kopyalanmaz, kalıplar özgün yazılır).
 * Güvenlik: indirim, kâr marjının altına düşecek şekilde önerilmez; satış garantisi verilmez; yayın işletme onayıyla olur.
 */
export type GrowthProfileIn = {
  monthlyRevenueCents: number | null;
  avgBasketCents: number | null;
  marginPct: number | null;
  busyHours: string | null;
  quietHours: string | null;
  competitors: Array<{ name: string; note: string }>;
  platforms: string[];
  platformDiscountNote: string | null;
  goal: string | null;
};

export type MarketIn = {
  hasLocation: boolean;
  radiusKm: number;
  nearbyBusinesses: number;
  activeCampaigns: number;
  avgDiscountPercent: number | null;
  maxDiscountPercent: number | null;
  withTimeWindow: number;
};

/** Önceki öneri kampanyalarının sonuçları (öneri id → toplam). */
export type SuggestionHistory = Record<string, { campaigns: number; views: number; clicks: number; redemptions: number }>;

export type EngineSuggestion = {
  id: string;
  title: string;
  rationale: string[];
  guard: string;
  /** Kampanya formuna aktarılan alanlar (EMPTY şekliyle uyumlu). */
  fields: Record<string, string | number | boolean | string[]>;
  ad: { title: string; body: string; cta: string };
  /** Daha önce bu türden kampanya yayınladıysa ölçülen sonuç. */
  history?: { campaigns: number; views: number; redemptions: number; rate: number | null };
};

export type EngineResult = { suggestions: EngineSuggestion[]; warnings: string[]; market: string };

const hhmm = (h: string, m?: string) => `${String(Number(h)).padStart(2, "0")}:${m ?? "00"}`;

/** "15:00-18:00" / "15-18" → { start, end } (ilk aralık). */
export function parseHours(text: string | null): { start: string; end: string } | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?/.exec(text ?? "");
  if (!m) return null;
  const sh = Number(m[1]), eh = Number(m[3]);
  if (sh > 23 || eh > 24) return null;
  return { start: hhmm(m[1], m[2]), end: hhmm(String(eh === 24 ? 23 : eh), eh === 24 ? "59" : m[4]) };
}

/** İndirim tavanı: marj − 10 puan (en az %10 marj kalır), en çok %30; marj yoksa %10. */
export function discountCap(marginPct: number | null): { cap: number; note: string } {
  if (marginPct == null) return { cap: 10, note: "Kâr marjı girilmediği için indirim üst sınırı %10 tutuldu; marjını girersen sınır buna göre hesaplanır." };
  const cap = Math.max(0, Math.min(30, Math.floor(marginPct - 10)));
  return {
    cap,
    note: cap >= 5
      ? `Kâr marjın %${marginPct}; indirimler marjının en az 10 puan altında kalmayacak şekilde en çok %${cap} önerildi.`
      : `Kâr marjın %${marginPct} ile düşük; yüzde indirim yerine hediye ürün ya da sepet tutarı şartı öneriyoruz.`,
  };
}

const round10 = (n: number) => Math.max(10, Math.ceil(n / 10) * 10);
const PLATFORM_TR: Record<string, string> = {
  TRENDYOL_GO: "Trendyol Go", YEMEKSEPETI: "Yemeksepeti", GETIR: "Getir Yemek", MIGROS_YEMEK: "Migros Yemek", KENDI_KURYESI: "kendi kurye", DIGER: "diğer",
};

/** Kampanya kalıpları (özgün metin; {placeholder} değerleri motor doldurur). */
const TEMPLATES = {
  quiet: {
    title: "Sakin saat avantajı %{d}",
    desc: "{saat} arasında {isletme}'e gel, siparişinde %{d} indirim kazan.",
    ad: { title: "{saat} arası %{d} avantaj — {isletme}", body: "Sakin saatlerde acele etmeden, indirimli keyfini çıkar. {isletme}, {ilce}. DampingVar'da kampanyayı gör, QR ile mağazada kullan.", cta: "Kampanyayı gör" },
  },
  basket: {
    title: "{min} ve üzeri sepette %{d} indirim",
    desc: "{min} üzeri siparişlerde %{d} indirim. Arkadaşınla paylaş, sepeti birlikte doldur.",
    ad: { title: "Sepetini doldur, %{d} kazan — {isletme}", body: "{min} ve üzeri alışverişte %{d} indirim. {isletme}, {ilce}. Koşullar kampanya sayfasında.", cta: "Hemen sipariş ver" },
  },
  ownChannel: {
    title: "Gel-al ve rezervede %{d} indirim",
    desc: "{isletme}'den gel-al ya da rezerve siparişlerinde %{d} indirim; kuryeyi bekleme, sıcak sıcak al.",
    ad: { title: "Gel-al'da %{d} indirim — {isletme}", body: "Sipariş aracısı yok, doğrudan {isletme}'den. Gel-al veya rezerve siparişte %{d} indirim. {ilce}.", cta: "Gel-al sipariş ver" },
  },
  newCustomer: {
    title: "İlk siparişe %{d} hoş geldin indirimi",
    desc: "{isletme}'de ilk siparişine %{d} indirim.",
    ad: { title: "Yeni misin? İlk siparişe %{d} indirim", body: "{isletme} ({ilce}) ilk siparişinde %{d} indirim veriyor. DampingVar'dan kampanyayı aç.", cta: "İlk siparişi ver" },
  },
  visibility: {
    title: "Bölgenin görünür adresi: {isletme}",
    desc: "",
    ad: { title: "{ilce}'de {isletme} — kampanyaları keşfet", body: "Çevrendeki işletme kampanyalarını DampingVar'da gör; {isletme} güncel fırsatlarla burada.", cta: "İşletmeyi gör" },
  },
} as const;

function fill(t: string, v: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
}

export function buildSuggestions(input: {
  businessName: string;
  district: string;
  profile: GrowthProfileIn | null;
  market: MarketIn;
  history?: SuggestionHistory;
}): EngineResult {
  const { businessName, district, profile: p, market } = input;
  const warnings: string[] = [];
  const out: EngineSuggestion[] = [];
  if (!p) return { suggestions: [], warnings: ["Önce Büyüme profilini doldur; öneriler bu bilgilere göre hazırlanır."], market: "" };

  const { cap, note: capNote } = discountCap(p.marginPct);
  if (p.marginPct == null) warnings.push("Kâr marjı girilmedi: indirim üst sınırı güvenli tarafta (%10) tutuldu.");
  if (p.avgBasketCents == null) warnings.push("Ortalama sepet girilmedi: minimum sepet tutarı önerilemiyor.");
  if (!market.hasLocation) warnings.push("İşletme konumu kayıtlı değil: Profil bölümünde adresini kaydet; çevredeki rakipler ancak o zaman hesaplanır.");
  if (!p.quietHours) warnings.push("Boş saatler girilmedi: saat bazlı kampanya önerilemiyor.");

  const mkt = market.hasLocation
    ? market.nearbyBusinesses > 0
      ? `${market.radiusKm} km çevrende aynı kategoride ${market.nearbyBusinesses} işletme var; ${market.activeCampaigns} yayında kampanya${market.avgDiscountPercent != null ? `, ortalama indirim %${Math.round(market.avgDiscountPercent)}` : ""}${market.withTimeWindow ? `, ${market.withTimeWindow} tanesi saat bazlı` : ""}.`
      : `${market.radiusKm} km çevrende aynı kategoride kampanya yayınlayan DampingVar işletmesi yok.`
    : "";
  const avgComp = market.avgDiscountPercent != null ? Math.round(market.avgDiscountPercent) : null;
  const dflt = (n: number) => Math.max(5, Math.min(cap, n));
  const canPercent = cap >= 5;
  const base = { isletme: businessName, ilce: district };
  const manual = p.competitors.length ? ` Girdiğin rakipler: ${p.competitors.map((c) => c.name).join(", ")}.` : "";

  const push = (id: string, tpl: keyof typeof TEMPLATES, d: number, extra: Record<string, string | number>, fields: EngineSuggestion["fields"], rationale: string[]) => {
    const v = { ...base, d, ...extra };
    const t = TEMPLATES[tpl];
    out.push({
      id,
      title: fill(t.title, v),
      rationale,
      guard: capNote,
      fields: {
        title: fill(t.title, v), description: fill(t.desc, v), type: "PERCENT", discountPercent: d,
        qrEnabled: true, perCustomerLimit: 2, usageLimit: 300,
        terms: `Kampanya ${businessName} için geçerlidir; diğer kampanyalarla birleştirilemez. Müşteri başına ${tpl === "newCustomer" ? "bir kez" : "en fazla 2 kez"} kullanılır. İşletme koşulları değiştirme hakkını saklı tutar.`,
        sourceSuggestion: id, ...fields,
      },
      ad: { title: fill(t.ad.title, v), body: fill(t.ad.body, v), cta: t.ad.cta },
    });
  };

  // 1) Sakin saat
  const quiet = parseHours(p.quietHours);
  if (quiet && canPercent) {
    const d = dflt(avgComp != null ? Math.min(avgComp, 20) : 15);
    push("quiet", "quiet", d, { saat: `${quiet.start}-${quiet.end}` },
      { timeStart: quiet.start, timeEnd: quiet.end, minBasketCents: p.avgBasketCents ? Math.round((p.avgBasketCents / 100) * 0.8 / 10) * 10 : 0 },
      [`Boş saat olarak girdiğin ${quiet.start}-${quiet.end} aralığında siparişi artırmayı hedefler; yoğun saatlere indirim verilmez.`,
        avgComp != null ? `Çevrendeki ortalama indirim %${avgComp}; öneri bunu aşmadan rekabetçi kalır.` : "Çevrende karşılaştıracak yayında kampanya bulunamadı; orta düzey bir oran seçildi.",
        ...(p.busyHours ? [`Yoğun saatlerin (${p.busyHours}) kampanya dışında kalır.`] : [])]);
  }

  // 2) Sepet büyütme
  if (p.avgBasketCents) {
    const min = round10((p.avgBasketCents / 100) * 1.25);
    const d = canPercent ? dflt(10) : 0;
    if (canPercent)
      push("basket", "basket", d, { min: `${min} TL` }, { minBasketCents: min },
        [`Ortalama sepetin ${Math.round(p.avgBasketCents / 100)} TL; eşik bunun yaklaşık %25 üstünde (${min} TL).`,
          "İndirim yalnızca eşiği geçen sepete uygulanır; ortalama sepet büyür, marj korunur."]);
  }

  // 3) Kendi kanalı (platformdan doğrudan siparişe)
  const onPlatform = p.platforms.filter((k) => k !== "KENDI_KURYESI");
  if (onPlatform.length && canPercent) {
    const d = dflt(12);
    push("own", "ownChannel", d, {}, { serviceModes: ["GEL_AL", "REZERVE"], paymentScope: ["CASH_DOOR", "CARD_DOOR"] },
      [`${onPlatform.map((k) => PLATFORM_TR[k] ?? k).join(", ")} üzerinde satış yapıyorsun; DampingVar'daki gel-al/rezerve siparişte aracı komisyonu yoktur, bu yüzden aynı indirimi daha düşük oranla verebilirsin.`,
        ...(p.platformDiscountNote ? [`Platformlardaki kampanyan: “${p.platformDiscountNote}”. Öneri bundan daha düşük oranda tutuldu (marjın korunur).`] : [])]);
  }

  // 4) Yeni müşteri
  if (/yeni|müşteri|musteri/i.test(p.goal ?? "") && canPercent) {
    const d = dflt(10);
    push("new", "newCustomer", d, {}, { type: "FIRST", perCustomerLimit: 1 },
      [`Hedefin: “${p.goal}”. Hoş geldin indirimi müşteri başına bir kez geçerlidir.`]);
  }

  // 5) Görünürlük (rakip yoksa / indirim uygun değilse)
  if (!out.length || (market.hasLocation && market.nearbyBusinesses === 0)) {
    push("visibility", "visibility", 0, {}, { type: "PERCENT", discountPercent: 0 },
      [market.hasLocation && market.nearbyBusinesses === 0
        ? "Çevrende kampanya yayınlayan aynı kategoride işletme yok; ilk kampanyayı yayınlayan öne çıkar."
        : "Marj ya da veri sınırlı olduğundan indirimsiz görünürlük metni önerildi."]);
  }

  if (out.length) out[0].rationale.push(...(manual ? [manual.trim()] : []));

  // Faz 3: geçmiş sonuçlara göre sırala — yeterli veri (≥50 görüntülenme) varsa kullanım oranı yüksek olan öne çıkar.
  const hist = input.history ?? {};
  for (const s2 of out) {
    const h = hist[s2.id];
    if (!h || !h.campaigns) continue;
    const rate = h.views >= 50 ? h.redemptions / h.views : null;
    s2.history = { campaigns: h.campaigns, views: h.views, redemptions: h.redemptions, rate };
    s2.rationale.unshift(
      rate != null
        ? `Daha önce bu türden ${h.campaigns} kampanya yayınladın: ${h.views} görüntülenmede ${h.redemptions} doğrulanmış kullanım (%${(rate * 100).toFixed(1)}).`
        : `Daha önce bu türden ${h.campaigns} kampanya yayınladın; henüz karşılaştırmaya yetecek veri (50+ görüntülenme) yok.`,
    );
  }
  out.sort((a, b) => (b.history?.rate ?? -1) - (a.history?.rate ?? -1));
  return { suggestions: out.slice(0, 4), warnings, market: mkt };
}
