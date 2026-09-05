'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ensureStore } from '@/lib/dealer';
import {
  loadMyDealerPerformance,
  loadDealerLeaderboard,
  monthLabel,
  type DealerPerformanceRow,
  type LeaderboardRow,
} from '@/lib/dealer-performance';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };

function fmtTL(n: number) {
  return n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  const top3 = rank <= 3;
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
      style={
        top3
          ? { background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000' }
          : { background: '#0A0E1A', color: '#A3B3D1', border: '1px solid #2A3650' }
      }
    >
      {top3 && <i className="fas fa-trophy" style={{ fontSize: 10 }} />}
      #{rank} / {total}
    </span>
  );
}

export default function DealerPerformancePage() {
  const { profile } = useAuth();
  const [myStoreId, setMyStoreId] = useState<string | null>(null);
  const [history, setHistory] = useState<DealerPerformanceRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [h, l, store] = await Promise.all([
          loadMyDealerPerformance(),
          loadDealerLeaderboard(10),
          profile ? ensureStore(profile.id) : Promise.resolve(null),
        ]);
        setHistory(h);
        setLeaderboard(l);
        setMyStoreId(store?.id ?? null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  if (loading) return <p className="text-[#5E7090] font-mono text-sm">Yükleniyor…</p>;
  if (error) return <p className="text-red-400 font-mono text-sm">{error}</p>;

  const current = history[0];
  const prev = history[1];
  const trend = current && prev ? current.sales_count - prev.sales_count : null;

  return (
    <div className="space-y-6">
      <p className="text-white font-black text-xl">Performansım</p>

      {!current ? (
        <div className="rounded-xl p-5 text-center" style={CARD}>
          <i className="fas fa-chart-line text-2xl text-[#2A3650] mb-2" />
          <p className="text-[#5E7090] text-sm font-mono">Henüz bir satışın yok — ilk satışından sonra burada göreceksin.</p>
        </div>
      ) : (
        <div className="rounded-2xl p-4" style={{ ...CARD, borderColor: '#D4AF37' }}>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <p className="text-white font-extrabold text-sm">{monthLabel(current.period_year, current.period_month)}</p>
            <RankBadge rank={current.rank_by_sales} total={current.total_dealers_that_month} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-mono text-[#5E7090] uppercase">Satış</p>
              <p className="text-white font-black text-lg">
                {current.sales_count}
                {trend !== null && (
                  <span className={`ml-1.5 text-xs font-bold ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <i className={`fas fa-arrow-${trend >= 0 ? 'up' : 'down'} mr-0.5`} style={{ fontSize: 9 }} />
                    {Math.abs(trend)}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-[#5E7090] uppercase">Brüt Ciro</p>
              <p className="text-white font-black text-lg">{fmtTL(current.gross_revenue)}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-[#5E7090] uppercase">Net Kazanç</p>
              <p className="font-black text-lg" style={{ color: '#D4AF37' }}>{fmtTL(current.net_earnings)}</p>
            </div>
          </div>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div>
          <p className="text-white font-black text-sm mb-2 flex items-center gap-2">
            <i className="fas fa-ranking-star" style={{ color: '#D4AF37' }} />
            Bu Ay Bayi Sıralaması
          </p>
          <div className="rounded-xl overflow-hidden" style={CARD}>
            {leaderboard.map((row, i) => {
              const isMe = row.store_id === myStoreId;
              return (
                <div
                  key={row.store_id}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid #1E2A42',
                    background: isMe ? 'rgba(212,175,55,0.08)' : 'transparent',
                  }}
                >
                  <span className="w-6 text-center font-black text-sm" style={{ color: row.rank_by_sales <= 3 ? '#D4AF37' : '#5E7090' }}>
                    {row.rank_by_sales}
                  </span>
                  <span className="flex-1 text-sm font-bold truncate" style={{ color: isMe ? '#D4AF37' : '#fff' }}>
                    {row.store_name}
                    {isMe && <span className="ml-1.5 text-[10px] font-mono text-[#5E7090]">(sen)</span>}
                  </span>
                  <span className="text-xs font-mono text-[#5E7090]">{row.sales_count} satış</span>
                </div>
              );
            })}
          </div>
          <p className="text-[#5E7090] text-[10px] font-mono mt-1.5">
            Yalnızca satış adedi görünür — hiçbir bayinin ciro/kazanç bilgisi paylaşılmaz.
          </p>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="text-white font-black text-sm mb-2">Geçmiş</p>
          <div className="rounded-xl overflow-hidden" style={CARD}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#5E7090] font-mono text-left">
                  <th className="px-4 py-2 font-normal">Ay</th>
                  <th className="px-4 py-2 font-normal">Satış</th>
                  <th className="px-4 py-2 font-normal">Net Kazanç</th>
                  <th className="px-4 py-2 font-normal">Sıra</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={`${h.period_year}-${h.period_month}`} style={{ borderTop: '1px solid #1E2A42' }}>
                    <td className="px-4 py-2.5 text-white font-mono">{monthLabel(h.period_year, h.period_month)}</td>
                    <td className="px-4 py-2.5 text-white font-mono">{h.sales_count}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: '#D4AF37' }}>{fmtTL(h.net_earnings)}</td>
                    <td className="px-4 py-2.5 text-[#5E7090] font-mono">#{h.rank_by_sales}/{h.total_dealers_that_month}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
