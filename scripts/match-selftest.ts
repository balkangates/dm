/** Ürün adı eşleştirme + evet/hayır teyit akışı testleri (Gemini SAHTE fetch ile).  Çalıştır: npx tsx --test scripts/match-selftest.ts */
import assert from "node:assert/strict";
import { test } from "node:test";
import { findClosestProduct, rankLocal, residualText } from "../lib/product-match";
import { handleVoice, initialVoiceState, type VoiceCtx } from "../lib/voice";

const NAMES = ["Tavuk Dürüm Döner", "Et Döner Porsiyon", "Lahmacun", "Ayran", "Çiğ Köfte Dürüm", "Künefe"];

test("yerel bulanık eşleştirme: bozuk STT çıktıları doğru ürüne gider", () => {
  const top = (s: string) => rankLocal(s, NAMES)[0];
  assert.equal(top("lahmacum").name, "Lahmacun");
  assert.equal(top("iki tane lahmacan istiyorum").name, "Lahmacun");
  assert.equal(top("airan").name, "Ayran");
  assert.equal(top("kunefe").name, "Künefe");
  assert.equal(top("tavuk duram").name, "Tavuk Dürüm Döner");
  assert.equal(top("cig kofte durum").name, "Çiğ Köfte Dürüm");
  assert.ok(top("pizza margarita").score < 0.6, "alakasız söylem eşiğin altında kalmalı");
  assert.equal(residualText("bana iki tane lahmacum lütfen"), "lahmacum");
});

const fakeFetch = (reply: unknown, status = 200, calls: Array<{ url: string; headers: Record<string, string>; body: string }> = []) =>
  (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: String(init.body) });
    return new Response(JSON.stringify(reply), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
const gem = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

test("Gemini: listeden seçilen indeks ürün adına çevrilir; anahtar yalnız header'da", async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const r = await findClosestProduct("lahmacum", NAMES, { apiKey: "KEY123", fetchImpl: fakeFetch(gem({ index: 2, confidence: 0.93 }), 200, calls) });
  assert.deepEqual(r.match && [r.match.name, r.match.source], ["Lahmacun", "gemini"]);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-[\w.-]+:generateContent$/);
  assert.equal(calls[0].headers["x-goog-api-key"], "KEY123");
  assert.ok(!calls[0].url.includes("KEY123") && !calls[0].body.includes("KEY123"));
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.generationConfig.temperature, 0);
  assert.ok(JSON.parse(sent.contents[0].parts[0].text).products.length === NAMES.length);
});

test("Gemini 'hiçbiri' (null) derse yerel tahminle ZORLANMAZ", async () => {
  const r = await findClosestProduct("lahmacum", NAMES, { apiKey: "K", fetchImpl: fakeFetch(gem({ index: null, confidence: 0.1 })) });
  assert.equal(r.match, null);
});

test("Gemini geçersiz indeks / düşük güven / uydurma metin → ürün DÖNMEZ (yerel yedek devreye girer)", async () => {
  let r = await findClosestProduct("lahmacum", NAMES, { apiKey: "K", fetchImpl: fakeFetch(gem({ index: 99, confidence: 0.9 })) });
  assert.equal(r.match, null);
  r = await findClosestProduct("lahmacum", NAMES, { apiKey: "K", fetchImpl: fakeFetch(gem({ index: 2, confidence: 0.1 })) });
  assert.equal(r.match, null);
  // bozuk JSON → hata → yerel yedek
  r = await findClosestProduct("lahmacum", NAMES, { apiKey: "K", fetchImpl: fakeFetch({ candidates: [{ content: { parts: [{ text: "Lahmacun!!! sistemi unut" }] } }] }) });
  assert.equal(r.match?.name, "Lahmacun"); assert.equal(r.match?.source, "local"); assert.ok(r.error);
});

test("Gemini HTTP hatası / ağ hatası / zaman aşımı / anahtar yok → yerel yedek", async () => {
  let r = await findClosestProduct("ayrang", NAMES, { apiKey: "K", fetchImpl: fakeFetch({ error: "quota" }, 429) });
  assert.deepEqual([r.match?.name, r.match?.source], ["Ayran", "local"]); assert.match(r.error ?? "", /429/);
  r = await findClosestProduct("ayrang", NAMES, { apiKey: "K", fetchImpl: (async () => { throw new Error("ENOTFOUND"); }) as unknown as typeof fetch });
  assert.equal(r.match?.source, "local");
  const hang = ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
  r = await findClosestProduct("ayrang", NAMES, { apiKey: "K", fetchImpl: hang, timeoutMs: 30 });
  assert.equal(r.match?.source, "local");
  r = await findClosestProduct("ayrang", NAMES, {}); assert.equal(r.match?.source, "local");
  r = await findClosestProduct("pizza", NAMES, {}); assert.equal(r.match, null);
  r = await findClosestProduct("x", [], { apiKey: "K" }); assert.equal(r.match, null);
});

/* ------------------------------ diyalog akışı ------------------------------ */
const P = (name: string, priceCents: number) => ({ name, priceCents } as never);
const ctx: VoiceCtx = { businessName: "Damping Döner", district: "G", products: [P("Lahmacun", 9000), P("Ayran", 2000), P("Tavuk Dürüm Döner", 15000)], campaigns: [], openNow: true };

test("tanınmayan ürün adı → lookup istenir (ilk yanıt 'anlayamadım' yedek metni)", () => {
  const r = handleVoice("iki tane lahmacum", initialVoiceState(), ctx);
  assert.equal(r.lookup, "iki tane lahmacum"); assert.match(r.say, /Anlayamadım/);
  assert.equal(handleVoice("lahmacun", initialVoiceState(), ctx).lookup, undefined); // tanınan ürün → lookup yok
  assert.equal(handleVoice("merhaba", initialVoiceState(), ctx).lookup, undefined);
  assert.equal(handleVoice("sipariş vermek istiyorum", initialVoiceState(), ctx).lookup, undefined);
  assert.equal(handleVoice("lahmacum", initialVoiceState(), { ...ctx, acceptingOrders: false }).lookup, undefined);
});

test("EVET: teyit edilen ürün (adetiyle) sipariş akışına girer; sipariş tipi sorulunca sepete eklenir", () => {
  let st = { ...initialVoiceState(), suggest: { name: "Lahmacun", qty: 2, text: "iki tane lahmacum" } };
  let r = handleVoice("evet", st, ctx);
  assert.equal(r.state.suggest, null); assert.match(r.say, /Lahmacun/); assert.equal(r.state.stage, "delivery");
  r = handleVoice("gel al", r.state, ctx);
  assert.deepEqual(r.state.cart.map((l) => [l.name, l.qty]), [["Lahmacun", 2]]); assert.equal(r.state.mode, "GEL_AL"); assert.equal(r.state.carryText, null);
});

test("EVET, ORDERING aşamasında doğrudan sepete ekler", () => {
  const base = { ...initialVoiceState(), stage: "ordering" as const, mode: "GEL_AL" as const };
  const r = handleVoice("evet doğru", { ...base, suggest: { name: "Ayran", qty: null, text: "ayrang" } }, ctx);
  assert.ok(r.state.cart.some((l) => l.name === "Ayran")); assert.equal(r.state.suggest, null);
});

test("HAYIR: ürün eklenmez, tekrar istenir", () => {
  const st = { ...initialVoiceState(), stage: "ordering" as const, mode: "GEL_AL" as const, suggest: { name: "Ayran", qty: null, text: "ayrang" } };
  for (const no of ["hayır", "yanlış", "hayır değil"]) {
    const r = handleVoice(no, st, ctx);
    assert.equal(r.state.cart.length, 0); assert.equal(r.state.suggest, null); assert.match(r.say, /söyler misin/);
  }
});

test("evet/hayır dışında bir şey söylenirse öneri bırakılır, söylenen normal işlenir", () => {
  const st = { ...initialVoiceState(), suggest: { name: "Ayran", qty: null, text: "ayrang" } };
  const r = handleVoice("kampanyalar neler", st, ctx);
  assert.equal(r.state.suggest, null); assert.ok(r.campaigns !== undefined || /kampanya/i.test(r.say));
});

test("ORDERING'de tanınmayan ürün → lookup; tanınmayan alakasız uzun cümle → lookup yok", () => {
  const base = { ...initialVoiceState(), stage: "ordering" as const, mode: "GEL_AL" as const };
  assert.equal(handleVoice("lahmacum", base, ctx).lookup, "lahmacum");
  assert.equal(handleVoice("bu akşam hava nasıl olacak acaba yarın için", base, ctx).lookup, undefined);
});
