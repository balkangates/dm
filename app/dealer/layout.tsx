'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

const NAV = [
  { href: '/dealer/live', label: 'Canlı Satış', icon: 'fa-video' },
  { href: '/dealer/catalog', label: 'Ürün Seçimi', icon: 'fa-list' },
  { href: '/dealer/orders', label: 'Siparişler', icon: 'fa-shopping-bag' },
  { href: '/dealer/performance', label: 'Performansım', icon: 'fa-chart-line' },
  { href: '/dealer/referral', label: 'Müşteri Kazanımım', icon: 'fa-user-plus' },
  { href: '/dealer/messages', label: 'Mesajlar', icon: 'fa-inbox' },
];

export default function DealerLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const pathname = usePathname();

  // middleware.ts zaten sunucu tarafında rol kontrolü yapıyor — bu sadece
  // client-side ekstra bir güvenlik/kullanıcı deneyimi katmanı (rol bilgisi
  // henüz yüklenmeden sayfa flaşlamasın diye).
  if (loading) return <div className="max-w-6xl mx-auto px-4 py-8 text-[#5E7090] font-mono text-sm">Yükleniyor…</div>;
  const canAccess = profile && (profile.role === 'admin' || profile.role === 'dealer' || profile.is_dealer);
  if (profile && !canAccess) {
    return <div className="max-w-6xl mx-auto px-4 py-8 text-red-400 font-mono text-sm">Bu sayfaya erişim yetkiniz yok.</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <nav className="flex items-center gap-2 mb-6 border-b border-[#1E2A42] pb-3 flex-wrap">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
            style={{
              background: pathname === n.href ? '#D4AF37' : 'transparent',
              color: pathname === n.href ? '#000' : '#5E7090',
            }}
          >
            <i className={`fas ${n.icon}`} /> {n.label}
          </Link>
        ))}
        {/* Faz 9: çift rol desteği — bu bayi ayrıca tedarikçi olarak da
            onaylanmışsa (is_supplier=true) tedarikçi paneline geçiş
            butonu görünür. */}
        {profile?.is_supplier && (
          <Link
            href="/supplier"
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
            style={{ background: '#131C2C', border: '1px solid #D4AF37', color: '#D4AF37' }}
          >
            <i className="fas fa-right-left" /> Tedarikçi Paneline Geç
          </Link>
        )}
      </nav>
      {children}
    </div>
  );
}
