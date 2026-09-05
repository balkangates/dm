'use client';
import { useEffect, useState } from 'react';
import { fetchDealerOptions, fetchGrantedDealerIds, updateProductVisibility, type DealerOption } from '@/lib/supplier';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };

const SCOPE_LABEL: Record<string, { label: string; desc: string; icon: string }> = {
  self: { label: 'Kendisi', desc: 'Sadece kendi mağazanızda kullanılır.', icon: 'fa-lock' },
  all: { label: 'Herkes', desc: 'Tüm bayilerin Ürün Seçimi ekranında görünür.', icon: 'fa-globe' },
  selected: { label: 'Seçili Bayiler', desc: 'Sadece işaretlediğiniz bayiler görebilir.', icon: 'fa-user-check' },
};

export default function VisibilityEditor({
  catalogProductId,
  productName,
  currentScope,
  onClose,
  onSaved,
}: {
  catalogProductId: string;
  productName: string;
  currentScope: 'self' | 'all' | 'selected';
  onClose: () => void;
  onSaved: (scope: 'self' | 'all' | 'selected') => void;
}) {
  const [scope, setScope] = useState<'self' | 'all' | 'selected'>(currentScope);
  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [opts, granted] = await Promise.all([fetchDealerOptions(), fetchGrantedDealerIds(catalogProductId)]);
        setDealers(opts);
        setSelectedIds(new Set(granted));
      } finally {
        setLoading(false);
      }
    })();
  }, [catalogProductId]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateProductVisibility(catalogProductId, scope, Array.from(selectedIds));
      onSaved(scope);
    } catch (e) {
      alert('Kaydedilemedi: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const filteredDealers = dealers.filter((d) => d.store_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-5 max-h-[85vh] overflow-y-auto" style={{ background: '#131C2C', border: '1px solid #2A3650' }}>
        <p className="text-white font-black text-base mb-0.5">Ürün Görünürlüğü</p>
        <p className="text-[#5E7090] text-xs font-mono mb-4">{productName}</p>

        <div className="space-y-2 mb-4">
          {(['self', 'all', 'selected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className="w-full text-left rounded-lg p-3 flex items-start gap-3"
              style={{
                background: scope === s ? 'rgba(212,175,55,0.1)' : '#0A0E1A',
                border: scope === s ? '1px solid #D4AF37' : '1px solid #2A3650',
              }}
            >
              <i className={`fas ${SCOPE_LABEL[s].icon} mt-0.5`} style={{ color: scope === s ? '#D4AF37' : '#5E7090' }} />
              <div>
                <p className="text-white text-sm font-bold">{SCOPE_LABEL[s].label}</p>
                <p className="text-[#5E7090] text-[11px] font-mono">{SCOPE_LABEL[s].desc}</p>
              </div>
            </button>
          ))}
        </div>

        {scope === 'selected' && (
          <div className="mb-4">
            <input
              placeholder="Bayi ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2 text-xs text-white mb-2"
            />
            {loading ? (
              <p className="text-[#5E7090] text-xs font-mono">Yükleniyor…</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg p-1" style={CARD}>
                {filteredDealers.length === 0 && <p className="text-[#5E7090] text-xs font-mono p-2">Bayi bulunamadı.</p>}
                {filteredDealers.map((d) => (
                  <label key={d.dealer_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-black/30 cursor-pointer">
                    <input type="checkbox" checked={selectedIds.has(d.dealer_id)} onChange={() => toggle(d.dealer_id)} />
                    <span className="text-white text-xs">{d.store_name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[#5E7090] text-[10px] font-mono mt-1.5">{selectedIds.size} bayi seçili</p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm font-bold" style={{ background: '#0A0E1A', border: '1px solid #2A3650', color: '#A3B3D1' }}>
            Vazgeç
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-lg py-2.5 text-sm font-extrabold"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? '…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
