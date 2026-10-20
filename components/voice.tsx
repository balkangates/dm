"use client";

/**
 * FAZ 12A — Ücretsiz Sesli Asistan (müşteri widget'ı).
 *
 * Konuşma tanıma ve seslendirme TARAYICININ YEREL Web Speech API'siyledir;
 * hiçbir dış API anahtarı kullanılmaz. Motor lib/voice.ts'tedir (yerel,
 * deterministik). Ses desteklenmiyorsa metin girişiyle aynı akış çalışır.
 *
 * Sipariş yalnızca işletmeye iletilir; ödeme kapıda nakit veya kartla
 * MÜŞTERİ ile İŞLETME arasında yapılır. DampingVar ödeme almaz.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, useToast } from "@/components/ds";
import {
  applyConfirm, applyDetails, applyPayment, cartTotalCents, handleVoice, initialVoiceState, MODE_LABELS,
  type VoiceCampaign, type VoiceCtx, type VoicePayment, type VoiceProduct, type VoiceState, type VoiceUi,
} from "@/lib/voice";

type Msg = { who: "ai" | "me"; text: string };

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
  business: { id: string; name: string; district: string };
  products: VoiceProduct[];
  campaigns: VoiceCampaign[];
  user: { name: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [vState, setVState] = useState<VoiceState>(() => ({ ...initialVoiceState(), name: user?.name ?? "" }));
  const [ui, setUi] = useState<VoiceUi>("menu");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState("");
  const [recSupported, setRecSupported] = useState(false);
  const [sending, setSending] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [campaignViews, setCampaignViews] = useState<Array<{ title: string; discountLabel: string }>>([]);
  const [productViews, setProductViews] = useState<Array<{ name: string; priceLabel: string }>>([]);
  const [form, setForm] = useState({ name: user?.name ?? "", phone: "", address: "" });
  const toast = useToast();

  const ctx = useMemo<VoiceCtx>(
    () => ({ businessName: business.name, district: business.district, products, campaigns }),
    [business, products, campaigns],
  );
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const vStateRef = useRef(vState);
  vStateRef.current = vState;
  const recRef = useRef<Rec | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

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
      if (step.products) setProductViews(step.products);
      push("ai", step.say);
      speak(step.say);
    },
    [push, speak],
  );

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !greetedRef.current) {
      greetedRef.current = true;
      const say = `Merhaba! Ben ${business.name} ücretsiz sesli asistanıyım. Kampanyalarımı sorabilir, menüye bakabilir veya sipariş verebilirsin — gel-al (işletme içinden) ya da adrese teslim. Ödemeyi nakit veya kartla yaparsın.`;
      push("ai", say);
      speak(say);
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
    setSending(true);
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: business.id,
          items: s.cart.map((l) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents })),
          paymentMethod: s.payment ?? "CASH_DOOR",
          deliveryType: s.mode,
          customerName: s.name,
          customerPhone: s.phone,
          customerDistrict: business.district,
          address: s.address,
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }) as Record<string, unknown>);
      if (!json.ok) {
        toast.push({ title: String(json.error ?? "Sipariş gönderilemedi"), tone: "danger" });
        setSending(false);
        return;
      }
      setOrderId(json.orderId ? String(json.orderId) : null);
      setVState(applyConfirm(s));
      vStateRef.current = applyConfirm(s);
      setUi("done");
      const say = `Siparişin ${business.name}iletildi! İşletme onaylayınca hazırlanacak; ödemeyi kapıda yapacaksın.`;
      push("ai", say);
      speak(say);
    } catch {
      toast.push({ title: "Ağ hatası oluştu", desc: "Sipariş gönderilemedi; tekrar dene.", tone: "danger" });
    }
    setSending(false);
  }

  const total = cartTotalCents(vState);

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
                {campaignViews.map((c, i) => (
                  <div key={i} className="rounded-[4px] border border-line bg-canvas px-3 py-2">
                    <p className="text-[0.85rem] font-semibold">{c.title}</p>
                    <p className="text-[0.76rem] text-accent">{c.discountLabel}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {ui === "products" && productViews.length ? (
              <div className="space-y-1 pt-1">
                {productViews.map((p, i) => (
                  <div key={i} className="flex justify-between rounded-[4px] border border-line bg-canvas px-3 py-1.5 text-[0.84rem]">
                    <span>{p.name}</span><span className="tabular font-semibold">{p.priceLabel}</span>
                  </div>
                ))}
                <Button size="sm" variant="secondary" className="mt-1" onClick={() => run("sipariş vermek istiyorum")}>Sipariş ver</Button>
              </div>
            ) : null}

            {ui === "delivery" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Sipariş tipi</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={vState.mode === "GEL_AL" ? "primary" : "secondary"} onClick={() => run("gel al")}>Gel-al / işletme içi</Button>
                  <Button size="sm" variant={vState.mode === "PAKET_SERVIS" ? "primary" : "secondary"} onClick={() => run("adrese teslim")}>Adrese teslim (paket servis)</Button>
                </div>
                <p className="text-[0.78rem] leading-snug text-muted">Fiyatlar sipariş tipine göre değişebilir; adrese teslimde teslimat adresi istenir.</p>
              </div>
            ) : null}

            {ui === "cart" ? (
              <div className="rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Sepet</p>
                {vState.mode ? (
                  <p className="mt-0.5 text-[0.78rem] text-accent">
                    {MODE_LABELS[vState.mode]} ·{" "}
                    <button className="underline" onClick={() => run(vState.mode === "GEL_AL" ? "adrese teslim" : "gel al")}>değiştir</button>
                  </p>
                ) : null}
                {vState.cart.length ? (
                  <ul className="mt-1.5 space-y-1">
                    {vState.cart.map((l, i) => (
                      <li key={i} className="flex justify-between text-[0.85rem]">
                        <span>{l.qty} × {l.name}</span>
                        <span className="tabular">{Math.round((l.qty * l.unitPriceCents) / 100)} ₺</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-[0.84rem] text-muted">Sepet boş — ürün adını söyle veya yaz.</p>}
                <p className="mt-2 border-t border-line-soft pt-2 text-[0.9rem] font-semibold">Toplam: <span className="tabular">{Math.round(total / 100)} ₺</span></p>
                {vState.cart.length ? (
                  <Button size="sm" className="mt-2" onClick={() => run("onayla")}>Siparişi onayla</Button>
                ) : null}
              </div>
            ) : null}

            {ui === "details" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Teslimat bilgileri</p>
                <Input placeholder="Adın" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Telefon" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                {vState.mode !== "GEL_AL" ? <Input placeholder="Adres (mahalle, sokak, kapı no)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /> : null}
                <Button size="sm" onClick={() => {
                  const next = applyDetails(vStateRef.current, form);
                  setVState(next);
                  vStateRef.current = next;
                  if (next.stage === "payment") {
                    setUi("payment");
                    const say = `${next.name}, kaydettim. Ödemeyi kapıda nakit mi kartla mı yapacaksın?`;
                    push("ai", say);
                    speak(say);
                  }
                }}>Devam</Button>
              </div>
            ) : null}

            {ui === "payment" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Kapıda ödeme yöntemi</p>
                <div className="flex gap-2">
                  <Button size="sm" variant={vState.payment === "CASH_DOOR" ? "primary" : "secondary"} onClick={() => {
                    const next = applyPayment(vStateRef.current, "CASH_DOOR");
                    setVState(next); vStateRef.current = next; setUi("confirm");
                    const yer = next.mode === "GEL_AL" ? "iş yerinde" : "kapıda";
                    const say = `${yer === "kapıda" ? "Kapıda" : "İş yerinde"} nakit kaydedildi. Siparişin: ${next.cart.map((l) => `${l.qty} ${l.name}`).join(", ")}. Toplam ${Math.round(cartTotalCents(next) / 100)} lira. Onaylıyor musun?`;
                    push("ai", say); speak(say);
                  }}>{vState.mode === "GEL_AL" ? "İş yerinde nakit" : "Kapıda nakit"}</Button>
                  <Button size="sm" variant={vState.payment === "CARD_DOOR" ? "primary" : "secondary"} onClick={() => {
                    const next = applyPayment(vStateRef.current, "CARD_DOOR");
                    setVState(next); vStateRef.current = next; setUi("confirm");
                    const yer = next.mode === "GEL_AL" ? "iş yerinde" : "kapıda";
                    const say = `${yer === "kapıda" ? "Kapıda" : "İş yerinde"} kart kaydedildi. Siparişin: ${next.cart.map((l) => `${l.qty} ${l.name}`).join(", ")}. Toplam ${Math.round(cartTotalCents(next) / 100)} lira. Onaylıyor musun?`;
                    push("ai", say); speak(say);
                  }}>{vState.mode === "GEL_AL" ? "İş yerinde kart" : "Kapıda kart"}</Button>
                </div>
              </div>
            ) : null}

            {ui === "confirm" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Sipariş özeti</p>
                <ul className="space-y-0.5 text-[0.85rem]">
                  {vState.cart.map((l, i) => <li key={i}>{l.qty} × {l.name}</li>)}
                </ul>
                <p className="text-[0.85rem] text-muted">{vState.name} · {vState.phone}</p>
                {vState.address ? <p className="text-[0.85rem] text-muted">{vState.address}</p> : null}
                <p className="text-[0.9rem] font-semibold">
                  Toplam {Math.round(total / 100)} ₺ · {vState.mode === "GEL_AL" ? "iş yerinde" : "kapıda"} {vState.payment === "CARD_DOOR" ? "kart" : "nakit"} · {vState.mode ? MODE_LABELS[vState.mode] : ""}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" loading={sending} onClick={() => void submit()}>Siparişi gönder</Button>
                  <Button size="sm" variant="ghost" onClick={() => run("hayır")}>Vazgeç</Button>
                </div>
              </div>
            ) : null}

            {ui === "done" ? (
              <div className="rounded-[4px] border border-positive/40 bg-canvas p-3">
                <p className="text-[0.9rem] font-semibold text-positive">Sipariş iletildi ✓</p>
                {orderId ? <p className="mt-0.5 text-[0.78rem] text-muted">Talep no: {orderId.slice(0, 8)}</p> : null}
                <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">
                  {vState.mode === "GEL_AL"
                    ? <>Hazır olunca gelip alırsın; ödemeyi nakit veya kartla <strong className="text-ink">{business.name}</strong>&apos;da yaparsın; DampingVar ödeme almaz.</>
                    : <>İşletme onaylayınca hazırlanır ve adresine yollanır; ödemeyi kapıda nakit veya kartla <strong className="text-ink">{business.name}</strong> yaparsın; DampingVar ödeme almaz.</>}
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
            <p className="mt-2 text-[0.68rem] leading-snug text-muted">
              Sipariş yalnızca işletmeye iletilir; ödeme kapıda yapılır. DampingVar ödeme almaz, tahsil etmez ve stok/fiyat garanti etmez.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
