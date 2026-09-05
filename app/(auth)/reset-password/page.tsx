'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  // "ready": /reset-password?code=... linkinden gelen kurtarma oturumu
  // kuruldu, yeni şifre formu gösterilebilir. @supabase/ssr'ın tarayıcı
  // istemcisi (createBrowserClient, detectSessionInUrl varsayılan true)
  // URL'deki code'u SAYFA YÜKLENİRKEN otomatik session'a çevirir — biz
  // sadece PASSWORD_RECOVERY event'ini (ve olası bir yarış durumuna karşı
  // mevcut session'ı) dinliyoruz.
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
        setChecking(false);
      }
    });
    // Event, listener bağlanmadan ÖNCE ateşlenmiş olabilir (Supabase'in
    // kendi dokümanlarında da belirtilen bilinen bir yarış durumu) — bu
    // yüzden mevcut session'ı da ayrıca kontrol ediyoruz.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (password !== password2) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push('/login');
      router.refresh();
    }, 2000);
  };

  if (checking) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center px-4">
        <p className="text-[#5E7090] font-mono text-sm">Yükleniyor…</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-3">
          <i className="fas fa-triangle-exclamation text-3xl text-amber-400" />
          <p className="text-white font-bold text-sm">Link geçersiz veya süresi dolmuş</p>
          <p className="text-[#5E7090] text-xs font-mono">
            Şifre sıfırlama linkleri güvenlik için sınırlı süre geçerlidir. Yeni bir link iste.
          </p>
          <Link href="/forgot-password" className="text-[#D4AF37] text-xs font-mono underline inline-block pt-2">
            Yeni link iste
          </Link>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-3">
          <i className="fas fa-circle-check text-3xl" style={{ color: '#10B981' }} />
          <p className="text-white font-bold text-sm">Şifren güncellendi</p>
          <p className="text-[#5E7090] text-xs font-mono">Girişe yönlendiriliyorsun…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-white font-black text-2xl">Yeni Şifre Belirle</h1>
        <input
          type="password"
          placeholder="Yeni şifre (en az 6 karakter)"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2.5 text-sm text-white"
        />
        <input
          type="password"
          placeholder="Yeni şifre (tekrar)"
          required
          minLength={6}
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          className="w-full bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2.5 text-sm text-white"
        />
        {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg py-2.5 text-sm font-extrabold"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? '…' : 'Şifreyi Güncelle'}
        </button>
      </form>
    </main>
  );
}
