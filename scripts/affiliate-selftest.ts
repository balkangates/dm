/**
 * Affiliate yardımcıları self-test (DB gerektirmez):
 *   npx tsx scripts/affiliate-selftest.ts
 */
import { buildOutboundUrl, isHttpUrl, slugifyTr, validateNetworkInput, validateOfferInput, videoEmbed } from "../lib/affiliate";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.error(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name}`);
}

// --- çıkış bağlantısı
eq("direct brand: click param eklenir",
  buildOutboundUrl({ destinationUrl: "https://marka.com/kampanya?a=1", clickId: "dv-1", offerId: "o1", networkClickParam: "subid" }),
  "https://marka.com/kampanya?a=1&subid=dv-1");
eq("fırsat param'ı ağ param'ından önce gelir",
  buildOutboundUrl({ destinationUrl: "https://marka.com/", clickParam: "sub1", clickId: "dv-1", offerId: "o1", networkClickParam: "subid" }),
  "https://marka.com/?sub1=dv-1");
eq("şablon: {click_id} ve {url} dolar, ek parametre yok",
  buildOutboundUrl({ destinationUrl: "https://marka.com/a b", trackingUrl: "https://ag.com/c/9?s={click_id}&u={url}", clickId: "dv-2", offerId: "o1" }),
  "https://ag.com/c/9?s=dv-2&u=https%3A%2F%2Fmarka.com%2Fa%20b");
eq("şablonda {click_id} yoksa param eklenir",
  buildOutboundUrl({ destinationUrl: "https://marka.com/", trackingUrl: "https://ag.com/go/77", networkClickParam: "aff_sub", clickId: "dv-3", offerId: "o1" }),
  "https://ag.com/go/77?aff_sub=dv-3");
eq("kullanıcı kimliği yalnız açık {user_id} ile gönderilir",
  buildOutboundUrl({ destinationUrl: "https://marka.com/", clickId: "dv-4", offerId: "o1", userId: "U-1" }),
  "https://marka.com/?subid=dv-4");
eq("{user_id} şablonu",
  buildOutboundUrl({ destinationUrl: "https://marka.com/", trackingUrl: "https://ag.com/?c={click_id}&u={user_id}", clickId: "dv-5", offerId: "o1", userId: "U-1" }),
  "https://ag.com/?c=dv-5&u=U-1");
eq("geçersiz param adı → subid",
  buildOutboundUrl({ destinationUrl: "https://marka.com/", clickParam: "a b!", clickId: "dv-6", offerId: "o1" }),
  "https://marka.com/?subid=dv-6");

// --- URL güvenliği
eq("javascript: reddedilir", isHttpUrl("javascript:alert(1)"), false);
eq("data: reddedilir", isHttpUrl("data:text/html,x"), false);
eq("https kabul", isHttpUrl("https://a.com"), true);

// --- slug
eq("slug TR", slugifyTr("Teknosa — Şık Çanta İndirimi"), "teknosa-sik-canta-indirimi");

// --- video
eq("youtube watch", videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), { kind: "iframe", provider: "youtube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
eq("youtu.be", videoEmbed("https://youtu.be/dQw4w9WgXcQ"), { kind: "iframe", provider: "youtube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
eq("vimeo", videoEmbed("https://vimeo.com/123456"), { kind: "iframe", provider: "vimeo", src: "https://player.vimeo.com/video/123456" });
eq("mp4", videoEmbed("https://cdn.x.com/a.mp4"), { kind: "file", src: "https://cdn.x.com/a.mp4" });
eq("bilinmeyen video", videoEmbed("https://example.com/watch"), null);
eq("youtube sahte id", videoEmbed("https://www.youtube.com/watch?v=<script>"), null);

// --- doğrulama
const base = { merchant: "Teknosa", title: "Ek indirim", destinationUrl: "https://www.teknosa.com/" };
const ok = validateOfferInput({ ...base, category: "Elektronik", priceCents: 1000, priceVerified: true });
eq("geçerli fırsat", ok.ok, true);
if (ok.ok) {
  eq("marka varsayılanı = satıcı", ok.value.brand, "Teknosa");
  eq("kategori küçük harf", ok.value.category, "elektronik");
  eq("varsayılan ifşa dolu", ok.value.disclosure.length > 20, true);
}
eq("başlık kısa → hata", validateOfferInput({ ...base, title: "a" }).ok, false);
eq("hedef url javascript → hata", validateOfferInput({ ...base, destinationUrl: "javascript:alert(1)" }).ok, false);
eq("tracking şablonu geçersiz → hata", validateOfferInput({ ...base, trackingUrl: "ftp://x/{click_id}" }).ok, false);
eq("tracking şablonu geçerli", validateOfferInput({ ...base, trackingUrl: "https://ag.com/{click_id}" }).ok, true);
eq("bitiş < başlangıç → hata", validateOfferInput({ ...base, startsAt: "2026-12-10", endsAt: "2026-12-01" }).ok, false);
eq("fiyat yoksa 'doğrulandı' düşer", (() => { const r = validateOfferInput({ ...base, priceVerified: true }); return r.ok ? r.value.priceVerified : null; })(), false);
eq("hariç olanlar satırlardan", (() => { const r = validateOfferInput({ ...base, exclusions: "a\n\n b " }); return r.ok ? r.value.exclusions : null; })(), ["a", "b"]);
eq("ağ: ad zorunlu", validateNetworkInput({ name: "" }).ok, false);
eq("ağ: geçersiz param", validateNetworkInput({ name: "iadeal", clickParam: "x y" }).ok, false);
eq("ağ: geçerli", validateNetworkInput({ name: "iadeal", reportingMethod: "POSTBACK", commissionModel: "CPS" }).ok, true);

if (fails) { console.error(`\n${fails} test başarısız`); process.exit(1); }
console.log("\nTüm affiliate testleri geçti.");
