/**
 * Sesli asistan — ürün adı tanınamadığında "en yakın ürün" önerisi (POST).
 *
 * Girdi : { businessId, text }  (text = müşterinin mesaj panosuna düşen cümle)
 * Çıktı : { ok:true, match: string | null, source: "gemini" | "local" | null }
 *
 * Ürün adayları İSTEMCİDEN ALINMAZ: işletmenin AKTİF `products` satırları sunucuda okunur.
 * GEMINI_API_KEY (+ opsiyonel GEMINI_MODEL) yalnız sunucuda okunur. Anahtar yoksa veya
 * Gemini hata verirse yerel bulanık eşleştirme çalışır. Öneri sepete eklenmez; istemci
 * evet/hayır teyidi ister.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findClosestProduct } from "@/lib/product-match";

export const dynamic = "force-dynamic";

/** Basit süreç-içi hız sınırı (IP başına dakikada 20): Gemini kotasını/maliyeti korur. */
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k);
  return arr.length > 20;
}

export async function POST(req: Request) {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
    if (limited(ip)) return NextResponse.json({ ok: false, error: "Çok fazla istek, biraz sonra tekrar dene." }, { status: 429 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const businessId = String(body.businessId ?? "");
    const text = String(body.text ?? "").trim().slice(0, 200);
    if (!businessId || !text) return NextResponse.json({ ok: false, error: "İşletme ve metin gerekli." }, { status: 400 });

    const client = await createClient();
    const { data: biz } = await client.from("businesses").select("id").eq("id", businessId).is("suspended_at", null).maybeSingle();
    if (!biz) return NextResponse.json({ ok: false, error: "İşletme bulunamadı." }, { status: 404 });

    const { data: rows } = await client.from("products").select("name").eq("business_id", businessId).eq("active", true).limit(200);
    const names = ((rows ?? []) as Array<{ name?: unknown }>).map((r) => String(r.name ?? "")).filter(Boolean);

    const r = await findClosestProduct(text, names, {
      apiKey: process.env.GEMINI_API_KEY || undefined,
      model: process.env.GEMINI_MODEL || undefined,
    });
    // Anahtar/ayrıntı sızdırmadan yalnız kısa neden sunucu loguna yazılır.
    if (r.error) console.warn("[voice/match] Gemini kullanılamadı, yerel eşleştirme:", r.error.slice(0, 120));
    return NextResponse.json({ ok: true, match: r.match?.name ?? null, source: r.match?.source ?? null });
  } catch {
    return NextResponse.json({ ok: false, error: "Ürün kontrolü yapılamadı." }, { status: 500 });
  }
}
