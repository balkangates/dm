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
  competitors: Competitor[];
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

/* ===================== RAKİP VERİSİ + REKABET DAYANMA GÜCÜ ===================== */

export type Crowd = "LOW" | "MEDIUM" | "HIGH";
export type Competitor = {
  name: string;
  note: string;
  address: string;
  lat: number | null;
  lng: number | null;
  /** Google Haritalar "şu anki yoğunluk" — işletme elle girer (Google bunu herkese açık API ile vermez). */
  crowd: Crowd | null;
  /** Rakibin online (platform) indirim oranı, %. */
  onlineDiscountPct: number | null;
  /** Rakibin online kampanya içerikleri (metin). */
  campaigns: string;
  /** Aynı ürün karşılaştırması: rakibin online fiyatı ve senin fiyatın (TL). */
  items: Array<{ product: string; theirPrice: number | null; myPrice: number | null }>;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
};

/** İstemciden/DB'den gelen ham rakip listesini güvenli biçime çevirir (en çok 8 rakip, 6 ürün). */
export function sanitizeCompetitors(raw: unknown): Competitor[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 8).map((r) => {
    const c = (r ?? {}) as Record<string, unknown>;
    const lat = num(c.lat), lng = num(c.lng);
    const disc = num(c.onlineDiscountPct);
    const crowd = c.crowd === "LOW" || c.crowd === "MEDIUM" || c.crowd === "HIGH" ? (c.crowd as Crowd) : null;
    return {
      name: String(c.name ?? "").trim().slice(0, 80),
      note: String(c.note ?? "").trim().slice(0, 200),
      address: String(c.address ?? "").trim().slice(0, 200),
      lat: lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? lat : null,
      lng: lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? lng : null,
      crowd,
      onlineDiscountPct: disc !== null && disc >= 0 && disc <= 90 ? Math.round(disc * 10) / 10 : null,
      campaigns: String(c.campaigns ?? "").trim().slice(0, 400),
      items: (Array.isArray(c.items) ? c.items : []).slice(0, 6).map((it) => {
        const i = (it ?? {}) as Record<string, unknown>;
        const tp = num(i.theirPrice), mp = num(i.myPrice);
        return {
          product: String(i.product ?? "").trim().slice(0, 80),
          theirPrice: tp !== null && tp > 0 && tp < 1_000_000 ? tp : null,
          myPrice: mp !== null && mp > 0 && mp < 1_000_000 ? mp : null,
        };
      }).filter((i) => i.product),
    };
  }).filter((c) => c.name);
}

export type ResilienceFactor = { key: string; label: string; weight: number; score: number | null; note: string };
export type Resilience = {
  score: number;
  level: "Güçlü" | "Orta" | "Zayıf";
  /** Skorun dayandığı verinin oranı (0-100). Düşükse sonuç kesin değildir. */
  confidence: number;
  factors: ResilienceFactor[];
  stress: string | null;
  insights: string[];
};

const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => {
  const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  return y0 + (y1 - y0) * t;
};

/**
 * Rekabet dayanma gücü (0-100): işletmenin rakip baskısı altında (fiyat, indirim, yoğunluk, kampanya) ayakta kalma kapasitesi.
 * Yedi etken ağırlıklı toplanır; verisi olmayan etken dışarıda bırakılır ve "veri güveni" düşer.
 */
export function computeResilience(input: {
  profile: GrowthProfileIn & { competitors: Competitor[] };
  business: { lat: number | null; lng: number | null };
  market: MarketIn;
}): Resilience {
  const { profile: p, business: b, market } = input;
  const comps = p.competitors;
  const insights: string[] = [];
  const distKm = (c: Competitor): number | null =>
    b.lat != null && b.lng != null && c.lat != null && c.lng != null ? haversine(b.lat, b.lng, c.lat, c.lng) : null;

  // 1) Fiyat konumu
  const ratios: number[] = [];
  for (const c of comps) for (const it of c.items) if (it.theirPrice && it.myPrice) {
    const r = it.myPrice / it.theirPrice;
    ratios.push(r);
    const diff = Math.round((r - 1) * 100);
    insights.push(`${it.product}: ${c.name} ${it.theirPrice} TL, sen ${it.myPrice} TL (${diff >= 0 ? "+" : ""}%${diff}).`);
  }
  const avgRatio = ratios.length ? ratios.reduce((a, x) => a + x, 0) / ratios.length : null;
  const priceScore = avgRatio == null ? null : avgRatio <= 0.95 ? 100 : avgRatio <= 1 ? lerp(avgRatio, 0.95, 1, 100, 80) : lerp(avgRatio, 1, 1.25, 80, 10);

  // 2) İndirim payı: marjın izin verdiği indirim − rakibin en yüksek online indirimi
  const { cap } = discountCap(p.marginPct);
  const compMax = Math.max(0, ...comps.map((c) => c.onlineDiscountPct ?? 0), market.maxDiscountPercent ?? 0);
  const headroom = cap - compMax;
  const discScore = p.marginPct == null || (compMax === 0 && !comps.length) ? null : headroom >= 5 ? 100 : headroom >= 0 ? lerp(headroom, 0, 5, 70, 100) : lerp(headroom, -15, 0, 10, 70);

  // 3) Marj tamponu
  const marginScore = p.marginPct == null ? null : p.marginPct >= 35 ? 100 : p.marginPct >= 25 ? lerp(p.marginPct, 25, 35, 80, 100) : p.marginPct >= 15 ? lerp(p.marginPct, 15, 25, 50, 80) : lerp(p.marginPct, 8, 15, 10, 50);

  // 4) Yakınlık / yoğunluk (1 km içindeki rakipler + çevredeki DampingVar işletmeleri)
  const located = comps.filter((c) => distKm(c) != null);
  const within1 = located.filter((c) => (distKm(c) as number) <= 1).length;
  for (const c of located.sort((a, z) => (distKm(a) as number) - (distKm(z) as number)).slice(0, 3)) {
    const d = distKm(c) as number;
    insights.push(`${c.name} yaklaşık ${d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`} uzaklıkta.`);
  }
  const densityN = located.length ? within1 : market.hasLocation ? Math.min(market.nearbyBusinesses, 6) : 0;
  const densityKnown = located.length > 0 || market.hasLocation;
  const densityScore = !densityKnown ? null : densityN <= 0 ? 100 : densityN === 1 ? 80 : densityN === 2 ? 60 : densityN <= 4 ? 40 : 20;

  // 5) Talep sinyali (rakiplerin Google Haritalar canlı yoğunluğu)
  const crowds = comps.map((c) => c.crowd).filter((x): x is Crowd => !!x);
  for (const c of comps) if (c.crowd === "HIGH") insights.push(`${c.name} şu an yoğun: taşan müşteriyi yakalama fırsatı.`);
  const crowdScore = crowds.length ? crowds.reduce((a, x) => a + (x === "HIGH" ? 80 : x === "MEDIUM" ? 65 : 40), 0) / crowds.length : null;

  // 6) Kampanya farklılaşması
  const withCamp = comps.filter((c) => c.campaigns.trim()).length;
  const ownCamp = Boolean(p.platformDiscountNote);
  const campScore = !comps.length ? null : withCamp === 0 ? 80 : ownCamp ? 65 : 45;
  for (const c of comps) if (c.campaigns.trim()) insights.push(`${c.name} online kampanyası: “${c.campaigns.slice(0, 90)}”.`);

  // 7) Platform bağımlılığı (komisyonlu kanal yükü)
  const plat = p.platforms.filter((k) => k !== "KENDI_KURYESI").length;
  const platScore = Math.max(0, (plat === 0 ? 90 : plat === 1 ? 70 : 50) - (plat > 0 && p.marginPct != null && p.marginPct < 20 ? 20 : 0));

  const factors: ResilienceFactor[] = [
    { key: "price", label: "Fiyat konumu", weight: 20, score: priceScore, note: avgRatio == null ? "Aynı ürün için rakip ve kendi fiyatını gir." : `Aynı ürünlerde fiyatın rakiplere göre ortalama ${avgRatio >= 1 ? "+" : ""}%${Math.round((avgRatio - 1) * 100)}.` },
    { key: "discount", label: "İndirim payı", weight: 20, score: discScore, note: discScore == null ? "Kâr marjı ve rakip indirim oranı gerekli." : `Marjın izin verdiği en yüksek indirim %${cap}, rakibin en yüksek online indirimi %${compMax} (fark ${headroom >= 0 ? "+" : ""}${headroom} puan).` },
    { key: "margin", label: "Marj tamponu", weight: 15, score: marginScore, note: p.marginPct == null ? "Kâr marjı girilmedi." : `Kâr marjın %${p.marginPct}.` },
    { key: "density", label: "Yakınlık ve yoğunluk", weight: 15, score: densityScore, note: !densityKnown ? "Konumun ve rakip konumları gerekli." : `1 km içinde ${within1} girilen rakip; çevrede ${market.hasLocation ? market.nearbyBusinesses : 0} DampingVar işletmesi.` },
    { key: "crowd", label: "Talep sinyali (canlı yoğunluk)", weight: 10, score: crowdScore, note: crowds.length ? `${crowds.length} rakipte yoğunluk girildi.` : "Rakiplerin Google Haritalar yoğunluğunu gir." },
    { key: "campaign", label: "Kampanya farklılaşması", weight: 10, score: campScore, note: !comps.length ? "Rakip eklenmedi." : `${withCamp}/${comps.length} rakip online kampanya yürütüyor.` },
    { key: "platform", label: "Platform bağımlılığı", weight: 10, score: platScore, note: plat ? `${plat} yemek platformunda satış var; komisyon yükü marjı baskılar.` : "Aracı platform bağımlılığı yok." },
  ];
  const have = factors.filter((f) => f.score != null);
  const wSum = have.reduce((a, f) => a + f.weight, 0);
  const score = wSum ? Math.round(have.reduce((a, f) => a + (f.score as number) * f.weight, 0) / wSum) : 0;
  for (const f of factors) if (f.score != null) f.score = Math.round(f.score);

  const stress = p.marginPct != null && compMax > 0
    ? (() => { const after = Math.round((p.marginPct - compMax) * 10) / 10; return `Stres testi: rakibin en yüksek online indirimini (%${compMax}) aynen karşılarsan kâr marjın %${p.marginPct}’den %${after}’e düşer${after < 10 ? " — bu sürdürülebilir değil; indirim yerine hediye ürün ya da sepet şartı kullan." : "."}`; })()
    : null;

  return { score, level: score >= 70 ? "Güçlü" : score >= 45 ? "Orta" : "Zayıf", confidence: Math.round((wSum / 100) * 100), factors, stress, insights: insights.slice(0, 10) };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
