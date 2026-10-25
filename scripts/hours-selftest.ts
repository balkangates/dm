/** Çalışma saati + sesli asistan "kapalı" davranışı testleri.  Çalıştır: npx tsx --test scripts/hours-selftest.ts */
import assert from "node:assert/strict";
import { test } from "node:test";
import { businessZone, isOpenAt, todayHours, withinHoursAt, zonedHmToIso } from "../lib/money";
import { closedNotice, enabledModes, handleVoice, initialVoiceState, type VoiceCtx } from "../lib/voice";

const week = (o: string, c: string) => Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, opensAt: o, closesAt: c, closed: false }));
const TR = businessZone("TR");
const H = week("11:00", "23:00");

test("Türkiye 02:13 (UTC 23:13) 11:00–23:00 işletme KAPALI — sunucu saat dilimi fark etmez", () => {
  assert.equal(isOpenAt(H, new Date("2026-10-25T23:13:00Z"), TR), false);
  assert.equal(todayHours(H, new Date("2026-10-25T23:13:00Z"), TR)?.dayOfWeek, 1); // TR'de Pazartesi
});
test("sınırlar: 10:59 kapalı, 11:00 açık, 22:59 açık, 23:00 kapalı", () => {
  const t = (z: string) => isOpenAt(H, new Date(z), TR);
  assert.deepEqual([t("2026-10-26T07:59:00Z"), t("2026-10-26T08:00:00Z"), t("2026-10-26T19:59:00Z"), t("2026-10-26T20:00:00Z")], [false, true, true, false]);
});
test("gece yarısını aşan vardiya + kapalı gün", () => {
  const n = week("18:00", "02:00");
  assert.equal(isOpenAt(n, new Date("2026-10-25T22:00:00Z"), TR), true); // 01:00
  assert.equal(isOpenAt(n, new Date("2026-10-26T00:00:00Z"), TR), false); // 03:00
  const closedMon = H.map((h) => (h.dayOfWeek === 1 ? { ...h, closed: true } : h));
  assert.equal(isOpenAt(closedMon, new Date("2026-10-26T09:00:00Z"), TR), false);
});
test("rezerve saati işletme saat diliminde ISO'ya çevrilir ve çalışma saatleri içinde mi denetlenir", () => {
  const now = new Date("2026-10-25T23:13:00Z"); // TR Pazartesi 02:13
  const iso = zonedHmToIso("12:30", TR, now)!;
  assert.equal(iso, "2026-10-26T09:30:00.000Z");
  assert.equal(withinHoursAt(H, new Date(iso), TR), true);
  assert.equal(withinHoursAt(H, new Date(zonedHmToIso("23:30", TR, now)!), TR), false);
  assert.equal(withinHoursAt(H, new Date(zonedHmToIso("09:00", TR, now)!), TR), false);
  assert.equal(withinHoursAt([], new Date(iso), TR), true); // saat tanımı yoksa engelleme yok
});

const ctx = (over: Partial<VoiceCtx> = {}): VoiceCtx => ({
  businessName: "Damping Döner", district: "Görükle",
  products: [{ name: "Döner", priceCents: 15000 } as never], campaigns: [], openNow: false, ...over,
});
const MSG = "gel-al ve paket servis siparişine kapanmıştır. Açılış ve kapanış saatleri arasına rezerve sipariş oluşturabilirsiniz.";

test("kapalıyken yalnız REZERVE açık; kapalı bilgisi doğru", () => {
  assert.deepEqual(enabledModes(ctx()), ["REZERVE"]);
  assert.deepEqual(enabledModes(ctx({ openNow: true })), ["GEL_AL", "REZERVE", "PAKET_SERVIS"]);
  assert.ok(closedNotice(ctx())!.includes(MSG));
  assert.equal(closedNotice(ctx({ openNow: true })), null);
  // işletme rezerveyi de kapatmışsa rezerve vaat edilmez
  assert.ok(!closedNotice(ctx({ modes: { rezerve: false } }))!.includes("rezerve sipariş oluşturabilirsiniz"));
});
test("kapalıyken 'gel al' / 'paket servis' reddedilir ve rezerve önerilir", () => {
  for (const say of ["gel al döner istiyorum", "paket servis sipariş vermek istiyorum"]) {
    const r = handleVoice(say, initialVoiceState(), ctx());
    assert.ok(r.say.includes(MSG), r.say);
    assert.equal(r.state.mode, null);
  }
});
test("kapalıyken genel sipariş isteği: uyarı + rezerve akışı", () => {
  const r = handleVoice("sipariş vermek istiyorum", initialVoiceState(), ctx());
  assert.ok(r.say.includes(MSG), r.say);
  assert.equal(r.state.mode, "REZERVE");
});
test("kapalıyken selamlama bilgi verir; açıkken değişmez", () => {
  assert.ok(handleVoice("merhaba", initialVoiceState(), ctx()).say.includes(MSG));
  assert.ok(!handleVoice("gel al döner", initialVoiceState(), ctx({ openNow: true })).say.includes("kapanmıştır"));
});
