'use client';
// app/admin/page.tsx — "Genel Bakış" sayfası.
//
// ÖNCEDEN bu sayfa kendi içinde 4 sekme (Katalog Onayı, Komisyon Oranları,
// Ürün Önerileri, Bayi Kazançları) barındırıyordu ve bunları lib/catalog-admin.ts
// üzerinden çekiyordu — bu arada app/admin/layout.tsx'teki nav menüsü aynı
// işi ayrı sayfalarda (app/admin/catalog, app/admin/suggestions,
// app/admin/finance) lib/admin.ts üzerinden AYRI bir kod yoluyla yapıyordu.
// İki paralel implementasyon vardı; biri güncellenip diğeri unutulma riski
// taşıyordu (ör. finance sayfasındaki dealer_earnings.payment_method
// değerleri DB'deki CHECK kısıtıyla uyuşmuyordu — bu artık düzeltildi,
// bkz. lib/admin.ts).
//
// Artık bu sayfa SADECE özet/istatistik kartları gösterir ve her karttan
// ilgili tek-kaynak sayfaya link verir. Gerçek iş mantığı yalnızca
// lib/admin.ts + app/admin/{catalog,suggestions,finance,auctions}/page.tsx
// içinde yaşıyor.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { loadAdminOverviewStats, fmtMoney } from '@/lib/admin';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };

type OverviewStats = {
  pendingCatalogCount: number;
  pendingSuggestionsCount: number;
  currentMonthCommission: number;
};

const CARDS: {
  key: keyof OverviewStats;
  label: string;
  href: string;
  icon: string;
  color: string;
  format: (stats: OverviewStats) => string;
  linkLabel: string;
}[] = [
  {
    key: 'pendingCatalogCount',
    label: 'Bekleyen Katalog Onayı',
    href: '/admin/catalog',
    icon: 'fa-clipboard-check',
    color: '#D4AF37',
    format: (s) => String(s.pendingCatalogCount),
    linkLabel: 'Katalog Onayına Git',
  },
  {
    key: 'pendingSuggestionsCount',
    label: 'Bekleyen Bayi Önerisi',
    href: '/admin/suggestions',
    icon: 'fa-lightbulb',
    color: '#38BDF8',
    format: (s) => String(s.pendingSuggestionsCount),
    linkLabel: 'Önerilere Git',
  },
  {
    key: 'currentMonthCommission',
    label: 'Bu Ayki Toplam Bayi Hakedişi',
    href: '/admin/finance',
    icon: 'fa-sack-dollar',
    color: '#10B981',
    format: (s) => fmtMoney(s.currentMonthCommission),
    linkLabel: 'Muhasebeye Git',
  },
];

export default function AdminOverviewPage() {
  const { profile, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAdminOverviewStats()
      .then(setStats)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (authLoading) return <main className="max-w-5xl mx-auto px-4 py-8 text-[#5E7090] font-mono text-sm">Yükleniyor…</main>;
  if (profile && profile.role !== 'admin') {
    return <main className="max-w-5xl mx-auto px-4 py-8 text-red-400 font-mono text-sm">Bu sayfaya erişim yetkiniz yok.</main>;
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-5">
      <div>
        <p className="text-white font-black text-xl">Genel Bakış</p>
        <p className="text-[#5E7090] text-xs font-mono mt-1">
          Tedarik, katalog ve muhasebe süreçlerinin özeti. Detaylar için
          kartlardaki linkleri kullanın.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-8 text-[#5E7090]"><i className="fas fa-spinner fa-spin" /></div>
      ) : error ? (
        <p className="text-red-400 text-xs font-mono">Özet yüklenemedi: {error}</p>
      ) : stats ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CARDS.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              className="rounded-xl p-4 flex flex-col gap-2 transition hover:brightness-110"
              style={CARD}
            >
              <div className="flex items-center justify-between">
                <span className="text-[#5E7090] text-xs font-mono">{c.label}</span>
                <i className={`fas ${c.icon}`} style={{ color: c.color }} />
              </div>
              <p className="font-black text-2xl" style={{ color: c.color }}>{c.format(stats)}</p>
              <span className="text-[#5E7090] text-[11px] font-mono mt-auto">
                {c.linkLabel} <i className="fas fa-arrow-right ml-1" />
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl p-4 flex flex-wrap gap-2" style={CARD}>
        <Link href="/admin/auctions" className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: '#090d16', color: '#5E7090', border: '1px solid #2A3650' }}>
          <i className="fas fa-gavel mr-1" /> İhale Onayı
        </Link>
      </div>
    </main>
  );
}
