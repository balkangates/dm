'use client';
import { useMemo, useState } from 'react';
import { calculatePricing, DEFAULT_REFERRAL_PCT, DEFAULT_MARGIN_PCT } from '@/lib/pricing';

const INPUT = 'w-full bg-black/30 border border-[#2A3650] rounded-lg px-3 py-2 text-sm text-white';
const LABEL = 'text-[10px] font-mono text-[#5E7090] uppercase mb-1 block';

export default function PriceCalculator({
  productName,
  supplierCost,
  platformCommissionPct,
  initialPrice,
  onConfirm,
  onCancel,
}: {
  productName: string;
  supplierCost: number;
  platformCommissionPct: number;
  initialPrice?: number;
  onConfirm: (price: number) => void;
  onCancel: () => void;
}) {
  const [includeReferral, setIncludeReferral] = useState(true);
  const [referralPct, setReferralPct] = useState(DEFAULT_REFERRAL_PCT);
  const [shippingCost, setShippingCost] = useState(0);
  const [otherCost, setOtherCost] = useState(0);
  const [marginPct, setMarginPct] = useState(DEFAULT_MARGIN_PCT);
  const [manualPrice, setManualPrice] = useState<number | null>(null);

  const breakdown = useMemo(
    () =>
      calculatePricing({
        supplierCost,
        platformCommissionPct,
        includeReferral,
        referralCommissionPct: referralPct,
        shippingCost,
        otherCost,
        marginPct,
      }),
    [supplierCost, platformCommissionPct, includeReferral, referralPct, shippingCost, otherCost, marginPct],
  );

  const finalPrice = manualPrice ?? breakdown.suggestedPrice;
  const isLoss = breakdown.dealerNetProceeds < supplierCost;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: '#131C2C', border: '1px solid #2A3650' }}>
        <p className="text-white font-black text-base mb-0.5">Satış Fiyatı Hesaplayıcı</p>
        <p className="text-[#5E7090] text-xs font-mono mb-4">{productName}</p>

        <div className="rounded-lg p-3 mb-4" style={{ background: '#0A0E1A', border: '1px solid #2A3650' }}>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[#5E7090]">Tedarikçi Fiyatı</span>
            <span className="text-white font-bold">₺{supplierCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs font-mono mt-1">
            <span className="text-[#5E7090]">Platform Komisyonu (kategori)</span>
            <span className="text-white">%{platformCommissionPct}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
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
            <label className={LABEL}>Referans Komisyonu (%)</label>
            <input
              type="number"
              min={0}
              value={referralPct}
              disabled={!includeReferral}
              onChange={(e) => setReferralPct(Number(e.target.value) || 0)}
              className={INPUT}
              style={{ opacity: includeReferral ? 1 : 0.4 }}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-mono text-[#A3B3D1] mb-4">
          <input type="checkbox" checked={includeReferral} onChange={(e) => setIncludeReferral(e.target.checked)} />
          Bu ürün Paylaş & Kazan referans programına dahil olabilir — fiyata pay bırak
        </label>

        <div className="rounded-lg p-3 mb-4 space-y-1" style={{ background: '#0A0E1A', border: '1px solid #2A3650' }}>
          <p className="text-[10px] font-mono text-[#5E7090] uppercase mb-1.5">Fiyat Dökümü (KDV dahil)</p>
          {[
            ['Tedarikçi maliyeti', breakdown.supplierCost],
            ['Hedeflenen kâr', breakdown.desiredProfit],
            ['Kargo + diğer giderler', shippingCost + otherCost],
            ['Platform komisyonu', breakdown.platformCommissionAmount],
            [includeReferral ? 'Referans komisyonu' : 'Referans komisyonu (dahil değil)', breakdown.referralCommissionAmount],
            ['KDV (%20)', breakdown.vatAmount],
          ].map(([label, val]) => (
            <div key={label as string} className="flex justify-between text-xs font-mono">
              <span className="text-[#5E7090]">{label}</span>
              <span className="text-[#A3B3D1]">₺{(val as number).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-mono pt-1.5 mt-1.5 border-t border-[#2A3650]">
            <span className="text-white font-bold">Önerilen Satış Fiyatı</span>
            <span className="font-black" style={{ color: '#D4AF37' }}>₺{breakdown.suggestedPrice.toFixed(2)}</span>
          </div>
        </div>

        <div className="mb-4">
          <label className={LABEL}>Nihai Fiyat (istersen elle değiştir)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={finalPrice}
            onChange={(e) => setManualPrice(Number(e.target.value) || 0)}
            className={INPUT}
          />
          {isLoss && (
            <p className="text-red-400 text-[11px] font-mono mt-1.5">
              <i className="fas fa-triangle-exclamation mr-1" />
              Bu fiyatla eline geçen tutar (₺{breakdown.dealerNetProceeds.toFixed(2)}), tedarikçi maliyetinin (₺{supplierCost.toFixed(2)}) altında — zararına satıyorsun.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-bold" style={{ background: '#0A0E1A', border: '1px solid #2A3650', color: '#A3B3D1' }}>
            Vazgeç
          </button>
          <button
            onClick={() => onConfirm(finalPrice)}
            className="flex-1 rounded-lg py-2.5 text-sm font-extrabold"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000' }}
          >
            {initialPrice != null ? 'Fiyatı Güncelle' : 'Bu Fiyatla Ekle'}
          </button>
        </div>
      </div>
    </div>
  );
}
