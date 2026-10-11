import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * GÖRSEL REGRESYON BASELINE'I (UI dondurma protokolü, Bölüm 3.3).
 * Dış kaynaklar (Google Fonts vb.) engellenir → sonuç internet erişiminden bağımsızdır.
 * Not: PNG'ler işletim sistemi/yazı tipi ortamına bağlıdır; kendi makinende ilk iş
 * `npm run test:e2e -- --update-snapshots` ile baseline'ı yeniden üret, sonra her fazda karşılaştır.
 */
const BIZ = "kadikoy-pizza-atolyesi";
const q = `?biz=${BIZ}&rol=OWNER`;

const PAGES: Array<[string, string]> = [
  ["home", "/"],
  ["isletme", `/isletme/${BIZ}`],
  ["admin", "/admin"],
  ["panel", `/panel${q}`],
  ["panel-ai", `/panel/ai${q}`],
  ["panel-ayarlar", `/panel/ayarlar${q}`],
  ["panel-damping-hane", `/panel/damping-hane${q}`],
  ["panel-hakedis", `/panel/hakedis${q}`],
  ["panel-kampanyalar", `/panel/kampanyalar${q}`],
  ["panel-kasa", `/panel/kasa${q}`],
  ["panel-musteriler", `/panel/musteriler${q}`],
  ["panel-performans", `/panel/performans${q}`],
  ["panel-plan", `/panel/plan${q}`],
  ["panel-vitrin", `/panel/vitrin${q}`],
];

// 1x1 nötr PNG: ZIP'te public/ klasörü olmadığından /images/* 404 veriyor (bkz. rapor, bulgu KD-2).
// Yer tutucu, baseline'ın görsellerin var/yok durumundan bağımsız ve deterministik olmasını sağlar.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

// Bilinen, migration'dan ÖNCE var olan hatalar (rapor: KD-1). Yeni hata çıkarsa test düşer.
const KNOWN_PAGE_ERRORS: Record<string, RegExp[]> = {
  "panel-kasa": [/Minified React error #418/], // KasaClient.tsx:420 new Date().toLocaleString() → hidrasyon uyuşmazlığı
};

/**
 * Maskelenen bölgeler (rapor: "UI REGRESYON — maskelenen alanlar").
 * Neden: kaynak kodda ORDER BY eşit değerlerde belirsiz (UUID/eşit zaman damgası) → sıralama her
 * seed'de değişebilir; canlı saat satırı her çalıştırmada değişir. İçerik değil yalnızca SIRA/ZAMAN maskelenir.
 */
const VOLATILE: Record<string, (p: Page) => Locator[]> = {
  "panel-kasa": (p) => [p.locator('div:has(> span:text-is("TARİH"))')],
  "panel-hakedis": (p) => [p.locator('xpath=//p[contains(normalize-space(),"mahsup raporu")]/following-sibling::ul[1]')],
  "panel-damping-hane": (p) => [
    p.locator('xpath=//h3[normalize-space()="Cüzdan defteri (ledger)"]/following::ul[1]'),
    p.locator('xpath=//li[.//span[starts-with(normalize-space(),"Katkı:")]]/parent::ul'),
  ],
  admin: (p) => [
    p.locator("#mahsup"),
    p.locator('xpath=//section[.//*[contains(normalize-space(),"Referral kayıtları")]]'),
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => !["127.0.0.1", "localhost"].includes(url.hostname),
    (route) => route.abort()
  );
  await page.route("**/images/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PLACEHOLDER_PNG })
  );
});

for (const [name, url] of PAGES) {
  test(`görsel: ${name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const res = await page.goto(url, { waitUntil: "load" });
    expect(res?.status(), `${url} HTTP durumu`).toBe(200);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    // Rastgele UUID metinlerini sabit uzunlukta sabit değerle değiştir (düzen değişmez).
    await page.evaluate(() => {
      const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.nodeValue && re.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(re, "00000000-0000-0000-0000-000000000000");
        re.lastIndex = 0;
      }
    });
    const mask = (VOLATILE[name]?.(page)) ?? [];
    // Sayfa yüksekliği kesirli olabilir (örn. 6556.77px) ve fullPage yakalaması 1px gidip gelir.
    // Çözüm: viewport'u sayfa yüksekliğine sabitle (düzen yeniden akışı oturana dek) ve tek kare al.
    const vp = page.viewportSize()!;
    for (let i = 0; i < 4; i++) {
      const h = await page.evaluate(() => Math.ceil(document.documentElement.getBoundingClientRect().height));
      if (h === page.viewportSize()!.height) break;
      await page.setViewportSize({ width: vp.width, height: Math.max(h, vp.height) });
      await page.waitForTimeout(150);
    }
    await expect(page).toHaveScreenshot(`${name}.png`, { mask });
    const known = KNOWN_PAGE_ERRORS[name] ?? [];
    const unexpected = errors.filter((e) => !known.some((k) => k.test(e)));
    expect(unexpected, "tarayıcıda beklenmeyen JS hatası").toEqual([]);
  });
}
