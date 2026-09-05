import Link from 'next/link';

// NOT: "Yardım Al" sütunundaki Sipariş Durumu / Kargo / İade / Ödeme / İletişim
// maddelerinin henüz kendi sayfaları yok (bu proje kapsamında değildi) —
// şimdilik # ile inert bırakıldı. Gerçek sayfalar eklenince buradan bağlanmalı.
const HELP_LINKS = ['Sipariş Durumu', 'Kargo ve Teslimat', 'İadeler', 'Ödeme Seçenekleri', 'İletişim'];

const SOCIALS = [
  { icon: 'fa-brands fa-facebook' },
  { icon: 'fa-brands fa-x-twitter' },
  { icon: 'fa-brands fa-instagram' },
  { icon: 'fa-brands fa-linkedin' },
  { icon: 'fa-brands fa-tiktok' },
];

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-[#1E2A42] bg-black">
      <div className="max-w-6xl mx-auto px-4 py-10 grid sm:grid-cols-3 gap-8">
        <div>
          <Link href="/" className="text-white font-black tracking-tight">
            DAMPING<span style={{ color: '#D4AF37' }}>VAR</span>
          </Link>
          <p className="text-[#5E7090] text-xs font-mono mt-2 max-w-xs">
            Sektör bazlı, canlı yayınla satış yapan tedarikçi–bayi–müşteri pazaryeri.
          </p>
        </div>

        <div>
          <p className="text-white font-bold text-xs mb-3 uppercase tracking-wide">DampingVar&apos;da Satıcı Ol</p>
          <ul className="space-y-2 text-xs font-mono">
            <li>
              <Link href="/apply" className="text-[#A3B3D1] hover:text-[#D4AF37]">
                Tedarikçi Ol
              </Link>
            </li>
            <li>
              <Link href="/apply" className="text-[#A3B3D1] hover:text-[#D4AF37]">
                Bayi Ol
              </Link>
            </li>
            <li>
              <Link href="/register" className="text-[#A3B3D1] hover:text-[#D4AF37]">
                Müşteri Ol
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-white font-bold text-xs mb-3 uppercase tracking-wide">Yardım Al</p>
          <ul className="space-y-2 text-xs font-mono">
            {HELP_LINKS.map((label) => (
              <li key={label}>
                <span className="text-[#5E7090] cursor-not-allowed" title="Yakında">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-6 flex items-center justify-between flex-wrap gap-3">
        <p className="text-[#5E7090] text-xs font-mono">© 2026 DampingVar</p>
        <div className="flex items-center gap-4">
          {SOCIALS.map((s) => (
            <span key={s.icon} className="text-[#5E7090] text-sm" title="Yakında">
              <i className={s.icon} />
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
