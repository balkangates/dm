/**
 * FAZ 12A — Ücretsiz Sesli Asistan motoru (anahtarsız, yerel, deterministik).
 *
 * Tarayıcının Web Speech API'si metne çevirir; bu motor metni NİYETE ve
 * SEPETE çevirir. Hiçbir dış API çağrısı YOKTUR; LLM anahtarı gerekmez.
 *
 * Sınırlar (dürüst): yalnızca desteklenen niyetler; anlaşılmayan girdi
 * sorulur; stok/fiyat uydurulmaz (fiyatlar işletme listesinden gelir);
 * online ödeme YOKTUR — ödeme kapıda nakit veya kartla işletmeye yapılır.
 */

export type VoiceProduct = { name: string; priceCents: number; discountPriceCents?: number | null };
export type VoiceCampaign = {
  title: string;
  discountPercent?: number | null;
  discountAmountCents?: number | null;
  endsAt?: string | null;
};

export type VoiceCtx = {
  businessName: string;
  district: string;
  products: VoiceProduct[];
  campaigns: VoiceCampaign[];
};

export type VoiceCartLine = { name: string; qty: number; unitPriceCents: number };
export type VoicePayment = "CASH_DOOR" | "CARD_DOOR";
export type VoiceStage = "menu" | "ordering" | "details" | "payment" | "confirm" | "done";

export type VoiceState = {
  stage: VoiceStage;
  cart: VoiceCartLine[];
  name: string;
  phone: string;
  address: string;
  payment: VoicePayment | null;
};

export type VoiceUi = "menu" | "campaigns" | "products" | "cart" | "details" | "payment" | "confirm" | "done";

export type VoiceStep = {
  state: VoiceState;
  say: string;
  ui: VoiceUi;
  campaigns?: Array<{ title: string; discountLabel: string }>;
  products?: Array<{ name: string; priceLabel: string }>;
};

export const initialVoiceState = (): VoiceState => ({
  stage: "menu",
  cart: [],
  name: "",
  phone: "",
  address: "",
  payment: null,
});

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

/** "üç adet", "3 tane", "on iki" gibi ifadelerden miktar çıkarır (varsayılan 1). */
export function parseQtyBefore(text: string, idx: number): number {
  const before = text.slice(0, idx).trimEnd().split(" ");
  const tail = before.slice(-3);
  for (let i = tail.length - 1; i >= 0; i--) {
    const w = tail[i];
    if (w === "adet" || w === "tane" || w === "kişi" || w === "kisi" || w === "porsiyon") continue; // ölçüt kelimeler atlanır
    let n = /^\d+$/.test(w) ? parseInt(w, 10) : NUM_WORDS[w];
    if (w === "on" || w === "onbir") {
      const next = tail[i + 1];
      const unitNext = next ? NUM_WORDS[next] : undefined;
      n = w === "onbir" ? 11 : 10 + (unitNext && unitNext < 10 ? unitNext : 0);
    }
    if (n && n >= 1 && n <= 99) return n;
    break; // en fazla son iki kelime taranır
  }
  return 1;
}

/** Girdideki ürün adlarını (uzundan kısala) bulup sepet satırlarına çevirir. */
export function matchProducts(input: string, products: VoiceProduct[]): VoiceCartLine[] {
  const text = norm(input);
  if (!text) return [];
  const tokens = new Set(text.split(" "));
  const cands = products
    .filter((p) => norm(p.name).length >= 2)
    .map((p) => ({ p, key: norm(p.name) }))
    .sort((a, b) => b.key.length - a.key.length);
  const used: Array<[number, number]> = [];
  const lines: VoiceCartLine[] = [];
  const addLine = (name: string, qty: number, unit: number) => {
    const ex = lines.find((l) => l.name === name);
    if (ex) ex.qty += qty;
    else if (lines.length < 25) lines.push({ name, qty, unitPriceCents: unit });
  };
  for (const { p, key } of cands) {
    const unit = p.discountPriceCents ?? p.priceCents;
    // 1) birebir ad eşleşmesi (uzun ad önce; örtüşen bölgeler atlanır)
    let idx = text.indexOf(key);
    while (idx >= 0) {
      const end = idx + key.length;
      if (!used.some(([s, e]) => idx < e && end > s)) {
        used.push([idx, end]);
        addLine(p.name, parseQtyBefore(text, idx), unit);
        break;
      }
      idx = text.indexOf(key, idx + 1);
    }
    // 2) kelime sırası bozulmuşsa: tüm kelimeler girdide var mı (ör. STT karıştırması)
    if (!lines.some((l) => l.name === p.name)) {
      const words = key.split(" ");
      if (words.length > 1 && words.every((w) => tokens.has(w))) {
        const firstIdx = text.indexOf(words[0]);
        addLine(p.name, firstIdx >= 0 ? parseQtyBefore(text, firstIdx) : 1, unit);
      }
    }
  }
  return lines;
}

export type VoiceIntent = "GREETING" | "HELP" | "CAMPAIGNS" | "PRODUCTS" | "ORDER" | "TOTAL" | "CONFIRM" | "REJECT" | "CANCEL" | "PAYMENT_ONLINE" | "UNKNOWN";

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
const isReject = (t: string) => detectIntent(t) === "REJECT";

export const cartTotalCents = (s: VoiceState) => s.cart.reduce((sum, l) => sum + l.qty * l.unitPriceCents, 0);

const cartSummary = (s: VoiceState) =>
  s.cart.map((l) => `${l.qty} ${l.name}`).join(", ");

const paymentLabel = (p: VoicePayment | null) =>
  p === "CASH_DOOR" ? "kapıda nakit" : p === "CARD_DOOR" ? "kapıda kart" : "kapıda nakit veya kart";

const stageUi = (s: VoiceStage): VoiceUi =>
  s === "menu" ? "menu" : s === "ordering" ? "cart" : s === "details" ? "details" : s === "payment" ? "payment" : s === "confirm" ? "confirm" : "done";

const capabilities =
  "Ben ${B}'un ücretsiz sesli asistanıyım. Kampanyalarını sorabilir, ürün ve fiyatlarını öğrenebilir veya paket servis siparişi verebilirsin. Ödemeyi kapıda nakit veya kartla işletmeye yaparsın.";

function campaignsView(ctx: VoiceCtx): VoiceStep {
  const list = ctx.campaigns.slice(0, 5);
  if (!list.length) {
    return {
      state: initialVoiceState(),
      say: `${ctx.businessName} için şu an aktif kampanya yok. Ürün ve fiyat listeme bakmamı ister misin?`,
      ui: "campaigns",
      campaigns: [],
    };
  }
  const views = list.map((c) => ({
    title: c.title,
    discountLabel: c.discountPercent
      ? `%${c.discountPercent} indirim`
      : c.discountAmountCents
        ? `${tl(c.discountAmountCents)} indirim`
        : c.endsAt
          ? `geçerlilik: ${c.endsAt.slice(0, 10)}`
          : "detay sayfada",
  }));
  const say =
    `${ctx.businessName}'da ${list.length} aktif kampanya var: ` +
    views.map((v) => `${v.title}, ${v.discountLabel}`).join("; ") +
    ". Detaylar için kampanya sayfama bakabilirsin.";
  return { state: initialVoiceState(), say, ui: "campaigns", campaigns: views };
}

function productsView(ctx: VoiceCtx, stage: VoiceStage = "menu"): VoiceStep {
  const list = ctx.products.slice(0, 8);
  if (!list.length) {
    return {
      state: { ...initialVoiceState(), stage },
      say: `${ctx.businessName}'da şu an ürün listesi yüklenmemiş. Kampanyalarımıza bakabilirsin.`,
      ui: "products",
      products: [],
    };
  }
  const views = list.map((p) => ({ name: p.name, priceLabel: tl(p.discountPriceCents ?? p.priceCents) }));
  const say = `Menüden ilk ${list.length} ürün: ` + views.map((v) => `${v.name}, ${v.priceLabel}`).join("; ") + ".";
  return { state: { ...initialVoiceState(), stage }, say, ui: "products", products: views };
}

function askNextDetail(s: VoiceState): { say: string; ui: VoiceUi; state: VoiceState } {
  const next = !s.name ? "name" : !s.phone ? "phone" : !s.address ? "address" : null;
  if (!next) return { say: "", ui: "payment", state: { ...s, stage: "payment" } };
  const ask =
    next === "name"
      ? "Sipariş için adını alabilir miyim?"
      : next === "phone"
        ? "Telefon numaranı söyler misin? İşletme seni onay için arayabilir."
        : "Teslimat adresini söyler misin? Mahalle, sokak ve kapı numarası yeterli.";
  return { say: ask, ui: "details", state: { ...s, stage: "details" } };
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

  /* ------------------------------ MENU ------------------------------ */
  if (state.stage === "menu") {
    const intent = detectIntent(t);
    if (intent === "CAMPAIGNS") return campaignsView(ctx);
    if (intent === "PRODUCTS") return productsView(ctx);
    if (intent === "GREETING" || intent === "HELP") {
      return {
        state,
        say: capabilities.replace("${B}", ctx.businessName),
        ui: "menu",
      };
    }
    // doğrudan ürün adı söylenmişse siparişe başla
    const direct = matchProducts(t, ctx.products);
    if (direct.length) {
      const cart = mergeLines(state.cart, direct);
      return {
        state: { ...state, stage: "ordering", cart },
        say: `Sepete ekledim: ${cartSummary({ ...state, cart })}. Toplam ${tl(cartTotalCents({ ...state, cart }))}. Siparişi onaylamak için 'onayla' diyebilir, ürün de ekleyebilirsin.`,
        ui: "cart",
      };
    }
    if (intent === "ORDER") {
      return {
        state: { ...state, stage: "ordering" },
        say: ctx.products.length
          ? `Tabii! ${ctx.district} için paket servis siparişini alırım. Ne istersin? Örneğin: üç tavuk dürüm döner, iki ayran.`
          : `${ctx.businessName}'da ürün listesi henüz yüklenmemiş; kampanyalarımıza bakabilirsin.`,
        ui: "cart",
      };
    }
    return {
      state,
      say: `Anlayamadım. Kampanyalarımı sorabilir, ürün ve fiyatlarımı öğrenebilir ya da sipariş verebilirsin. Ne yapmak istersin?`,
      ui: "menu",
    };
  }

  /* ----------------------------- ORDERING ----------------------------- */
  if (state.stage === "ordering") {
    const intent = detectIntent(t);
    if (intent === "CANCEL") {
      return { state: initialVoiceState(), say: "Siparişten vazgeçtim. Başka bir şey ister misin?", ui: "menu" };
    }
    if (intent === "CAMPAIGNS") return { ...campaignsView(ctx), state: { ...state, stage: "ordering" } };
    if (intent === "PRODUCTS") return { ...productsView(ctx, "ordering"), state: { ...state, stage: "ordering", cart: state.cart } };
    if (intent === "TOTAL") {
      return {
        state,
        say: state.cart.length
          ? `Sepetinde ${cartSummary(state)} var. Toplam ${tl(cartTotalCents(state))}.`
          : "Sepetin boş. Ürün eklemek ister misin?",
        ui: "cart",
      };
    }
    if (intent === "CONFIRM") {
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
    const lines = matchProducts(t, ctx.products);
    if (lines.length) {
      const cart = mergeLines(state.cart, lines);
      const next = { ...state, cart };
      return {
        state: next,
        say: `Ekledim: ${lines.map((l) => `${l.qty} ${l.name}`).join(", ")}. Sepette toplam ${cartSummary(next)}, tutar ${tl(cartTotalCents(next))}. Onaylıyor musun?`,
        ui: "cart",
      };
    }
    if (intent === "PAYMENT_ONLINE") return paymentOnlineNote(state);
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
    if (!next.name && digits.length < 10 && t.split(" ").length <= 3) next.name = capitalize(input.trim());
    else if (!next.phone && digits.length >= 10) next.phone = "+" + digits.slice(-12);
    else if (!next.address && t.split(" ").length >= 2) next.address = capitalize(input.trim());
    else if (!next.name) next.name = capitalize(input.trim());
    else if (!next.phone && digits.length >= 10) next.phone = "+" + digits.slice(-12);
    else if (!next.address) next.address = capitalize(input.trim());

    if (next.name && next.phone && next.address) {
      return {
        state: { ...next, stage: "payment" },
        say: `${next.name}, kaydettim. Ödemeyi kapıda nakit mi kartla mı yapacaksın?`,
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
    if (t.includes("kart") || t.includes("kredi")) return toConfirm({ ...state, payment: "CARD_DOOR" });
    if (t.includes("nakit") || t.includes("para")) return toConfirm({ ...state, payment: "CASH_DOOR" });
    if (intent === "CONFIRM") return toConfirm({ ...state, payment: state.payment ?? "CASH_DOOR" });
    return {
      state,
      say: "Kapıda nakit ve kapıda kart seçeneklerimiz var. Hangisiyle ödeyeceksin?",
      ui: "payment",
    };
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
      return {
        state: { ...state, stage: "done" },
        say: `Siparişin ${ctx.businessName}iletildi! İşletme onaylayınca hazırlanacak; ödemeyi kapıda ${paymentLabel(state.payment)} yapacaksın.`,
        ui: "done",
      };
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

/** Form alanlarından devam: ad/telefon/adres tamamlanınca ödeme adımına geçer. */
export function applyDetails(s: VoiceState, d: { name?: string; phone?: string; address?: string }): VoiceState {
  const next: VoiceState = {
    ...s,
    name: d.name?.trim() ? d.name.trim().slice(0, 80) : s.name,
    phone: d.phone?.trim() ? d.phone.trim().slice(0, 20) : s.phone,
    address: d.address?.trim() ? d.address.trim().slice(0, 300) : s.address,
  };
  next.stage = next.name && next.phone && next.address ? "payment" : "details";
  return next;
}

export function applyPayment(s: VoiceState, method: VoicePayment): VoiceState {
  return { ...s, payment: method, stage: "confirm" };
}

export function applyConfirm(s: VoiceState): VoiceState {
  return { ...s, stage: "done" };
}

/* ------------------------------ iç ------------------------------ */

function mergeLines(cart: VoiceCartLine[], add: VoiceCartLine[]): VoiceCartLine[] {
  const out = cart.map((l) => ({ ...l }));
  for (const l of add) {
    const ex = out.find((o) => o.name === l.name);
    if (ex) ex.qty += l.qty;
    else if (out.length < 25) out.push({ ...l });
  }
  return out;
}

function toConfirm(s: VoiceState): VoiceStep {
  return {
    state: { ...s, stage: "confirm" },
    say: `Siparişin: ${cartSummary(s)}. Toplam ${tl(cartTotalCents(s))}, ödeme ${paymentLabel(s.payment)}. Onaylıyor musun?`,
    ui: "confirm",
  };
}

function paymentOnlineNote(state: VoiceState): VoiceStep {
  return {
    state,
    say: "Online ödeme yok; DampingVar ödeme almaz. Ödemeyi kapıda nakit veya kartla doğrudan işletmeye yaparsın. Kapıda nakit mi kart mı?",
    ui: state.stage === "payment" ? "payment" : stageUi(state.stage),
  };
}

function capitalize(s: string) {
  return s ? s[0].toLocaleUpperCase("tr-TR") + s.slice(1) : s;
}
