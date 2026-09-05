'use client';
import { useMemo, useState } from 'react';
import { calculatePricing, DEFAULT_REFERRAL_PCT, DEFAULT_MARGIN_PCT } from '@/lib/pricing';
import type { CatalogProduct } from '@/lib/dealer-catalog';

const INPUT = 'w-full bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2 text-sm text-white';
const LABEL = 'text-[10px] font-mono text-[#5E7090] uppercase mb-1 block';

export default function BulkAddModal({
  products,
  commissionFor,
  onConfirm,
  onCancel,
}: {
  products: CatalogProduct[];
  commissionFor: (categoryId: string) => number;
  onConfirm: (prices: Record<string, number>) => void;
  onCancel: () => void;
}) {
  const [includeReferral, setIncludeReferral] = useState(true);
  const [referralPct, setReferralPct] = useState(DEFAULT_REFERRAL_PCT);
  const [shippingCost, setShippingCost] = useState(0);
  const [otherCost, setOtherCost] = useState(0);
  const [marginPct, setMarginPct] = useState(DEFAULT_MARGIN_PCT);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const computed = useMemo(() => {
    return products.map((p) => {
      const breakdown = calculatePricing({
        supplierCost: p.suggested_price ?? 0,
        platformCommissionPct: commissionFor(p.category_id),
        includeReferral,
        referralCommissionPct: referralPct,
        shippingCost,
        otherCost,
        marginPct,
      });
      return { product: p, breakdown };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, includeReferral, referralPct, shippingCost, otherCost, marginPct]);

  const finalPriceFor = (id: string, fallback: number) => overrides[id] ?? fallback;

  const confirm = async () => {
    setSaving(true);
    const prices: Record<string, number> = {};
    computed.forEach(({ product, breakdown }) => {
      prices[product.id] = finalPriceFor(product.id, breakdown.suggestedPrice);
    });
    try {
      await onConfirm(prices);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: '#131C2C', border: '1px solid #2A3650' }}>
        <p className="text-white font-black text-base mb-0.5">Seçilenleri Mağazama Ekle</p>
        <p className="text-[#5E7090] text-xs font-mono mb-4">{products.length} ürün seçili — hepsine aynı hedef marj/gider uygulanır, satır satır düzenleyebilirsin.</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className={LABEL}>Hedef Kâr Marjı (%)</label>
            <input type="number" min={0} value={marginPct} onChange={(e) => setMarginPct(Number(e.target.value) || 0)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Kargo Payı (₺/birim)</label>
            <input type="number" min={0} value={shippingCost} onChange={(e) => setShippingCost(Number(e.target.value) || 0)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Diğer Giderler (₺)</label>
            <input type="number" min={0} value={otherCost} onChange={(e) => setOtherCost(Number(e.target.value) || 0)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Referans Kom. (%)</label>
            <input
              type="number" min={0} value={referralPct} disabled={!includeReferral}
              onChange={(e) => setReferralPct(Number(e.target.value) || 0)}
              className={INPUT} style={{ opacity: includeReferral ? 1 : 0.4 }}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-mono text-[#A3B3D1] mb-4">
          <input type="checkbox" checked={includeReferral} onChange={(e) => setIncludeReferral(e.target.checked)} />
          Bu ürünler Paylaş & Kazan referans programına dahil olabilir — fiyata pay bırak
        </label>

        <div className="rounded-lg overflow-hidden mb-4" style={{ border: '1px solid #2A3650' }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#5E7090] border-b border-[#2A3650]" style={{ background: '#0A0E1A' }}>
                <th className="p-2">Ürün</th>
                <th className="p-2">Tedarikçi</th>
                <th className="p-2">Önerilen Fiyat</th>
              </tr>
            </thead>
            <tbody>
              {computed.map(({ product, breakdown }) => {
                const isLoss = breakdown.dealerNetProceeds < (product.suggested_price ?? 0);
                return (
                  <tr key={product.id} className="border-b border-[#1E2A42]">
                    <td className="p-2 text-white">{product.name}</td>
                    <td className="p-2 text-[#A3B3D1] font-mono">₺{(product.suggested_price ?? 0).toFixed(2)}</td>
                    <td className="p-2">
                      <input
                        type="number" min={0} step="0.01"
                        value={finalPriceFor(product.id, breakdown.suggestedPrice)}
                        onChange={(e) => setOverrides((prev) => ({ ...prev, [product.id]: Number(e.target.value) || 0 }))}
                        className="w-24 rounded px-2 py-1 text-white font-bold"
                        style={{ background: '#0A0E1A', border: `1px solid ${isLoss ? '#EF4444' : '#2A3650'}`, color: isLoss ? '#EF4444' : '#D4AF37' }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-bold" style={{ background: '#0A0E1A', border: '1px solid #2A3650', color: '#A3B3D1' }}>
            Vazgeç
          </button>
          <button
            onClick={confirm}
            disabled={saving}
            className="flex-1 rounded-lg py-2.5 text-sm font-extrabold"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Ekleniyor…' : `${products.length} Ürünü Ekle`}
          </button>
        </div>
      </div>
    </div>
  );
}
