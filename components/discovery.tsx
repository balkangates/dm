"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Chip, EmptyState, Icon, IconButton, SkeletonCard, useToast } from "@/components/ds";
import { makeT } from "@/lib/i18n";
import { daysUntil, money, shortDate, type Currency, type Lang } from "@/lib/money";
import type { CampaignCard } from "@/lib/queries";

export function discountLabel(c: { type: string; discountPercent: number; discountAmountCents: number; currency: string }, lang: Lang) {
  if (c.type === "FIXED" || c.type === "PRODUCT") {
    return lang === "en" ? `${money(c.discountAmountCents, c.currency as Currency, lang)} off` : `${money(c.discountAmountCents, c.currency as Currency, lang)} indirim`;
  }
  return lang === "en" ? `-${c.discountPercent}%` : `%${c.discountPercent} İndirim`;
}

export function CampaignCardView({
  c,
  lang,
  saved,
  onToggleSave,
  layout = "grid",
  compact = false,
}: {
  c: CampaignCard;
  lang: Lang;
  saved?: boolean;
  onToggleSave?: (id: string, next: boolean) => void;
  layout?: "grid" | "list";
  compact?: boolean;
}) {
  const t = makeT(lang);
  const href = `/kampanya/${c.slug ?? c.code}`;
  const left = daysUntil(c.endsAt);
  const expiringSoon = left !== null && left >= 0 && left <= 5;
  const expired = left !== null && left < 0;
  const image = c.imageUrl ?? c.coverImage ?? "/images/magaza-ic.jpg";

  const body = (
    <>
      <div className={`relative overflow-hidden ${layout === "grid" ? "h-44" : "h-full min-h-[168px] w-full sm:w-56"}`}>
        <img
          src={image}
          alt={`${c.businessName} — ${c.title}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.05]"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink/70 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          <span className="rounded-[3px] bg-accent px-2.5 py-1.5 font-display text-[0.92rem] font-bold leading-none text-white shadow-sm">
            {discountLabel(c, lang)}
          </span>
          {c.isSponsored ? (
            <span className="rounded-full bg-surface/95 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {t("common.sponsored")}
            </span>
          ) : null}
        </div>
        {c.qrEnabled ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-1 text-[0.64rem] font-semibold text-white backdrop-blur-sm">
            <Icon.qr size={11} /> QR
          </span>
        ) : null}
        <div className="absolute inset-x-3 bottom-2.5 flex items-center gap-1.5 text-[0.74rem] font-medium text-white">
          <Icon.pin size={12} />
          <span className="truncate">
            {c.district}, {c.city}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/isletme/${c.businessSlug}`} className="text-[0.76rem] font-semibold text-accent hover:underline">
              {c.businessName}
            </Link>
            <h3 className="mt-1 truncate font-display text-[1.02rem] font-bold leading-snug text-ink">{c.title}</h3>
          </div>
          {onToggleSave ? (
            <IconButton
              label={saved ? t("common.saved") : t("common.save")}
              active={saved}
              onClick={() => onToggleSave(c.id, !saved)}
              className="shrink-0"
            >
              <Icon.bookmark size={15} />
            </IconButton>
          ) : null}
        </div>

        {!compact ? (
          <p className="mt-2 line-clamp-2 text-[0.84rem] leading-relaxed text-muted">{c.description}</p>
        ) : null}

        <dl className="mt-3.5 space-y-1.5 border-t border-line-soft pt-3 text-[0.78rem]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t("common.minBasket")}</dt>
            <dd className="tabular font-semibold text-ink">
              {c.minBasketCents > 0 ? money(c.minBasketCents, c.currency as Currency, lang) : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t("common.validUntil")}</dt>
            <dd className="tabular font-semibold text-ink">
              {c.endsAt ? shortDate(c.endsAt, lang) : "—"}
              {expiringSoon ? <span className="ml-1.5 text-warning">· {left} gün</span> : null}
              {expired ? <span className="ml-1.5 text-danger">· {t("common.expired")}</span> : null}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex items-center gap-2">
          <Button href={href} size="sm" className="flex-1">
            {t("common.viewTerms")}
          </Button>
          <span className="tabular hidden text-[0.7rem] text-muted-2 sm:inline">{c.code}</span>
        </div>
      </div>
    </>
  );

  return layout === "grid" ? (
    <article className="card group hover-lift flex flex-col overflow-hidden p-0">
      <Link href={href} className="flex h-full flex-col" aria-label={c.title}>
        {body}
      </Link>
    </article>
  ) : (
    <article className="card group hover-lift flex flex-col overflow-hidden p-0 sm:flex-row">
      <Link href={href} className="flex flex-1 flex-col sm:flex-row" aria-label={c.title}>
        {body}
      </Link>
    </article>
  );
}

/* ------------------------------------------------------------------ */

export type DiscoveryProps = {
  campaigns: CampaignCard[];
  districts: { district: string; city: string; n: number }[];
  categories: { category: string; n: number }[];
  lang: Lang;
  currency: Currency;
  initialQuery?: string;
  initialDistrict?: string;
  initialCategory?: string;
  savedIds?: string[];
  userId?: string | null;
};

const SORTS = [
  { key: "relevance", tr: "Öne çıkanlar", en: "Featured" },
  { key: "discount", tr: "En yüksek indirim", en: "Highest discount" },
  { key: "expiring", tr: "Yakında bitenler", en: "Ending soon" },
  { key: "recent", tr: "En yeniler", en: "Newest" },
];

export default function Discovery(props: DiscoveryProps) {
  const { campaigns, districts, categories, lang, initialQuery = "", savedIds = [], userId } = props;
  const t = makeT(lang);
  const toast = useToast();

  const [q, setQ] = useState(initialQuery);
  const [district, setDistrict] = useState(props.initialDistrict ?? "");
  const [category, setCategory] = useState(props.initialCategory ?? "");
  const [sort, setSort] = useState("relevance");
  const [onlyQr, setOnlyQr] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<string[]>(savedIds);

  const results = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase(lang === "tr" ? "tr-TR" : lang === "ka" ? "ka-GE" : "en-US");
    let list = campaigns.filter((c) => {
      if (district && c.district !== district) return false;
      if (category && c.category !== category) return false;
      if (onlyQr && !c.qrEnabled) return false;
      if (onlyOpen) {
        const left = daysUntil(c.endsAt);
        if (left === null || left < 0) return false;
      }
      if (!needle) return true;
      return [c.title, c.businessName, c.district, c.city, c.category, c.description ?? "", c.code]
        .join(" ")
        .toLocaleLowerCase(lang === "tr" ? "tr-TR" : "en-US")
        .includes(needle);
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "discount":
          return b.discountPercent - a.discountPercent;
        case "expiring": {
          const da = daysUntil(a.endsAt) ?? 9999;
          const db = daysUntil(b.endsAt) ?? 9999;
          return da - db;
        }
        case "recent":
          return (b.startsAt ?? "").localeCompare(a.startsAt ?? "");
        default:
          return Number(b.isSponsored) - Number(a.isSponsored) || b.rating - a.rating;
      }
    });
    return list;
  }, [campaigns, q, district, category, onlyQr, onlyOpen, sort, lang]);

  async function toggleSave(id: string, next: boolean) {
    if (!userId) {
      toast.push({ title: "Giriş gerekli", desc: "Kampanyaları kaydetmek için hesabınıza giriş yapın.", tone: "warning" });
      return;
    }
    setSaved((prev) => (next ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
    setLoading(true);
    await fetch("/api/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: next ? "save" : "unsave", campaignId: id }),
    });
    setLoading(false);
    toast.push({
      title: next ? t("common.saved") : "Kayıtlardan çıkarıldı",
      tone: next ? "positive" : "neutral",
    });
  }

  function reset() {
    setQ("");
    setDistrict("");
    setCategory("");
    setOnlyQr(false);
    setOnlyOpen(false);
    setSort("relevance");
  }

  return (
    <div>
      {/* arama + görünüm */}
      <div className="card mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">{t("common.search")}</span>
            <Icon.search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("hero.search")}
              className="h-11 w-full rounded-[3px] border border-line bg-canvas pl-10 pr-3 text-[0.92rem] text-ink placeholder:text-muted-2 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/15"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sıralama"
                className="h-11 appearance-none rounded-[3px] border border-line bg-surface pl-3.5 pr-9 text-[0.86rem] font-medium text-ink-700 focus:border-accent focus:outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {lang === "en" ? s.en : s.tr}
                  </option>
                ))}
              </select>
              <Icon.chevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            </div>

            <div className="flex overflow-hidden rounded-[3px] border border-line">
              <button
                onClick={() => setLayout("grid")}
                aria-label={t("common.grid")}
                aria-pressed={layout === "grid"}
                className={`flex h-11 w-11 items-center justify-center ${layout === "grid" ? "bg-ink text-white" : "bg-surface text-muted hover:text-ink"}`}
              >
                <Icon.grid size={16} />
              </button>
              <button
                onClick={() => setLayout("list")}
                aria-label={t("common.list")}
                aria-pressed={layout === "list"}
                className={`flex h-11 w-11 items-center justify-center border-l border-line ${layout === "list" ? "bg-ink text-white" : "bg-surface text-muted hover:text-ink"}`}
              >
                <Icon.list size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* kategori + konum chip'leri */}
        <div className="mt-4 flex flex-col gap-3 border-t border-line-soft pt-4">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Chip active={category === ""} onClick={() => setCategory("")}>
              {t("common.all")}
            </Chip>
            {categories.map((c) => (
              <Chip key={c.category} active={category === c.category} onClick={() => setCategory(c.category)} count={c.n}>
                {c.category.toLocaleUpperCase(lang === "tr" ? "tr-TR" : "en-US")}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[0.78rem] font-semibold text-muted">
              <Icon.pin size={14} /> {t("common.location")}
            </span>
            <Chip active={district === ""} onClick={() => setDistrict("")}>
              {t("common.all")}
            </Chip>
            {districts.map((d) => (
              <Chip key={d.district} active={district === d.district} onClick={() => setDistrict(d.district)} count={d.n}>
                {d.district}
              </Chip>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
            <Chip active={onlyQr} onClick={() => setOnlyQr((v) => !v)} icon={<Icon.qr size={13} />}>
              QR kampanyaları
            </Chip>
            <Chip active={onlyOpen} onClick={() => setOnlyOpen((v) => !v)} icon={<Icon.clock size={13} />}>
              {t("common.today")}
            </Chip>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.86rem] text-muted">
          <span className="tabular font-semibold text-ink">{results.length}</span> {t("common.results")}
          {q ? <span className="text-muted-2"> · “{q}”</span> : null}
          {loading ? <span className="ml-2 text-accent">· {t("common.loading")}…</span> : null}
        </p>
        {(q || district || category || onlyQr || onlyOpen) && (
          <Button size="sm" variant="ghost" onClick={reset} icon={<Icon.refresh size={14} />}>
            {t("common.clearFilters")}
          </Button>
        )}
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={<Icon.search size={22} />}
          title={t("common.noResults")}
          desc="Arama terimini değiştirmeyi veya daha az filtre uygulamayı deneyin. Kampanyalar işletmeler tarafından sürekli güncellenir."
          action={
            <Button variant="secondary" onClick={reset}>
              {t("common.clearFilters")}
            </Button>
          }
        />
      ) : (
        <div className={layout === "grid" ? "grid gap-5 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-4"}>
          {results.map((c, i) => (
            <div key={c.id} className="anim-rise" style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}>
              <CampaignCardView
                c={c}
                lang={lang}
                layout={layout}
                saved={saved.includes(c.id)}
                onToggleSave={toggleSave}
              />
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-[0.78rem] leading-relaxed text-muted">
        <Icon.info size={14} className="mt-0.5 shrink-0" />
        Kampanyalar örnek/demo içerik olarak işaretlenmiştir. İndirim, koşullar sağlandığında işletme tarafından
        kasada uygulanır; DampingVar ödeme almaz veya indirim tutarını finanse etmez.
      </p>
    </div>
  );
}

export function DiscoverySkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SponsoredStrip({ items, lang }: { items: CampaignCard[]; lang: Lang }) {
  if (!items.length) return null;
  return (
    <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {items.map((c) => (
        <Link
          key={c.id}
          href={`/kampanya/${c.slug ?? c.code}`}
          className="card hover-lift group flex w-[300px] shrink-0 items-center gap-3 p-3"
        >
          <img src={c.imageUrl ?? c.coverImage ?? "/images/magaza-ic.jpg"} alt="" className="h-16 w-16 rounded-[3px] object-cover" />
          <div className="min-w-0 flex-1">
            <Badge tone="neutral" className="mb-1">
              {lang === "en" ? "Sponsored" : "Sponsorlu"}
            </Badge>
            <p className="truncate text-[0.88rem] font-semibold text-ink">{c.title}</p>
            <p className="truncate text-[0.76rem] text-muted">
              {c.businessName} · {c.district}
            </p>
          </div>
          <span className="tabular shrink-0 rounded-[3px] bg-accent-soft px-2 py-1 text-[0.82rem] font-bold text-accent-700">
            {discountLabel(c, lang)}
          </span>
        </Link>
      ))}
    </div>
  );
}
