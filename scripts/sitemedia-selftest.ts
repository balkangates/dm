import assert from "node:assert/strict";
import { SITE_SLOTS, buildStorePath, checkMediaFile, storePathOfUrl, urlMatchesStorePath, validStorePath } from "../lib/siteMedia";

const p = buildStorePath("image", "home.hero.customer", "image/webp");
assert.match(p, /^image\/home-hero-customer-\d+-[a-z0-9]+\.webp$/);
assert.ok(validStorePath("image", p));
assert.ok(!validStorePath("video", p), "klasör türü eşleşmeli");
assert.ok(!validStorePath("image", "image/../video/x.mp4"));
assert.ok(!validStorePath("image", "other/x.jpg"));
const url = `https://x.supabase.co/storage/v1/object/public/store-media/${p}`;
assert.ok(urlMatchesStorePath(url, p));
assert.ok(!urlMatchesStorePath(url.replace("store-media", "business-media"), p));
assert.equal(storePathOfUrl(url), p);
assert.equal(storePathOfUrl("/images/magaza-ic.jpg"), null);
assert.ok(checkMediaFile("image", { type: "image/gif", size: 10 }));
assert.ok(checkMediaFile("video", { type: "video/mp4", size: 101 * 1024 * 1024 }));
assert.equal(checkMediaFile("video", { type: "video/mp4", size: 5 * 1024 * 1024 }), null);
assert.equal(new Set(SITE_SLOTS.map((s) => s.key)).size, SITE_SLOTS.length);
console.log("sitemedia-selftest OK");
