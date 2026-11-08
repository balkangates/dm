/** Sipariş kotası saf kural testleri.  Çalıştır: npx tsx --test scripts/orderquota-selftest.ts */
import assert from "node:assert/strict";
import { test } from "node:test";
import { canTakeOrder, parseOrderQuota, topupAmountCents, topupChoices, validTopupQty } from "../lib/orderQuota";

const raw = (o: Record<string, unknown> = {}) => ({
  period: "2026-11", packageCode: "FREE", packageName: "Ücretsiz Profil", unlimited: false,
  quota: 20, used: 5, quotaRemaining: 15, balance: 0, unitPriceCents: 800, topupMinQty: 10, ...o,
});

test("parse: geçersiz girdi null; sayılar güvenli çevrilir", () => {
  assert.equal(parseOrderQuota(null), null);
  assert.equal(parseOrderQuota({}), null);
  const s = parseOrderQuota(raw({ used: "7", balance: -3, topupMinQty: 0 }))!;
  assert.equal(s.used, 7);
  assert.equal(s.balance, 0);
  assert.equal(s.topupMinQty, 1);
});

test("kota veya bakiye varsa sipariş alınır; ikisi de bittiyse alınmaz", () => {
  assert.equal(canTakeOrder(parseOrderQuota(raw())!), true);
  assert.equal(canTakeOrder(parseOrderQuota(raw({ used: 20, quotaRemaining: 0 }))!), false);
  assert.equal(canTakeOrder(parseOrderQuota(raw({ used: 20, quotaRemaining: 0, balance: 3 }))!), true);
});

test("tanımsız kota (null) sınırsızdır", () => {
  const s = parseOrderQuota(raw({ unlimited: true, quota: null, quotaRemaining: null, unitPriceCents: null }))!;
  assert.equal(s.quota, null);
  assert.equal(canTakeOrder(s), true);
});

test("bakiye adedi: minimum ve katları", () => {
  assert.equal(validTopupQty(10, 10), true);
  assert.equal(validTopupQty(30, 10), true);
  assert.equal(validTopupQty(5, 10), false);
  assert.equal(validTopupQty(15, 10), false);
  assert.equal(validTopupQty(0, 10), false);
  assert.equal(validTopupQty(10.5, 10), false);
  assert.equal(validTopupQty(7, 1), true);
});

test("tutar = adet × birim fiyat; hızlı seçimler minimumun katları", () => {
  assert.equal(topupAmountCents(30, 800), 24000);
  assert.deepEqual(topupChoices(50), [50, 100, 250, 500]);
  for (const c of topupChoices(25)) assert.equal(validTopupQty(c, 25), true);
});
