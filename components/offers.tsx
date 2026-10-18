"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Chip, Dialog, EmptyState, Icon, Notice, SkeletonCard, useToast } from "@/components/ds";
import { Icon as IconSafe } from "@/components/icons";
import { daysUntil, money, relative, shortDate, type Currency, type Lang } from "@/lib/money";
import type { OfferCard as OfferCardType } from "@/lib/queries";

/* ------------------------------------------------------------------ *
 * DIŞ SATICIYA ÇIKIŞ: izlenen tıklama + ayrılış onayı
 * ------------------------------------------------------------------ */

export function OutboundCta({
  offerId,
  destinationUrl,
  merchant,
  disclosure,
  lang,
  label = "Fırsatı İncele",
}: {
  offerId: string;
  destinationUrl: string;
  merchant: string;
  disclosure: string;
  lang: Lang;
  label?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ clickId: string; notice: string } | null>(null);

  async function start() {
    setBusy(true);
    const res = await fetch("/api/affiliate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "click", offerId, channel: window.innerWidth < 768 ? "MOBILE_WEB" : "WEB" }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    setBusy(false);
    if (!json.ok) {
      toast.push({ title: json.error ?? "Bağlantı hazırlanamadı", tone: "danger" });
      return;
    }
    setInfo({ clickId: json.clickId, notice: json.notice });
    setOpen(true);
  }

  async function leave() {
    if (!info) return;
    setBusy(true);
    await fetch("/api/affiliate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm-outbound", clickId: info.clickId }),
    });
    setBusy(false);
    setOpen(false);
    window.open(destinationUrl, "_blank", "noopener,noreferrer");
    toast.push({
      title: "DampingVar'dan ayrıldın",
      desc: "Alışveriş ve ödeme satıcının sitesinde gerçekleşir. Dönüşüm raporlanırsa kayıt güncellenir.",
      tone: "neutral",
    });
  }

  return (
    <>
      <Button onClick={() => void start()} loading={busy} icon={<IconSafe.external size={16} />} className="w-full sm:w-auto">
        {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="DampingVar'dan ayrılıyorsun"
        desc={`${merchant} sitesine yönlendirileceksin.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button loading={busy} onClick={() => void leave()} icon={<IconSafe.external size={15} />}>
              Satıcının sitesine git
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-2 border-dashed border-line bg-canvas p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink bg-surface text-ink">
              <IconSafe.external size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-muted">Hedef</p>
              <p className="truncate font-display text-[1rem] font-bold text-ink">{destinationUrl.replace(/^https?:\/\//, "")}</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 py-1">
            {["DampingVar teklifi", "İzlenen bağlantı", "Satıcının sitesi", "Ağ dönüşüm raporu", "Komisyon durumu"].map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className="hidden text-[0.7rem] font-medium text-muted sm:inline">{s}</span>
                {i < 4 ? (
                  <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
                    <line x1="0" y1="5" x2="22" y2="5" stroke="#d9ccb4" strokeWidth="2" className="flow-line" />
                    <path d="M20 1 L25 5 L20 9" fill="none" stroke="#d9ccb4" strokeWidth="2" />
                  </svg>
                ) : null}
              </span>
            ))}
          </div>

          <Notice tone="warning" icon={<IconSafe.alert size={16} />}>
            {info?.notice} Satın alma DampingVar içinde tamamlanmaz; DampingVar ödeme almaz.
          </Notice>

          <div className="border-l-4 border-accent bg-accent-soft/50 px-4 py-3">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-accent-700">
              {lang === "en" ? "Affiliate disclosure" : "Affiliate ifşası"}
            </p>
            <p className="mt-1.5 text-[0.86rem] leading-relaxed text-ink-700">{disclosure}</p>
          </div>

          <p className="text-[0.78rem] leading-relaxed text-muted">
            Tıklama kaydı <span className="tabular">{info?.clickId}</span> kimliğiyle oluşturuldu. Bu kayıt bir satın
            alma değildir; dönüşüm yalnızca ilgili ağ raporladığında kaydedilir.
          </p>
        </div>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * FIRSAT KARTI
 * ------------------------------------------------------------------ */

export function OfferCardView({
  o,
  lang,
  layout = "grid",
  saved,
  onToggleSave,
}: {
  o: OfferCardType;
  lang: Lang;
  layout?: "grid" | "list";
  saved?: boolean;
  onToggleSave?: (id: string, next: boolean) => void;
}) {
  const left = daysUntil(o.endsAt);
  const href = `/firsat/${o.slug}`;

  return (
    <article className={`card hover-lift group flex overflow-hidden p-0 ${layout === "list" ? "flex-col sm:flex-row" : "flex-col"}`}>
      <div className={`relative overflow-hidden ${layout === "list" ? "h-40 sm:h-auto sm:w-52" : "h-40"}`}>
        <img
          src={o.imageUrl ?? "/images/magaza-ic.jpg"}
          alt={`${o.merchant} — ${o.title}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.06]"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink/75 to-transparent" />
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {o.isSponsored ? (
            <span className="border-2 border-ink bg-surface px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-ink">
              Sponsorlu
            </span>
          ) : null}
          {o.isSample ? (
            <span className="border-2 border-warning bg-warning-soft px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-warning">
              Örnek içerik
            </span>
          ) : null}
        </div>
        <span className="absolute bottom-2 left-2.5 text-[0.72rem] font-semibold text-surface">{o.merchant}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-accent">{o.category}</p>
            <h3 className="mt-1 line-clamp-2 font-display text-[1.02rem] font-bold leading-snug">
              <Link href={href} className="hover:text-accent">{o.title}</Link>
            </h3>
          </div>
          {onToggleSave ? (
            <button
              onClick={() => onToggleSave(o.id, !saved)}
              aria-pressed={saved}
              aria-label={saved ? "Kayıtlardan çıkar" : "Kaydet"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 ${
                saved ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-ink-500"
              }`}
            >
              <IconSafe.bookmark size={14} />
            </button>
          ) : null}
        </div>

        <p className="mt-2 line-clamp-2 text-[0.84rem] leading-relaxed text-muted">{o.description}</p>

        <div className="mt-3 space-y-1.5 border-t-2 border-dashed border-line pt-3 text-[0.8rem]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">Fiyat</span>
            {o.priceVerified && o.priceCents != null ? (
              <span className="tabular font-bold text-ink">{money(o.priceCents, o.currency as Currency, lang)}</span>
            ) : (
              <span className="text-[0.78rem] text-muted-2">satıcı sitesinde</span>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">Geçerlilik</span>
            <span className="tabular font-semibold text-ink">
              {o.endsAt ? shortDate(o.endsAt, lang) : "—"}
              {left !== null && left >= 0 && left <= 5 ? <span className="ml-1.5 text-warning">· {left} gün</span> : null}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">Satıcı</span>
            <span className="truncate text-[0.78rem] font-medium text-ink">{o.country}</span>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-[0.72rem] leading-relaxed text-muted-2">{o.disclosure}</p>

        <div className="mt-4 flex items-center gap-2">
          <Button href={href} size="sm" variant="secondary" className="flex-1">
            Teklifi Gör
          </Button>
          {o.networkStatus && o.networkStatus !== "CONNECTED" ? (
            <Badge tone="warning">ağ bağlı değil</Badge>
          ) : (
            <Badge tone="positive">ağ bağlı</Badge>
          )}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * KEŞİF IZGARASI
 * ------------------------------------------------------------------ */

export default function OfferDiscovery({
  offers,
  categories,
  lang,
  currency,
  initialQuery = "",
  savedIds = [],
  userId,
}: {
  offers: OfferCardType[];
  categories: { category: string; n: number }[];
  lang: Lang;
  currency: Currency;
  initialQuery?: string;
  savedIds?: string[];
  userId?: string | null;
}) {
  const toast = useToast();
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState("");
  const [country, setCountry] = useState("");
  const [sort, setSort] = useState("recent");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [saved, setSaved] = useState<string[]>(savedIds);
  const [loading, setLoading] = useState(false);

  const countries = useMemo(() => Array.from(new Set(offers.map((o) => o.country))), [offers]);

  const results = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    let list = offers.filter((o) => {
      if (cat && o.category !== cat) return false;
      if (country && o.country !== country) return false;
      if (!needle) return true;
      return [o.title, o.merchant, o.description ?? "", o.category].join(" ").toLocaleLowerCase("tr-TR").includes(needle);
    });
    list = [...list].sort((a, b) => {
      if (sort === "discount") return Number(b.priceVerified) - Number(a.priceVerified);
      if (sort === "expiring") return (daysUntil(a.endsAt) ?? 9999) - (daysUntil(b.endsAt) ?? 9999);
      if (sort === "popular") return b.clicks - a.clicks;
      return Number(b.isSponsored) - Number(a.isSponsored) || String(b.lastUpdated ?? "").localeCompare(String(a.lastUpdated ?? ""));
    });
    return list;
  }, [offers, q, cat, country, sort]);

  async function toggleSave(id: string, next: boolean) {
    if (!userId) {
      toast.push({ title: "Giriş gerekli", desc: "Fırsatları kaydetmek için giriş yap.", tone: "warning" });
      return;
    }
    setSaved((p) => (next ? [...new Set([...p, id])] : p.filter((x) => x !== id)));
    setLoading(true);
    await fetch("/api/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: next ? "save" : "unsave", campaignId: id }),
    }).catch(() => undefined);
    setLoading(false);
    toast.push({ title: next ? "Kaydedildi" : "Kayıtlardan çıkarıldı", tone: next ? "positive" : "neutral" });
  }

  return (
    <div>
      <Card className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Fırsat ara</span>
            <IconSafe.search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Marka, ürün veya kategori ara — “kulaklık”, “moda”, “seyahat”…"
              className="h-11 w-full rounded-[3px] border-2 border-line bg-canvas pl-10 pr-3 text-[0.92rem] placeholder:text-muted-2 focus:border-accent focus:bg-surface focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sıralama"
                className="h-11 appearance-none rounded-[3px] border-2 border-line bg-surface pl-3.5 pr-9 text-[0.86rem] font-semibold text-ink-700 focus:border-accent focus:outline-none"
              >
                <option value="recent">En güncel</option>
                <option value="popular">En çok tıklanan</option>
                <option value="expiring">Yakında bitenler</option>
                <option value="discount">Fiyatı doğrulanmış</option>
              </select>
              <IconSafe.chevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            </div>
            <div className="flex overflow-hidden rounded-[3px] border-2 border-line">
              {(["grid", "list"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLayout(l)}
                  aria-pressed={layout === l}
                  aria-label={l === "grid" ? "Izgara görünümü" : "Liste görünümü"}
                  className={`flex h-11 w-11 items-center justify-center ${layout === l ? "bg-ink text-surface" : "bg-surface text-muted hover:text-ink"}`}
                >
                  {l === "grid" ? <IconSafe.grid size={16} /> : <IconSafe.list size={16} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t-2 border-dashed border-line pt-4">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            <Chip active={cat === ""} onClick={() => setCat("")}>Tümü</Chip>
            {categories.map((c) => (
              <Chip key={c.category} active={cat === c.category} onClick={() => setCat(c.category)} count={c.n}>
                {c.category}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[0.76rem] font-bold uppercase tracking-[0.12em] text-muted">
              <IconSafe.globe size={14} /> Ülke
            </span>
            <Chip active={country === ""} onClick={() => setCountry("")}>Tümü</Chip>
            {countries.map((c) => (
              <Chip key={c} active={country === c} onClick={() => setCountry(c)}>{c}</Chip>
            ))}
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.86rem] text-muted">
          <span className="tabular font-bold text-ink">{results.length}</span> online fırsat
          {loading ? <span className="ml-2 text-accent">· işleniyor…</span> : null}
        </p>
        {q || cat || country ? (
          <Button size="sm" variant="ghost" icon={<IconSafe.refresh size={14} />} onClick={() => { setQ(""); setCat(""); setCountry(""); setSort("recent"); }}>
            Filtreleri temizle
          </Button>
        ) : null}
      </div>

      <Notice tone="warning" icon={<IconSafe.alert size={16} />} className="mb-5">
        Aşağıdaki teklifler <strong>örnek/demo içeriktir</strong>; gerçek bir markanın aktif kampanyası değildir.
        Affiliate ağ bağlantısı kurulmadığı için komisyon verileri canlı rapordan gelmez. Alışveriş ve ödeme her
        zaman satıcının kendi sitesinde tamamlanır.
      </Notice>

      {results.length === 0 ? (
        <EmptyState
          icon={<IconSafe.search size={22} />}
          title="Filtrelere uyan online fırsat yok"
          desc="Arama terimini değiştir veya daha az filtre uygula."
          action={<Button variant="secondary" onClick={() => { setQ(""); setCat(""); setCountry(""); }}>Filtreleri temizle</Button>}
        />
      ) : (
        <div className={layout === "grid" ? "grid gap-5 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-4"}>
          {results.map((o, i) => (
            <div key={o.id} className="anim-rise" style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}>
              <OfferCardView o={o} lang={lang} layout={layout} saved={saved.includes(o.id)} onToggleSave={toggleSave} />
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-[0.78rem] text-muted-2">Para birimi: {currency} · Fiyatlar yalnızca doğrulanmışsa gösterilir, kur dönüşümü yapılmaz.</p>
    </div>
  );
}

export function OfferSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

export function RelativeTime({ at, lang }: { at: string | null; lang: Lang }) {
  return <span className="text-[0.76rem] text-muted-2">{at ? relative(at, lang) : "—"}</span>;
}

export { Card, Icon };
