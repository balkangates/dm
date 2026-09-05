'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadSectors, loadStoreCards, type Sector, type StoreCard } from '@/lib/stores';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };

// ── Küçük yardımcılar ────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

function fmtCount(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'B';
  return String(n);
}

// sectors.icon veritabanında Lucide ikon adlarıyla dolu ('home', 'sparkles'…)
// — bu proje yalnızca Font Awesome yüklüyor (bkz. app/layout.tsx), lucide-react
// bağımlılığı yok. Bilinmeyen bir isim gelirse fa-shop'a düşer, hiç ikon
// göstermemektense.
const SECTOR_ICON_MAP: Record<string, string> = {
  home: 'house',
  leaf: 'leaf',
  sparkles: 'wand-magic-sparkles',
  shirt: 'shirt',
  gem: 'gem',
  smartphone: 'mobile-screen',
  'heart-pulse': 'heart-pulse',
};
function sectorIconClass(icon: string) {
  return `fas fa-${SECTOR_ICON_MAP[icon] ?? 'shop'}`;
}

// ── Ok butonlu yatay kaydırma şeridi (Whatnot'taki kategori listesi gibi) ──

function ScrollRail({ children }: { children: React.ReactNode }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = () => {
    const el = railRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    railRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });
  };

  return (
    <div className="relative group">
      {canLeft && (
        <button
          onClick={() => scrollBy(-1)}
          aria-label="Sola kaydır"
          className="hidden sm:flex absolute -left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full items-center justify-center shadow-lg"
          style={{ background: '#131C2C', border: '1px solid #2A3650', color: '#A3B3D1' }}
        >
          <i className="fas fa-chevron-left text-[10px]" />
        </button>
      )}
      <div
        ref={railRef}
        onScroll={updateArrows}
        className="flex gap-2 overflow-x-auto no-scrollbar pb-1 scroll-smooth"
      >
        {children}
      </div>
      {canRight && (
        <button
          onClick={() => scrollBy(1)}
          aria-label="Sağa kaydır"
          className="hidden sm:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full items-center justify-center shadow-lg"
          style={{ background: '#131C2C', border: '1px solid #2A3650', color: '#A3B3D1' }}
        >
          <i className="fas fa-chevron-right text-[10px]" />
        </button>
      )}
    </div>
  );
}

// ── Mağaza avatarı: logo varsa görsel, yoksa isim baş harfleri ──────────

function StoreAvatar({ store, size }: { store: StoreCard; size: number }) {
  if (store.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={store.logo_url}
        alt={store.name}
        width={size}
        height={size}
        className="rounded-2xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-2xl flex items-center justify-center font-black text-white shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size / 2.6,
        background: 'linear-gradient(135deg,#2A3650,#131C2C)',
        border: '1px solid #2A3650',
      }}
    >
      {initials(store.name)}
    </div>
  );
}

// ── Canlı rozeti (izleyici sayısıyla) ────────────────────────────────────

function LiveBadge({ viewerCount, compact }: { viewerCount: number; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex items-center gap-1 rounded-full font-black text-white"
        style={{ background: '#EF4444', padding: compact ? '2px 7px' : '3px 9px', fontSize: compact ? 9 : 10 }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        CANLI
      </span>
      {viewerCount > 0 && (
        <span
          className="flex items-center gap-1 rounded-full font-bold font-mono text-white"
          style={{ background: 'rgba(0,0,0,0.55)', padding: compact ? '2px 7px' : '3px 9px', fontSize: compact ? 9 : 10 }}
        >
          <i className="fas fa-eye" style={{ fontSize: compact ? 8 : 9 }} />
          {fmtCount(viewerCount)}
        </span>
      )}
    </div>
  );
}

// ── Öne çıkan "Şu An Canlı" kartı — büyük, thumbnail ağırlıklı ──────────

function LiveStoreCard({ store, onOpen }: { store: StoreCard; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="text-left shrink-0 w-[180px] rounded-2xl overflow-hidden relative"
      style={{ ...CARD, borderColor: '#EF4444' }}
    >
      <div
        className="h-[180px] flex items-center justify-center relative"
        style={{
          background: store.logo_url
            ? `center/cover no-repeat url(${store.logo_url})`
            : 'linear-gradient(135deg,#2A3650,#0A0E1A)',
        }}
      >
        {!store.logo_url && (
          <span className="text-white font-black text-3xl opacity-40">{initials(store.name)}</span>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,transparent 50%,rgba(0,0,0,0.75) 100%)' }} />
        <div className="absolute top-2 left-2">
          <LiveBadge viewerCount={store.live_viewer_count} compact />
        </div>
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-white font-extrabold text-xs leading-tight truncate">{store.name}</p>
          {store.district && <p className="text-white/70 text-[10px] font-mono truncate">{store.district}</p>}
        </div>
      </div>
    </button>
  );
}

// ── Standart mağaza kartı — grid içinde ──────────────────────────────────

function StoreGridCard({
  store,
  sectorsById,
  onOpen,
}: {
  store: StoreCard;
  sectorsById: Map<string, Sector>;
  onOpen: () => void;
}) {
  const tags = store.sector_ids.map((id) => sectorsById.get(id)).filter(Boolean) as Sector[];
  return (
    <button onClick={onOpen} className="text-left rounded-2xl p-3 hover:border-[#D4AF37]/60 transition-colors" style={CARD}>
      <div className="flex items-start gap-3">
        <StoreAvatar store={store} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <p className="text-white font-extrabold text-sm truncate">{store.name}</p>
          </div>
          {store.is_live ? (
            <LiveBadge viewerCount={store.live_viewer_count} compact />
          ) : (
            <p className="text-[#5E7090] text-[11px] font-mono truncate">
              {store.district ?? store.city ?? store.address ?? '—'}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-[#5E7090]">
            <span>
              <i className="fas fa-user-group mr-1" style={{ color: '#D4AF37' }} />
              {fmtCount(store.follower_count)}
            </span>
            {store.distance_km != null && (
              <span>
                <i className="fas fa-location-dot mr-1" />
                {store.distance_km.toFixed(1)} km
              </span>
            )}
          </div>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex gap-1.5 mt-2.5 overflow-hidden">
          {tags.slice(0, 3).map((t) => (
            <span
              key={t.id}
              className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: `${t.color}22`, color: t.color2, border: `1px solid ${t.color}55` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ── Ana sayfa ─────────────────────────────────────────────────────────────

export default function StoreSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [stores, setStores] = useState<StoreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [activeSector, setActiveSector] = useState<string | null>(null);
  const [liveOnly, setLiveOnly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [sec, st] = await Promise.all([loadSectors(), loadStoreCards()]);
        setSectors(sec);
        setStores(st);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sectorsById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);

  const liveStores = useMemo(() => stores.filter((s) => s.is_live), [stores]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores.filter((s) => {
      if (liveOnly && !s.is_live) return false;
      if (activeSector && !s.sector_ids.includes(activeSector)) return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.district ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stores, query, activeSector, liveOnly]);

  const openStore = (id: string) => router.push(`/store/${id}`);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-11 rounded-xl" style={{ background: '#131C2C' }} />
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-24 rounded-full shrink-0" style={{ background: '#131C2C' }} />
          ))}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-2xl" style={{ background: '#131C2C' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Arama */}
      <div className="relative">
        <i className="fas fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#5E7090] text-sm" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Mağaza veya semt ara…"
          className="w-full bg-[#131C2C] border border-[#2A3650] rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-[#5E7090] focus:outline-none focus:border-[#D4AF37]/60"
        />
      </div>

      {error && <p className="text-[11px] text-amber-400 font-mono">{error}</p>}

      {/* Sektör şeridi */}
      <ScrollRail>
        <button
          onClick={() => setActiveSector(null)}
          className="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-colors"
          style={
            activeSector === null
              ? { background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000' }
              : { background: '#131C2C', color: '#A3B3D1', border: '1px solid #2A3650' }
          }
        >
          Tümü
        </button>
        {sectors.map((s) => {
          const active = activeSector === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSector(active ? null : s.id)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors"
              style={
                active
                  ? { background: `linear-gradient(135deg,${s.color},${s.color2})`, color: '#000' }
                  : { background: `${s.color}18`, color: s.color2, border: `1px solid ${s.color}40` }
              }
            >
              <i className={sectorIconClass(s.icon)} />
              {s.label}
            </button>
          );
        })}
        <button
          onClick={() => setLiveOnly((v) => !v)}
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors"
          style={
            liveOnly
              ? { background: '#EF4444', color: '#fff' }
              : { background: '#131C2C', color: '#A3B3D1', border: '1px solid #2A3650' }
          }
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Sadece Canlı
        </button>
      </ScrollRail>

      {/* Şu an canlı şeridi — filtre uygulanmamış tam liste, her zaman görünür */}
      {!liveOnly && !activeSector && !query && liveStores.length > 0 && (
        <div>
          <p className="text-white font-black text-sm mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Şu An Canlı
          </p>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {liveStores.map((s) => (
              <LiveStoreCard key={s.id} store={s} onOpen={() => openStore(s.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Tüm mağazalar grid */}
      <div>
        <p className="text-white font-black text-sm mb-2">
          {activeSector || query || liveOnly ? `${filtered.length} Mağaza` : 'Tüm Mağazalar'}
        </p>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-store-slash text-2xl text-[#2A3650] mb-2" />
            <p className="text-[#5E7090] text-sm font-mono">Bu kriterlere uyan mağaza bulunamadı.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <StoreGridCard key={s.id} store={s} sectorsById={sectorsById} onOpen={() => openStore(s.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
