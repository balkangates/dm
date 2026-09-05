'use client';
import { useEffect, useState } from 'react';
import {
  loadPendingCatalogProducts, approveCatalogProduct, rejectCatalogProduct,
  loadCategories, updateCommissionPct,
  loadBrands, createBrand, assignBrandToProduct, loadApprovedCatalogProducts,
} from '@/lib/admin';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

export default function AdminCatalogPage() {
  const [pending, setPending] = useState<AnyRow[]>([]);
  const [approved, setApproved] = useState<AnyRow[]>([]);
  const [categories, setCategories] = useState<AnyRow[]>([]);
  const [brands, setBrands] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandLogo, setNewBrandLogo] = useState('');
  const [brandBusy, setBrandBusy] = useState(false);
  const [showApproved, setShowApproved] = useState(false);

  const refresh = async () => {
    const [p, c, b] = await Promise.all([loadPendingCatalogProducts(), loadCategories(), loadBrands()]);
    setPending(p);
    setCategories(c);
    setBrands(b);
  };

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  const loadApprovedList = async () => {
    setShowApproved(true);
    if (approved.length === 0) setApproved(await loadApprovedCatalogProducts());
  };

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) return;
    setBrandBusy(true);
    try {
      const b = await createBrand(newBrandName, newBrandLogo);
      setBrands((prev) => [...prev, b].sort((a, bb) => a.name.localeCompare(bb.name)));
      setNewBrandName('');
      setNewBrandLogo('');
    } catch (e) {
      alert('Marka eklenemedi: ' + (e as Error).message);
    } finally {
      setBrandBusy(false);
    }
  };

  const handleAssignBrand = async (productId: string, brandId: string, isPending: boolean) => {
    try {
      await assignBrandToProduct(productId, brandId || null);
      const brand = brands.find((b) => b.id === brandId) ?? null;
      const updater = (list: AnyRow[]) => list.map((p) => (p.id === productId ? { ...p, brand_id: brandId || null, brands: brand } : p));
      if (isPending) setPending(updater); else setApproved(updater);
    } catch (e) {
      alert('Marka atanamadı: ' + (e as Error).message);
    }
  };

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try { await approveCatalogProduct(id); await refresh(); }
    catch (e) { alert('Onaylanamadı: ' + (e as Error).message); }
    finally { setBusyId(null); }
  };

  const handleReject = async (id: string) => {
    if (!confirm('Bu ürünü reddetmek istediğinize emin misiniz?')) return;
    setBusyId(id);
    try { await rejectCatalogProduct(id); await refresh(); }
    catch (e) { alert('Reddedilemedi: ' + (e as Error).message); }
    finally { setBusyId(null); }
  };

  const handleCommissionChange = async (categoryId: string, pct: number) => {
    try {
      await updateCommissionPct(categoryId, pct);
      setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, commission_pct: pct } : c)));
    } catch (e) {
      alert('Güncellenemedi: ' + (e as Error).message);
    }
  };

  if (loading) return <p className="text-[#5E7090] font-mono text-sm">Yükleniyor…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-white font-bold text-sm mb-3">Onay Bekleyen Tedarikçi Ürünleri ({pending.length})</p>
        {pending.length === 0 ? (
          <p className="text-[#5E7090] text-xs font-mono">Bekleyen ürün yok. 🎉</p>
        ) : (
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="rounded-xl p-3 flex items-center justify-between flex-wrap gap-2" style={CARD}>
                <div>
                  <p className="text-white text-sm font-bold">{p.name}</p>
                  <p className="text-[#5E7090] text-xs font-mono">
                    {p.categories?.name ?? '—'} · Teklif fiyat: ₺{p.suggested_price}
                  </p>
                  <select
                    value={p.brand_id ?? ''}
                    onChange={(e) => handleAssignBrand(p.id, e.target.value, true)}
                    className="mt-1.5 bg-black/30 border border-[#2A3650] rounded-lg px-2 py-1 text-[11px] text-white"
                  >
                    <option value="">Marka seç (opsiyonel)</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(p.id)}
                    disabled={busyId === p.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: '#10B981', color: '#fff' }}
                  >
                    <i className="fas fa-check mr-1" />Onayla
                  </button>
                  <button
                    onClick={() => handleReject(p.id)}
                    disabled={busyId === p.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: '#2A3650', color: '#A3B3D1' }}
                  >
                    <i className="fas fa-xmark mr-1" />Reddet
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-white font-bold text-sm mb-3">Kategori Komisyon Oranları</p>
        <div className="rounded-xl overflow-hidden" style={CARD}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#5E7090] border-b border-[#2A3650]">
                <th className="p-2.5">Kategori</th>
                <th className="p-2.5">Komisyon %</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-[#1E2A42]">
                  <td className="p-2.5 text-white">{c.name}</td>
                  <td className="p-2.5">
                    <input
                      type="number" min={0} max={100} defaultValue={c.commission_pct}
                      onBlur={(e) => handleCommissionChange(c.id, Number(e.target.value))}
                      className="w-20 rounded px-2 py-1 text-white text-xs"
                      style={{ background: '#0B1220', border: '1px solid #2A3650' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Faz 1.5: Marka yönetimi */}
      <div>
        <p className="text-white font-bold text-sm mb-3">Markalar ({brands.length})</p>
        <div className="rounded-xl p-3 mb-3" style={CARD}>
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Marka adı (ör. Bargello)"
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              className="flex-1 min-w-[160px] bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2 text-xs text-white"
            />
            <input
              placeholder="Logo URL (opsiyonel)"
              value={newBrandLogo}
              onChange={(e) => setNewBrandLogo(e.target.value)}
              className="flex-1 min-w-[160px] bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2 text-xs text-white"
            />
            <button
              onClick={handleAddBrand}
              disabled={brandBusy || !newBrandName.trim()}
              className="px-4 py-2 rounded-lg text-xs font-bold"
              style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000', opacity: brandBusy ? 0.6 : 1 }}
            >
              Marka Ekle
            </button>
          </div>
        </div>
        {brands.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {brands.map((b) => (
              <span key={b.id} className="text-[10px] font-mono px-2 py-1 rounded-full" style={{ background: '#131C2C', border: '1px solid #2A3650', color: '#A3B3D1' }}>
                {b.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Faz 1.5: onaylı ürünlere sonradan marka atama/düzeltme */}
      <div>
        {!showApproved ? (
          <button onClick={loadApprovedList} className="text-xs font-mono text-[#D4AF37] underline">
            Onaylı ürünlere marka ata / düzelt →
          </button>
        ) : (
          <>
            <p className="text-white font-bold text-sm mb-3">Onaylı Ürünler — Marka Ataması ({approved.length})</p>
            <div className="rounded-xl overflow-hidden" style={CARD}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#5E7090] border-b border-[#2A3650]">
                    <th className="p-2.5">Ürün</th>
                    <th className="p-2.5">Kategori</th>
                    <th className="p-2.5">Marka</th>
                  </tr>
                </thead>
                <tbody>
                  {approved.map((p) => (
                    <tr key={p.id} className="border-b border-[#1E2A42]">
                      <td className="p-2.5 text-white">{p.name}</td>
                      <td className="p-2.5 text-[#5E7090]">{p.categories?.name ?? '—'}</td>
                      <td className="p-2.5">
                        <select
                          value={p.brand_id ?? ''}
                          onChange={(e) => handleAssignBrand(p.id, e.target.value, false)}
                          className="bg-black/30 border border-[#2A3650] rounded-lg px-2 py-1 text-[11px] text-white"
                        >
                          <option value="">— marka yok —</option>
                          {brands.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
