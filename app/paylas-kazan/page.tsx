'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import {
  getOrCreateStoreReferralLink,
  getMyReferralPartnerships,
  getMyReferralEarningsHistory,
  searchActiveStores,
  storeReferralLinkUrl,
  updateMyPayoutIban,
  type Partnership,
  type EarningHistoryRow,
} from '@/lib/store-referral';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };
const INPUT = 'w-full bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#5E7090]';

function fmtTL(n: number) {
  return n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  HELD: { text: 'Onay Bekliyor', color: '#F59E0B' },
  RELEASED: { text: 'Ödemeye Hazır', color: '#10B981' },
  PAID: { text: 'Ödendi', color: '#5E7090' },
  REFUNDED: { text: 'İptal Edildi', color: '#EF4444' },
};

function StorePicker({ onPicked }: { onPicked: (store: { id: string; name: string }) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; logo_url: string | null }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(true);
    const t = setTimeout(() => {
      searchActiveStores(query)
        .then(setResults)
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="rounded-xl p-4" style={CARD}>
      <p className="text-white font-bold text-sm mb-2">Bir mağaza seç, linkini al</p>
      <input placeholder="Mağaza ara…" value={query} onChange={(e) => setQuery(e.target.value)} className={INPUT} />
      <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
        {busy && <p className="text-[#5E7090] text-xs font-mono px-1">Aranıyor…</p>}
        {!busy && results.length === 0 && <p className="text-[#5E7090] text-xs font-mono px-1">Sonuç yok.</p>}
        {results.map((s) => (
          <button
            key={s.id}
            onClick={() => onPicked(s)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-white hover:bg-black/30 flex items-center gap-2"
          >
            <i className="fas fa-store text-[#5E7090]" style={{ fontSize: 11 }} />
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PaylasKazanPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [history, setHistory] = useState<EarningHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [ibanSaved, setIbanSaved] = useState(false);

  const load = async () => {
    try {
      const [p, h] = await Promise.all([getMyReferralPartnerships(), getMyReferralEarningsHistory()]);
      setPartnerships(p);
      setHistory(h);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirectTo=/paylas-kazan');
      return;
    }
    if (user) {
      load();
      setIban(profile?.iban ?? '');
      setBankName(profile?.bank_name ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const pickStore = async (store: { id: string; name: string }) => {
    try {
      await getOrCreateStoreReferralLink(store.id);
      await load();
    } catch (err) {
      alert('Link oluşturulamadı: ' + (err as Error).message);
    }
  };

  const copy = (code: string, storeId: string) => {
    navigator.clipboard.writeText(storeReferralLinkUrl(code, storeId));
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const saveIban = async () => {
    try {
      await updateMyPayoutIban(iban.trim(), bankName.trim());
      setIbanSaved(true);
      setTimeout(() => setIbanSaved(false), 2000);
    } catch (err) {
      alert('Kaydedilemedi: ' + (err as Error).message);
    }
  };

  if (authLoading || loading) return <main className="max-w-3xl mx-auto px-4 py-8 text-[#5E7090] font-mono text-sm">Yükleniyor…</main>;

  const totals = partnerships.reduce(
    (acc, p) => ({
      held: acc.held + p.held_amount,
      released: acc.released + p.released_amount,
      paid: acc.paid + p.paid_amount,
    }),
    { held: 0, released: 0, paid: 0 },
  );

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-white font-black text-2xl">Paylaş & Kazan</h1>
        <p className="text-[#5E7090] text-sm mt-1">
          Sevdiğin bir mağazanın linkini paylaş — o linkle gelen kişinin yaptığı{' '}
          <span className="text-white font-bold">her alışverişten</span> %5 cashback kazan. Süresiz.
        </p>
      </div>

      {error && <p className="text-red-400 text-xs font-mono">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 text-center" style={CARD}>
          <p className="text-white font-black text-lg">{fmtTL(totals.held)}</p>
          <p className="text-[10px] font-mono text-[#5E7090] uppercase mt-1">Onay Bekleyen</p>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ ...CARD, borderColor: '#10B981' }}>
          <p className="font-black text-lg" style={{ color: '#10B981' }}>{fmtTL(totals.released)}</p>
          <p className="text-[10px] font-mono text-[#5E7090] uppercase mt-1">Ödemeye Hazır</p>
        </div>
        <div className="rounded-xl p-4 text-center" style={CARD}>
          <p className="text-white font-black text-lg">{fmtTL(totals.paid)}</p>
          <p className="text-[10px] font-mono text-[#5E7090] uppercase mt-1">Ödendi</p>
        </div>
      </div>

      <StorePicker onPicked={pickStore} />

      {partnerships.length > 0 && (
        <div>
          <p className="text-white font-black text-sm mb-2">Linklerin</p>
          <div className="space-y-2">
            {partnerships.map((p) => (
              <div key={p.store_id} className="rounded-xl p-3" style={CARD}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-white font-bold text-sm">{p.store_name}</p>
                  <button
                    onClick={() => copy(p.referral_code, p.store_id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000' }}
                  >
                    {copiedCode === p.referral_code ? <i className="fas fa-check" /> : 'Linki Kopyala'}
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-[#5E7090]">
                  <span>{p.click_count} tıklama</span>
                  <span>{p.signup_count} yönlendirme</span>
                  <span>%{p.commission_rate} oran</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl p-4" style={CARD}>
        <p className="text-white font-bold text-sm mb-1">Ödeme Bilgilerin</p>
        <p className="text-[#5E7090] text-xs font-mono mb-3">
          Ödemeye hazır bakiyen banka hesabına gönderilecek.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input placeholder="IBAN" value={iban} onChange={(e) => setIban(e.target.value)} className={INPUT} />
          <input placeholder="Banka adı" value={bankName} onChange={(e) => setBankName(e.target.value)} className={INPUT} />
        </div>
        <button
          onClick={saveIban}
          className="mt-2 px-4 py-2 rounded-lg text-xs font-bold"
          style={{ background: '#0A0E1A', border: '1px solid #2A3650', color: '#A3B3D1' }}
        >
          {ibanSaved ? <span className="text-emerald-400"><i className="fas fa-check mr-1" />Kaydedildi</span> : 'Kaydet'}
        </button>
      </div>

      {history.length > 0 && (
        <div>
          <p className="text-white font-black text-sm mb-2">Kazanç Geçmişi</p>
          <div className="rounded-xl overflow-hidden" style={CARD}>
            {history.map((h, i) => {
              const s = STATUS_LABEL[h.status];
              return (
                <div
                  key={h.id}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #1E2A42' }}
                >
                  <div>
                    <p className="text-white text-sm font-bold">{h.store_name}</p>
                    <p className="text-[#5E7090] text-[10px] font-mono">
                      {new Date(h.created_at).toLocaleDateString('tr-TR')} · sipariş {fmtTL(h.order_amount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm" style={{ color: '#D4AF37' }}>+{fmtTL(h.commission_amount)}</p>
                    <p className="text-[10px] font-mono" style={{ color: s.color }}>{s.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
