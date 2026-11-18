import "server-only";
/**
 * Adres → koordinat (OpenStreetMap Nominatim). Sunucuda çalışır; hata/zaman aşımında null döner.
 * Kullanım politikası gereği User-Agent gönderilir; sonuçlar kısa süre bellekte önbelleğe alınır.
 */
import { validCoord } from "@/lib/geodist";

const cache = new Map<string, { at: number; v: { lat: number; lng: number } | null }>();
const TTL = 10 * 60 * 1000;

export async function geocodeAddress(
  address: string,
  opts: { district?: string | null; city?: string | null; country?: string | null } = {},
): Promise<{ lat: number; lng: number } | null> {
  const text = [address, opts.district, opts.city].map((s) => String(s ?? "").trim()).filter(Boolean).join(", ");
  if (text.length < 5) return null;
  const key = `${text.toLowerCase()}|${opts.country ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const cc = (opts.country ?? "").toLowerCase() === "ge" ? "ge" : "tr,ge";
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=${cc}&q=${encodeURIComponent(text)}`;
  let v: { lat: number; lng: number } | null = null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DampingVar/1.0 (https://www.dampingvar.com.tr)", "Accept-Language": "tr,en" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json()) as Array<{ lat?: string; lon?: string }>;
      const lat = Number(j?.[0]?.lat);
      const lng = Number(j?.[0]?.lon);
      if (validCoord(lat, lng)) v = { lat, lng };
    }
  } catch { v = null; }
  if (v || cache.size < 500) cache.set(key, { at: Date.now(), v });
  return v;
}
