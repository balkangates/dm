"use client";

/**
 * Anasayfa › Yerel işletmeler.
 * Konum açıksa (tarayıcı izni) işletmeler konuma göre mesafeye sıralanır; hero arama formundaki
 * metin / ilçe / kategori filtresi bu listeye uygulanır. Konum kapalıysa popüler işletmeler gösterilir.
 * Her kartta "Sipariş ver" → sayfadan çıkmadan sipariş popup'ı (sesli asistan + görsel modül).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@/components/ds";
import { Icon } from "@/components/icons";
import { OrderButton } from "@/components/BusinessOrder";
import { clearGeo, distanceKm, formatKm, requestGeo, useGeo } from "@/lib/geo";

export type NearbyBiz = {
  id: string; slug: string; name: string; coverImage: string | null; category: string; subCategory: string | null;
  district: string; city: string; rating: number; verified: boolean; planCode: string; lat: number | null; lng: number | null;
  description: string | null;
};

const PAGE = 6;
const norm = (s: string) => s.toLocaleLowerCase("tr-TR");

export default function NearbyBusinesses({ businesses, fallbackCover }: { businesses: NearbyBiz[]; fallbackCover: string }) {
  const geo = useGeo();
  const [shown, setShown] = useState(PAGE);
  const active = geo.status === "granted" && geo.pos !== null;

  const { list, withCoords, filtered } = useMemo(() => {
    const { q, district, category } = geo.search;
    const nq = norm(q.trim());
    const matches = (b: NearbyBiz) =>
      (!nq || norm(`${b.name} ${b.category} ${b.subCategory ?? ""} ${b.district} ${b.description ?? ""}`).includes(nq)) &&
      (!district || b.district === district) &&
      (!category || norm(b.category) === norm(category) || norm(b.subCategory ?? "") === norm(category));
    const hasFilter = Boolean(nq || district || category);
    const pool = active ? businesses.filter(matches) : hasFilter ? businesses.filter(matches) : businesses;
    const coords = businesses.filter((b) => b.lat != null && b.lng != null).length;
    if (!active) return { list: pool.map((b) => ({ b, km: null as number | null })), withCoords: coords, filtered: hasFilter };
    const pos = geo.pos!;
    const ranked = pool
      .filter((b) => b.lat != null && b.lng != null)
      .map((b) => ({ b, km: distanceKm(pos, { lat: b.lat as number, lng: b.lng as number }) }))
      .sort((x, y) => x.km - y.km);
    return { list: ranked, withCoords: coords, filtered: hasFilter };
  }, [businesses, geo.pos, geo.search, active]);

  const noCoords = active && withCoords === 0;
  const rows = noCoords ? businesses.map((b) => ({ b, km: null as number | null })) : list;
  const visible = rows.slice(0, shown);

  return (
    <section id="yerel-isletmeler" className="mx-auto mt-16 max-w-[1280px] scroll-mt-28 px-4 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[60ch]">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-accent">Yerel işletmeler</p>
          <h2 className="mt-1.5 font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[2rem]">
            {active && !noCoords ? "Sana en yakın işletmeler" : "Popüler mağaza ve markalar"}
          </h2>
          <p className="mt-2 text-[0.92rem] leading-relaxed text-muted">
            {active && !noCoords
              ? "Konumuna göre mesafeye sıralandı. Kartlardaki “Sipariş ver” ile sesli asistan ve görsel menüyle hemen sipariş verebilirsin."
              : "Doğrulanmış işletme profilleri, çalışma saatleri ve aktif kampanyaları. Konumunu açarsan en yakınlar öne çıkar."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {geo.status === "granted" ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-positive/40 bg-positive/10 px-3 py-1.5 text-[0.78rem] font-semibold text-positive">
                <Icon.pin size={13} /> Konum açık
              </span>
              <Button size="sm" variant="ghost" onClick={clearGeo}>Konumu kapat</Button>
            </>
          ) : geo.status === "asking" ? (
            <span className="text-[0.84rem] text-muted" aria-live="polite">Konum alınıyor…</span>
          ) : geo.status === "unsupported" ? null : (
            <Button size="sm" onClick={requestGeo} icon={<Icon.pin size={14} />}>Konumumu kullan</Button>
          )}
        </div>
      </div>

      {geo.status === "denied" ? (
        <p className="mb-4 rounded-[4px] border-2 border-line bg-surface px-3.5 py-2.5 text-[0.84rem] text-muted">
          Konum izni verilmedi. Tarayıcı adres çubuğundaki konum simgesinden izni açıp tekrar deneyebilirsin; o zamana kadar popüler işletmeler gösterilir.
        </p>
      ) : null}
      {noCoords ? (
        <p className="mb-4 rounded-[4px] border-2 border-line bg-surface px-3.5 py-2.5 text-[0.84rem] text-muted">
          İşletmelerin konum koordinatları henüz kayıtlı değil; mesafe hesaplanamadı, popüler işletmeler gösteriliyor.
        </p>
      ) : null}
      {(filtered || active) && (geo.search.q || geo.search.district || geo.search.category) ? (
        <p className="mb-4 text-[0.84rem] text-muted">
          Filtre: {[geo.search.q && `“${geo.search.q}”`, geo.search.district, geo.search.category].filter(Boolean).join(" · ")} — {rows.length} işletme
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-[4px] border-2 border-line bg-surface p-6 text-center">
          <p className="font-display text-[1.05rem] font-bold">Bu filtreyle eşleşen işletme bulunamadı</p>
          <p className="mt-1 text-[0.88rem] text-muted">Arama metnini veya kategoriyi değiştirmeyi dene.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ b, km }) => (
            <div key={b.id} className="card hover-lift flex flex-col p-4">
              <Link href={`/isletme/${b.slug}`} className="group flex gap-4">
                <img src={b.coverImage ?? fallbackCover} alt="" className="h-20 w-20 shrink-0 rounded-[3px] object-cover" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-display text-[1rem] font-bold group-hover:text-accent">{b.name}</p>
                    {b.verified ? <Icon.verified size={14} className="shrink-0 text-positive" /> : null}
                  </div>
                  <p className="mt-0.5 truncate text-[0.8rem] text-muted">{b.subCategory ?? b.category} · {b.district}, {b.city}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">★ {b.rating.toFixed(1)}</Badge>
                    {km != null ? <Badge tone="positive">{formatKm(km)}</Badge> : null}
                    <Badge tone="accent">{b.planCode}</Badge>
                  </div>
                </div>
              </Link>
              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2 border-t border-line-soft pt-3">
                <OrderButton slug={b.slug} name={b.name} className="w-full" />
                <Link href={`/isletme/${b.slug}`}><Button size="sm" variant="ghost">Profil</Button></Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > shown ? (
        <div className="mt-6 text-center">
          <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>Daha fazla göster ({rows.length - shown})</Button>
        </div>
      ) : null}
    </section>
  );
}
