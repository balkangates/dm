'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

function fmtTL(n: number) {
  return n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });
}

export default function AdminReferralPayoutsPage() {
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    const { data, error } = await supabase.rpc('get_pending_referral_payouts');
    if (error) {
      alert('Yüklenemedi: ' + error.message);
      return;
    }
    setRows(data ?? []);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const pay = async (partnerId: string) => {
    const m = method[partnerId] || 'bank';
    if (!confirm(`Bu partnere ödenecek tüm hakedişleri "${m}" ile ödendi işaretle?`)) return;
    setBusyId(partnerId);
    try {
      const { error } = await supabase.rpc('admin_pay_referral_partner', { p_partner_id: partnerId, p_method: m });
      if (error) throw error;
      await refresh();
    } catch (e) {
      alert('İşaretlenemedi: ' + (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-[#5E7090] font-mono text-sm">Yükleniyor…</p>;

  const total = rows.reduce((s, r) => s + Number(r.total_released || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-white font-bold text-sm">Paylaş & Kazan — Ödenecek Bakiyeler</p>
        <p className="text-[#5E7090] text-xs font-mono mt-1">
          Toplam ödenecek: <span className="text-white font-bold">{fmtTL(total)}</span> ({rows.length} kişi)
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-[#5E7090] text-xs font-mono">Ödenecek bakiye yok. 🎉</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.partner_id} className="rounded-xl p-3 flex items-center justify-between flex-wrap gap-2" style={CARD}>
              <div>
                <p className="text-white text-sm font-bold">{r.partner_name || 'İsimsiz'}</p>
                <p className="text-[#5E7090] text-xs font-mono">
                  {r.iban ? r.iban : <span className="text-amber-400">IBAN kayıtlı değil</span>}
                  {r.bank_name ? ` · ${r.bank_name}` : ''}
                </p>
                <p className="text-[#5E7090] text-xs font-mono">{r.earning_count} hakediş</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-sm" style={{ color: '#D4AF37' }}>{fmtTL(Number(r.total_released))}</p>
                <select
                  value={method[r.partner_id] || 'bank'}
                  onChange={(e) => setMethod((m) => ({ ...m, [r.partner_id]: e.target.value }))}
                  className="bg-black/30 border border-[#2A3650] rounded-lg px-2 py-1.5 text-xs text-white"
                >
                  <option value="bank">Banka Havalesi</option>
                  <option value="wallet">Cüzdan</option>
                  <option value="USDT">USDT</option>
                </select>
                <button
                  onClick={() => pay(r.partner_id)}
                  disabled={busyId === r.partner_id}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: '#10B981', color: '#fff', opacity: busyId === r.partner_id ? 0.6 : 1 }}
                >
                  Ödendi İşaretle
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
