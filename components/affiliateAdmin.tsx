"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge, Button, Dialog, Field, Icon, Input, Notice, Select, Textarea, Toggle, useToast,
} from "@/components/ds";
import {
  COMMISSION_MODELS, CURRENCIES, DEFAULT_DISCLOSURE, INTEGRATION_LABEL, INTEGRATION_TYPES, PLACEHOLDERS,
  REPORTING_METHODS, buildOutboundUrl, videoEmbed, type IntegrationType,
} from "@/lib/affiliate";
import { getBrowserSupabase } from "@/lib/supabase/client";

type AffiliateData = Awaited<ReturnType<typeof import("@/lib/queries").getAffiliateData>>;
export type AffOffer = AffiliateData["offers"][number];
export type AffNetwork = AffiliateData["networks"][number];

/** /api/affiliate yönetici çağrısı; başarıda true döner, hata toast'ı gösterir. */
export function useAffiliateApi() {
  const toast = useToast();
  async function call(body: Record<string, unknown>, okMsg?: string, reload = true): Promise<Record<string, unknown> | null> {
    const res = await fetch("/api/affiliate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({ ok: false }))) as Record<string, unknown>;
    if (!json.ok) {
      toast.push({ title: String(json.error ?? "İşlem başarısız"), tone: "danger" });
      return null;
    }
    if (okMsg) toast.push({ title: okMsg, tone: "positive" });
    if (reload) setTimeout(() => window.location.reload(), 700);
    return json;
  }
  return call;
}

const money2 = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(/\.00$/, ""));
const toCents = (v: string) => {
  const x = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(x) ? null : Math.round(x * 100);
};
const localDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 mt-6 border-b-2 border-dashed border-line pb-1.5 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-accent first:mt-0">{children}</p>;
}

/* ================================================================== *
 * FIRSAT FORMU (oluştur / düzenle)
 * ================================================================== */

type OfferForm = {
  merchant: string; brand: string; title: string; description: string; category: string; country: string;
  imageUrl: string; videoUrl: string;
  integrationType: IntegrationType; networkId: string; destinationUrl: string; trackingUrl: string; clickParam: string;
  commissionTerms: string; commissionRatePercent: string; commissionFixed: string; cookieDays: string;
  currency: string; price: string; priceVerified: boolean; startsAt: string; endsAt: string;
  exclusions: string; terms: string; disclosure: string; status: string; isSponsored: boolean;
};

const EMPTY: OfferForm = {
  merchant: "", brand: "", title: "", description: "", category: "", country: "TR",
  imageUrl: "", videoUrl: "",
  integrationType: "NETWORK", networkId: "", destinationUrl: "", trackingUrl: "", clickParam: "",
  commissionTerms: "", commissionRatePercent: "", commissionFixed: "", cookieDays: "",
  currency: "TRY", price: "", priceVerified: false, startsAt: "", endsAt: "",
  exclusions: "", terms: "", disclosure: DEFAULT_DISCLOSURE, status: "ACTIVE", isSponsored: false,
};

function fromOffer(o: AffOffer): OfferForm {
  return {
    merchant: o.merchant, brand: o.brand, title: o.title, description: o.description ?? "", category: o.category, country: o.country,
    imageUrl: o.imageUrl ?? "", videoUrl: o.videoUrl ?? "",
    integrationType: (INTEGRATION_TYPES as readonly string[]).includes(o.integrationType) ? (o.integrationType as IntegrationType) : "NETWORK",
    networkId: o.networkId ?? "", destinationUrl: o.destinationUrl, trackingUrl: o.trackingUrl ?? "", clickParam: o.clickParam ?? "",
    commissionTerms: o.commissionTerms ?? "",
    commissionRatePercent: o.commissionRatePercent == null ? "" : String(o.commissionRatePercent),
    commissionFixed: money2(o.commissionFixedCents), cookieDays: o.cookieDays == null ? "" : String(o.cookieDays),
    currency: o.currency, price: money2(o.priceCents), priceVerified: o.priceVerified,
    startsAt: localDate(o.startsAt), endsAt: localDate(o.endsAt),
    exclusions: o.exclusions.join("\n"), terms: o.terms ?? "", disclosure: o.disclosure || DEFAULT_DISCLOSURE,
    status: o.status, isSponsored: o.isSponsored,
  };
}

export function OfferDialog({
  open, onClose, offer, networks, categories,
}: { open: boolean; onClose: () => void; offer: AffOffer | null; networks: AffNetwork[]; categories: string[] }) {
  const toast = useToast();
  const call = useAffiliateApi();
  const [f, setF] = useState<OfferForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setF(offer ? fromOffer(offer) : EMPTY); }, [open, offer]);

  const set = <K extends keyof OfferForm>(k: K, v: OfferForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const net = networks.find((n) => n.id === f.networkId) ?? null;

  const preview = useMemo(() => {
    if (!/^https?:\/\//i.test(f.destinationUrl)) return "";
    try {
      return buildOutboundUrl({
        destinationUrl: f.destinationUrl, trackingUrl: f.trackingUrl || null, clickParam: f.clickParam || null,
        networkClickParam: net?.clickParam ?? null, clickId: "dv-ORNEK-1a2b3c", userId: null, offerId: offer?.id ?? "OFFER_ID",
      });
    } catch { return ""; }
  }, [f.destinationUrl, f.trackingUrl, f.clickParam, net, offer]);

  const hasPlaceholder = f.trackingUrl.includes("{click_id}");
  const embed = videoEmbed(f.videoUrl);

  function insertPlaceholder(ph: string) {
    // Yer tutucu bağlantının sonuna eklenir (Input ref iletmez; imleç konumu kullanılmaz).
    set("trackingUrl", f.trackingUrl + ph);
  }

  async function upload(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.push({ title: "Yalnızca JPG, PNG veya WEBP", tone: "danger" }); return; }
    if (file.size > 5 * 1024 * 1024) { toast.push({ title: "Görsel en fazla 5MB olabilir", tone: "danger" }); return; }
    setUploading(true);
    try {
      const sb = getBrowserSupabase();
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `offers/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await sb.storage.from("affiliate-media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) { toast.push({ title: "Yükleme başarısız", desc: error.message, tone: "danger" }); return; }
      const { data: pub } = sb.storage.from("affiliate-media").getPublicUrl(data.path);
      set("imageUrl", pub.publicUrl);
      toast.push({ title: "Görsel yüklendi", tone: "positive" });
    } finally { setUploading(false); }
  }

  async function save() {
    setBusy(true);
    const payload = {
      action: "offer-save", id: offer?.id,
      merchant: f.merchant, brand: f.brand, title: f.title, description: f.description, category: f.category, country: f.country,
      imageUrl: f.imageUrl, videoUrl: f.videoUrl,
      integrationType: f.integrationType, networkId: f.networkId || null,
      destinationUrl: f.destinationUrl, trackingUrl: f.trackingUrl, clickParam: f.clickParam,
      commissionTerms: f.commissionTerms,
      commissionRatePercent: f.commissionRatePercent === "" ? null : Number(f.commissionRatePercent.replace(",", ".")),
      commissionFixedCents: toCents(f.commissionFixed), cookieDays: f.cookieDays === "" ? null : Number(f.cookieDays),
      currency: f.currency, priceCents: toCents(f.price), priceVerified: f.priceVerified,
      startsAt: f.startsAt ? new Date(`${f.startsAt}T00:00:00`).toISOString() : null,
      endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : null,
      exclusions: f.exclusions, terms: f.terms, disclosure: f.disclosure, status: f.status, isSponsored: f.isSponsored,
    };
    const ok = await call(payload, offer ? "Fırsat güncellendi" : "Fırsat yayına alındı");
    setBusy(false);
    if (ok) onClose();
  }

  const nets = networks.filter((n) => n.status !== "SUSPENDED");

  return (
    <Dialog
      open={open} onClose={onClose} width="max-w-3xl"
      title={offer ? "Affiliate fırsatını düzenle" : "Yeni affiliate fırsatı"}
      desc="Referral/entegrasyon bağlantısını siz tanımlarsınız. Kayıt gerçek moddadır; anasayfada ve Online Fırsatlar menüsünde hemen görünür."
      footer={<><Button variant="secondary" onClick={onClose}>Vazgeç</Button><Button loading={busy} onClick={() => void save()}>{offer ? "Kaydet" : "Fırsatı yayınla"}</Button></>}
    >
      <div className="max-h-[68vh] space-y-0 overflow-y-auto pr-1">
        <SectionTitle>1 · Marka ve içerik</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Satıcı (mağaza adı)" required><Input value={f.merchant} onChange={(e) => set("merchant", e.target.value)} placeholder="Teknosa" /></Field>
          <Field label="Marka" hint="Boş bırakılırsa satıcı adı kullanılır. Menüde bu ada göre gruplanır."><Input value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Teknosa" /></Field>
          <Field label="Fırsat başlığı" required className="sm:col-span-2"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Seçili elektronik ürünlerde ek indirim" /></Field>
          <Field label="Kategori" hint="Mevcut kategoriden seçin ya da yenisini yazın.">
            <Input list="aff-cats" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="elektronik" />
            <datalist id="aff-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Ülke (2 harf)"><Input value={f.country} maxLength={2} onChange={(e) => set("country", e.target.value.toUpperCase())} /></Field>
          <Field label="Açıklama" className="sm:col-span-2"><Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
        </div>

        <SectionTitle>2 · Görsel ve video</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Field label="Görsel URL" hint="Doğrudan adres yapıştırın veya dosya yükleyin (JPG/PNG/WEBP, en çok 5MB).">
              <Input value={f.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" />
            </Field>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
            <Button size="sm" variant="secondary" className="mt-2" loading={uploading} icon={<Icon.upload size={14} />} onClick={() => fileRef.current?.click()}>Görsel yükle</Button>
            {f.imageUrl ? <img src={f.imageUrl} alt="" className="mt-3 h-28 w-full rounded-[3px] border-2 border-line object-cover" /> : null}
          </div>
          <div>
            <Field label="Video URL (isteğe bağlı)" hint="YouTube, Vimeo veya doğrudan .mp4/.webm bağlantısı.">
              <Input value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
            </Field>
            {f.videoUrl && !embed ? <p className="mt-2 text-[0.78rem] text-warning">Bu video adresi gömülemez; fırsat sayfasında bağlantı olarak gösterilir.</p> : null}
            {embed ? <Badge tone="positive">Gömülü oynatma desteklenir</Badge> : null}
          </div>
        </div>

        <SectionTitle>3 · Entegrasyon ve referral bağlantısı</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Entegrasyon türü" required>
            <Select value={f.integrationType} onChange={(e) => set("integrationType", e.target.value as IntegrationType)}>
              {INTEGRATION_TYPES.map((t) => <option key={t} value={t}>{INTEGRATION_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="Ağ / marka entegrasyonu" hint={nets.length ? "Komisyon raporu bu kaynaktan gelir." : "Önce “Affiliate Ağ Durumu” bölümünden bir ağ/marka ekleyin."}>
            <Select value={f.networkId} onChange={(e) => set("networkId", e.target.value)}>
              <option value="">— Seçilmedi (rapor yalnız manuel girilir) —</option>
              {nets.map((n) => <option key={n.id} value={n.id}>{n.name} · {n.status}</option>)}
            </Select>
          </Field>
          <Field label="Hedef URL (satıcı sayfası)" required className="sm:col-span-2" hint="Kullanıcının sonunda ineceği gerçek mağaza/ürün/kampanya sayfası.">
            <Input value={f.destinationUrl} onChange={(e) => set("destinationUrl", e.target.value)} placeholder="https://www.teknosa.com/kampanyalar" />
          </Field>
          <Field label="Referral / entegrasyon (izleme) bağlantısı" className="sm:col-span-2"
            hint="Ağın verdiği affiliate/referral bağlantısı. Boş bırakılırsa hedef URL'ye tıklama kimliği eklenir.">
            <Input value={f.trackingUrl} onChange={(e) => set("trackingUrl", e.target.value)} placeholder="https://ag.com/c/12345?subid={click_id}&u={url}" />
          </Field>
          <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
            <span className="text-[0.74rem] text-muted">Yer tutucu ekle:</span>
            {PLACEHOLDERS.map((ph) => (
              <button key={ph} type="button" onClick={() => insertPlaceholder(ph)} className="tabular rounded-[3px] border-2 border-line bg-canvas px-2 py-0.5 text-[0.74rem] font-semibold text-ink-700 hover:border-accent">{ph}</button>
            ))}
          </div>
          <Field label="Tıklama parametresi adı" hint={hasPlaceholder ? "Şablonda {click_id} var; parametre eklenmez." : `Boşsa ağın değeri (${net?.clickParam ?? "subid"}) kullanılır.`}>
            <Input value={f.clickParam} disabled={hasPlaceholder} onChange={(e) => set("clickParam", e.target.value)} placeholder={net?.clickParam ?? "subid"} />
          </Field>
          <div className="sm:col-span-2">
            <p className="text-[0.74rem] font-bold uppercase tracking-[0.12em] text-muted">Çıkış bağlantısı önizlemesi</p>
            <p className="tabular mt-1.5 break-all rounded-[3px] border-2 border-dashed border-line bg-canvas px-3 py-2 text-[0.78rem] text-ink-700">
              {preview || "Hedef URL girin…"}
            </p>
            {f.integrationType !== "DIRECT_BRAND" && !f.trackingUrl ? (
              <Notice tone="warning" icon={<Icon.alert size={15} />} className="mt-2">
                Referral bağlantısı girilmedi: kullanıcı doğrudan hedef URL&apos;ye gider ve ağ komisyonu <strong>izlenemez</strong>. Ağın verdiği bağlantıyı yukarıya yapıştırın.
              </Notice>
            ) : null}
          </div>
        </div>

        <SectionTitle>4 · Komisyon koşulları</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Komisyon oranı (%)"><Input inputMode="decimal" value={f.commissionRatePercent} onChange={(e) => set("commissionRatePercent", e.target.value)} placeholder="4.5" /></Field>
          <Field label="Sabit komisyon"><Input inputMode="decimal" value={f.commissionFixed} onChange={(e) => set("commissionFixed", e.target.value)} placeholder="25" /></Field>
          <Field label="Çerez süresi (gün)"><Input inputMode="numeric" value={f.cookieDays} onChange={(e) => set("cookieDays", e.target.value)} placeholder="30" /></Field>
          <Field label="Komisyon notu" className="sm:col-span-3" hint="Yalnızca ağın size bildirdiği koşulları yazın."><Input value={f.commissionTerms} onChange={(e) => set("commissionTerms", e.target.value)} /></Field>
        </div>

        <SectionTitle>5 · Fiyat, geçerlilik ve koşullar</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Para birimi"><Select value={f.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Fiyat (isteğe bağlı)"><Input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
          <div className="flex items-end gap-3 pb-2"><Toggle checked={f.priceVerified} onChange={(v) => set("priceVerified", v)} label="Fiyat doğrulandı" /><span className="text-[0.8rem] text-ink-700">Fiyatı doğruladım</span></div>
          <Field label="Başlangıç"><Input type="date" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></Field>
          <Field label="Bitiş" hint="Süresi dolan fırsat vitrinden kalkar."><Input type="date" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></Field>
          <Field label="Durum">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="ACTIVE">Aktif (yayında)</option><option value="PAUSED">Duraklatıldı</option><option value="EXPIRED">Süresi doldu</option>
            </Select>
          </Field>
          <Field label="Teklif kapsamı" className="sm:col-span-3"><Textarea rows={2} value={f.terms} onChange={(e) => set("terms", e.target.value)} /></Field>
          <Field label="Hariç olanlar (her satıra bir madde)" className="sm:col-span-3"><Textarea rows={3} value={f.exclusions} onChange={(e) => set("exclusions", e.target.value)} /></Field>
          <Field label="Affiliate ifşası" className="sm:col-span-3" hint="Kullanıcıya çıkıştan önce gösterilir."><Textarea rows={2} value={f.disclosure} onChange={(e) => set("disclosure", e.target.value)} /></Field>
          <div className="flex items-center gap-3 sm:col-span-3"><Toggle checked={f.isSponsored} onChange={(v) => set("isSponsored", v)} label="Sponsorlu" /><span className="text-[0.8rem] text-ink-700">Sponsorlu yerleşim (etiketle ve öne alınarak gösterilir)</span></div>
        </div>
      </div>
    </Dialog>
  );
}

/* ================================================================== *
 * AĞ / MARKA FORMU
 * ================================================================== */

export function NetworkDialog({ open, onClose, network }: { open: boolean; onClose: () => void; network: AffNetwork | null }) {
  const call = useAffiliateApi();
  const [f, setF] = useState({ name: "", kind: "PLATFORM", reportingMethod: "POSTBACK", commissionModel: "CPS", baseUrl: "", clickParam: "subid", defaultCookieDays: "", notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF(network
      ? { name: network.name, kind: network.kind, reportingMethod: network.reportingMethod ?? "", commissionModel: network.commissionModel ?? "", baseUrl: network.baseUrl ?? "", clickParam: network.clickParam, defaultCookieDays: network.defaultCookieDays == null ? "" : String(network.defaultCookieDays), notes: network.notes ?? "" }
      : { name: "", kind: "PLATFORM", reportingMethod: "POSTBACK", commissionModel: "CPS", baseUrl: "", clickParam: "subid", defaultCookieDays: "", notes: "" });
  }, [open, network]);

  async function save() {
    setBusy(true);
    const ok = await call({ action: "network-save", id: network?.id, ...f, defaultCookieDays: f.defaultCookieDays === "" ? null : Number(f.defaultCookieDays) }, network ? "Ağ güncellendi" : "Ağ eklendi");
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} width="max-w-xl" title={network ? "Ağ / marka entegrasyonunu düzenle" : "Yeni ağ / marka entegrasyonu"}
      desc="Yeni kayıt BAĞLI DEĞİL başlar; kimlik/postback kurulunca durumu elle “CONNECTED” yaparsınız."
      footer={<><Button variant="secondary" onClick={onClose}>Vazgeç</Button><Button loading={busy} onClick={() => void save()}>Kaydet</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ad" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="iadeal, Admitad, Teknosa Partner…" /></Field>
        <Field label="Tür">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="PLATFORM">Platform / ağ (iadeal vb.)</option><option value="DIRECT_BRAND">Doğrudan marka sitesi</option>
          </Select>
        </Field>
        <Field label="Raporlama yöntemi">
          <Select value={f.reportingMethod} onChange={(e) => setF({ ...f, reportingMethod: e.target.value })}>
            <option value="">—</option>{REPORTING_METHODS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Komisyon modeli">
          <Select value={f.commissionModel} onChange={(e) => setF({ ...f, commissionModel: e.target.value })}>
            <option value="">—</option>{COMMISSION_MODELS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Tıklama parametresi" hint="Çıkış bağlantısına eklenen parametre adı (örn. subid, sub1, aff_sub)."><Input value={f.clickParam} onChange={(e) => setF({ ...f, clickParam: e.target.value })} /></Field>
        <Field label="Panel / site adresi" className="sm:col-span-2"><Input value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="https://…" /></Field>
        <Field label="Varsayılan çerez süresi (gün)"><Input inputMode="numeric" value={f.defaultCookieDays} onChange={(e) => setF({ ...f, defaultCookieDays: e.target.value })} /></Field>
        <Field label="Notlar" className="sm:col-span-2"><Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

/* ================================================================== *
 * POSTBACK PANELİ (token üret + hazır URL)
 * ================================================================== */

export function PostbackDialog({ open, onClose, network }: { open: boolean; onClose: () => void; network: AffNetwork | null }) {
  const toast = useToast();
  const call = useAffiliateApi();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setToken(null); }, [open]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = token
    ? `${origin}/api/affiliate/postback?token=${token}&click_id={click_id}&ref={transaction_id}&status={status}&commission={commission}&currency={currency}`
    : "";

  async function gen() {
    if (!network) return;
    setBusy(true);
    const json = await call({ action: "network-token", id: network.id }, undefined, false);
    setBusy(false);
    if (json?.token) setToken(String(json.token));
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.push({ title: "Postback URL kopyalandı", tone: "positive" }); }
    catch { toast.push({ title: "Kopyalanamadı; metni elle seçin", tone: "warning" }); }
  }

  return (
    <Dialog open={open} onClose={onClose} width="max-w-2xl" title={`Postback · ${network?.name ?? ""}`}
      desc="Ağ, bir dönüşüm olduğunda bu adresi çağırır; kayıt “REPORTED” olarak düşer. Gelir sayılması için sizin onayınız gerekir."
      footer={<Button variant="secondary" onClick={onClose}>Kapat</Button>}>
      <div className="space-y-4">
        {network?.status !== "CONNECTED" ? (
          <Notice tone="warning" icon={<Icon.alert size={15} />}>
            Ağ durumu <strong>{network?.status}</strong>. Postback yalnızca <strong>CONNECTED</strong> ağlardan kabul edilir; ağ panelinde kurulumu bitirince durumu değiştirin.
          </Notice>
        ) : null}
        {!token ? (
          <div>
            <p className="text-[0.86rem] leading-relaxed text-ink-700">Token yalnızca üretildiği anda gösterilir. Yeniden üretmek eski token&apos;ı geçersiz kılar; ağ panelindeki postback adresini de güncellemeniz gerekir.</p>
            <Button className="mt-3" loading={busy} icon={<Icon.lock size={14} />} onClick={() => void gen()}>Token üret / yenile</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[0.74rem] font-bold uppercase tracking-[0.12em] text-muted">Postback adresi</p>
            <p className="tabular break-all rounded-[3px] border-2 border-dashed border-line bg-canvas px-3 py-2 text-[0.78rem]">{url}</p>
            <Button size="sm" variant="secondary" icon={<Icon.copy size={14} />} onClick={() => void copy()}>Kopyala</Button>
            <Notice tone="info" icon={<Icon.info size={15} />}>
              Süslü parantezli alanlar (<span className="tabular">{"{click_id}"}</span>, <span className="tabular">{"{transaction_id}"}</span> …) ağın kendi makro adlarıyla değiştirilmelidir.
              <span className="tabular"> ref</span> zorunludur; aynı ref tekrar gelirse kayıt çoğaltılmaz.
            </Notice>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ================================================================== *
 * MANUEL KOMİSYON KAYDI
 * ================================================================== */

export function ManualConversionDialog({ open, onClose, offers }: { open: boolean; onClose: () => void; offers: AffOffer[] }) {
  const call = useAffiliateApi();
  const [f, setF] = useState({ offerId: "", clickId: "", amount: "", currency: "TRY", reference: "", note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ offerId: offers[0]?.id ?? "", clickId: "", amount: "", currency: "TRY", reference: "", note: "" }); }, [open, offers]);

  async function save() {
    const offer = offers.find((o) => o.id === f.offerId);
    if (!offer) return;
    setBusy(true);
    const ok = await call({
      action: "report-conversion", offerId: offer.id, networkId: offer.networkId, clickId: f.clickId.trim() || null,
      commissionCents: toCents(f.amount), currency: f.currency, source: "MANUAL_ENTRY",
      networkReference: f.reference.trim() || null, note: f.note.trim() || null,
      idempotencyKey: `manual:${crypto.randomUUID()}`,
    }, "Komisyon kaydı eklendi (REPORTED)");
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} width="max-w-xl" title="Manuel komisyon kaydı"
      desc="Ağ panelinden/CSV'den gördüğünüz bir dönüşümü elle girin. Kayıt “REPORTED” başlar; onay ve ödeme durumlarını siz yönetirsiniz."
      footer={<><Button variant="secondary" onClick={onClose}>Vazgeç</Button><Button loading={busy} disabled={!f.offerId} onClick={() => void save()}>Kaydı ekle</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fırsat" required className="sm:col-span-2">
          <Select value={f.offerId} onChange={(e) => setF({ ...f, offerId: e.target.value })}>{offers.map((o) => <option key={o.id} value={o.id}>{o.merchant} — {o.title}</option>)}</Select>
        </Field>
        <Field label="Komisyon tutarı"><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="12.50" /></Field>
        <Field label="Para birimi"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Ağ işlem referansı"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Tıklama kimliği (varsa)"><Input value={f.clickId} onChange={(e) => setF({ ...f, clickId: e.target.value })} placeholder="dv-…" /></Field>
        <Field label="Not" className="sm:col-span-2"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}
