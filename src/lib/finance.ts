import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, cartItems, commissionInvoices, commissionTransactions, orderItems, orders, payments, quoteOffers, quoteRequests, shipments, storeBalances, storeLedger, storeOrders, storeProducts } from "@/db/schema";
import { cents, money } from "@/lib/core";

export async function confirmPayment(orderId: string, method: "card" | "bank_transfer", reference: string, actorId: string | null = null) {
  await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.orderId, orderId)).for("update");
    if (!payment || payment.method !== method || (method === "card" ? payment.status !== "card_pending" : payment.status !== "pending_verification")) {
      if (payment?.status === "paid") return;
      throw new Error("Ödeme doğrulanamadı veya zaten işlendi.");
    }
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || order.status !== "awaiting_payment") throw new Error("Sipariş ödeme için uygun değil.");
    await tx.update(payments).set({ status: "paid", verifiedAt: new Date(), reference, providerPaymentId: method === "card" ? reference : null }).where(eq(payments.id, payment.id));
    await tx.update(orders).set({ status: "paid" }).where(eq(orders.id, orderId));
    const parts = await tx.select().from(storeOrders).where(eq(storeOrders.orderId, orderId));
    for (const part of parts) {
      await tx.update(storeOrders).set({ status: "preparing" }).where(eq(storeOrders.id, part.id));
      await tx.update(storeBalances).set({ pendingAmount: sql`${storeBalances.pendingAmount} + ${part.payoutAmount}`, updatedAt: new Date() }).where(eq(storeBalances.storeId, part.storeId));
      await tx.insert(storeLedger).values({ storeId: part.storeId, storeOrderId: part.id, type: "pending_accrual", amount: part.payoutAmount, description: `Ödeme doğrulandı · ${order.orderNumber}`, referenceKey: `paid:${part.id}` });
    }
    await tx.insert(auditLogs).values({ actorId, action: "payment.confirmed", entityType: "order", entityId: orderId, after: { method, reference } });
  });
}

export async function confirmDelivery(storeOrderId: string, actorId: string, admin = false) {
  await db.transaction(async (tx) => {
    const [part] = await tx.select().from(storeOrders).where(eq(storeOrders.id, storeOrderId)).for("update");
    if (!part) throw new Error("Mağaza siparişi bulunamadı.");
    const [order] = await tx.select().from(orders).where(eq(orders.id, part.orderId));
    if (!admin && order.userId !== actorId) throw new Error("Bu sipariş size ait değil.");
    if (part.status === "delivered") return;
    if (part.status !== "shipped") throw new Error("Teslimat için önce kargo gönderilmelidir.");
    const [payment] = await tx.select().from(payments).where(eq(payments.orderId, order.id));
    if (!payment || payment.status !== "paid") throw new Error("Ödeme henüz doğrulanmadı.");
    const deliveryTime = new Date();
    await tx.update(storeOrders).set({ status: "delivered", deliveredAt: deliveryTime }).where(eq(storeOrders.id, part.id));
    await tx.update(shipments).set({ status: "delivered", deliveredAt: deliveryTime }).where(and(eq(shipments.storeOrderId, part.id), eq(shipments.status, "shipped")));
    await tx.update(storeBalances).set({
      pendingAmount: sql`${storeBalances.pendingAmount} - ${part.payoutAmount}`,
      availableAmount: sql`${storeBalances.availableAmount} + ${part.payoutAmount}`,
      commissionTotal: sql`${storeBalances.commissionTotal} + ${part.commissionTotal}`,
      updatedAt: deliveryTime,
    }).where(eq(storeBalances.storeId, part.storeId));
    await tx.insert(storeLedger).values({ storeId: part.storeId, storeOrderId: part.id, type: "delivery_settlement", amount: part.payoutAmount, description: `Teslimat sonrası hakediş · ${order.orderNumber}`, referenceKey: `delivered:${part.id}` });
    await tx.insert(commissionTransactions).values({ storeOrderId: part.id, storeId: part.storeId, amount: part.commissionTotal, type: "earned" });
    await tx.insert(commissionInvoices).values({ storeOrderId: part.id, storeId: part.storeId, amount: part.commissionTotal, status: "draft" });
    const siblings = await tx.select({ status: storeOrders.status }).from(storeOrders).where(eq(storeOrders.orderId, order.id));
    const parentStatus = siblings.every((s) => s.status === "delivered") ? "delivered" : siblings.some((s) => s.status === "refunded") ? "partially_refunded" : "partially_delivered";
    await tx.update(orders).set({ status: parentStatus }).where(eq(orders.id, order.id));
    await tx.insert(auditLogs).values({ actorId, action: "delivery.confirmed", entityType: "store_order", entityId: part.id, after: { payoutAmount: part.payoutAmount, commission: part.commissionTotal } });
  });
}

export async function cancelUnpaidOrder(orderId: string, actorId: string | null, restoreCart = false) {
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new Error("Sipariş bulunamadı.");
    if (actorId && order.userId !== actorId) throw new Error("Bu sipariş size ait değil.");
    if (order.status === "cancelled") return;
    if (order.status !== "awaiting_payment") throw new Error("Ödenmiş sipariş bu işlemle iptal edilemez.");
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      if (item.storeProductId) await tx.update(storeProducts).set({ stock: sql`${storeProducts.stock} + ${item.quantity}`, updatedAt: new Date() }).where(eq(storeProducts.id, item.storeProductId));
      if (item.quoteOfferId) {
        const [offer] = await tx.select({ requestId: quoteOffers.quoteRequestId }).from(quoteOffers).where(eq(quoteOffers.id, item.quoteOfferId));
        await tx.update(quoteOffers).set({ stock: sql`${quoteOffers.stock} + ${item.quantity}`, status: "active" }).where(eq(quoteOffers.id, item.quoteOfferId));
        if (offer) await tx.update(quoteRequests).set({ status: "open" }).where(eq(quoteRequests.id, offer.requestId));
      }
      if (restoreCart) await tx.insert(cartItems).values({ userId: order.userId, storeProductId: item.storeProductId, quoteOfferId: item.quoteOfferId, quantity: item.quantity }).onConflictDoNothing();
    }
    await tx.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    await tx.update(storeOrders).set({ status: "cancelled" }).where(eq(storeOrders.orderId, order.id));
    await tx.update(payments).set({ status: "cancelled" }).where(eq(payments.orderId, order.id));
    await tx.insert(auditLogs).values({ actorId, action: "order.cancelled", entityType: "order", entityId: order.id, after: { restoreCart } });
  });
}

export async function reverseStoreOrder(storeOrderId: string, actorId: string, refundReference: string) {
  if (!refundReference.trim()) throw new Error("Doğrulanmış iade referansı gerekli.");
  await db.transaction(async (tx) => {
    const [part] = await tx.select().from(storeOrders).where(eq(storeOrders.id, storeOrderId)).for("update");
    if (!part || !["preparing", "shipped", "delivered"].includes(part.status)) throw new Error("İade için uygun mağaza siparişi bulunamadı.");
    const [order] = await tx.select().from(orders).where(eq(orders.id, part.orderId));
    const [payment] = await tx.select().from(payments).where(eq(payments.orderId, order.id));
    if (!payment || payment.status !== "paid") throw new Error("Yalnızca doğrulanmış ödeme iade edilebilir.");
    if (payment.method === "card") throw new Error("Kart iadesi önce iyzico üzerinden doğrulanmalıdır; bankadan manuel iade kaydı yapılamaz.");
    const delivered = part.status === "delivered";
    if (delivered) {
      await tx.select().from(storeBalances).where(eq(storeBalances.storeId, part.storeId)).for("update");
      await tx.update(storeBalances).set({ availableAmount: sql`${storeBalances.availableAmount} - ${part.payoutAmount}`, commissionTotal: sql`${storeBalances.commissionTotal} - ${part.commissionTotal}`, refundTotal: sql`${storeBalances.refundTotal} + ${part.payoutAmount}`, updatedAt: new Date() }).where(eq(storeBalances.storeId, part.storeId));
      await tx.insert(commissionTransactions).values({ storeOrderId: part.id, storeId: part.storeId, type: "reversed", amount: money(-cents(part.commissionTotal)) });
      await tx.update(commissionInvoices).set({ status: "void" }).where(and(eq(commissionInvoices.storeOrderId, part.id), eq(commissionInvoices.status, "draft")));
    } else {
      await tx.update(storeBalances).set({ pendingAmount: sql`${storeBalances.pendingAmount} - ${part.payoutAmount}`, refundTotal: sql`${storeBalances.refundTotal} + ${part.payoutAmount}`, updatedAt: new Date() }).where(eq(storeBalances.storeId, part.storeId));
      const items = await tx.select().from(orderItems).where(eq(orderItems.storeOrderId, part.id));
      for (const item of items) {
        if (item.storeProductId) await tx.update(storeProducts).set({ stock: sql`${storeProducts.stock} + ${item.quantity}` }).where(eq(storeProducts.id, item.storeProductId));
        if (item.quoteOfferId) await tx.update(quoteOffers).set({ stock: sql`${quoteOffers.stock} + ${item.quantity}`, status: "active" }).where(eq(quoteOffers.id, item.quoteOfferId));
      }
    }
    await tx.insert(storeLedger).values({ storeId: part.storeId, storeOrderId: part.id, type: "refund_reversal", amount: money(-cents(part.payoutAmount)), description: `Doğrulanmış iade · ${refundReference}`, referenceKey: `refund:${part.id}` });
    await tx.update(storeOrders).set({ status: "refunded" }).where(eq(storeOrders.id, part.id));
    const siblings = await tx.select({ status: storeOrders.status }).from(storeOrders).where(eq(storeOrders.orderId, order.id));
    await tx.update(orders).set({ status: siblings.every((s) => s.status === "refunded" || (siblings.length === 1 && s.status === part.status)) ? "refunded" : "partially_refunded" }).where(eq(orders.id, order.id));
    if (siblings.length === 1) await tx.update(payments).set({ status: "refunded", reference: refundReference }).where(eq(payments.id, payment.id));
    await tx.insert(auditLogs).values({ actorId, action: "refund.recorded", entityType: "store_order", entityId: part.id, after: { reference: refundReference, amount: part.subtotal } });
  });
}
