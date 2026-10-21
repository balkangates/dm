"use client";

/**
 * FAZ 12A/12C — Ücretsiz Sesli Asistan (müşteri widget'ı).
 *
 * Konuşma tanıma ve seslendirme TARAYICININ YEREL Web Speech API'siyledir;
 * hiçbir dış API anahtarı kullanılmaz. Motor lib/voice.ts'tedir (yerel,
 * deterministik). Ses desteklenmiyorsa metin girişiyle aynı akış çalışır.
 *
 * FAZ 12C:
 *   * Sipariş için GİRİŞ ZORUNLU (suistimal önlemi) — oturumsuz müşteriye
 *     giriş butonu gösterilir.
 *   * İşletmenin açık sipariş modları (gel-al / rezerve / paket servis)
 *     yalnız onları sunar; tek mod açıksa sorulmaz.
 *   * Sipariş özeti dökümlü: matrah − kampanya indirimi + KDV = ödenecek.
 *   * Ürün notları/ekstraları ("turşu olmasın" gibi) kaleme eklenir.
 *
 * Sipariş yalnızca işletmeye iletilir; ödeme kapıda/iş yerinde nakit veya
 * kartla MÜŞTERİ ile İŞLETME arasında yapılır. DampingVar ödeme almaz.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, Input, useToast } from "@/components/ds";
import {
  applyConfirm, applyDetails, applyMode, applyPayment, announceCampaign, cartBreakdown, enabledModes, handleVoice,
  initialVoiceState, MODE_LABELS, modePrice, paymentScopeHint,
  type VoiceCampaign, type VoiceCtx, type VoiceMode, type VoicePayment, type VoiceProduct, type VoiceState, type VoiceUi,
} from "@/lib/voice";
import { breakdownLines } from "@/lib/order-price";

type Msg = { who: "ai" | "me"; text: string };

/** FAZ 12C-2 — çiplerde yan yana görünen kısa mod etiketleri. */
const SHORT_MODE: Record<VoiceMode, string> = {
  GEL_AL: "Gel-al",
  PAKET_SERVIS: "Adrese teslim",
  REZERVE: "Rezerve",
};

/** FAZ 12C-3 — "HH:MM" → bugünün (geçtiyse yarının) tarihiyle ISO an.
 *  Sunucu 30 gün + geçmiş kontrolü yapar; burada yalnız yerel ISO üretilir. */
function reservedIso(hm: string): string | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return undefined;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() < Date.now() - 5 * 60_000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

type Rec = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type Win = {
  SpeechRecognition?: new () => Rec;
  webkitSpeechRecognition?: new () => Rec;
  speechSynthesis?: SpeechSynthesis;
};

const MicSvg = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
    <line x1="12" y1="18" x2="12" y2="22" />
  </svg>
);

export default function VoiceAssistant({
  business, products, campaigns, user,
}: {
  business: {
    id: string;
    name: string;
    district: string;
    /** FAZ 12C — işletmenin açık sipariş modları (yoksa hepsi açık). */
    modes?: { gelAl?: boolean; rezerve?: boolean; paketServis?: boolean };
    /** FAZ 12C — "sipariş alıyorum" anahtarı. */
    acceptingOrders?: boolean;
    /** FAZ 12C — işletme varsayılan KDV oranı (%). */
    kdvRate?: number;
  };
  products: VoiceProduct[];
  campaigns: VoiceCampaign[];
  user: { name: string; phone?: string | null; address?: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  // FAZ 12C-3 — oturumdaki cep + adres sipariş formuna OTOMATİK gelir.
  const [vState, setVState] = useState<VoiceState>(() => ({
    ...initialVoiceState(),
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    address: user?.address ?? "",
  }));
  const [ui, setUi] = useState<VoiceUi>("menu");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState("");
  const [recSupported, setRecSupported] = useState(false);
  const [sending, setSending] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [lastBreakdown, setLastBreakdown] = useState<ReturnType<typeof cartBreakdown> | null>(null);
  const [campaignViews, setCampaignViews] = useState<Array<{ title: string; discountLabel: string; campaign?: VoiceCampaign }>>([]);
  /** FAZ 12C-2 — ürün listesindeki satır bazlı adet seçici (manuel sipariş). */
  const [qtyPick, setQtyPick] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    address: user?.address ?? "",
    reservedAt: "", // FAZ 12C-3 — REZERVE'de zorunlu saat alanı
  });
  const toast = useToast();
  const pathname = usePathname();
  const loginHref = `/giris?next=${encodeURIComponent(pathname || "/")}`;

  const ctx = useMemo<VoiceCtx>(
    () => ({
      businessName: business.name,
      district: business.district,
      products,
      campaigns,
      modes: business.modes,
      acceptingOrders: business.acceptingOrders,
      businessKdvRate: business.kdvRate,
    }),
    [business, products, campaigns],
  );
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const vStateRef = useRef(vState);
  vStateRef.current = vState;
  const recRef = useRef<Rec | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  const modeList = enabledModes(ctx);

  useEffect(() => {
    const w = window as unknown as Win;
    setRecSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs, ui]);

  const speak = useCallback((text: string) => {
    const synth = (window as unknown as Win).speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "tr-TR";
    synth.speak(u);
  }, []);

  const push = useCallback((who: Msg["who"], text: string) => {
    setMsgs((p) => [...p.slice(-40), { who, text }]);
  }, []);

  const run = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      push("me", clean);
      const step = handleVoice(clean, vStateRef.current, ctxRef.current);
      setVState(step.state);
      vStateRef.current = step.state;
      setUi(step.ui);
      if (step.campaigns) setCampaignViews(step.campaigns);
      setLastBreakdown(step.state.cart.length ? cartBreakdown(step.state, ctxRef.current) : null);
      push("ai", step.say);
      speak(step.say);
    },
    [push, speak],
  );

  /* ---------------- FAZ 12C-2 — manuel sipariş fonksiyonları (ses zorunlu değil) ---------------- */

  /** Mod butonu/çipi: mod uygulanır ve ÜRÜN LİSTESİ açılır. */
  function chooseMode(m: VoiceMode) {
    const base = applyMode(vStateRef.current, m, ctxRef.current);
    const next: VoiceState = { ...base, stage: "ordering" };
    setVState(next);
    vStateRef.current = next;
    setLastBreakdown(next.cart.length ? cartBreakdown(next, ctxRef.current) : null);
    setUi("products");
    const say = next.cart.length
      ? `Tamam, siparişin ${MODE_LABELS[m].toLocaleLowerCase("tr-TR")} olarak güncellendi; fiyatlar yenilendi.`
      : `Tamam, ${MODE_LABELS[m].toLocaleLowerCase("tr-TR")} menüsü açıldı. Listeden adet seçip Sepete ekle ile sipariş listene ekleyebilirsin.`;
    push("ai", say);
    speak(say);
  }

  /** Ürün satırındaki adetle sepete ekle (aynı isimsiz satır birleşir). */
  function addToCart(p: VoiceProduct, qty: number) {
    const cur = vStateRef.current;
    const mode = cur.mode ?? (modeList.length === 1 ? modeList[0] : null);
    if (!mode) {
      setUi("delivery");
      toast.push({ title: "Önce sipariş tipi seç", desc: "Gel-al, adrese teslim veya rezerve — listede fiyatlar ona göre görünür.", tone: "warning" });
      return;
    }
    const unit = modePrice(p, mode);
    const cart = [...cur.cart];
    const ex = cart.find((l) => l.name === p.name && !l.options?.length);
    if (ex) ex.qty += qty;
    else cart.push({ name: p.name, qty, unitPriceCents: unit });
    const next: VoiceState = { ...cur, mode, cart, stage: "ordering" };
    setVState(next);
    vStateRef.current = next;
    setLastBreakdown(cartBreakdown(next, ctxRef.current));
    setQtyPick((q) => ({ ...q, [p.name]: 1 }));
    toast.push({ title: `${qty} × ${p.name} sepete eklendi`, desc: "Sepeti görüp ödeme seçebilirsin.", tone: "positive" });
  }

  function removeFromCart(idx: number) {
    const cur = vStateRef.current;
    const cart = cur.cart.filter((_, i) => i !== idx);
    const next: VoiceState = { ...cur, cart };
    setVState(next);
    vStateRef.current = next;
    setLastBreakdown(cart.length ? cartBreakdown(next, ctxRef.current) : null);
    toast.push({ title: "Sepetten çıkarıldı", tone: "neutral" });
  }

  /** Sepetteki ödeme seçimi (manuel). FAZ 12C-3: nakite/karta özel kampanya
   *  farkı da söylenir — seçilen yöntemde indirim varsa/düşerse müşteri bilir. */
  function pickPayment(m: VoicePayment) {
    const before = cartBreakdown(vStateRef.current, ctxRef.current).discountCents;
    const next = applyPayment(vStateRef.current, m);
    setVState(next);
    vStateRef.current = next;
    const b = cartBreakdown(next, ctxRef.current);
    setLastBreakdown(b);
    setUi("cart");
    let say = `${m === "CARD_DOOR" ? "Kart" : "Nakit"} ödeme seçildi (${yer}).`;
    if (b.discountCents > before) say += " Kampanya indirimi uygulandı.";
    else if (before > b.discountCents) say += " Seçtiğin ödeme yöntemi bu kampanyanın kapsamı dışında — indirim düştü.";
    say += ' Sepeti kontrol edip "Sipariş ver" ile gönderebilirsin.';
    push("ai", say);
    speak(say);
  }

  /** Sepetteki "Sipariş ver": eksik bilgi → form; ödeme yok → uyar; doluysa gönder. */
  function manualSend() {
    const s = vStateRef.current;
    if (!s.cart.length) {
      toast.push({ title: "Sepet boş", desc: "Menüden ürün ekleyip tekrar dene.", tone: "warning" });
      return;
    }
    // FAZ 12C-3 — REZERVE'de saat zorunlu (masa planı).
    if (!s.name || !s.phone || (s.mode === "PAKET_SERVIS" && !s.address) || (s.mode === "REZERVE" && !s.reservedAt)) {
      setForm({
        name: s.name || form.name,
        phone: s.phone || form.phone,
        address: s.address || form.address,
        reservedAt: s.reservedAt ?? "",
      });
      setUi("details");
      const missing = s.mode === "REZERVE" && !s.reservedAt ? " rezerve saat" : "";
      const say = `Önce teslimat bilgilerini doldur — ad, telefon${s.mode === "PAKET_SERVIS" ? " ve adres" : ""}${missing}.`;
      push("ai", say);
      speak(say);
      return;
    }
    if (!s.payment) {
      toast.push({ title: "Ödeme yöntemini seç", desc: "Nakit veya kart seçtikten sonra siparişi gönderebilirsin.", tone: "warning" });
      return;
    }
    void submit();
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !greetedRef.current) {
      greetedRef.current = true;
      const modeWords = modeList.map((m) => MODE_LABELS[m].toLocaleLowerCase("tr-TR")).join(" / ");
      const say = business.acceptingOrders === false
        ? `Merhaba! Ben ${business.name} ücretsiz sesli asistanıyım. Şu an sipariş almıyoruz; kampanyalarımı sorabilir, menüye bakabilirsin.`
        : `Merhaba! Ben ${business.name} ücretsiz sesli asistanıyım. Kampanyalarımı sorabilir, menüye bakabilir veya sipariş verebilirsin — ${modeWords}. Ödemeyi nakit veya kartla yaparsın.`;
      push("ai", say);
      speak(say);
      if (!user) {
        push("ai", "Sipariş verebilmek için giriş yapman yeterli — güvensizliği önler, siparişlerini takip edebilirsin.");
      }
    }
  }

  function toggleMic() {
    const w = window as unknown as Win;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.push({ title: "Bu tarayıcı sesli girişi desteklemiyor", desc: "Aşağıdaki kutuya yazarak aynı akışı kullanabilirsin.", tone: "warning" });
      return;
    }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "tr-TR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript ?? "";
      if (t) run(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      toast.push({ title: "Ses alınamadı", desc: "Mikrofon iznini kontrol edip tekrar dene; yazarak da devam edebilirsin.", tone: "danger" });
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function submit() {
    const s = vStateRef.current;
    if (!s.cart.length || !s.name || !s.phone || !s.mode) {
      toast.push({ title: "Sipariş tipi, sepet veya iletişim bilgisi eksik", tone: "warning" });
      return;
    }
    // FAZ 12C-3 — REZERVE'de saat zorunlu (masa planı): gitmeden tekrar form.
    if (s.mode === "REZERVE" && !s.reservedAt) {
      setForm({ name: s.name, phone: s.phone, address: s.address, reservedAt: "" });
      setUi("details");
      toast.push({ title: "Rezerve saat zorunlu", desc: "İşletme masa planını saate göre yapar — saati gir.", tone: "warning" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: business.id,
          items: s.cart.map((l) => ({
            name: l.name,
            qty: l.qty,
            unitPriceCents: l.unitPriceCents,
            ...(l.options?.length ? { options: l.options } : {}),
          })),
          paymentMethod: s.payment ?? "CASH_DOOR",
          deliveryType: s.mode,
          customerName: s.name,
          customerPhone: s.phone,
          customerDistrict: business.district,
          address: s.address,
          // FAZ 12C-3 — rezervasyon saati (REZERVE'de zorunlu; sunucu da doğrular).
          ...(s.mode === "REZERVE" && s.reservedAt ? { reservedAt: reservedIso(s.reservedAt) } : {}),
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }) as Record<string, unknown>);
      if (!json.ok) {
        setSending(false);
        if (json.needLogin) {
          const m = "Sipariş verebilmek için giriş yapman gerekiyor. Giriş yapınca sepetin duruyor; tekrar gönderebilirsin.";
          push("ai", m);
          speak(m);
          toast.push({ title: "Giriş gerekli", desc: "Sipariş için giriş yapmalısın.", tone: "warning" });
          return;
        }
        const errText = String(json.error ?? "Sipariş gönderilemedi");
        push("ai", errText);
        toast.push({ title: errText, tone: "danger" });
        return;
      }
      if (json.duplicate) {
        setSending(false);
        const m = "Bu telefonla çok kısa sürede sipariş gönderildi; işletme zaten aldı. Yine de gerekirse birkaç dakika sonra tekrar dene.";
        push("ai", m);
        toast.push({ title: "Son siparişin zaten iletildi", tone: "warning" });
        return;
      }
      setOrderId(json.orderId ? String(json.orderId) : null);
      if (json.breakdown && typeof json.breakdown === "object") setLastBreakdown(json.breakdown as ReturnType<typeof cartBreakdown>);
      setVState(applyConfirm(s));
      vStateRef.current = applyConfirm(s);
      setUi("done");
      const say =
        s.mode === "PAKET_SERVIS"
          ? `Siparişin ${business.name} işletmesine iletildi! İşletme onaylayınca hazırlanacak ve adresine yollanacak; ödemeyi kapıda yapacaksın. Siparişiniz alınmıştır. İyi günler dileriz.`
          : s.mode === "REZERVE"
            ? `Rezerve siparişin ${business.name} işletmesine iletildi! Belirttiğin zamanda gelip alacaksın; ödemeyi iş yerinde yapacaksın. Siparişiniz alınmıştır. İyi günler dileriz.`
            : `Siparişin ${business.name} işletmesine iletildi! Hazır olunca gelip alırsın; ödemeyi iş yerinde yapacaksın. Siparişiniz alınmıştır. İyi günler dileriz.`;
      push("ai", say);
      speak(say);
    } catch {
      toast.push({ title: "Ağ hatası oluştu", desc: "Sipariş gönderilemedi; tekrar dene.", tone: "danger" });
    }
    setSending(false);
  }

  const bd = vState.cart.length ? (lastBreakdown ?? cartBreakdown(vState, ctx)) : null;
  const yer = vState.mode === "PAKET_SERVIS" ? "kapıda" : "iş yerinde";
  // FAZ 12C-3 — ödeme henüz seçili değilse "nakite/karta özel indirim" ipucu.
  const payHint = paymentScopeHint(vState, ctx);
  const loginBtn = (
    <a href={loginHref}>
      <Button size="sm" variant="primary" className="w-full">Giriş yap / kayıt ol</Button>
    </a>
  );

  return (
    <>
      {/* Sabit buton */}
      <button
        onClick={toggleOpen}
        aria-label="Sesli asistanı aç"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-accent/30 bg-ink px-4 py-3 text-white shadow-lg transition-transform hover:-translate-y-0.5"
      >
        <MicSvg size={18} />
        <span className="text-[0.85rem] font-semibold">Sesli Asistan</span>
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-50 flex max-h-[74vh] w-[min(92vw,390px)] flex-col overflow-hidden rounded-[6px] border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="font-display text-[0.98rem] font-bold">{business.name} · Sesli Asistan</p>
              <p className="text-[0.72rem] text-muted">{recSupported ? "Mikrofonla konuş veya yaz" : "Sesli giriş desteklenmiyor — yazarak devam et"}</p>
            </div>
            <button onClick={toggleOpen} aria-label="Kapat" className="rounded-[3px] px-2 py-1 text-muted hover:text-ink">✕</button>
          </div>

          <div ref={logRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[88%] rounded-[4px] px-3 py-2 text-[0.84rem] leading-relaxed ${m.who === "ai" ? "bg-canvas text-ink-700" : "ml-auto bg-ink text-white"}`}>
                {m.text}
              </div>
            ))}

            {ui === "campaigns" && campaignViews.length ? (
              <div className="space-y-1.5 pt-1">
                <p className="text-[0.7rem] leading-snug text-muted">Bir kampanyaya dokun; seçtiğin kampanyayı sesli tekrarlayayım (işitme güçlüğü için).</p>
                {campaignViews.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (!c.campaign) return;
                      const t = announceCampaign(c.campaign, ctxRef.current);
                      push("ai", t);
                      speak(t);
                    }}
                    className="w-full rounded-[4px] border border-line bg-canvas px-3 py-2 text-left transition-colors hover:border-accent/60 hover:bg-accent/5"
                  >
                    <p className="text-[0.85rem] font-semibold">{c.title}</p>
                    <p className="text-[0.76rem] text-accent">{c.discountLabel}</p>
                    <p className="mt-0.5 text-[0.68rem] text-muted">Dinlemek için dokun ▶</p>
                  </button>
                ))}
              </div>
            ) : null}

            {ui === "products" ? (
              <div className="space-y-2 pt-1">
                {/* Sipariş tipi — yan yana, yalnız açık olanlar (FAZ 12C-2) */}
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(SHORT_MODE) as VoiceMode[]).filter((m) => modeList.includes(m)).map((m) => (
                    <button
                      key={m}
                      onClick={() => chooseMode(m)}
                      className={`rounded-full border px-2.5 py-1 text-[0.74rem] transition-colors ${vState.mode === m ? "border-accent bg-accent/10 font-semibold text-ink" : "border-line bg-canvas text-muted hover:text-ink"}`}
                    >
                      {SHORT_MODE[m]}
                    </button>
                  ))}
                </div>
                <p className="text-[0.7rem] leading-snug text-muted">
                  {vState.mode ? <><strong className="text-ink">{MODE_LABELS[vState.mode]}</strong> fiyatları — tek fiyat gösterilir.</> : "Önce sipariş tipini seç; fiyatlar ona göre görünür."} Adet seç, “Sepete ekle” ile listene ekle.
                </p>

                {products.length ? (
                  <div className="space-y-1.5">
                    {products.map((p) => {
                      const price = modePrice(p, vState.mode);
                      const q = qtyPick[p.name] ?? 1;
                      return (
                        <div key={p.name} className="rounded-[4px] border border-line bg-canvas px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[0.85rem] font-medium leading-snug">{p.name}</span>
                            <span className="tabular shrink-0 text-[0.85rem] font-semibold">{Math.round(price / 100)} ₺</span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                aria-label={`${p.name} adedini azalt`}
                                onClick={() => setQtyPick((s) => ({ ...s, [p.name]: Math.max(1, q - 1) }))}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-canvas text-[0.95rem] leading-none text-ink transition-colors hover:border-accent"
                              >−</button>
                              <span className="tabular w-5 text-center text-[0.85rem] font-semibold">{q}</span>
                              <button
                                aria-label={`${p.name} adedini artır`}
                                onClick={() => setQtyPick((s) => ({ ...s, [p.name]: Math.min(20, q + 1) }))}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-canvas text-[0.95rem] leading-none text-ink transition-colors hover:border-accent"
                              >+</button>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => addToCart(p, q)}>Sepete ekle</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[0.84rem] text-muted">Bu işletmede şu an ürün yok; kampanyalara bakabilirsin.</p>
                )}

                {/* Sepet barı */}
                <div className="flex items-center justify-between gap-2 rounded-[4px] border border-accent/40 bg-accent/5 px-3 py-2">
                  <span className="text-[0.8rem]">
                    <strong>Sepet: {vState.cart.reduce((s, l) => s + l.qty, 0)} ürün</strong>
                    {bd ? <> · {Math.round(bd.totalCents / 100)} ₺</> : null}
                  </span>
                  <div className="flex gap-1.5">
                    {vState.cart.length ? <Button size="sm" onClick={() => setUi("cart")}>Sepeti gör</Button> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {ui === "qty" ? (
              <div className="rounded-[4px] border border-accent/40 bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Ürün adedi</p>
                <p className="mt-0.5 text-[0.82rem] leading-snug text-ink-700">Kaç adet olduğunu söyle veya yaz — örneğin “iki tane” ya da “3”.</p>
              </div>
            ) : null}

            {ui === "delivery" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Sipariş tipi — hangisiyle ilerleyelim?</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(SHORT_MODE) as VoiceMode[]).filter((m) => modeList.includes(m)).map((m) => (
                    <Button key={m} size="sm" variant={vState.mode === m ? "primary" : "secondary"} onClick={() => chooseMode(m)}>
                      {SHORT_MODE[m]}
                    </Button>
                  ))}
                </div>
                <p className="text-[0.78rem] leading-snug text-muted">Seçtiğin tipe göre menü ve fiyatlar tek olarak gösterilir; adrese teslimde adres istenir.</p>
              </div>
            ) : null}

            {ui === "cart" ? (
              <div className="rounded-[4px] border border-line bg-canvas p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Sepet</p>
                  <button onClick={() => setUi("products")} className="text-[0.72rem] text-accent underline">menüye dön</button>
                </div>
                {vState.mode ? (
                  <p className="mt-0.5 text-[0.78rem] text-accent">
                    {MODE_LABELS[vState.mode]} ·{" "}
                    <button className="underline" onClick={() => setUi("delivery")}>tipi değiştir</button>
                  </p>
                ) : null}
                {vState.cart.length ? (
                  <ul className="mt-1.5 space-y-1.5">
                    {vState.cart.map((l, i) => (
                      <li key={i} className="text-[0.85rem]">
                        <div className="flex items-center justify-between gap-2">
                          <span>{l.qty} × {l.name}</span>
                          <span className="flex items-center gap-2">
                            <span className="tabular font-semibold">{Math.round((l.qty * l.unitPriceCents) / 100)} ₺</span>
                            <button aria-label={`${l.name} sepetten çıkar`} onClick={() => removeFromCart(i)} className="text-muted transition-colors hover:text-danger">✕</button>
                          </span>
                        </div>
                        {l.options?.length ? (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {l.options.map((o, j) => (
                              <span key={j} className={`rounded-full border px-1.5 py-0.5 text-[0.68rem] ${o.wanted ? "border-positive/40 text-positive" : "border-line text-muted line-through"}`}>{o.name}</span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-[0.84rem] text-muted">Sepet boş — menüden ürün ekleyebilir ya da ürün adını söyleyebilirsin.</p>}
                {bd && vState.cart.length ? (
                  <div className="mt-2 space-y-0.5 border-t border-line-soft pt-2">
                    {breakdownLines(bd).map((ln, i) => (
                      <p key={i} className={`flex justify-between text-[0.8rem] ${ln.tone === "discount" ? "text-positive" : ln.tone === "mid" ? "text-ink-700" : "text-muted"}`}>
                        <span>{ln.label}</span><span className="tabular">{ln.value}</span>
                      </p>
                    ))}
                    <p className="flex justify-between pt-1 text-[0.9rem] font-semibold">
                      <span>Ödenecek toplam</span><span className="tabular">{Math.round(bd.totalCents / 100)} ₺</span>
                    </p>
                  </div>
                ) : null}
                {vState.cart.length ? (
                  <div className="mt-2 space-y-2 border-t border-line-soft pt-2">
                    <div>
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Ödeme seçimi</p>
                      <div className="mt-1 flex gap-2">
                        <Button size="sm" variant={vState.payment === "CASH_DOOR" ? "primary" : "secondary"} onClick={() => pickPayment("CASH_DOOR")}>
                          {yer === "kapıda" ? "Kapıda nakit" : "İş yerinde nakit"}
                        </Button>
                        <Button size="sm" variant={vState.payment === "CARD_DOOR" ? "primary" : "secondary"} onClick={() => pickPayment("CARD_DOOR")}>
                          {yer === "kapıda" ? "Kapıda kart" : "İş yerinde kart"}
                        </Button>
                      </div>
                      {vState.payment ? <p className="mt-1 text-[0.72rem] text-positive">Seçili: {vState.payment === "CARD_DOOR" ? "kart" : "nakit"} ({yer}) ✓</p> : null}
                      {!vState.payment && payHint ? <p className="mt-1 text-[0.72rem] font-semibold text-accent-700">{payHint}</p> : null}
                    </div>
                    {!user ? loginBtn : (
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" loading={sending} onClick={manualSend}>Sipariş ver</Button>
                        <Button size="sm" variant="secondary" onClick={() => setUi("products")}>Alışverişe devam</Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => setUi("products")}>Menüye gözat</Button>
                )}
              </div>
            ) : null}

            {ui === "details" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Teslimat bilgileri</p>
                <Input placeholder="Adın" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Telefon" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                {vState.mode === "PAKET_SERVIS" ? <Input placeholder="Adres (mahalle, sokak, kapı no)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /> : null}
                {/* FAZ 12C-3 — REZERVE'de saat zorunlu (masa planı). */}
                {vState.mode === "REZERVE" ? (
                  <Input type="time" aria-label="Rezerve saat" value={form.reservedAt} onChange={(e) => setForm({ ...form, reservedAt: e.target.value })} />
                ) : null}
                <Button size="sm" onClick={() => {
                  if (!form.name.trim() || !form.phone.trim() || (vState.mode === "PAKET_SERVIS" && !form.address.trim()) || (vState.mode === "REZERVE" && !form.reservedAt.trim())) {
                    toast.push({
                      title: "Ad ve telefon zorunlu",
                      desc: vState.mode === "PAKET_SERVIS" ? "Adrese teslimde adres de gerekli." : vState.mode === "REZERVE" ? "Rezerve siparişte saat zorunlu — masa planı için." : "Eksik alanları doldur.",
                      tone: "warning",
                    });
                    return;
                  }
                  const next = applyDetails(vStateRef.current, form);
                  setVState(next);
                  vStateRef.current = next;
                  setLastBreakdown(next.cart.length ? cartBreakdown(next, ctxRef.current) : null);
                  setUi("cart");
                  const say = `${next.name}, kaydettim.${next.mode === "REZERVE" && next.reservedAt ? ` Rezerve saat ${next.reservedAt}.` : ""} Ödeme yöntemini seçip "Sipariş ver" ile gönderebilirsin.`;
                  push("ai", say);
                  speak(say);
                }}>Devam</Button>
              </div>
            ) : null}

            {ui === "payment" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">{yer === "kapıda" ? "Kapıda ödeme yöntemi" : "İş yerinde ödeme yöntemi"}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant={vState.payment === "CASH_DOOR" ? "primary" : "secondary"} onClick={() => pickPayment("CASH_DOOR")}>
                    {yer === "kapıda" ? "Kapıda nakit" : "İş yerinde nakit"}
                  </Button>
                  <Button size="sm" variant={vState.payment === "CARD_DOOR" ? "primary" : "secondary"} onClick={() => pickPayment("CARD_DOOR")}>
                    {yer === "kapıda" ? "Kapıda kart" : "İş yerinde kart"}
                  </Button>
                </div>
              </div>
            ) : null}

            {ui === "confirm" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Sipariş özeti</p>
                <ul className="space-y-0.5 text-[0.85rem]">
                  {vState.cart.map((l, i) => (
                    <li key={i}>
                      {l.qty} × {l.name}
                      {l.options?.length ? (
                        <span className="ml-1 text-[0.72rem] text-muted">({l.options.map((o) => `${o.name} ${o.wanted ? "olsun" : "olmasın"}`).join(", ")})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="text-[0.85rem] text-muted">{vState.name} · {vState.phone}</p>
                {vState.address ? <p className="text-[0.85rem] text-muted">{vState.address}</p> : null}
                {/* FAZ 12C-3 — rezerve saati özet satırı (masa planı). */}
                {vState.mode === "REZERVE" && vState.reservedAt ? <p className="text-[0.85rem] font-semibold text-accent-700">Rezerve saat: {vState.reservedAt}</p> : null}
                {bd ? (
                  <div className="space-y-0.5 border-t border-line-soft pt-1.5">
                    {breakdownLines(bd).map((ln, i) => (
                      <p key={i} className={`flex justify-between text-[0.8rem] ${ln.tone === "discount" ? "text-positive" : "text-muted"}`}>
                        <span>{ln.label}</span><span className="tabular">{ln.value}</span>
                      </p>
                    ))}
                  </div>
                ) : null}
                <p className="text-[0.9rem] font-semibold">
                  Ödenecek {bd ? `${Math.round(bd.totalCents / 100)} ₺` : "—"} · {yer} {vState.payment === "CARD_DOOR" ? "kart" : "nakit"} · {vState.mode ? MODE_LABELS[vState.mode] : ""}
                </p>
                <div className="flex gap-2">
                  {!user ? loginBtn : (
                    <Button size="sm" loading={sending} onClick={() => void submit()}>Siparişi gönder</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => run("hayır")}>Vazgeç</Button>
                </div>
              </div>
            ) : null}

            {ui === "done" ? (
              <div className="rounded-[4px] border border-positive/40 bg-canvas p-3">
                <p className="text-[0.9rem] font-semibold text-positive">Sipariş iletildi ✓</p>
                <p className="mt-0.5 text-[0.85rem] font-semibold text-ink">Siparişiniz alınmıştır. İyi günler dileriz.</p>
                {orderId ? <p className="mt-0.5 text-[0.78rem] text-muted">Talep no: {orderId.slice(0, 8)}</p> : null}
                <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">
                  {vState.mode === "PAKET_SERVIS"
                    ? <>İşletme onaylayınca hazırlanır ve adresine yollanır; ödemeyi kapıda nakit veya kartla <strong className="text-ink">{business.name}</strong> yaparsın; DampingVar ödeme almaz.</>
                    : vState.mode === "REZERVE"
                      ? <>Belirttiğin zamanda gelip alırsın; ödemeyi nakit veya kartla <strong className="text-ink">{business.name}</strong>&apos;da yaparsın; DampingVar ödeme almaz.</>
                      : <>Hazır olunca gelip alırsın; ödemeyi nakit veya kartla <strong className="text-ink">{business.name}</strong>&apos;da yaparsın; DampingVar ödeme almaz.</>}
                </p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => run("yeni sipariş")}>Yeni sipariş</Button>
              </div>
            ) : null}
          </div>

          <div className="border-t border-line px-4 py-2">
            <div className="flex flex-wrap gap-1.5">
              {["Kampanyalar neler?", "Menü"].map((q) => (
                <button key={q} onClick={() => run(q)} className="rounded-full border border-line bg-canvas px-2.5 py-1 text-[0.74rem] text-muted hover:text-ink">{q}</button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={toggleMic}
                aria-label={listening ? "Dinlemeyi durdur" : "Konuşmaya başla"}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${listening ? "border-danger bg-danger text-white" : "border-line bg-canvas text-ink hover:border-accent"}`}
              >
                <MicSvg size={18} />
              </button>
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => { e.preventDefault(); run(input); setInput(""); }}
              >
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "Dinliyorum…" : "Ya da buraya yaz…"} aria-label="Mesaj" />
                <Button type="submit" size="sm" variant="secondary">Gönder</Button>
              </form>
            </div>
            {!user ? (
              <p className="mt-2 text-[0.7rem] leading-snug text-muted">
                Sipariş için <a className="font-semibold text-accent underline" href={loginHref}>giriş yap</a> — oturumsuz sipariş alınmaz (suistimal önlemi). Ödemeyi kapıda/iş yerinde işletmeye yaparsın; DampingVar ödeme almaz.
              </p>
            ) : (
              <p className="mt-2 text-[0.68rem] leading-snug text-muted">
                Sipariş yalnızca işletmeye iletilir; ödeme kapıda/iş yerinde yapılır. DampingVar ödeme almaz, tahsil etmez ve stok/fiyat garanti etmez.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
