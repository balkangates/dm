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
  applyConfirm, applyDetails, applyPayment, cartBreakdown, enabledModes, handleVoice, initialVoiceState, MODE_LABELS,
  type VoiceCampaign, type VoiceCtx, type VoicePayment, type VoiceProduct, type VoiceState, type VoiceUi,
} from "@/lib/voice";
import { breakdownLines } from "@/lib/order-price";

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
  const [lastBreakdown, setLastBreakdown] = useState<ReturnType<typeof cartBreakdown> | null>(null);
  const [campaignViews, setCampaignViews] = useState<Array<{ title: string; discountLabel: string }>>([]);
  const [productViews, setProductViews] = useState<Array<{ name: string; priceLabel: string }>>([]);
  const [form, setForm] = useState({ name: user?.name ?? "", phone: "", address: "" });
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
      if (step.products) setProductViews(step.products);
      setLastBreakdown(step.state.cart.length ? cartBreakdown(step.state, ctxRef.current) : null);
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
          ? `Siparişin ${business.name} işletmesine iletildi! İşletme onaylayınca hazırlanacak ve adresine yollanacak; ödemeyi kapıda yapacaksın.`
          : s.mode === "REZERVE"
            ? `Rezerve siparişin ${business.name} işletmesine iletildi! Belirttiğin zamanda gelip alacaksın; ödemeyi iş yerinde yapacaksın.`
            : `Siparişin ${business.name} işletmesine iletildi! Hazır olunca gelip alırsın; ödemeyi iş yerinde yapacaksın.`;
      push("ai", say);
      speak(say);
    } catch {
      toast.push({ title: "Ağ hatası oluştu", desc: "Sipariş gönderilemedi; tekrar dene.", tone: "danger" });
    }
    setSending(false);
  }

  const bd = vState.cart.length ? (lastBreakdown ?? cartBreakdown(vState, ctx)) : null;
  const yer = vState.mode === "PAKET_SERVIS" ? "kapıda" : "iş yerinde";
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
                {!user ? loginBtn : (
                  <Button size="sm" variant="secondary" className="mt-1" onClick={() => run("sipariş vermek istiyorum")}>Sipariş ver</Button>
                )}
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
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Sipariş tipi</p>
                {!user ? loginBtn : null}
                <div className="flex flex-wrap gap-2">
                  {modeList.includes("GEL_AL") ? (
                    <Button size="sm" variant={vState.mode === "GEL_AL" ? "primary" : "secondary"} onClick={() => run("gel al")}>Gel-al / işletme içi</Button>
                  ) : null}
                  {modeList.includes("REZERVE") ? (
                    <Button size="sm" variant={vState.mode === "REZERVE" ? "primary" : "secondary"} onClick={() => run("rezerve")}>Rezerve (ileri tarihli)</Button>
                  ) : null}
                  {modeList.includes("PAKET_SERVIS") ? (
                    <Button size="sm" variant={vState.mode === "PAKET_SERVIS" ? "primary" : "secondary"} onClick={() => run("adrese teslim")}>Adrese teslim (paket servis)</Button>
                  ) : null}
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
                    <button className="underline" onClick={() => run(modeList.length > 1 ? (vState.mode === "PAKET_SERVIS" ? "gel al" : "adrese teslim") : "menü")}>değiştir</button>
                  </p>
                ) : null}
                {vState.cart.length ? (
                  <ul className="mt-1.5 space-y-1">
                    {vState.cart.map((l, i) => (
                      <li key={i} className="text-[0.85rem]">
                        <div className="flex justify-between">
                          <span>{l.qty} × {l.name}</span>
                          <span className="tabular">{Math.round((l.qty * l.unitPriceCents) / 100)} ₺</span>
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
                ) : <p className="mt-1 text-[0.84rem] text-muted">Sepet boş — ürün adını söyle veya yaz.</p>}
                {bd && vState.cart.length ? (
                  <div className="mt-2 space-y-0.5 border-t border-line-soft pt-2">
                    {breakdownLines(bd).map((ln, i) => (
                      <p key={i} className={`flex justify-between text-[0.8rem] ${ln.tone === "discount" ? "text-positive" : ln.tone === "kdv" ? "text-muted" : "text-muted"}`}>
                        <span>{ln.label}</span><span className="tabular">{ln.value}</span>
                      </p>
                    ))}
                    <p className="flex justify-between pt-1 text-[0.9rem] font-semibold">
                      <span>Ödenecek toplam</span><span className="tabular">{Math.round(bd.totalCents / 100)} ₺</span>
                    </p>
                  </div>
                ) : null}
                {vState.cart.length ? (
                  !user ? loginBtn : (
                    <Button size="sm" className="mt-2" onClick={() => run("onayla")}>Siparişi onayla</Button>
                  )
                ) : null}
              </div>
            ) : null}

            {ui === "details" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Teslimat bilgileri</p>
                <Input placeholder="Adın" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Telefon" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                {vState.mode === "PAKET_SERVIS" ? <Input placeholder="Adres (mahalle, sokak, kapı no)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /> : null}
                <Button size="sm" onClick={() => {
                  const next = applyDetails(vStateRef.current, form);
                  setVState(next);
                  vStateRef.current = next;
                  if (next.stage === "payment") {
                    setUi("payment");
                    const say = `${next.name}, kaydettim. ${yer === "kapıda" ? "Ödemeyi kapıda" : "Ödemeyi iş yerinde"} nakit mi kartla mı yapacaksın?`;
                    push("ai", say);
                    speak(say);
                  }
                }}>Devam</Button>
              </div>
            ) : null}

            {ui === "payment" ? (
              <div className="space-y-2 rounded-[4px] border border-line bg-canvas p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">{yer === "kapıda" ? "Kapıda ödeme yöntemi" : "İş yerinde ödeme yöntemi"}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant={vState.payment === "CASH_DOOR" ? "primary" : "secondary"} onClick={() => {
                    const next = applyPayment(vStateRef.current, "CASH_DOOR");
                    setVState(next); vStateRef.current = next; setUi("confirm");
                    setLastBreakdown(cartBreakdown(next, ctxRef.current));
                    const say = `${yer === "kapıda" ? "Kapıda" : "İş yerinde"} nakit kaydedildi. Siparişin: ${next.cart.map((l) => `${l.qty} ${l.name}`).join(", ")}. Onaylıyor musun?`;
                    push("ai", say); speak(say);
                  }}>{yer === "kapıda" ? "Kapıda nakit" : "İş yerinde nakit"}</Button>
                  <Button size="sm" variant={vState.payment === "CARD_DOOR" ? "primary" : "secondary"} onClick={() => {
                    const next = applyPayment(vStateRef.current, "CARD_DOOR");
                    setVState(next); vStateRef.current = next; setUi("confirm");
                    setLastBreakdown(cartBreakdown(next, ctxRef.current));
                    const say = `${yer === "kapıda" ? "Kapıda" : "İş yerinde"} kart kaydedildi. Siparişin: ${next.cart.map((l) => `${l.qty} ${l.name}`).join(", ")}. Onaylıyor musun?`;
                    push("ai", say); speak(say);
                  }}>{yer === "kapıda" ? "Kapıda kart" : "İş yerinde kart"}</Button>
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
