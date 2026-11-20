"use client";
import { useState } from "react";
import { Card, Field, Input } from "@/components/ds";

/** Başabaş: aylık sabit gider ÷ (ortalama sepet × kâr marjı) = gereken aylık sipariş. */
export function BreakEven() {
  const [fixed, setFixed] = useState("");
  const [basket, setBasket] = useState("");
  const [margin, setMargin] = useState("");
  const f = Number(fixed.replace(",", ".")), b = Number(basket.replace(",", ".")), m = Number(margin.replace(",", "."));
  const ok = f > 0 && b > 0 && m > 0 && m <= 100;
  const orders = ok ? Math.ceil(f / (b * (m / 100))) : null;
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Aylık sabit giderler (TL)" hint="Kira, personel, enerji, muhasebe…"><Input inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="Örn. 120000" /></Field>
        <Field label="Ortalama sepet (TL)"><Input inputMode="decimal" value={basket} onChange={(e) => setBasket(e.target.value)} placeholder="Örn. 320" /></Field>
        <Field label="Brüt kâr marjı (%)" hint="Ürün maliyeti düşüldükten sonra kalan oran."><Input inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="Örn. 55" /></Field>
      </div>
      {orders ? (
        <p className="mt-4 rounded-[6px] bg-canvas p-3 text-[0.9rem]">
          Başabaş için ayda yaklaşık <strong className="tabular">{orders.toLocaleString("tr-TR")}</strong> sipariş (günde ≈ {Math.ceil(orders / 30)}) ve <strong className="tabular">{Math.round(orders * b).toLocaleString("tr-TR")} TL</strong> ciro gerekir.
          Bu hesap tahmindir; vergi ve beklenmedik giderleri ayrıca hesaba kat.
        </p>
      ) : <p className="mt-4 text-[0.82rem] text-muted">Üç alanı doldur; gereken aylık sipariş sayısı hesaplanır.</p>}
    </Card>
  );
}
