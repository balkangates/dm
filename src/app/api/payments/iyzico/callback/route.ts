import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, payments } from "@/db/schema";
import { confirmPayment } from "@/lib/finance";
import { retrieveCardPayment } from "@/lib/iyzico";

export async function POST(request: Request) {
  let orderId: string | null = null;
  try {
    const form = await request.formData();
    const token = String(form.get("token") || "");
    if (!token || token.length > 500) throw new Error("Ödeme token'ı bulunamadı.");
    const [payment] = await db.select().from(payments).where(eq(payments.providerToken, token)).limit(1);
    if (!payment || payment.method !== "card") throw new Error("Ödeme kaydı bulunamadı.");
    orderId = payment.orderId;
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw new Error("Sipariş bulunamadı.");
    if (payment.status === "paid") return NextResponse.redirect(new URL(`/siparisler/${orderId}?success=Ödeme+onaylandı`, request.url), 303);
    const providerId = await retrieveCardPayment(token, { orderId, orderNumber: order.orderNumber, total: order.total });
    await confirmPayment(orderId, "card", providerId);
    return NextResponse.redirect(new URL(`/siparisler/${orderId}?success=Kart+ödemeniz+onaylandı`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ödeme doğrulanamadı.";
    return NextResponse.redirect(new URL(orderId ? `/siparisler/${orderId}?error=${encodeURIComponent(message)}` : `/sepet?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
