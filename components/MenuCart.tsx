"use client";

/**
 * Menü ve Sipariş — işletme sayfasındaki GÖRSEL sipariş modülü.
 *
 * Harici bir yemek platformu entegrasyonu DEĞİLDİR; yalnızca tasarım dili yemek-sipariş uygulamalarına
 * benzer (kategori çubuğu, yatay ürün kartları, ürün penceresi, sticky sepet). Akış, Sesli Asistan'ın
 * çalışma modelini görselleştirir: Menü → Teslimat → Bilgiler → Ödeme → Onay → Tamam; her adımda asistanın
 * sorusu konuşma balonu olarak görünür. Sesli Asistan'a dokunulmaz; üstteki panel yalnızca onu açar.
 *
 * Ödeme alınmaz: kapıda/iş yerinde müşteri ile işletme arasındadır. Fiyat sunucuda yeniden hesaplanır.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Button, Input, Notice, useToast } from "@/components/ds";
import { Icon } from "@/components/icons";
import { bestCampaign, breakdownLines, computeTotals, type PriceBreakdown } from "@/lib/order-price";
import { enabledModes, modePrice, type VoiceCampaign, type VoiceMode, type VoicePayment } from "@/lib/voice";
import { isOpenNow, money, withinHoursAt, zonedHmToIso, type Currency, type HourRow, type Lang } from "@/lib/money";

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  discountPriceCents: number | null;
  deliveryPriceCents: number | null;
  options: string[];
  kdvRate: number | null;
  category: string | null;
  imageUrl: string | null;
};

type Picks = Record<string, boolean>; // seçenek adı → true (olsun) / false (olmasın); yoksa nötr
type Line = { key: string; productId: string; qty: number; picks: Picks };
type Step = "cart" | "delivery" | "details" | "payment" | "confirm" | "done";

const SHORT_MODE: Record<VoiceMode, string> = { GEL_AL: "Gel-al", REZERVE: "Rezerve", PAKET_SERVIS: "Adrese teslim" };
const MODE_HINT: Record<VoiceMode, string> = {
  GEL_AL: "Hazır olunca gelip alırsın; ödeme iş yerinde.",
  REZERVE: "Belirlediğin saatte gelip alırsın; ödeme iş yerinde.",
  PAKET_SERVIS: "Adresine yollanır; ödeme kapıda.",
};
const MODE_ICON: Record<VoiceMode, string> = { GEL_AL: "🛍️", REZERVE: "🕒", PAKET_SERVIS: "🛵" };
const STEP_LABEL: Record<Exclude<Step, "done">, string> = { cart: "Sepet", delivery: "Teslimat", details: "Bilgiler", payment: "Ödeme", confirm: "Onay" };
const MAX_QTY = 99;

const lineKey = (productId: string, picks: Picks) =>
  `${productId}|${Object.keys(picks).sort().map((k) => `${k}:${picks[k] ? 1 : 0}`).join(",")}`;

const CartSvg = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" />
    <path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6" />
  </svg>
);
const MicSvg = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" />
  </svg>
);

/** Adet seçici (− n +). */
function Stepper({ qty, onChange, label, min = 0 }: { qty: number; onChange: (n: number) => void; label: string; min?: number }) {
  return (
    <div className="inline-flex items-center rounded-full border-2 border-line bg-surface">
      <button type="button" aria-label={`${label} adedini azalt`} onClick={() => onChange(Math.max(min, qty - 1))}
        className="flex h-8 w-8 items-center justify-center text-[1.1rem] font-bold text-ink hover:text-accent">−</button>
      <span className="tabular w-6 text-center text-[0.9rem] font-semibold" aria-live="polite">{qty}</span>
      <button type="button" aria-label={`${label} adedini artır`} onClick={() => onChange(Math.min(MAX_QTY, qty + 1))}
        className="flex h-8 w-8 items-center justify-center text-[1.1rem] font-bold text-ink hover:text-accent">+</button>
    </div>
  );
}

/** Ürün notu/ekstrası çipi: nötr → Olsun → Olmasın → nötr. */
function OptionChip({ name, state, onCycle }: { name: string; state: boolean | undefined; onCycle: () => void }) {
  const cls =
    state === true ? "border-positive/50 bg-positive/10 text-positive"
    : state === false ? "border-danger/40 bg-danger/5 text-danger line-through"
    : "border-line text-ink-700 hover:border-ink-500";
  return (
    <button type="button" onClick={onCycle}
      aria-label={`${name}: ${state === true ? "olsun" : state === false ? "olmasın" : "belirtilmedi"}. Değiştirmek için dokun`}
      className={`rounded-full border-2 px-3 py-1.5 text-[0.8rem] font-semibold transition-colors ${cls}`}>
      {state === true ? "+ " : state === false ? "✕ " : ""}{name}{state === true ? " olsun" : state === false ? " olmasın" : ""}
    </button>
  );
}

/** Sesli asistanın soru balonu (görsel akışta her adımın başında). */
function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white"><MicSvg size={15} /></span>
      <p className="rounded-[14px] rounded-tl-[3px] border-2 border-line bg-canvas px-3.5 py-2.5 text-[0.88rem] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export default function MenuCart({
  business, products, campaigns, user, currency, lang, embedded = false,
}: {
  business: {
    id: string;
    name: string;
    district: string;
    modes?: { gelAl?: boolean; rezerve?: boolean; paketServis?: boolean };
    acceptingOrders?: boolean;
    kdvRate?: number;
    openNow?: boolean;
    timeZone?: string;
    hours?: HourRow[];
  };
  products: MenuProduct[];
  campaigns: VoiceCampaign[];
  user: { name: string; phone?: string | null; address?: string | null } | null;
  currency: Currency;
  lang: Lang;
  /** Popup içinde: yapışkan ofsetler sayfa başlığına göre değil popup gövdesine göre. */
  embedded?: boolean;
}) {
  const toast = useToast();
  const pathname = usePathname();
  const loginHref = `/giris?next=${encodeURIComponent(pathname || "/")}`;
  const tz = business.timeZone ?? "Europe/Istanbul";
  const storeKey = `dv-cart:${business.id}`;

  const [lines, setLines] = useState<Line[]>([]);
  const [modal, setModal] = useState<{ p: MenuProduct; picks: Picks; qty: number } | null>(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("");
  const [sheet, setSheet] = useState(false); // mobil sepet çekmecesi
  const [step, setStep] = useState<Step>("cart");
  const [mode, setMode] = useState<VoiceMode | null>(null);
  const [payment, setPayment] = useState<VoicePayment | null>(null);
  const [form, setForm] = useState({ name: user?.name ?? "", phone: user?.phone ?? "", address: user?.address ?? "", reservedAt: "", note: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ orderId: string | null; breakdown: PriceBreakdown | null; mode: VoiceMode } | null>(null);
  const [openNow, setOpenNow] = useState<boolean>(business.openNow ?? true);
  const [loaded, setLoaded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const accepting = business.acceptingOrders !== false;

  // Çalışma saati: gel-al / paket servis kapanır; durum canlı yenilenir (sesli asistanla aynı kural).
  useEffect(() => {
    const hrs = business.hours;
    if (!hrs?.length) return;
    const tick = () => setOpenNow(isOpenNow(hrs, new Date(), tz));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [business.hours, tz]);

  const modes = useMemo(
    () => enabledModes({ businessName: business.name, district: business.district, products: [], campaigns: [], modes: business.modes, openNow }),
    [business.name, business.district, business.modes, openNow],
  );
  // Tek mod açıksa sorulmaz (sesli asistan gibi); seçili mod kapandıysa sıfırlanır.
  useEffect(() => {
    setMode((m) => (m && modes.includes(m) ? m : modes.length === 1 ? modes[0] : null));
  }, [modes]);

  // Sepet tarayıcıda saklanır (giriş yönlendirmesinden sonra da durur). Yalnız ürün kimliği/adet/not.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Line[];
        const valid = (Array.isArray(parsed) ? parsed : [])
          .filter((l) => l && byId.has(String(l.productId)) && Number.isFinite(l.qty))
          .map((l) => ({ key: lineKey(l.productId, l.picks ?? {}), productId: l.productId, qty: Math.max(1, Math.min(MAX_QTY, Math.round(l.qty))), picks: l.picks ?? {} }));
        if (valid.length) setLines(valid);
      }
    } catch { /* depolama yok/engelli: sepet yalnız bellekte */ }
    setLoaded(true);
  }, [storeKey, byId]);
  useEffect(() => {
    if (!loaded) return;
    try {
      if (lines.length) localStorage.setItem(storeKey, JSON.stringify(lines));
      else localStorage.removeItem(storeKey);
    } catch { /* yok say */ }
  }, [lines, loaded, storeKey]);

  const unit = useCallback(
    (p: MenuProduct) => modePrice({ name: p.name, priceCents: p.priceCents, discountPriceCents: p.discountPriceCents, deliveryPriceCents: p.deliveryPriceCents }, mode),
    [mode],
  );
  const price = (c: number) => money(c, currency, lang);

  const cartLines = useMemo(
    () => lines.map((l) => ({ line: l, p: byId.get(l.productId) as MenuProduct })).filter((x) => x.p),
    [lines, byId],
  );
  const count = cartLines.reduce((s, x) => s + x.line.qty, 0);
  const qtyOfProduct = (pid: string) => lines.filter((l) => l.productId === pid).reduce((s, l) => s + l.qty, 0);

  const breakdown = useMemo<PriceBreakdown | null>(() => {
    if (!cartLines.length) return null;
    const items = cartLines.map(({ line, p }) => ({ name: p.name, qty: line.qty, unitPriceCents: unit(p), kdvRate: p.kdvRate }));
    const camps = campaigns.map((c) => ({
      title: c.title, discountPercent: c.discountPercent, discountAmountCents: c.discountAmountCents, minBasketCents: c.minBasketCents,
      serviceMode: c.serviceMode, serviceModes: c.serviceModes, paymentScope: c.paymentScope, startsAt: c.startsAt, endsAt: c.endsAt,
    }));
    const best = bestCampaign(items, camps, mode, new Date(), payment);
    return computeTotals({ items, businessKdvRate: business.kdvRate ?? 20, campaign: best, mode, payment });
  }, [cartLines, campaigns, mode, payment, unit, business.kdvRate]);

  /* ----------------------------- sepet işlemleri ----------------------------- */

  function addLine(p: MenuProduct, qty: number, picks: Picks) {
    const key = lineKey(p.id, picks);
    setLines((prev) => {
      const hit = prev.find((l) => l.key === key);
      if (hit) return prev.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l));
      return [...prev, { key, productId: p.id, qty, picks }];
    });
    if (step === "done") setStep("cart");
    toast.push({ title: `${p.name} sepete eklendi`, tone: "positive" });
  }
  const setQty = (key: string, qty: number) =>
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty } : l))));
  const cyclePick = (opt: string) =>
    setModal((m) => {
      if (!m) return m;
      const cur = { ...m.picks };
      if (cur[opt] === undefined) cur[opt] = true;
      else if (cur[opt] === true) cur[opt] = false;
      else delete cur[opt];
      return { ...m, picks: cur };
    });

  /** Sesli asistanı (değiştirilmemiş bileşen) açar: panel kapalıysa sayfadaki düğmesine basar. */
  function openAssistant() {
    const panelOpen = document.querySelector('[aria-label="Konuşmaya başla"], [aria-label="Dinlemeyi durdur"]');
    if (!panelOpen) (document.querySelector('button[aria-label="Sesli asistanı aç"]') as HTMLButtonElement | null)?.click();
  }

  /* ---------------------------- akış (asistan modeli) ---------------------------- */

  const flow: Step[] = useMemo(
    () => ["cart", ...(modes.length > 1 ? (["delivery"] as Step[]) : []), "details", "payment", "confirm"],
    [modes.length],
  );
  const stepIdx = flow.indexOf(step);
  const go = (dir: 1 | -1) => setStep(flow[Math.max(0, Math.min(flow.length - 1, stepIdx + dir))]);

  function stepError(s: Step): string | null {
    if (s === "cart") {
      if (!cartLines.length) return "Sepet boş.";
      if (!accepting) return `${business.name} şu an sipariş almıyor.`;
      if (!modes.length) return "Şu an seçilebilir sipariş tipi yok.";
    }
    if (s === "delivery" && !mode) return "Teslimat tipini seç.";
    if (s === "details") {
      if (!mode) return "Teslimat tipini seç.";
      if (!form.name.trim()) return "Adını yaz.";
      if (form.phone.replace(/\D/g, "").length < 10) return "Geçerli bir telefon numarası yaz.";
      if (mode === "PAKET_SERVIS" && !form.address.trim()) return "Teslimat adresini yaz.";
      if (mode === "REZERVE") {
        if (!form.reservedAt) return "Rezerve saatini seç.";
        const iso = zonedHmToIso(form.reservedAt, tz);
        if (!iso) return "Rezerve saati geçersiz.";
        if (business.hours?.length && !withinHoursAt(business.hours, new Date(iso), tz)) return "Rezerve saati işletmenin çalışma saatleri içinde olmalı.";
      }
    }
    if (s === "payment" && !payment) return "Ödeme yöntemini seç.";
    return null;
  }
  function next() {
    const err = stepError(step);
    if (err) { toast.push({ title: err, tone: "warning" }); return; }
    go(1);
  }

  async function submit() {
    for (const s of flow) {
      const err = stepError(s);
      if (err) { setStep(s); toast.push({ title: err, tone: "warning" }); return; }
    }
    if (!user) { toast.push({ title: "Sipariş için giriş yapmalısın", desc: "Sepetin giriş sonrası da durur.", tone: "warning" }); return; }
    setSending(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: business.id,
          items: cartLines.map(({ line, p }) => ({
            name: p.name,
            qty: line.qty,
            unitPriceCents: unit(p),
            ...(Object.keys(line.picks).length ? { options: Object.entries(line.picks).map(([name, wanted]) => ({ name, wanted })) } : {}),
          })),
          paymentMethod: payment,
          deliveryType: mode,
          customerName: form.name.trim(),
          customerPhone: form.phone.trim(),
          customerDistrict: business.district,
          address: form.address.trim() || undefined,
          note: form.note.trim() || undefined,
          ...(mode === "REZERVE" ? { reservedAt: zonedHmToIso(form.reservedAt, tz) } : {}),
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }) as Record<string, unknown>);
      if (!json.ok) {
        if (json.needLogin) toast.push({ title: "Giriş gerekli", desc: "Giriş yapınca sepetin duruyor; tekrar gönderebilirsin.", tone: "warning" });
        else toast.push({ title: String(json.error ?? "Sipariş gönderilemedi"), tone: "danger" });
        return;
      }
      if (json.duplicate) { toast.push({ title: "Son siparişin zaten iletildi", desc: "Aynı telefonla çok kısa sürede sipariş gönderildi.", tone: "warning" }); return; }
      setDone({ orderId: json.orderId ? String(json.orderId) : null, breakdown: (json.breakdown as PriceBreakdown) ?? breakdown, mode: mode as VoiceMode });
      setLines([]);
      setStep("done");
    } catch {
      toast.push({ title: "Ağ hatası oluştu", desc: "Sipariş gönderilemedi; tekrar dene.", tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  function resetAfterDone() { setDone(null); setPayment(null); setStep("cart"); setSheet(false); }

  // Mobil çekmece: Esc ile kapanır, arka plan kaydırması kilitlenir.
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (step === "done") resetAfterDone(); else setSheet(false); } };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [modal]);

  /* --------------------------------- menü verisi --------------------------------- */

  const sections = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    const list = q ? products.filter((p) => `${p.name} ${p.description ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)) : products;
    const map = new Map<string, MenuProduct[]>();
    for (const p of list) {
      const k = p.category?.trim() || "Öne çıkanlar";
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return Array.from(map.entries());
  }, [products, query]);

  const statusNotice = !accepting
    ? `${business.name} şu an sipariş almıyor (yoğunluk). Menüyü inceleyebilirsin.`
    : !openNow && modes.length === 1 && modes[0] === "REZERVE"
      ? "İşletme şu an kapalı; gel-al ve adrese teslim kapalıdır. Çalışma saatleri içine rezerve sipariş verebilirsin."
      : !openNow && modes.length === 0
        ? "İşletme şu an kapalı ve rezerve de kabul etmiyor."
        : null;

  function scrollToCat(c: string) {
    setActiveCat(c);
    document.getElementById(`menu-cat-${encodeURIComponent(c)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ------------------------------- sağ panel (sepet/akış) ------------------------------- */

  const panel = (
    <div className="flex h-full min-h-0 flex-col">
      {step !== "done" ? (
        <ol className="flex items-center gap-1 border-b-2 border-line px-4 py-3" aria-label="Sipariş adımları">
          {flow.map((s, i) => (
            <li key={s} className={`flex items-center gap-1.5 ${s === step ? "shrink-0" : "flex-1"}`} aria-current={s === step ? "step" : undefined}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.64rem] font-bold ${i < stepIdx ? "bg-positive text-white" : s === step ? "bg-accent text-white" : "bg-line text-muted"}`}>
                {i < stepIdx ? "✓" : i + 1}
              </span>
              <span className={`truncate text-[0.68rem] font-semibold uppercase tracking-[0.06em] ${s === step ? "text-ink" : "hidden"}`}>{STEP_LABEL[s as Exclude<Step, "done">]}</span>
              {i < flow.length - 1 ? <span className="h-px flex-1 bg-line" /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* ---------------- Sepet ---------------- */}
        {step === "cart" ? (
          cartLines.length ? (
            <>
              <AssistantBubble>Sepetin hazır. Adetleri buradan değiştirebilir, menüden ürün ekleyebilirsin.</AssistantBubble>
              <ul className="divide-y divide-line-soft">
                {cartLines.map(({ line, p }) => (
                  <li key={line.key} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9rem] font-semibold leading-snug">{p.name}</p>
                      {Object.keys(line.picks).length ? (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(line.picks).map(([n, w]) => (
                            <span key={n} className={`rounded-full border px-1.5 py-0.5 text-[0.66rem] ${w ? "border-positive/40 text-positive" : "border-line text-muted line-through"}`}>{n}{w ? "" : " ✕"}</span>
                          ))}
                        </p>
                      ) : null}
                      <p className="tabular mt-1 text-[0.76rem] text-muted">{price(unit(p))}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Stepper qty={line.qty} onChange={(n) => setQty(line.key, n)} label={p.name} />
                      <p className="tabular text-[0.86rem] font-semibold">{price(unit(p) * line.qty)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-muted"><CartSvg size={26} /></span>
              <p className="mt-3 font-display text-[1rem] font-bold">Sepetin boş</p>
              <p className="mt-1 max-w-[26ch] text-[0.82rem] text-muted">Menüden ürün seç ya da sesli asistana söyle.</p>
            </div>
          )
        ) : null}

        {/* ---------------- Teslimat ---------------- */}
        {step === "delivery" ? (
          <>
            <AssistantBubble>Siparişini nasıl teslim almak istersin?</AssistantBubble>
            <div className="grid gap-2" role="radiogroup" aria-label="Teslimat tipi">
              {modes.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={`flex items-center gap-3 rounded-[10px] border-2 px-3.5 py-3 text-left transition-colors ${mode === m ? "border-accent bg-accent/5" : "border-line hover:border-ink-500"}`}>
                  <span className="text-[1.4rem]" aria-hidden>{MODE_ICON[m]}</span>
                  <span>
                    <span className="block text-[0.92rem] font-semibold">{SHORT_MODE[m]}</span>
                    <span className="block text-[0.76rem] text-muted">{MODE_HINT[m]}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[0.74rem] text-muted">Adrese teslim fiyatı işletme içi fiyattan farklı olabilir; seçince sepet güncellenir.</p>
          </>
        ) : null}

        {/* ---------------- Bilgiler ---------------- */}
        {step === "details" ? (
          <div className="space-y-3.5">
            <AssistantBubble>
              {mode === "PAKET_SERVIS" ? "Teslimat için adını, telefonunu ve adresini yazar mısın?"
                : mode === "REZERVE" ? "Rezervasyon için adını, telefonunu ve geleceğin saati yazar mısın?"
                : "Siparişi hazırlarken seni arayabilmemiz için adını ve telefonunu yazar mısın?"}
            </AssistantBubble>
            {!user ? (
              <Notice tone="warning" title="Giriş gerekli">
                Sipariş göndermek için giriş yapmalısın; sepetin burada durur.
                <a href={loginHref} className="mt-2 block"><Button size="sm" className="w-full">Giriş yap / kayıt ol</Button></a>
              </Notice>
            ) : null}
            <label className="block text-[0.78rem] font-semibold">Ad soyad
              <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            </label>
            <label className="block text-[0.78rem] font-semibold">Telefon
              <Input className="mt-1" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="05xx xxx xx xx" />
            </label>
            {mode === "PAKET_SERVIS" ? (
              <label className="block text-[0.78rem] font-semibold">Teslimat adresi
                <Input className="mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} autoComplete="street-address" placeholder="Mahalle, sokak, bina, daire" />
              </label>
            ) : null}
            {mode === "REZERVE" ? (
              <label className="block text-[0.78rem] font-semibold">Rezerve saati (işletme saatiyle)
                <Input className="mt-1" type="time" value={form.reservedAt} onChange={(e) => setForm({ ...form, reservedAt: e.target.value })} />
              </label>
            ) : null}
            <label className="block text-[0.78rem] font-semibold">Sipariş notu <span className="font-normal text-muted">(isteğe bağlı)</span>
              <Input className="mt-1" value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Örn. zili çalmayın" />
            </label>
          </div>
        ) : null}

        {/* ---------------- Ödeme ---------------- */}
        {step === "payment" ? (
          <>
            <AssistantBubble>Ödemeyi {mode === "PAKET_SERVIS" ? "kapıda" : "iş yerinde"} nasıl yapacaksın? Nakit ya da kart.</AssistantBubble>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Ödeme yöntemi">
              {([["CASH_DOOR", "Nakit", "💵"], ["CARD_DOOR", "Kart", "💳"]] as Array<[VoicePayment, string, string]>).map(([k, l, ic]) => (
                <button key={k} type="button" role="radio" aria-checked={payment === k} onClick={() => setPayment(k)}
                  className={`rounded-[10px] border-2 px-3 py-4 text-center transition-colors ${payment === k ? "border-accent bg-accent/5" : "border-line hover:border-ink-500"}`}>
                  <span className="block text-[1.5rem]" aria-hidden>{ic}</span>
                  <span className="mt-1 block text-[0.9rem] font-semibold">{l}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[0.76rem] leading-relaxed text-muted">Ödeme siparişi teslim alırken işletmeye yapılır; çevrimiçi ödeme alınmaz. Nakite/karta özel kampanyalar seçime göre özete yansır.</p>
          </>
        ) : null}

        {/* ---------------- Onay ---------------- */}
        {step === "confirm" ? (
          <>
            <AssistantBubble>Siparişini özetledim. Her şey doğruysa “Siparişi gönder” de.</AssistantBubble>
            <div className="rounded-[10px] border-2 border-line p-3 text-[0.84rem]">
              <p className="font-semibold">{mode ? SHORT_MODE[mode] : ""} · {payment === "CARD_DOOR" ? "Kart" : "Nakit"}</p>
              <p className="mt-0.5 text-muted">{form.name} · {form.phone}</p>
              {mode === "PAKET_SERVIS" ? <p className="text-muted">{form.address}</p> : null}
              {mode === "REZERVE" ? <p className="text-muted">Saat: {form.reservedAt}</p> : null}
              {form.note ? <p className="text-muted">Not: {form.note}</p> : null}
            </div>
            <ul className="mt-3 space-y-1 text-[0.84rem]">
              {cartLines.map(({ line, p }) => (
                <li key={line.key} className="flex justify-between gap-3">
                  <span>{line.qty} × {p.name}{Object.keys(line.picks).length ? <span className="text-muted"> ({Object.entries(line.picks).map(([n, w]) => `${n} ${w ? "olsun" : "olmasın"}`).join(", ")})</span> : null}</span>
                  <span className="tabular shrink-0">{price(unit(p) * line.qty)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {/* ---------------- Tamam ---------------- */}
        {step === "done" && done ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-positive text-white"><Icon.check size={24} /></span>
              <div>
                <p className="font-display text-[1.05rem] font-bold leading-snug">Siparişin {business.name} işletmesine iletildi</p>
                {done.orderId ? <p className="tabular text-[0.76rem] text-muted">Sipariş no: {done.orderId.slice(0, 8).toUpperCase()}</p> : null}
              </div>
            </div>
            <AssistantBubble>
              {done.mode === "PAKET_SERVIS" ? "İşletme onaylayınca hazırlanıp adresine yollanır; ödemeyi kapıda yaparsın."
                : done.mode === "REZERVE" ? "Belirttiğin saatte gelip alırsın; ödemeyi iş yerinde yaparsın."
                : "Hazır olunca gelip alırsın; ödemeyi iş yerinde yaparsın."} Siparişiniz alınmıştır. İyi günler dileriz.
            </AssistantBubble>
            {done.breakdown ? (
              <div className="rounded-[10px] border-2 border-line p-3">
                <ul className="space-y-1 text-[0.84rem]">
                  {breakdownLines(done.breakdown).map((r, i) => (
                    <li key={i} className={`flex justify-between ${r.tone === "discount" ? "text-positive" : ""}`}><span>{r.label}</span><span className="tabular">{r.value}</span></li>
                  ))}
                </ul>
                <p className="tabular mt-2 flex justify-between border-t border-line-soft pt-2 text-[1rem] font-bold"><span>Ödenecek</span><span>{price(done.breakdown.totalCents)}</span></p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ---- alt çubuk: döküm + eylem ---- */}
      <div className="border-t-2 border-line bg-surface px-4 py-3.5">
        {step !== "done" && breakdown ? (
          <div className="mb-3">
            <ul className="space-y-0.5 text-[0.78rem] text-muted">
              {breakdownLines(breakdown).map((r, i) => (
                <li key={i} className={`flex justify-between ${r.tone === "discount" ? "text-positive" : ""}`}><span>{r.label}</span><span className="tabular">{r.value}</span></li>
              ))}
            </ul>
            <p className="tabular mt-1.5 flex justify-between text-[1.05rem] font-bold"><span>Ödenecek</span><span>{price(breakdown.totalCents)}</span></p>
            <p className="text-[0.68rem] text-muted">Tutar sipariş anında sunucuda yeniden doğrulanır.</p>
          </div>
        ) : null}
        {step === "done" ? (
          <Button className="w-full" onClick={resetAfterDone}>Menüye dön</Button>
        ) : step === "confirm" ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="ghost" onClick={() => go(-1)}>Geri</Button>
            {user ? <Button loading={sending} disabled={sending} onClick={() => void submit()}>Siparişi gönder</Button>
              : <a href={loginHref}><Button className="w-full">Giriş yap ve gönder</Button></a>}
          </div>
        ) : (
          <div className={stepIdx > 0 ? "grid grid-cols-[auto_1fr] gap-2" : ""}>
            {stepIdx > 0 ? <Button variant="ghost" onClick={() => go(-1)}>Geri</Button> : null}
            <Button className="w-full" disabled={step === "cart" && (!cartLines.length || !accepting)} onClick={next} iconRight={<Icon.arrowRight size={15} />}>
              {step === "cart" ? "Siparişi tamamla" : "Devam et"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  /* ----------------------------------- UI ----------------------------------- */

  return (
    <div id="menu" className="scroll-mt-28">
      {/* ---------------------------- Sesle sipariş paneli ---------------------------- */}
      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-[10px] bg-ink p-4 text-white sm:p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white"><MicSvg size={22} /></span>
        <div className="min-w-[220px] flex-1">
          <p className="font-display text-[1.05rem] font-bold leading-snug">Sesle sipariş ver</p>
          <p className="mt-1 text-[0.84rem] leading-relaxed text-white/75">
            Sesli asistan menüyü okur, söylediğin ürünleri ekler ve siparişi seninle tamamlar. Aynı adımları aşağıda görsel olarak da izleyebilirsin.
          </p>
        </div>
        <Button variant="secondary" onClick={openAssistant} icon={<MicSvg size={16} />}>Sesli asistanı aç</Button>
      </div>

      {statusNotice ? <Notice tone="warning" className="mb-4">{statusNotice}</Notice> : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px] md:items-start">
        {/* =============================== MENÜ =============================== */}
        <div className="min-w-0">
          {/* arama + kategori çubuğu (yapışkan) */}
          <div className={`sticky ${embedded ? "top-0" : "top-16"} z-20 -mx-1 mb-4 border-b border-line bg-canvas/95 px-1 pb-3 pt-1 backdrop-blur`}>
            <div className="relative">
              <Icon.search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Menüde ara" aria-label="Menüde ara" />
            </div>
            {sections.length > 1 ? (
              <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5" role="tablist" aria-label="Menü kategorileri">
                {sections.map(([c, items]) => (
                  <button key={c} role="tab" aria-selected={activeCat === c} onClick={() => scrollToCat(c)}
                    className={`shrink-0 rounded-full border-2 px-3.5 py-1.5 text-[0.8rem] font-semibold ${activeCat === c ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-700 hover:border-ink-500"}`}>
                    {c} <span className="tabular opacity-60">{items.length}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {sections.length === 0 ? <Notice tone="neutral">“{query}” için sonuç yok.</Notice> : null}

          {sections.map(([cat, items]) => (
            <section key={cat} id={`menu-cat-${encodeURIComponent(cat)}`} className="mb-7 scroll-mt-44">
              <h3 className="mb-3 font-display text-[1.15rem] font-extrabold tracking-[-0.01em]">{cat}</h3>
              <ul className="grid gap-3">
                {items.map((p) => {
                  const base = p.discountPriceCents ?? p.priceCents;
                  const diff = p.deliveryPriceCents != null && p.deliveryPriceCents !== base;
                  const inCart = qtyOfProduct(p.id);
                  const quick = !p.options.length;
                  return (
                    <li key={p.id} className="group relative flex overflow-hidden rounded-[10px] border-2 border-line bg-surface transition-colors hover:border-ink-500">
                      <button type="button" onClick={() => setModal({ p, picks: {}, qty: 1 })} aria-label={`${p.name} ayrıntıları`}
                        className="flex min-w-0 flex-1 flex-col gap-1 p-3.5 text-left">
                        <span className="font-display text-[0.98rem] font-bold leading-snug">{p.name}</span>
                        {p.description ? <span className="line-clamp-2 text-[0.8rem] leading-relaxed text-muted">{p.description}</span> : null}
                        <span className="mt-auto pt-2">
                          <span className="tabular text-[1rem] font-bold text-accent">
                            {p.discountPriceCents ? <span className="mr-1.5 text-[0.8rem] font-normal text-muted line-through">{price(p.priceCents)}</span> : null}
                            {price(base)}
                          </span>
                          {diff ? <span className="tabular block text-[0.72rem] text-muted">Adrese teslim {price(p.deliveryPriceCents as number)}</span> : null}
                          {p.options.length ? <span className="mt-0.5 block text-[0.7rem] font-semibold text-ink-700">Not / ekstra eklenebilir</span> : null}
                        </span>
                      </button>
                      <div className="relative w-[112px] shrink-0 sm:w-[124px]">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-canvas text-[2rem]" aria-hidden>🍽️</div>
                        )}
                        {inCart ? (
                          <span className="tabular absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[0.68rem] font-bold text-white">{inCart}</span>
                        ) : null}
                        <button type="button" aria-label={quick ? `${p.name} sepete ekle` : `${p.name} seçeneklerini aç`}
                          onClick={() => (quick ? addLine(p, 1, {}) : setModal({ p, picks: {}, qty: 1 }))}
                          className="absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-[1.3rem] font-bold leading-none text-accent shadow-md ring-1 ring-line transition-transform hover:scale-105">+</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <p className="text-[0.78rem] leading-relaxed text-muted">
            Ödeme kapıda/iş yerinde müşteri ile işletme arasında yapılır; DampingVar ödeme almaz. Tutar KDV ve geçerli kampanya indirimiyle sipariş özetinde gösterilir.
          </p>
        </div>

        {/* ===================== SEPET / AKIŞ (masaüstü, yapışkan) ===================== */}
        <aside className={`hidden md:sticky md:block md:self-start ${embedded ? "md:top-2" : "md:top-20"}`} aria-label="Sipariş sepeti">
          <div className={`flex ${embedded ? "max-h-[calc(100vh-9rem)]" : "max-h-[calc(100vh-7rem)]"} flex-col overflow-hidden rounded-[10px] border-2 border-line bg-surface shadow-sm`}>
            <div className="flex items-center justify-between border-b-2 border-line px-4 py-3">
              <p className="flex items-center gap-2 font-display text-[1rem] font-bold"><CartSvg size={17} /> Siparişim</p>
              {count ? <span className="tabular rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-bold text-white">{count}</span> : null}
            </div>
            {panel}
          </div>
        </aside>
      </div>

      {/* ============================ MOBİL: sepet çubuğu + çekmece ============================ */}
      {(count > 0 || step === "done") && !sheet ? (
        <div className="fixed inset-x-4 bottom-[5.25rem] z-40 md:hidden">
          <button type="button" onClick={() => setSheet(true)}
            className="flex w-full items-center justify-between gap-3 rounded-full bg-accent px-5 py-3 text-left text-white shadow-xl">
            <span className="flex items-center gap-2.5"><CartSvg size={20} /><span className="text-[0.9rem] font-bold">{step === "done" ? "Sipariş özeti" : `Sepetim · ${count} ürün`}</span></span>
            <span className="tabular text-[0.95rem] font-bold">{step !== "done" && breakdown ? `${price(breakdown.totalCents)} →` : ""}</span>
          </button>
        </div>
      ) : null}
      {sheet ? (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Sipariş sepeti">
          <button type="button" aria-label="Sepeti kapat" onClick={() => (step === "done" ? resetAfterDone() : setSheet(false))} className="absolute inset-0 bg-ink/60" />
          <div ref={sheetRef} tabIndex={-1} className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col overflow-hidden rounded-t-[16px] bg-surface shadow-2xl outline-none">
            <div className="flex items-center justify-between border-b-2 border-line px-4 py-3">
              <p className="flex items-center gap-2 font-display text-[1.05rem] font-bold"><CartSvg size={18} /> {step === "done" ? "Sipariş alındı" : "Siparişim"}</p>
              <button type="button" aria-label="Sepeti kapat" onClick={() => (step === "done" ? resetAfterDone() : setSheet(false))} className="rounded-[3px] px-2 py-1 text-muted hover:text-ink">✕</button>
            </div>
            <div className="min-h-0 flex-1">{panel}</div>
          </div>
        </div>
      ) : null}

      {/* ================================ ÜRÜN PENCERESİ ================================ */}
      {modal ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={modal.p.name}>
          <button type="button" aria-label="Kapat" onClick={() => setModal(null)} className="absolute inset-0 bg-ink/60" />
          <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[16px] bg-surface shadow-2xl sm:max-w-[460px] sm:rounded-[14px]">
            <button type="button" aria-label="Kapat" onClick={() => setModal(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-ink shadow ring-1 ring-line">✕</button>
            {modal.p.imageUrl ? <img src={modal.p.imageUrl} alt={modal.p.name} className="aspect-[16/9] w-full object-cover" /> : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <p className="pr-8 font-display text-[1.25rem] font-extrabold leading-snug">{modal.p.name}</p>
              {modal.p.description ? <p className="mt-1.5 text-[0.88rem] leading-relaxed text-muted">{modal.p.description}</p> : null}
              {(() => {
                const base = modal.p.discountPriceCents ?? modal.p.priceCents;
                const diff = modal.p.deliveryPriceCents != null && modal.p.deliveryPriceCents !== base;
                return (
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                    <p className="tabular"><span className="block text-[0.7rem] uppercase tracking-[0.1em] text-muted">{diff ? "İşletme içi" : "Fiyat"}</span><span className="text-[1.1rem] font-bold text-accent">{price(base)}</span></p>
                    {diff ? <p className="tabular"><span className="block text-[0.7rem] uppercase tracking-[0.1em] text-muted">Adrese teslim</span><span className="text-[1.1rem] font-bold">{price(modal.p.deliveryPriceCents as number)}</span></p> : null}
                  </div>
                );
              })()}
              {modal.p.options.length ? (
                <div className="mt-5">
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">Not / ekstra</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {modal.p.options.map((o) => <OptionChip key={o} name={o} state={modal.picks[o]} onCycle={() => cyclePick(o)} />)}
                  </div>
                  <p className="mt-2 text-[0.72rem] text-muted">Dokun: olsun → olmasın → belirtme. Seçimler siparişle işletmeye iletilir.</p>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3 border-t-2 border-line p-4">
              <Stepper qty={modal.qty} min={1} label={modal.p.name} onChange={(n) => setModal((m) => (m ? { ...m, qty: n } : m))} />
              <Button className="flex-1" onClick={() => { addLine(modal.p, modal.qty, modal.picks); setModal(null); }}>
                Sepete ekle · {price((modal.p.discountPriceCents ?? modal.p.priceCents) * modal.qty)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
