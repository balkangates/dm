/**
 * Yemek sepeti siparişi (POST) — işletme sayfasındaki "Menü ve Sipariş" modülü.
 * Sesli asistan rotası (/api/voice) ayrıdır ve değiştirilmemiştir; çekirdek mantık lib/order-submit.ts'tedir.
 */
import { NextResponse } from "next/server";
import { placeOrder } from "@/lib/order-submit";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400 });
  return placeOrder(body, "WEB");
}
