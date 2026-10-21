/**
 * FAZ 12A/12B/12C — Ücretsiz Sesli Asistan motoru (anahtarsız, yerel, deterministik).
 *
 * Tarayıcının Web Speech API'si metne çevirir; bu motor metni NİYETE ve
 * SEPETE çevirir. Hiçbir dış API çağrısı YOKTUR; LLM anahtarı gerekmez.
 *
 * FAZ 12B — ÇİFT FİYAT ve SİPARİŞ TİPİ:
 *   * GEL_AL      → gel-al / içeride: İŞLETME İÇİ fiyat (priceCents)
 *   * REZERVE     → rezerve/ileri tarihli gel-al: İŞLETME İÇİ fiyat
 *   * PAKET_SERVIS→ adrese teslim: ADRES TESLİM fiyatı
 *     (deliveryPriceCents; boşsa işletme içi fiyat geçerlidir)
 * Sipariş tipi sessizce varsayılmaz; müşteriye sorulur veya ifadede
 * anlaşılır ("adrese teslim", "gel alacağım", "rezerve et").
 *
 * FAZ 12C — mod ayarları + adet sorma + ürün notları + dökümlü toplam:
 *   * İşletme hangi modları açtıysa akış yalnız onları sunar (ctx.modes).
 *   * Ürün adı söylenip adet belirtilmediyse motor ADDET SORAR.
 *   * Ürün options listesi varsa "turşu olmasın / ketçap olsun" gibi
 *     tercihler okunup sipariş kalemine eklenir (işletmeye iletilir).
 *   * Toplam dökümü: matrah − kampanya indirimi + KDV = ödenecek
 *     (lib/order-price.ts ile aynı matematik).
 *
 * Sınırlar (dürüst): yalnızca desteklenen niyetler; anlaşılmayan girdi
 * sorulur; stok/fiyat uydurulmaz (fiyatlar işletme listesinden gelir);
 * online ödeme YOKTUR — ödeme kapıda veya iş yerinde nakit/kartla yapılır.
 */
import { bestCampaign, computeTotals, type OrderMode, type PriceBreakdown } from "@/lib/order-price";

export type VoiceMode = OrderMode;

export const MODE_LABELS: Record<VoiceMode, string> = {
  GEL_AL: "Gel-al / işletme içi",
  REZERVE: "Rezerve (ileri tarihli gel-al)",
  PAKET_SERVIS: "Adrese teslim (paket servis)",
};

export type VoiceProduct = {
  name: string;
  priceCents: number;
  discountPriceCents?: number | null;
  deliveryPriceCents?: number | null;
  /** Ürün notları/ekstraları (ör. Turşu, Biber, Ketçap, Mayonez). */
  options?: string[] | null;
  /** Ürün bazlı KDV oranı (%); null → işletme varsayılanı. */
  kdvRate?: number | null;
};
export type VoiceCampaign = {
  title: string;
  discountPercent?: number | null;
  discountAmountCents?: number | null;
  minBasketCents?: number | null;
  endsAt?: string | null;
  startsAt?: string | null;
  serviceMode?: string | null;
};

/** İşletmenin açık sipariş modları (FAZ 12C ayarları; undefined = hepsi açık). */
export type VoiceModes = { gelAl?: boolean; rezerve?: boolean; paketServis?: boolean };

export type VoiceCtx = {
  businessName: string;
  district: string;
  products: VoiceProduct[];
  campaigns: VoiceCampaign[];
  modes?: VoiceModes;
  acceptingOrders?: boolean;
  businessKdvRate?: number;
};

export type VoiceOptionPick = { name: string; wanted: boolean };
export type VoiceCartLine = {
  name: string;
  qty: number;
  unitPriceCents: number;
  options?: VoiceOptionPick[];
};
export type VoicePayment = "CASH_DOOR" | "CARD_DOOR";
export type VoiceStage = "menu" | "delivery" | "qty" | "ordering" | "details" | "payment" | "confirm" | "done";

export type VoiceState = {
  stage: VoiceStage;
  mode: VoiceMode | null;
  cart: VoiceCartLine[];
  name: string;
  phone: string;
  address: string;
  payment: VoicePayment | null;
  /** Adet sorusu beklenen satır (FAZ 12C). */
  pendingQtyFor?: string | null;
};

export type VoiceUi =
  | "menu" | "delivery" | "campaigns" | "products" | "cart" | "qty" | "details" | "payment" | "confirm" | "done";

export type VoiceStep = {
  state: VoiceState;
  say: string;
  ui: VoiceUi;
  /** FAZ 12C-2: kart nesnesi de taşınır — tıklanınca TEK kampanya sesli anlatılır. */
  campaigns?: Array<{ title: string; discountLabel: string; campaign?: VoiceCampaign }>;
  products?: Array<{ name: string; priceLabel: string }>;
};

export const initialVoiceState = (): VoiceState => ({
  stage: "menu",
  mode: null,
  cart: [],
  name: "",
  phone: "",
  address: "",
  payment: null,
  pendingQtyFor: null,
});

/* ------------------------------ fiyatlar ------------------------------ */

/** Mod fiyatı: adrese teslim fiyat varsa o; yoksa indirimli/temel fiyat. */
export function modePrice(p: VoiceProduct, mode: VoiceMode | null): number {
  if (mode === "PAKET_SERVIS" && p.deliveryPriceCents != null) return p.deliveryPriceCents;
  return p.discountPriceCents ?? p.priceCents;
}

/** İfadeden teslimat tipi okunur; yoksa null (müşteriye sorulur). */
export function detectDeliveryMode(text: string): VoiceMode | null {
  const t = norm(text);
  // rezerve, gel-al kalıplarından ÖNCE okunur ("rezerve et" / "rezervasyon").
  if (/(rezerve|rezervasyon)/.test(t)) return "REZERVE";
  if (/(adrese teslim|adrese|adresime|evime|kurye|paket servis|paket|gönder|gonder|kapıya|kapida)/.test(t))
    return "PAKET_SERVIS";
  if (/(gel al|gel-al|gelip al|alıp gideceğim|alip gidecegim|içeride|iceride|masada|iş yerinde|is yerinde|yerimde)/.test(t))
    return "GEL_AL";
  return null;
}

/** İşletmenin açık modları (varsayılan: hepsi). */
export function enabledModes(ctx: VoiceCtx): VoiceMode[] {
  if (!ctx.modes) return ["GEL_AL", "REZERVE", "PAKET_SERVIS"];
  const out: VoiceMode[] = [];
  if (ctx.modes.gelAl !== false) out.push("GEL_AL");
  if (ctx.modes.rezerve !== false) out.push("REZERVE");
  if (ctx.modes.paketServis !== false) out.push("PAKET_SERVIS");
  return out;
}
export function modeEnabled(ctx: VoiceCtx, mode: VoiceMode): boolean {
  return enabledModes(ctx).includes(mode);
}

/* ------------------------------ yardımcılar ------------------------------ */

const norm = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/[.,!?;:()"'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tl = (cents: number) => `${Math.round(cents / 100)} lira`;

const NUM_WORDS: Record<string, number> = {
  bir: 1, iki: 2, üç: 3, uc: 3, dört: 4, dort: 4, beş: 5, bes: 5,
  altı: 6, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, yarım: 1,
};

/** Metindeki İLK sayıyı (rakam veya yazı) bulur (adet yanıtları için). */
export function scanNumber(text: string): number | null {
  const words = norm(text).split(" ");
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^\d+$/.test(w)) {
      const n = parseInt(w, 10);
      if (n >= 1 && n <= 99) return n;
    }
    if (w === "on" || w === "onbir") {
      const next = words[i + 1];
      const unitNext = next ? NUM_WORDS[next] : undefined;
      const n = w === "onbir" ? 11 : 10 + (unitNext && unitNext < 10 ? unitNext : 0);
      if (n >= 1 && n <= 99) return n;
    }
    const n = NUM_WORDS[w];
    if (n && n >= 1 && n <= 99) return n;
  }
  return null;
}

/** "üç adet", "3 tane", "on iki" gibi ifadelerden miktar çıkarır (varsayılan 1). */
export function parseQtyBefore(text: string, idx: number): number {
  return explicitQtyBefore(text, idx) ?? 1;
}

/** Ürün adından ÖNCEki kelimelerde açık miktar varsa o; yoksa null (FAZ 12C: adet sorma). */
export function explicitQtyBefore(text: string, idx: number): number | null {
  const before = text.slice(0, idx).trimEnd().split(" ");
  const tail = before.slice(-3);
  // Sola doğru taranır: "on iki" gibi bileşik sayılar önce okunur (FAZ 12A sözleşmesi).
  for (let i = 0; i < tail.length; i++) {
    const w = tail[i];
    if (w === "adet" || w === "tane" || w === "kişi" || w === "kisi" || w === "porsiyon") continue; // ölçüt kelimeler atlanır
    if (w === "on" || w === "onbir") {
      const next = tail[i + 1];
      const unitNext = next ? NUM_WORDS[next] : undefined;
      const n = w === "onbir" ? 11 : 10 + (unitNext && unitNext < 10 ? unitNext : 0);
      if (n >= 1 && n <= 99) return n;
      break;
    }
    const n = /^\d+$/.test(w) ? parseInt(w, 10) : NUM_WORDS[w];
    if (n && n >= 1 && n <= 99) return n;
    break; // en fazla son üç kelime taranır
  }
  return null;
}

export type VoiceDetailedLine = VoiceCartLine & { qtyExplicit: boolean };

/** Ürün adlarını bulur; adet açıkça söylendiyse `qtyExplicit` true (FAZ 12C adet sorması için). */
export function matchProductsDetailed(
  input: string,
  products: VoiceProduct[],
  mode: VoiceMode | null = null,
): VoiceDetailedLine[] {
  const text = norm(input);
  if (!text) return [];
  const tokens = new Set(text.split(" "));
  const cands = products
    .filter((p) => norm(p.name).length >= 2)
    .map((p) => ({ p, key: norm(p.name) }))
    .sort((a, b) => b.key.length - a.key.length);
  const used: Array<[number, number]> = [];
  const lines: VoiceDetailedLine[] = [];
  const addLine = (name: string, qty: number | null, unit: number) => {
    const ex = lines.find((l) => l.name === name);
    if (ex) {
      ex.qty += qty ?? 1;
      if (qty != null) ex.qtyExplicit = true;
    } else if (lines.length < 25) {
      lines.push({ name, qty: qty ?? 1, unitPriceCents: unit, qtyExplicit: qty != null });
    }
  };
  for (const { p, key } of cands) {
    const unit = modePrice(p, mode);
    // 1) birebir ad eşleşmesi (uzun ad önce; örtüşen bölgeler atlanır)
    let idx = text.indexOf(key);
    while (idx >= 0) {
      const end = idx + key.length;
      if (!used.some(([s, e]) => idx < e && end > s)) {
        used.push([idx, end]);
        addLine(p.name, explicitQtyBefore(text, idx), unit);
        break;
      }
      idx = text.indexOf(key, idx + 1);
    }
    // 2) kelime sırası bozulmuşsa: tüm kelimeler girdide var mı (ör. STT karıştırması)
    if (!lines.some((l) => l.name === p.name)) {
      const words = key.split(" ");
      if (words.length > 1 && words.every((w) => tokens.has(w))) {
        const firstIdx = text.indexOf(words[0]);
        addLine(p.name, firstIdx >= 0 ? explicitQtyBefore(text, firstIdx) : null, unit);
      }
    }
  }
  return lines;
}

/** Eski sözleşmeyi korur (adet yoksa 1). */
export function matchProducts(input: string, products: VoiceProduct[], mode: VoiceMode | null = null): VoiceCartLine[] {
  return matchProductsDetailed(input, products, mode).map(({ qtyExplicit: _q, ...l }) => l);
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Ürün options listesinden, metindeki "olsun/olmasın" tercihlerini okur.
 * Örn: "turşu olmasın, ketçap olsun" → [{Turşu,false},{Ketçap,true}]
 */
export function parseOptions(text: string, options: string[] | null | undefined): VoiceOptionPick[] {
  if (!options?.length) return [];
  const t = norm(text);
  const picks: VoiceOptionPick[] = [];
  for (const raw of options.slice(0, 20)) {
    const name = String(raw ?? "").trim().slice(0, 40);
    const key = norm(name);
    if (key.length < 3) continue;
    const neg = new RegExp(`(^|\\s)${escRe(key)}(e|i)?\\s*(olmasın|olma|yok|istemiyorum|eklenmesin|çıksın|ciksin|isterim degil)`);
    const pos = new RegExp(`(^|\\s)${escRe(key)}(e|i)?\\s*(olsun|eklensin|ekle|istiyorum|olsun lutfen|iyidir)`);
    if (neg.test(t)) picks.push({ name, wanted: false });
    else if (pos.test(t)) picks.push({ name, wanted: true });
  }
  return picks;
}

export type VoiceIntent =
  | "GREETING" | "HELP" | "CAMPAIGNS" | "PRODUCTS" | "ORDER" | "TOTAL"
  | "CONFIRM" | "REJECT" | "CANCEL" | "PAYMENT_ONLINE" | "UNKNOWN";

export function detectIntent(text: string): VoiceIntent {
  const t = norm(text);
  const has = (...ws: string[]) => ws.some((w) => t.includes(w));
  if (has("vazgeç", "vazgec", "iptal", "kapat", "gerek yok", "güle güle", "gule gule", "hoşça kal")) return "CANCEL";
  if (has("online ödeme", "online odeme", "online öde", "online ode", "internetten öde", "internetten ode", "kredi kartı ile ödeyebilir", "kart ile online")) return "PAYMENT_ONLINE";
  if (has("kampanya", "indirim", "fırsat", "firsat")) return "CAMPAIGNS";
  if (has("menü", "menu", "ürünler", "urunler", "fiyat", "ne var", "neler var", "listele")) return "PRODUCTS";
  if (has("onayla", "onaylıyorum", "onayliyorum", "gönder", "gonder", "devam", "siparişi tamam", "siparisi tamam", "evet", "tamam")) return "CONFIRM";
  if (has("hayır", "hayir", "istemi", "değil")) return "REJECT";
  if (has("toplam", "hesap", "kaç lira", "kac lira", "tutar")) return "TOTAL";
  if (has("sipariş", "siparis", "paket", "servis", "vermek istiyorum", "alsam", "istiyorum", "eker misin", "yapabilir")) return "ORDER";
  if (has("merhaba", "selam", "günaydın", "iyi günler", "naber")) return "GREETING";
  if (has("yardım", "yardim", "ne yapabilirsin", "neler yapabilirsin")) return "HELP";
  return "UNKNOWN";
}

const isQuit = (t: string) => detectIntent(t) === "CANCEL";
const isConfirm = (t: string) => detectIntent(t) === "CONFIRM";

export const cartTotalCents = (s: VoiceState) => s.cart.reduce((sum, l) => sum + l.qty * l.unitPriceCents, 0);

/** Sepetin FAZ 12C dökümü (matrah − kampanya indirimi + KDV); istemci de aynı fonksiyonu kullanır. */
export function cartBreakdown(s: VoiceState, ctx: VoiceCtx): PriceBreakdown {
  const items = s.cart.map((l) => {
    const p = ctx.products.find((x) => x.name === l.name);
    return { name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents, kdvRate: p?.kdvRate ?? null };
  });
  const camps = ctx.campaigns.map((c) => ({
    title: c.title,
    discountPercent: c.discountPercent,
    discountAmountCents: c.discountAmountCents,
    minBasketCents: c.minBasketCents,
    serviceMode: c.serviceMode,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
  }));
  const best = bestCampaign(items, camps, s.mode);
  return computeTotals({
    items,
    businessKdvRate: ctx.businessKdvRate ?? 20,
    campaign: best,
    mode: s.mode,
  });
}

const optLabel = (opts?: VoiceOptionPick[]) =>
  opts && opts.length ? ` (${opts.map((o) => `${o.name} ${o.wanted ? "olsun" : "olmasın"}`).join(", ")})` : "";

const cartSummary = (s: VoiceState) =>
  s.cart.map((l) => `${l.qty} ${l.name}${optLabel(l.options)}`).join(", ");

/** Toplam cümlesi: indirim/KDV varsa dökümle birlikte (FAZ 12C). */
const totalSay = (s: VoiceState, ctx: VoiceCtx) => {
  const b = cartBreakdown(s, ctx);
  if (b.discountCents > 0) {
    return `Toplam ${tl(b.totalCents)} (matrah ${tl(b.subtotalCents)}, ${b.campaignTitle ? `${b.campaignTitle} ile ` : ""}${tl(b.discountCents)} indirim düştü, KDV dahil)`;
  }
  return `Toplam ${tl(b.totalCents)} (KDV dahil)`;
};

const paymentLabel = (p: VoicePayment | null, mode: VoiceMode | null) => {
  const yer = mode === "PAKET_SERVIS" ? "kapıda" : "iş yerinde";
  return p === "CASH_DOOR" ? `${yer} nakit` : p === "CARD_DOOR" ? `${yer} kart` : `${yer} nakit veya kart`;
};

const payAsk = (mode: VoiceMode | null) =>
  mode === "PAKET_SERVIS"
    ? "Ödemeyi kapıda nakit mi kartla mı yapacaksın?"
    : "Ödemeyi iş yerinde nakit mi kartla mı yapacaksın?";

const stageUi = (s: VoiceStage): VoiceUi =>
  s === "menu" ? "menu"
  : s === "delivery" ? "delivery"
  : s === "qty" ? "qty"
  : s === "ordering" ? "cart"
  : s === "details" ? "details"
  : s === "payment" ? "payment"
  : s === "confirm" ? "confirm"
  : "done";

const modesPhrase = (ctx: VoiceCtx) => {
  const ms = enabledModes(ctx);
  const parts: string[] = [];
  if (ms.includes("GEL_AL")) parts.push("gel-al (işletme içinden)");
  if (ms.includes("REZERVE")) parts.push("rezerve (ileri tarihli gel-al)");
  if (ms.includes("PAKET_SERVIS")) parts.push("adrese teslim");
  return parts.join(" ya da ");
};

const capabilities = (B: string, ctx: VoiceCtx) =>
  ctx.acceptingOrders === false
    ? `Ben ${B} ücretsiz sesli asistanıyım. Şu an sipariş almıyoruz; kampanyalarımı sorabilir, ürün ve fiyatlarımı öğrenebilirsin.`
    : `Ben ${B} ücretsiz sesli asistanıyım. Kampanyalarını sorabilir, ürün ve fiyatlarını öğrenebilir veya sipariş verebilirsin — ${modesPhrase(ctx)}. Ödemeyi nakit veya kartla yaparsın; online ödeme yok.`;

const modeWord = (m: VoiceMode | null) =>
  m === "GEL_AL" ? "gel-al (işletme içi)"
  : m === "REZERVE" ? "rezerve (ileri tarihli gel-al)"
  : m === "PAKET_SERVIS" ? "adrese teslim (paket servis)"
  : "sipariş";

const modeTag = (m: string | null | undefined) =>
  m === "GEL_AL" ? " · gel-al" : m === "REZERVE" ? " · rezerve" : m === "PAKET_SERVIS" ? " · paket servis" : "";

function campaignsView(ctx: VoiceCtx, mode: VoiceMode | null): VoiceStep {
  const all = ctx.campaigns.filter((c) => !mode || !c.serviceMode || c.serviceMode === "ALL" || c.serviceMode === mode);
  const list = all.slice(0, 5);
  if (!list.length) {
    return {
      state: initialVoiceState(),
      say: mode
        ? `${ctx.businessName}'da ${MODE_LABELS[mode]} için aktif kampanya yok. Menüye bakıp sipariş verebilirsin.`
        : `${ctx.businessName} için şu an aktif kampanya yok. Ürün ve fiyat listeme bakmamı ister misin?`,
      ui: "campaigns",
      campaigns: [],
    };
  }
  const views = list.map((c) => ({
    title: c.title,
    campaign: c,
    discountLabel:
      (c.discountPercent
        ? `%${c.discountPercent} indirim`
        : c.discountAmountCents
          ? `${tl(c.discountAmountCents)} indirim`
          : c.endsAt
            ? `geçerlilik: ${c.endsAt.slice(0, 10)}`
            : "detay sayfada") + modeTag(c.serviceMode),
  }));
  const scope = mode ? `${MODE_LABELS[mode]} için ` : "";
  const say =
    `${ctx.businessName}'da ${scope}${list.length} aktif kampanya var: ` +
    views.map((v) => `${v.title}, ${v.discountLabel}`).join("; ") +
    ". Detaylar için kampanya sayfama bakabilirsin.";
  return { state: initialVoiceState(), say, ui: "campaigns", campaigns: views };
}

function productsView(ctx: VoiceCtx, mode: VoiceMode | null, stage: VoiceStage = "menu"): VoiceStep {
  const list = ctx.products.slice(0, 8);
  if (!list.length) {
    return {
      state: { ...initialVoiceState(), stage },
      say: `${ctx.businessName}'da şu an ürün listesi yüklenmemiş. Kampanyalarımıza bakabilirsin.`,
      ui: "products",
      products: [],
    };
  }
  const views = list.map((p) => {
    // FAZ 12C-2: mod seçildiyse YALNIZ o modun tek fiyatı gösterilir (yan yana çift fiyat kafa karıştırır).
    const label = mode ? tl(modePrice(p, mode)) : tl(p.discountPriceCents ?? p.priceCents);
    return { name: p.name, priceLabel: label };
  });
  const scope = mode ? `${MODE_LABELS[mode]} fiyatlarıyla` : "";
  const say =
    `Menüden ilk ${list.length} ürün${scope ? `, ${scope}` : ""}: ` +
    views.map((v) => `${v.name}, ${v.priceLabel}`).join("; ") +
    ".";
  return { state: { ...initialVoiceState(), stage }, say, ui: "products", products: views };
}

/** FAZ 12C-2 — tıklanılan TEK kampanyanın sesli anlatımı (işitme/görme güçlüğü olanlar için). */
export function announceCampaign(c: VoiceCampaign, ctx: VoiceCtx): string {
  const scope =
    !c.serviceMode || c.serviceMode === "ALL" ? "tüm sipariş tiplerinde"
    : c.serviceMode === "GEL_AL" ? "yalnız gel-al siparişlerinde"
    : c.serviceMode === "REZERVE" ? "yalnız rezerve siparişlerinde"
    : c.serviceMode === "PAKET_SERVIS" ? "yalnız adrese teslim siparişlerinde"
    : "";
  const disc = c.discountPercent ? `%${c.discountPercent} indirim` : c.discountAmountCents ? `${tl(c.discountAmountCents)} indirim` : "detaylar aşağıda";
  const min = c.minBasketCents ? ` Minimum sepet ${tl(c.minBasketCents)}.` : "";
  const dates = c.endsAt ? ` Geçerlilik: ${String(c.endsAt).slice(0, 10)} tarihine kadar.` : "";
  return `${c.title}: ${disc}${scope ? `, ${scope}` : ""}.${min}${dates} Kampanya ${ctx.businessName} işletmesinde geçerlidir.`;
}

function askNextDetail(s: VoiceState): { say: string; ui: VoiceUi; state: VoiceState } {
  const needAddress = s.mode === "PAKET_SERVIS";
  const next = !s.name ? "name" : !s.phone ? "phone" : needAddress && !s.address ? "address" : null;
  if (!next) return { say: "", ui: "payment", state: { ...s, stage: "payment" } };
  const ask =
    next === "name"
      ? "Sipariş için adını alabilir miyim?"
      : next === "phone"
        ? "Telefon numaranı söyler misin? İşletme seni onay için arayabilir."
        : "Teslimat adresini söyler misin? Mahalle, sokak ve kapı numarası yeterli.";
  return { say: ask, ui: "details", state: { ...s, stage: "details" } };
}

/** Siparişe uygun mu? (FAZ 12C: açık mod + sipariş alım durumu) */
function orderGate(ctx: VoiceCtx, mode: VoiceMode | null): string | null {
  if (ctx.acceptingOrders === false)
    return `${ctx.businessName} şu an sipariş almıyor. Kampanyalarımı sorabilir veya ürün ve fiyatlarımı öğrenebilirsin.`;
  if (mode && !modeEnabled(ctx, mode)) {
    const others = modesPhrase(ctx);
    return `${ctx.businessName} şu an ${MODE_LABELS[mode].toLocaleLowerCase("tr-TR")} siparişi almıyor${others ? `; yalnız ${others}` : ""}.`;
  }
  return null;
}

/* ------------------------------ ana motor ------------------------------ */

export function handleVoice(input: string, state: VoiceState, ctx: VoiceCtx): VoiceStep {
  const t = norm(input);
  if (!t) {
    return { state, say: "Seni duyamadım, tekrar söyler misin?", ui: stageUi(state.stage) };
  }
  if (isQuit(t)) {
    return {
      state: initialVoiceState(),
      say: "Tamam, vazgeçtim. İstersen kampanyalarıma bakabilir ya da daha sonra sipariş verebilirsin.",
      ui: "menu",
    };
  }

  /* -------------------------------- QTY -------------------------------- */
  // FAZ 12C — ürün adı söylendi ama adet belirtilmediyse MOTOR ADDET SORAR.
  if (state.stage === "qty" && state.pendingQtyFor) {
    const n = scanNumber(t);
    if (n != null) {
      const cart = state.cart.map((l) => (l.name === state.pendingQtyFor ? { ...l, qty: n } : l));
      const next: VoiceState = { ...state, cart, stage: "ordering", pendingQtyFor: null };
      return {
        state: next,
        say: `Tamam, ${n} ${state.pendingQtyFor}${optLabel(next.cart.find((l) => l.name === state.pendingQtyFor)?.options)}. Sepette toplam ${cartSummary(next)}. ${totalSay(next, ctx)}. Onaylıyor musun?`,
        ui: "cart",
      };
    }
    return {
      state,
      say: `${state.pendingQtyFor} için adet söyle — örneğin 'iki tane' veya '3'.`,
      ui: "qty",
    };
  }

  /* ------------------------------ MENU ------------------------------ */
  if (state.stage === "menu") {
    const intent = detectIntent(t);
    if (intent === "CAMPAIGNS") return campaignsView(ctx, null);
    // FAZ 12C-2: "menü" seçildiğinde ÖNCE sipariş tipi sorulur (tek mod açıksa doğrudan o modun menüsü açılır).
    if (intent === "PRODUCTS") {
      // productsView taze bir state döndürür; ad/telefon/sepet/mode KAYBEDİLMESİN diye mevcut state korunur.
      if (state.mode && modeEnabled(ctx, state.mode))
        return { ...productsView(ctx, state.mode, state.stage), state: { ...state, stage: state.stage, mode: state.mode } };
      const ms = enabledModes(ctx);
      if (ms.length === 1)
        return { ...productsView(ctx, ms[0], state.stage), state: { ...state, stage: state.stage, mode: ms[0] } };
      return {
        state: { ...state, stage: "delivery" },
        say: `Önce sipariş tipini seç — ${modesPhrase(ctx)}? Seçtiğin tipe göre menüyü tek fiyatla gösteririm.`,
        ui: "delivery",
      };
    }
    if (intent === "GREETING" || intent === "HELP") return { state, say: capabilities(ctx.businessName, ctx), ui: "menu" };
    const modeInUtterance = detectDeliveryMode(t);
    const gate = orderGate(ctx, modeInUtterance);
    if (gate && (modeInUtterance || intent === "ORDER")) return { state, say: gate, ui: "menu" };
    const ms = enabledModes(ctx);
    // FAZ 12C: yalnız BİR mod açıksa sorulmadan o mod seçilir.
    const effMode: VoiceMode | null = modeInUtterance ?? (ms.length === 1 ? ms[0] : state.mode);
    const direct = matchProductsDetailed(t, ctx.products, effMode);
    attachOptions(direct, t, ctx);
    // FAZ 12C-2: yalnız "gel al" / "rezerve" / "adrese teslim" söylenirse de sipariş başlar.
    if (direct.length || intent === "ORDER" || modeInUtterance) {
      if (effMode && modeEnabled(ctx, effMode) && (modeInUtterance || ms.length === 1)) {
        const askQty = direct.find((l) => !l.qtyExplicit);
        const cart = mergeLines(state.cart, stripFlags(direct));
        const next: VoiceState = {
          ...state,
          stage: askQty ? "qty" : "ordering",
          mode: effMode,
          cart,
          pendingQtyFor: askQty ? askQty.name : null,
        };
        return {
          state: next,
          say: cart.length
            ? askQty
              ? `Tamam, ${modeWord(effMode)}. Sepete ekledim: ${cartSummary(next)}. ${askQty.name} için adet ne olsun?`
              : `Tamam, ${modeWord(effMode)}. Sepete ekledim: ${cartSummary(next)}. ${totalSay(next, ctx)}. Onaylıyor musun, ürün de ekleyebilirsin.`
            : `Tamam, ${modeWord(effMode)} siparişini alırım. Menü karşında — adet seçip sepete ekleyebilir ya da istediğini söyleyebilirsin.`,
          // FAZ 12C-2: sepet boşken liste açılır (manuel adet/sepete ekle).
          ui: askQty ? "qty" : cart.length ? "cart" : "products",
        };
      }
      return {
        state: { ...state, stage: "delivery" },
        say: ctx.products.length
          ? `Tabii! Siparişini nasıl alacaksın — ${modesPhrase(ctx)}?`
          : `${ctx.businessName}'da ürün listesi henüz yüklenmemiş; kampanyalarımıza bakabilirsin.`,
        ui: ctx.products.length ? "delivery" : "menu",
      };
    }
    return {
      state,
      say: `Anlayamadım. Kampanyalarımı sorabilir, ürün ve fiyatlarımı öğrenebilir ya da sipariş verebilirsin — ${modesPhrase(ctx)}. Ne yapmak istersin?`,
      ui: "menu",
    };
  }

  /* ----------------------------- DELIVERY ----------------------------- */
  if (state.stage === "delivery") {
    const intent = detectIntent(t);
    if (intent === "CANCEL") return { state: initialVoiceState(), say: "Tamam, sipariş yok. Başka bir şey ister misin?", ui: "menu" };
    if (intent === "CAMPAIGNS") return campaignsView(ctx, null);
    // Tek mod açıksa ad-seviyesinde sorulmadan o mod uygulanır (FAZ 12C).
    const ms = enabledModes(ctx);
    const mode = detectDeliveryMode(t) ?? (ms.length === 1 ? ms[0] : null);
    if (!mode || !modeEnabled(ctx, mode)) {
      if (mode && ms.length === 1) return { state, say: orderGate(ctx, mode) ?? "", ui: "delivery" };
      return {
        state,
        say: mode
          ? orderGate(ctx, mode) ?? ""
          : `Anlayamadım: ${modesPhrase(ctx)}? Birini söyle yeterli.`,
        ui: "delivery",
      };
    }
    const direct = matchProductsDetailed(t, ctx.products, mode);
    attachOptions(direct, t, ctx);
    const askQty = direct.find((l) => !l.qtyExplicit);
    const cart = mergeLines(state.cart, stripFlags(direct));
    const next: VoiceState = { ...state, stage: askQty ? "qty" : "ordering", mode, cart, pendingQtyFor: askQty ? askQty.name : null };
    return {
      state: next,
      say: cart.length
        ? askQty
          ? `Tamam, ${modeWord(mode)}. Ekledim: ${cartSummary(next)}. ${askQty.name} için adet ne olsun?`
          : `Tamam, ${modeWord(mode)}. Ekledim: ${cartSummary(next)}. ${totalSay(next, ctx)}. Onaylıyor musun?`
        // FAZ 12C-2: mod seçilince ÜRÜN LİSTESİ açılır (adet/sepete ekle ile manuel seçim).
        : `Tamam, ${modeWord(mode)} sipariş. Menü karşında — adet seçip sepete ekleyebilir ya da istediğini söyleyebilirsin.`,
      ui: askQty ? "qty" : cart.length ? "cart" : "products",
    };
  }

  /* ----------------------------- ORDERING ----------------------------- */
  if (state.stage === "ordering") {
    const intent = detectIntent(t);
    if (intent === "CANCEL") {
      return { state: initialVoiceState(), say: "Siparişten vazgeçtim. Başka bir şey ister misin?", ui: "menu" };
    }
    // Teslimat tipi değişimi — sepet fiyatları yeni moda göre yeniden hesaplanır.
    const modeSwitch = detectDeliveryMode(t);
    if (modeSwitch && state.mode && modeSwitch !== state.mode) {
      const gate = orderGate(ctx, modeSwitch);
      if (gate) return { state, say: gate, ui: "cart" };
      const cart = repriceCart(state.cart, modeSwitch, ctx);
      const next: VoiceState = { ...state, mode: modeSwitch, cart };
      return {
        state: next,
        say: `Tamam, siparişin ${modeWord(modeSwitch)} olarak güncellendi. ${totalSay(next, ctx)}. Onaylıyor musun?`,
        ui: "cart",
      };
    }
    if (intent === "CAMPAIGNS") return { ...campaignsView(ctx, state.mode), state: { ...state, stage: "ordering" } };
    if (intent === "PRODUCTS")
      return { ...productsView(ctx, state.mode, "ordering"), state: { ...state, stage: "ordering", cart: state.cart } };
    if (intent === "TOTAL") {
      return {
        state,
        say: state.cart.length
          ? `Sepetinde ${cartSummary(state)} var (${modeWord(state.mode)}). ${totalSay(state, ctx)}.`
          : "Sepetin boş. Ürün eklemek ister misin?",
        ui: "cart",
      };
    }
    if (intent === "CONFIRM") {
      if (!state.mode) return { state: { ...state, stage: "delivery" }, say: "Siparişini nasıl alacaksın?", ui: "delivery" };
      if (!state.cart.length) {
        return { state, say: "Sepetin boş önce. Menüden ne istersin? Örneğin: üç tavuk dürüm döner.", ui: "cart" };
      }
      return askNextDetail(state);
    }
    if (intent === "REJECT") {
      return {
        state,
        say: state.cart.length
          ? `Tamam, sepetin duruyor: ${cartSummary(state)}. Onaylıyor musun?`
          : "Sepetin zaten boş. Menüden ürün ekleyebilirsin.",
        ui: "cart",
      };
    }
    if (intent === "PAYMENT_ONLINE") return paymentOnlineNote(state);
    const lines = matchProductsDetailed(t, ctx.products, state.mode);
    attachOptions(lines, t, ctx);
    if (lines.length) {
      const askQty = lines.find((l) => !l.qtyExplicit);
      const cart = mergeLines(state.cart, stripFlags(lines));
      const next: VoiceState = { ...state, cart, stage: askQty ? "qty" : "ordering", pendingQtyFor: askQty ? askQty.name : null };
      return {
        state: next,
        say: askQty
          ? `Ekledim: ${lines.map((l) => `${l.qty} ${l.name}${optLabel(l.options)}`).join(", ")}. ${askQty.name} için adet ne olsun?`
          : `Ekledim: ${lines.map((l) => `${l.qty} ${l.name}${optLabel(l.options)}`).join(", ")}. Sepette toplam ${cartSummary(next)}. ${totalSay(next, ctx)}. Onaylıyor musun?`,
        ui: askQty ? "qty" : "cart",
      };
    }
    return {
      state,
      say: `Bu ürünü menüde bulamadım. Söylediğin ürünün tam adını tekrar eder misin? Menüdeki ürünleri 'menü' diyerek öğrenebilirsin.`,
      ui: "cart",
    };
  }

  /* ------------------------------ DETAILS ------------------------------ */
  if (state.stage === "details") {
    const intent = detectIntent(t);
    if (intent === "CANCEL") return { state: initialVoiceState(), say: "Tamam, siparişi iptal ettim.", ui: "menu" };
    const digits = t.replace(/\D/g, "");
    const next: VoiceState = { ...state };
    const needAddress = next.mode === "PAKET_SERVIS";
    if (!next.name && digits.length < 10 && t.split(" ").length <= 3) next.name = capitalize(input.trim());
    else if (!next.phone && digits.length >= 10) next.phone = "+" + digits.slice(-12);
    else if (needAddress && !next.address && t.split(" ").length >= 2) next.address = capitalize(input.trim());
    else if (!next.name) next.name = capitalize(input.trim());
    else if (!next.phone && digits.length >= 10) next.phone = "+" + digits.slice(-12);
    else if (needAddress && !next.address) next.address = capitalize(input.trim());

    if (next.name && next.phone && (!needAddress || next.address)) {
      return {
        state: { ...next, stage: "payment" },
        say: `${next.name}, kaydettim. ${payAsk(next.mode)}`,
        ui: "payment",
      };
    }
    const ask = askNextDetail(next);
    return { state: ask.state, say: `Kaydettim. ${ask.say}`, ui: "details" };
  }

  /* ------------------------------ PAYMENT ------------------------------ */
  if (state.stage === "payment") {
    const intent = detectIntent(t);
    if (intent === "CANCEL") return { state: initialVoiceState(), say: "Tamam, siparişi iptal ettim.", ui: "menu" };
    if (intent === "PAYMENT_ONLINE") return paymentOnlineNote(state);
    if (t.includes("kart") || t.includes("kredi")) return toConfirm({ ...state, payment: "CARD_DOOR" }, ctx);
    if (t.includes("nakit") || t.includes("para")) return toConfirm({ ...state, payment: "CASH_DOOR" }, ctx);
    if (intent === "CONFIRM") return toConfirm({ ...state, payment: state.payment ?? "CASH_DOOR" }, ctx);
    return { state, say: `Nakit ve kart seçeneklerimiz var. ${payAsk(state.mode)}`, ui: "payment" };
  }

  /* ------------------------------ CONFIRM ------------------------------ */
  if (state.stage === "confirm") {
    const intent = detectIntent(t);
    if (intent === "REJECT" || intent === "CANCEL") {
      return {
        state: { ...state, stage: "ordering" },
        say: `Tamam, göndermedim; sepete döndük: ${cartSummary(state)}. Değişiklik yapabilir veya onaylayabilirsin.`,
        ui: "cart",
      };
    }
    if (isConfirm(t)) {
      const sonuc =
        state.mode === "PAKET_SERVIS"
          ? `Siparişin ${ctx.businessName} işletmesine iletildi! İşletme onaylayınca hazırlanacak ve adresine yollanacak; ödemeyi kapıda ${paymentLabel(state.payment, state.mode)} yapacaksın. Siparişiniz alınmıştır. İyi günler dileriz.`
          : state.mode === "REZERVE"
            ? `Rezerve siparişin ${ctx.businessName} işletmesine iletildi! Belirttiğin zamanda gelip alacaksın; ödemeyi iş yerinde ${paymentLabel(state.payment, state.mode)} yapacaksın. Siparişiniz alınmıştır. İyi günler dileriz.`
            : `Siparişin ${ctx.businessName} işletmesine iletildi! Hazır olunca gelip alacaksın; ödemeyi iş yerinde ${paymentLabel(state.payment, state.mode)} yapacaksın. Siparişiniz alınmıştır. İyi günler dileriz.`;
      return { state: { ...state, stage: "done" }, say: sonuc, ui: "done" };
    }
    return { state, say: "Siparişi onaylıyor musun? 'Evet' de yeterli.", ui: "confirm" };
  }

  /* ------------------------------- DONE ------------------------------- */
  return {
    state: initialVoiceState(),
    say: "Yeni bir işlem ister misin? Kampanyaları sorabilir, menüye bakabilir veya yeni sipariş verebilirsin.",
    ui: "menu",
  };
}

/* ------------------------- UI için saf yardımcılar ------------------------- */

/** Mod seçilince/dönünce sepet fiyatları o moda göre yeniden çözülür. */
export function applyMode(s: VoiceState, mode: VoiceMode, ctx: VoiceCtx): VoiceState {
  const cart = repriceCart(s.cart, mode, ctx);
  return { ...s, mode, cart, stage: s.stage === "delivery" ? "ordering" : s.stage };
}

/** Form alanlarından devam: ad/telefon (+adrese teslimde adres) tamamlanınca ödeme adımına geçer. */
export function applyDetails(s: VoiceState, d: { name?: string; phone?: string; address?: string }): VoiceState {
  const next: VoiceState = {
    ...s,
    name: d.name?.trim() ? d.name.trim().slice(0, 80) : s.name,
    phone: d.phone?.trim() ? d.phone.trim().slice(0, 20) : s.phone,
    address: d.address?.trim() ? d.address.trim().slice(0, 300) : s.address,
  };
  const ok = next.name && next.phone && (next.mode !== "PAKET_SERVIS" || next.address);
  next.stage = ok ? "payment" : "details";
  return next;
}

export function applyPayment(s: VoiceState, method: VoicePayment): VoiceState {
  return { ...s, payment: method, stage: "confirm" };
}

export function applyConfirm(s: VoiceState): VoiceState {
  return { ...s, stage: "done" };
}

/* ------------------------------ iç ------------------------------ */

/** Satırlara, eşleşen ürünlerin options listesinden tercihleri ekler (FAZ 12C). */
function attachOptions(lines: VoiceDetailedLine[], text: string, ctx: VoiceCtx) {
  for (const l of lines) {
    const p = ctx.products.find((x) => x.name === l.name);
    const picks = parseOptions(text, p?.options);
    if (picks.length) l.options = picks;
  }
}

const stripFlags = (lines: VoiceDetailedLine[]): VoiceCartLine[] =>
  lines.map(({ qtyExplicit: _q, ...l }) => ({ ...l }));

function repriceCart(cart: VoiceCartLine[], mode: VoiceMode, ctx: VoiceCtx): VoiceCartLine[] {
  return cart.map((l) => {
    const p = ctx.products.find((x) => x.name === l.name);
    return p ? { ...l, unitPriceCents: modePrice(p, mode) } : l;
  });
}

/** Aynı ad + aynı NOT imzası birleşir; notları farklıysa ayrı satır kalır. */
function optSig(o?: VoiceOptionPick[]) {
  return o && o.length ? o.map((x) => `${x.name}:${x.wanted}`).sort().join("|") : "";
}
function mergeLines(cart: VoiceCartLine[], add: VoiceCartLine[]): VoiceCartLine[] {
  const out = cart.map((l) => ({ ...l }));
  for (const l of add) {
    const sig = optSig(l.options);
    const ex = out.find((o) => o.name === l.name && optSig(o.options) === sig);
    if (ex) ex.qty += l.qty;
    else if (out.length < 25) out.push({ ...l });
  }
  return out;
}

function toConfirm(s: VoiceState, ctx: VoiceCtx): VoiceStep {
  return {
    state: { ...s, stage: "confirm" },
    say: `Siparişin (${modeWord(s.mode)}): ${cartSummary(s)}. ${totalSay(s, ctx)}, ödeme ${paymentLabel(s.payment, s.mode)}. Onaylıyor musun?`,
    ui: "confirm",
  };
}

function paymentOnlineNote(state: VoiceState): VoiceStep {
  return {
    state,
    say: `Online ödeme yok; DampingVar ödeme almaz. Ödemeyi ${state.mode === "PAKET_SERVIS" ? "kapıda" : "iş yerinde"} nakit veya kartla doğrudan işletmeye yaparsın. Nakit mi kart mı?`,
    ui: state.stage === "payment" ? "payment" : stageUi(state.stage),
  };
}

function capitalize(s: string) {
  return s ? s[0].toLocaleUpperCase("tr-TR") + s.slice(1) : s;
}
