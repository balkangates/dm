'use client';
import { useEffect, useState } from 'react';
import {
  getOrCreateMyReferralLink,
  getMyReferralStats,
  referralLinkUrl,
  type ReferralStatsRow,
} from '@/lib/referral';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };

export default function DealerReferralPage() {
  const [stats, setStats] = useState<ReferralStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      await getOrCreateMyReferralLink(); // yoksa oluşturur
      setStats(await getMyReferralStats());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-[#5E7090] font-mono text-sm">Yükleniyor…</p>;
  if (error) return <p className="text-red-400 font-mono text-sm">{error}</p>;

  const summary = stats[0];
  const referredCustomers = stats.filter((s) => s.referred_full_name);
  const link = summary ? referralLinkUrl(summary.referral_code, summary.store_id) : '';

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const conversionPct =
    summary && summary.click_count > 0 ? Math.round((summary.signup_count / summary.click_count) * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-white font-black text-xl">Müşteri Kazanımım</p>
        <p className="text-[#5E7090] text-xs font-mono mt-1">
          Bu linki paylaş — üzerinden gelen her yeni müşteri sana bağlanır.
        </p>
      </div>

      {!summary ? (
        <div className="rounded-xl p-5 text-center" style={CARD}>
          <p className="text-[#5E7090] text-sm font-mono">Link oluşturulamadı — önce mağazanı kurman gerekebilir.</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl p-4" style={{ ...CARD, borderColor: '#D4AF37' }}>
            <p className="text-[10px] font-mono text-[#5E7090] uppercase mb-1.5">Referans Linkin</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs sm:text-sm text-white bg-black/30 rounded-lg px-3 py-2.5 truncate font-mono">
                {link}
              </code>
              <button
                onClick={copyLink}
                className="shrink-0 px-4 py-2.5 rounded-lg text-xs font-bold"
                style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000' }}
              >
                {copied ? <i className="fas fa-check" /> : 'Kopyala'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-4 text-center" style={CARD}>
              <p className="text-white font-black text-2xl">{summary.click_count}</p>
              <p className="text-[10px] font-mono text-[#5E7090] uppercase mt-1">Tıklama</p>
            </div>
            <div className="rounded-xl p-4 text-center" style={CARD}>
              <p className="font-black text-2xl" style={{ color: '#D4AF37' }}>{summary.signup_count}</p>
              <p className="text-[10px] font-mono text-[#5E7090] uppercase mt-1">Kazanılan Müşteri</p>
            </div>
            <div className="rounded-xl p-4 text-center" style={CARD}>
              <p className="text-white font-black text-2xl">{conversionPct !== null ? `%${conversionPct}` : '—'}</p>
              <p className="text-[10px] font-mono text-[#5E7090] uppercase mt-1">Dönüşüm</p>
            </div>
          </div>

          <div>
            <p className="text-white font-black text-sm mb-2">Getirdiğin Müşteriler</p>
            {referredCustomers.length === 0 ? (
              <div className="rounded-xl p-5 text-center" style={CARD}>
                <i className="fas fa-user-plus text-2xl text-[#2A3650] mb-2" />
                <p className="text-[#5E7090] text-sm font-mono">Henüz linkinle gelen bir müşteri yok.</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={CARD}>
                {referredCustomers.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid #1E2A42' }}
                  >
                    <span className="text-white text-sm font-bold">{c.referred_full_name || 'İsimsiz'}</span>
                    <span className="text-[#5E7090] text-xs font-mono">
                      {c.referred_created_at ? new Date(c.referred_created_at).toLocaleDateString('tr-TR') : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
