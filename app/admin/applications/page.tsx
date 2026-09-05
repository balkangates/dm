'use client';
import { useEffect, useState } from 'react';
import {
  loadPendingApplications,
  approveApplication,
  rejectApplication,
  ROLE_LABEL,
  type RequestedRole,
} from '@/lib/applications';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

export default function AdminApplicationsPage() {
  const [pending, setPending] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setPending(await loadPendingApplications());
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      await approveApplication(id);
      await refresh();
    } catch (e) {
      alert('Onaylanamadı: ' + (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!reason.trim()) {
      alert('Red sebebi yazmalısın.');
      return;
    }
    setBusyId(id);
    try {
      await rejectApplication(id, reason.trim());
      setRejectFor(null);
      setReason('');
      await refresh();
    } catch (e) {
      alert('Reddedilemedi: ' + (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-[#5E7090] font-mono text-sm">Yükleniyor…</p>;

  return (
    <div className="space-y-3">
      <p className="text-white font-bold text-sm">Bayi/Tedarikçi Başvuruları ({pending.length})</p>
      <p className="text-[#5E7090] text-xs font-mono">
        Onaylandığında kullanıcının rolü otomatik güncellenir, paneli açılır. Reddedildiğinde
        kullanıcı sebebi görür ve yeniden başvurabilir.
      </p>

      {pending.length === 0 ? (
        <p className="text-[#5E7090] text-xs font-mono">Bekleyen başvuru yok. 🎉</p>
      ) : (
        <div className="space-y-2">
          {pending.map((a) => (
            <div key={a.id} className="rounded-xl p-3" style={CARD}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-white text-sm font-bold">
                    {a.company_name}{' '}
                    <span className="text-[#D4AF37] font-mono text-xs">
                      · {ROLE_LABEL[a.requested_role as RequestedRole]}
                    </span>
                  </p>
                  <p className="text-[#5E7090] text-xs font-mono">
                    {a.profiles?.full_name ?? a.profiles?.email} · {a.phone}
                  </p>
                  {a.tax_number && (
                    <p className="text-[#5E7090] text-xs font-mono">
                      VKN: {a.tax_number} {a.tax_office ? `· ${a.tax_office}` : ''}
                    </p>
                  )}
                  {a.address && <p className="text-[#5E7090] text-xs font-mono">{a.address}</p>}
                  {a.note && <p className="text-[#A3B3D1] text-xs font-mono mt-1">Not: {a.note}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(a.id)}
                    disabled={busyId === a.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: '#10B981', color: '#fff', opacity: busyId === a.id ? 0.6 : 1 }}
                  >
                    <i className="fas fa-check mr-1" />Onayla
                  </button>
                  <button
                    onClick={() => setRejectFor(rejectFor === a.id ? null : a.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: '#2A3650', color: '#A3B3D1' }}
                  >
                    <i className="fas fa-xmark mr-1" />Reddet
                  </button>
                </div>
              </div>
              {rejectFor === a.id && (
                <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-dashed border-[#1E2A42]">
                  <input
                    placeholder="Red sebebi…"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="flex-1 bg-black/30 border border-[#2A3650] rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                  <button
                    onClick={() => handleReject(a.id)}
                    disabled={busyId === a.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: '#EF4444', color: '#fff' }}
                  >
                    Reddi Onayla
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
