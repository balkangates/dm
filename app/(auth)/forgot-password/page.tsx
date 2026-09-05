'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase, SITE_URL } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${SITE_URL}/reset-password`,
    });
    setBusy(false);
    if (error) {
      // Not: Supabase burada genelde "kayıtlı e-posta yok" dese bile hata
      // döndürmez (enumeration'ı önlemek için) — gerçek bir hata (rate
      // limit, network vb.) olduğunda gösteriyoruz.
      setError(error.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-3">
          <i className="fas fa-envelope-circle-check text-3xl" style={{ color: '#10B981' }} />
          <p className="text-white font-bold text-sm">E-posta gönderildi</p>
          <p className="text-[#5E7090] text-xs font-mono">
            <span className="text-white">{email}</span> adresine bir şifre sıfırlama linki gönderdik
            (kayıtlıysa). Gelen kutunu (ve spam klasörünü) kontrol et.
          </p>
          <Link href="/login" className="text-[#D4AF37] text-xs font-mono underline inline-block pt-2">
            Girişe dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-white font-black text-2xl">Şifremi Unuttum</h1>
          <p className="text-[#5E7090] text-xs font-mono mt-1">
            E-postanı gir, sana bir sıfırlama linki gönderelim.
          </p>
        </div>
        <input
          type="email"
          placeholder="E-posta"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2.5 text-sm text-white"
        />
        {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg py-2.5 text-sm font-extrabold"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? '…' : 'Sıfırlama Linki Gönder'}
        </button>
        <p className="text-[#5E7090] text-xs font-mono text-center">
          <Link href="/login" className="text-[#D4AF37]">
            Girişe dön
          </Link>
        </p>
      </form>
    </main>
  );
}
