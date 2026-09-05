'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import HeaderAuthStatus from './HeaderAuthStatus';
import NotificationBell from './NotificationBell';
import { heldRoles } from '@/lib/applications';

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();
  const [q, setQ] = useState('');

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
  };

  // Zaten hem bayi hem tedarikçi olanlara, ya da admin/lojistik gibi
  // başvuru akışıyla ilgisi olmayan rollere CTA gösterme.
  const showBecomeCta =
    !profile || (profile.role !== 'admin' && profile.role !== 'logistics' && heldRoles(profile).length < 2);

  return (
    <header className="border-b border-[#1E2A42] sticky top-0 z-30 bg-[#0A0E1A]/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
        <Link href="/" className="text-white font-black tracking-tight shrink-0">
          DAMPING<span style={{ color: '#D4AF37' }}>VAR</span>
        </Link>

        <Link
          href="/"
          className="shrink-0 hidden sm:inline-block px-4 py-1.5 rounded-full text-xs font-bold transition-colors"
          style={
            pathname === '/'
              ? { background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000' }
              : { background: 'transparent', color: '#A3B3D1' }
          }
        >
          Ana Sayfa
        </Link>

        {profile && (
          <Link
            href="/paylas-kazan"
            className="shrink-0 hidden md:inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-colors"
            style={
              pathname === '/paylas-kazan'
                ? { background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000' }
                : { background: 'transparent', color: '#A3B3D1' }
            }
          >
            <i className="fas fa-share-nodes" style={{ fontSize: 11 }} />
            Paylaş & Kazan
          </Link>
        )}

        <form onSubmit={submitSearch} className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <i className="fas fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5E7090] text-xs" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Mağaza ara…"
              className="w-full bg-[#131C2C] border border-[#2A3650] rounded-full pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-[#5E7090] focus:outline-none focus:border-[#D4AF37]/60"
            />
          </div>
        </form>

        <div className="flex-1 md:hidden" />

        {showBecomeCta && (
          <Link
            href="/apply"
            className="shrink-0 px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold"
            style={{ background: '#131C2C', border: '1px solid #D4AF37', color: '#D4AF37' }}
          >
            <span className="hidden sm:inline">Bayi/Tedarikçi Ol</span>
            <span className="sm:hidden">Satıcı Ol</span>
          </Link>
        )}

        <NotificationBell />
        <HeaderAuthStatus />
      </div>
    </header>
  );
}
