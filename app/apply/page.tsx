'use client';
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import {
  submitRoleApplication,
  checkApplicationDuplicate,
  submitPublicRoleApplication,
  heldRoles,
  ROLE_LABEL,
  type RequestedRole,
} from '@/lib/applications';
import { isValidTcKimlikNo, normalizeTrPhone, isValidTaxNumber } from '@/lib/validators';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };
const INPUT = 'w-full bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2.5 text-sm text-white';

// ── Rol seçimi (her iki akışta da ortak) ─────────────────────────────────

function RoleToggle({
  value,
  onChange,
  excludeRoles = [],
}: {
  value: RequestedRole;
  onChange: (r: RequestedRole) => void;
  excludeRoles?: RequestedRole[];
}) {
  const options = (['dealer', 'supplier'] as RequestedRole[]).filter((r) => !excludeRoles.includes(r));
  if (options.length === 0) return null;
  return (
    <div className="flex gap-2 mb-4">
      {options.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className="flex-1 rounded-lg py-2.5 text-sm font-bold"
          style={{
            background: value === r ? 'linear-gradient(135deg,#D4AF37,#F5D76E)' : '#0A0E1A',
            color: value === r ? '#000' : '#A3B3D1',
            border: '1px solid #2A3650',
          }}
        >
          {ROLE_LABEL[r]} Olmak İstiyorum
        </button>
      ))}
    </div>
  );
}

// ── Ziyaretçi (giriş yapmamış) formu — hesap oluşturma + başvuru tek adımda ──

function GuestApplyForm() {
  const [requestedRole, setRequestedRole] = useState<RequestedRole>('dealer');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'ok' | 'confirm-email' | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || password.length < 6 || !companyName.trim()) {
      setError('Ad soyad, e-posta, en az 6 haneli şifre ve firma adı zorunlu.');
      return;
    }
    if (!isValidTcKimlikNo(nationalId)) {
      setError('TC Kimlik No geçersiz görünüyor — 11 haneyi kontrol et.');
      return;
    }
    const normalizedPhone = normalizeTrPhone(phone);
    if (!normalizedPhone) {
      setError('Telefon numarası geçersiz — 05XX XXX XX XX formatında olmalı.');
      return;
    }
    if (taxNumber.trim() && !isValidTaxNumber(taxNumber)) {
      setError('Vergi No 10 (kurumlar) ya da 11 (şahıs) haneli olmalı.');
      return;
    }

    setBusy(true);
    try {
      // 1) Çift kayıt kontrolü — hesap oluşturmadan ÖNCE.
      const dup = await checkApplicationDuplicate({
        phone: normalizedPhone,
        nationalId: nationalId.replace(/\D/g, ''),
        taxNumber: taxNumber.trim() || undefined,
      });
      if (dup.duplicate) {
        setError(
          dup.reason === 'EXISTING_ACCOUNT'
            ? 'Bu TC kimlik/telefon/vergi no ile zaten bir bayi/tedarikçi hesabı var. Giriş yapmayı dene.'
            : 'Bu bilgilerle zaten bekleyen ya da onaylanmış bir başvuru var.',
        );
        setBusy(false);
        return;
      }

      // 2) Hesabı oluştur.
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (signUpError) throw signUpError;
      const newUserId = signUpData.user?.id;
      if (!newUserId) throw new Error('Hesap oluşturulamadı.');

      // 3) Başvuruyu yeni hesabın id'siyle kaydet.
      await submitPublicRoleApplication(newUserId, {
        requestedRole,
        fullName: fullName.trim(),
        email: email.trim(),
        nationalId: nationalId.replace(/\D/g, ''),
        companyName: companyName.trim(),
        taxNumber: taxNumber.trim() || undefined,
        taxOffice: taxOffice.trim() || undefined,
        phone: normalizedPhone,
        address: address.trim() || undefined,
        note: note.trim() || undefined,
      });

      setDone(signUpData.session ? 'ok' : 'confirm-email');
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('DUPLICATE_APPLICATION')) {
        setError('Bu bilgilerle zaten bir hesap/başvuru var.');
      } else if (msg.toLowerCase().includes('already registered')) {
        setError('Bu e-posta zaten kayıtlı. Giriş yapmayı dene.');
      } else {
        setError('Başvuru gönderilemedi: ' + msg);
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl p-5 text-center" style={CARD}>
        <i className="fas fa-circle-check text-3xl mb-3" style={{ color: '#10B981' }} />
        <p className="text-white font-bold text-sm mb-1">Başvurun alındı!</p>
        <p className="text-[#5E7090] text-xs font-mono">
          {done === 'confirm-email'
            ? 'Hesabını aktifleştirmek için e-postana gönderdiğimiz linke tıkla. Admin onayı ayrıca gerçekleşecek.'
            : 'Admin incelemesi bekleniyor. Onaylanınca panelin otomatik açılır.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <RoleToggle value={requestedRole} onChange={setRequestedRole} />
      <p className="text-[#5E7090] text-xs font-mono mb-1">
        {requestedRole === 'dealer'
          ? 'Bayi: onaylı katalogdan ürün seçip kendi mağazanda canlı satış yaparsın.'
          : 'Tedarikçi: ürün/fiyat teklifi girer, ihalelere (ters ihale) teklif verirsin.'}
      </p>

      <p className="text-white text-xs font-bold pt-2">Hesap Bilgileri</p>
      <input placeholder="Ad Soyad *" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={INPUT} />
      <input type="email" placeholder="E-posta *" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
      <input
        type="password"
        placeholder="Şifre (en az 6 karakter) *"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={INPUT}
      />

      <p className="text-white text-xs font-bold pt-2">Kimlik ve Firma Bilgileri</p>
      <input
        placeholder="TC Kimlik No *"
        required
        inputMode="numeric"
        maxLength={11}
        value={nationalId}
        onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
        className={INPUT}
      />
      <input placeholder="Firma adı *" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={INPUT} />
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="Vergi no" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value.replace(/\D/g, ''))} className={INPUT} />
        <input placeholder="Vergi dairesi" value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} className={INPUT} />
      </div>
      <input placeholder="Telefon * (05XX XXX XX XX)" required value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} />
      <input placeholder="Adres" value={address} onChange={(e) => setAddress(e.target.value)} className={INPUT} />
      <textarea placeholder="Eklemek istediğin not (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={INPUT} />

      {error && <p className="text-red-400 text-xs font-mono">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg py-2.5 text-sm font-extrabold"
        style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Gönderiliyor…' : `Hesap Oluştur ve ${ROLE_LABEL[requestedRole]} Başvurusu Gönder`}
      </button>
      <p className="text-[#5E7090] text-[11px] font-mono text-center">
        Zaten hesabın var mı?{' '}
        <a href="/login?redirectTo=/apply" className="text-[#D4AF37]">
          Giriş yap
        </a>
      </p>
    </form>
  );
}

// ── Zaten giriş yapmış müşteri formu (daha kısa — hesap bilgisi istemez) ──

function CustomerApplyForm({ alreadyHeld }: { alreadyHeld: RequestedRole[] }) {
  const firstAvailable = (['dealer', 'supplier'] as RequestedRole[]).find((r) => !alreadyHeld.includes(r)) ?? 'dealer';
  const [requestedRole, setRequestedRole] = useState<RequestedRole>(firstAvailable);
  const [nationalId, setNationalId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!companyName.trim() || !phone.trim()) {
      setError('Firma adı ve telefon zorunlu.');
      return;
    }
    if (nationalId.trim() && !isValidTcKimlikNo(nationalId)) {
      setError('TC Kimlik No geçersiz görünüyor — 11 haneyi kontrol et.');
      return;
    }
    const normalizedPhone = normalizeTrPhone(phone) ?? phone.trim();
    setBusy(true);
    try {
      await submitRoleApplication({
        requestedRole,
        companyName: companyName.trim(),
        taxNumber: taxNumber.trim() || undefined,
        taxOffice: taxOffice.trim() || undefined,
        phone: normalizedPhone,
        address: address.trim() || undefined,
        note: note.trim() || undefined,
        nationalId: nationalId.replace(/\D/g, '') || undefined,
      });
      setDone(true);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('ALREADY_PENDING')) setError('Bu rol için zaten incelenmekte olan bir başvurun var.');
      else if (msg.includes('ALREADY_HAS_ROLE')) setError('Bu role zaten sahipsin.');
      else if (msg.includes('DUPLICATE_APPLICATION')) setError('Bu telefon/TCKN/vergi no ile zaten başka bir hesap/başvuru var.');
      else setError('Başvuru gönderilemedi: ' + msg);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl p-5 text-center" style={CARD}>
        <i className="fas fa-circle-check text-3xl mb-3" style={{ color: '#10B981' }} />
        <p className="text-white font-bold text-sm">Başvurun alındı, admin onayı bekleniyor.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <RoleToggle value={requestedRole} onChange={setRequestedRole} excludeRoles={alreadyHeld} />
      {alreadyHeld.length > 0 && (
        <p className="text-[#5E7090] text-[11px] font-mono -mt-2">
          Zaten {alreadyHeld.map((r) => ROLE_LABEL[r]).join(' ve ')} rolüne sahipsin — sadece kalan rol(ler) için başvurabilirsin.
        </p>
      )}
      <input
        placeholder="TC Kimlik No (varsa çift kaydı önler)"
        inputMode="numeric"
        maxLength={11}
        value={nationalId}
        onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
        className={INPUT}
      />
      <input placeholder="Firma adı *" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={INPUT} />
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="Vergi no" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} className={INPUT} />
        <input placeholder="Vergi dairesi" value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} className={INPUT} />
      </div>
      <input placeholder="Telefon *" required value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} />
      <input placeholder="Adres" value={address} onChange={(e) => setAddress(e.target.value)} className={INPUT} />
      <textarea placeholder="Not (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={INPUT} />
      {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg py-2.5 text-sm font-extrabold"
        style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Gönderiliyor…' : `${ROLE_LABEL[requestedRole]} Başvurusu Gönder`}
      </button>
    </form>
  );
}

// ── Sayfa ─────────────────────────────────────────────────────────────────

export default function ApplyPage() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <p className="max-w-xl mx-auto px-4 py-8 text-[#5E7090] font-mono text-sm">Yükleniyor…</p>;
  }

  const held = heldRoles(profile);
  const hasBoth = held.length === 2;

  if (user && profile && hasBoth) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 space-y-3">
        <p className="text-white font-bold text-sm">Zaten hem bayi hem tedarikçisin — yeni bir başvuruya gerek yok.</p>
        <div className="flex gap-2">
          <a href="/dealer/live" className="text-[#D4AF37] text-xs font-mono underline">Bayi Paneline Git</a>
          <a href="/supplier" className="text-[#D4AF37] text-xs font-mono underline">Tedarikçi Paneline Git</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-white font-black text-2xl">Bayi veya Tedarikçi Ol</h1>
        <p className="text-[#5E7090] text-sm mt-1">
          Başvurun admin tarafından incelenir. Onaylanınca panelin otomatik açılır.
          {held.length === 1 && ' Zaten sahip olduğun rolün paneline erişimin devam eder — bu, ikinci rol için ek bir başvuru.'}
        </p>
      </div>
      <div className="rounded-xl p-4" style={CARD}>
        {user ? <CustomerApplyForm alreadyHeld={held} /> : <GuestApplyForm />}
      </div>
    </div>
  );
}
