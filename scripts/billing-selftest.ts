/** Cari / faturalama saf kural testleri.  Çalıştır: npx tsx --test scripts/billing-selftest.ts */
import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedTargets, balanceOf, buildStatement, isValidPeriod, monthEnd, paymentState, recentPeriods, taxCents, type Entry } from "../lib/billing";

const e = (o: Partial<Entry>): Entry => ({ id: Math.random().toString(), entryDate: "2026-11-01", kind: "INVOICE", description: "", debitCents: 0, creditCents: 0, ...o });

test("ödeme durumu eşlemesi", () => {
  for (const s of ["DRAFT", "ISSUED", "SENT", "OVERDUE", "PARTIALLY_PAID"]) assert.equal(paymentState(s), "PENDING");
  assert.equal(paymentState("PAID"), "PAID");
  assert.equal(paymentState("CANCELLED"), "CANCELLED");
  assert.equal(paymentState("REFUNDED"), "REFUNDED");
});

test("geçiş kuralları: bekleyen → ödendi/iptal; ödendi → iade; diğerleri kapalı", () => {
  assert.deepEqual(allowedTargets("ISSUED"), ["PAID", "CANCELLED"]);
  assert.deepEqual(allowedTargets("PAID"), ["REFUNDED"]);
  assert.deepEqual(allowedTargets("CANCELLED"), []);
  assert.deepEqual(allowedTargets("REFUNDED"), []);
});

test("fatura + ödeme → bakiye 0; yalnız fatura → borç", () => {
  assert.equal(balanceOf([e({ debitCents: 119900 })]), 119900);
  assert.equal(balanceOf([e({ debitCents: 119900 }), e({ kind: "PAYMENT", creditCents: 119900 })]), 0);
});

test("iade: iade faturası + iade ödemesi bakiyeyi değiştirmez", () => {
  const list = [
    e({ debitCents: 100000 }),
    e({ kind: "PAYMENT", creditCents: 100000 }),
    e({ kind: "REFUND_NOTE", creditCents: 100000 }),
    e({ kind: "REFUND_PAYOUT", debitCents: 100000 }),
  ];
  assert.equal(balanceOf(list), 0);
});

test("ekstre: açılış bakiyesi + yürüyen bakiye + tarih sırası", () => {
  const st = buildStatement(5000, [
    e({ entryDate: "2026-11-30", kind: "PAYMENT", creditCents: 8000 }),
    e({ entryDate: "2026-11-05", debitCents: 10000 }),
  ]);
  assert.deepEqual(st.rows.map((r) => r.balanceCents), [15000, 7000]);
  assert.equal(st.closingCents, 7000);
  assert.equal(st.totalDebitCents, 10000);
  assert.equal(st.totalCreditCents, 8000);
});

test("KDV yuvarlama ve dönem yardımcıları", () => {
  assert.equal(taxCents(299900, 0.2), 59980);
  assert.equal(taxCents(333, 0.2), 67);
  assert.equal(isValidPeriod("2026-11"), true);
  assert.equal(isValidPeriod("2026-13"), false);
  assert.equal(monthEnd("2026-02"), "2026-02-28");
  assert.equal(monthEnd("2026-11"), "2026-11-30");
  assert.deepEqual(recentPeriods(new Date(Date.UTC(2026, 0, 15)), 3), ["2026-01", "2025-12", "2025-11"]);
});
