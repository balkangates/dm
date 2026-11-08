/** Anasayfa mod çözümleme testleri.  Çalıştır: npx tsx --test scripts/viewmode-selftest.ts */
import assert from "node:assert/strict";
import { test } from "node:test";
import { hrefForMode, modeFromRole, parseMode, resolveViewMode, resolveViewModeDetailed, withMode } from "../lib/viewMode";

test("misafir / ilk ziyaret → müşteri (varsayılan)", () => {
  assert.deepEqual(resolveViewModeDetailed({}), { mode: "musteri", source: "default" });
  assert.equal(resolveViewMode({ param: undefined, role: null }), "musteri");
});

test("işletme rolü, parametre yok → işletme; müşteri rolü → müşteri", () => {
  for (const r of ["isletme", "bayi", "business", "BUSINESS"]) assert.equal(resolveViewMode({ role: r }), "isletme", r);
  for (const r of ["musteri", "customer", "CUSTOMER"]) assert.equal(resolveViewMode({ role: r }), "musteri", r);
});

test("URL parametresi rolden önceliklidir", () => {
  assert.deepEqual(resolveViewModeDetailed({ param: "musteri", role: "BUSINESS" }), { mode: "musteri", source: "url" });
  assert.deepEqual(resolveViewModeDetailed({ param: "isletme", role: "CUSTOMER" }), { mode: "isletme", source: "url" });
  assert.equal(resolveViewMode({ param: ["isletme", "musteri"] }), "isletme");
});

test("geçersiz parametre yok sayılır → rol, sonra varsayılan", () => {
  assert.equal(parseMode("admin"), null);
  assert.equal(resolveViewMode({ param: "xyz", role: "BUSINESS" }), "isletme");
  assert.equal(resolveViewMode({ param: "", role: undefined }), "musteri");
});

test("yönetici veya bilinmeyen rol moda zorlamaz", () => {
  assert.equal(modeFromRole("ADMIN"), null);
  assert.equal(modeFromRole(undefined), null);
  assert.equal(resolveViewMode({ role: "ADMIN" }), "musteri");
});

test("withMode / hrefForMode: sorgu ve hash korunur, mod güncellenir", () => {
  assert.equal(withMode("/#kategoriler", "musteri"), "/?mod=musteri#kategoriler");
  assert.equal(withMode("/kayit?tip=isletme", "isletme"), "/kayit?tip=isletme&mod=isletme");
  assert.equal(withMode("/fiyatlar?mod=musteri", "isletme"), "/fiyatlar?mod=isletme");
  assert.equal(withMode("/fiyatlar", null), "/fiyatlar");
  assert.equal(hrefForMode("/kampanyalar", "kategori=kahve&mod=musteri", "isletme"), "/kampanyalar?kategori=kahve&mod=isletme");
  assert.equal(hrefForMode("/", "", "musteri"), "/?mod=musteri");
});
