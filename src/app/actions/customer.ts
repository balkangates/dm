"use server";

import { randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, callRequests, cartItems, commissionRules, favorites, garageVehicles, messages, orderItems, orders, payments, platformSettings, products, quoteOffers, quoteRequests, storeOrders, storeProducts, stores } from "@/db/schema";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { cents, externalUrl, field, money } from "@/lib/core";
import { cancelUnpaidOrder, confirmDelivery } from "@/lib/finance";
import { initializeCardPayment, isCardConfigured } from "@/lib/iyzico";

function err(path: string, message: string): never { redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`); }

export async function addToCartAction(form: FormData) {
  const user = await requireUser();
  const productId = field(form, "productId");
  const quoteOfferId = field(form, "quoteOfferId");
  const quantity = Number(field(form, "quantity") || 1);
  const returnTo = field(form, "returnTo");
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) err("/sepet", "Geçersiz adet.");
  if (quoteOfferId) {
    const [offer] = await db.select({ offer: quoteOffers, request: quoteRequests, store: stores }).from(quoteOffers)
      .innerJoin(quoteRequests, eq(quoteOffers.quoteRequestId, quoteRequests.id)).innerJoin(stores, eq(quoteOffers.storeId, stores.id))
      .where(eq(quoteOffers.id, quoteOfferId)).limit(1);
    if (!offer || offer.request.customerId !== user.id || offer.offer.status !== "active" || offer.offer.validityUntil < new Date() || offer.offer.stock < quantity || offer.store.status !== "approved") err("/teklif-al", "Teklif artık geçerli değil.");
    const [existing] = await db.select().from(cartItems).where(and(eq(cartItems.userId, user.id), eq(cartItems.quoteOfferId, quoteOfferId)));
    if (existing && existing.quantity + quantity > offer.offer.stock) err("/sepet", "Stok miktarı aşıldı.");
    await db.insert(cartItems).values({ userId: user.id, quoteOfferId, quantity }).onConflictDoUpdate({ target: [cartItems.userId, cartItems.quoteOfferId], set: { quantity: sql`${cartItems.quantity} + ${quantity}` } });
  } else {
    const [offer] = await db.select({ offer: storeProducts, catalog: products, store: stores }).from(storeProducts)
      .innerJoin(products, eq(storeProducts.catalogProductId, products.id)).innerJoin(stores, eq(storeProducts.storeId, stores.id))
      .where(eq(storeProducts.id, productId)).limit(1);
    if (!offer || !offer.offer.active || !offer.catalog.isActive || offer.store.status !== "approved" || offer.offer.stock < quantity) err("/parcalar", "Bu ürün şu anda satışta değil.");
    const [existing] = await db.select().from(cartItems).where(and(eq(cartItems.userId, user.id), eq(cartItems.storeProductId, productId)));
    if (existing && existing.quantity + quantity > offer.offer.stock) err("/sepet", "Stok miktarı aşıldı.");
    await db.insert(cartItems).values({ userId: user.id, storeProductId: productId, quantity }).onConflictDoUpdate({ target: [cartItems.userId, cartItems.storeProductId], set: { quantity: sql`${cartItems.quantity} + ${quantity}` } });
  }
  revalidatePath("/sepet");
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}added=1`);
  redirect("/sepet?added=1");
}

export async function updateCartAction(form: FormData) {
  const user = await requireUser();
  const id = field(form, "id");
  const quantity = Number(field(form, "quantity"));
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 100) err("/sepet", "Geçersiz adet.");
  if (quantity === 0) await db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.userId, user.id)));
  else await db.update(cartItems).set({ quantity }).where(and(eq(cartItems.id, id), eq(cartItems.userId, user.id)));
  revalidatePath("/sepet");
  redirect("/sepet");
}

export async function toggleFavoriteAction(form: FormData) {
  const user = await requireUser();
  const productId = field(form, "productId");
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
  if (!product) err("/parcalar", "Ürün bulunamadı.");
  const [existing] = await db.select().from(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.productId, productId)));
  if (existing) await db.delete(favorites).where(eq(favorites.id, existing.id));
  else await db.insert(favorites).values({ userId: user.id, productId });
  revalidatePath("/favoriler");
  revalidatePath(`/parca/${productId}`);
}

export async function addGarageAction(form: FormData) {
  const user = await requireUser();
  const brand = field(form, "brand").slice(0, 100), model = field(form, "model").slice(0, 100);
  const year = Number(field(form, "year"));
  if (!brand || !model || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) err("/garajim", "Marka, model ve geçerli yıl giriniz.");
  await db.insert(garageVehicles).values({ userId: user.id, brand, model, year, engine: field(form, "engine").slice(0, 100) || null, trim: field(form, "trim").slice(0, 100) || null });
  revalidatePath("/garajim");
  redirect("/garajim?success=Araç+garajınıza+eklendi");
}

export async function removeGarageAction(form: FormData) {
  const user = await requireUser();
  await db.delete(garageVehicles).where(and(eq(garageVehicles.id, field(form, "id")), eq(garageVehicles.userId, user.id)));
  revalidatePath("/garajim");
  redirect("/garajim");
}

export async function createQuoteRequestAction(form: FormData) {
  const user = await requireUser();
  const description = field(form, "description").slice(0, 2000);
  const city = field(form, "city").slice(0, 100);
  const quantity = Number(field(form, "quantity") || 1);
  const vehicleYear = Number(field(form, "vehicleYear")) || null;
  if (description.length < 8 || !city || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) err("/teklif-al", "Parça açıklaması, şehir ve geçerli adet gerekli.");
  if (vehicleYear && (vehicleYear < 1950 || vehicleYear > new Date().getFullYear() + 1)) err("/teklif-al", "Araç yılı geçersiz.");
  let photoUrl: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 2_000_000) err("/teklif-al", "Fotoğraf en fazla 2 MB olabilir.");
    const bytes = Buffer.from(await photo.arrayBuffer());
    const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp = bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!jpeg && !png && !webp) err("/teklif-al", "Yalnızca JPG, PNG veya WebP yüklenebilir.");
    photoUrl = `data:image/${jpeg ? "jpeg" : png ? "png" : "webp"};base64,${bytes.toString("base64")}`;
  } else if (field(form, "photoUrl")) {
    photoUrl = externalUrl(field(form, "photoUrl"));
    if (!photoUrl) err("/teklif-al", "Fotoğraf bağlantısı HTTPS olmalıdır.");
  }
  const [request] = await db.insert(quoteRequests).values({ customerId: user.id, vehicleBrand: field(form, "vehicleBrand").slice(0, 100) || null,
    vehicleModel: field(form, "vehicleModel").slice(0, 100) || null, vehicleYear, oemNo: field(form, "oemNo").slice(0, 100) || null,
    description, quantity, brandPreference: field(form, "brandPreference").slice(0, 120) || null, city, photoUrl }).returning({ id: quoteRequests.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "quote.requested", entityType: "quote_request", entityId: request.id });
  revalidatePath("/teklif-al");
  redirect(`/teklif-al/${request.id}?success=Talebiniz+mağazalara+iletildi`);
}

export async function startCallAction(form: FormData) {
  const user = await requireUser();
  const productId = field(form, "storeProductId");
  const [offer] = await db.select({ offer: storeProducts, store: stores }).from(storeProducts).innerJoin(stores, eq(storeProducts.storeId, stores.id)).where(eq(storeProducts.id, productId));
  if (!offer || offer.store.status !== "approved" || !offer.offer.active) err("/parcalar", "Görüşme için mağaza teklifi bulunamadı.");
  const [call] = await db.insert(callRequests).values({ customerId: user.id, storeId: offer.store.id, storeProductId: productId }).returning({ id: callRequests.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "live.requested", entityType: "call_request", entityId: call.id, after: { storeId: offer.store.id, storeProductId: productId } });
  redirect(`/canli/${call.id}`);
}

export async function sendMessageAction(form: FormData) {
  const user = await requireUser();
  const callId = field(form, "callId"), content = field(form, "content").slice(0, 2000);
  if (!content) return;
  const [call] = await db.select({ customerId: callRequests.customerId, ownerId: stores.ownerId }).from(callRequests).innerJoin(stores, eq(callRequests.storeId, stores.id)).where(eq(callRequests.id, callId));
  if (!call || (call.customerId !== user.id && call.ownerId !== user.id && user.role !== "admin")) err("/hesabim", "Bu görüşmeye erişim izniniz yok.");
  await db.insert(messages).values({ callRequestId: callId, senderId: user.id, content });
  revalidatePath(`/canli/${callId}`);
}

export async function cancelOrderAction(form: FormData) {
  const user = await requireUser();
  const id = field(form, "orderId");
  try { await cancelUnpaidOrder(id, user.id); }
  catch (e) { err(`/siparisler/${id}`, e instanceof Error ? e.message : "Sipariş iptal edilemedi."); }
  revalidatePath(`/siparisler/${id}`);
  redirect(`/siparisler/${id}?success=Sipariş+iptal+edildi`);
}

export async function confirmDeliveryAction(form: FormData) {
  const user = await requireUser();
  const id = field(form, "storeOrderId"), orderId = field(form, "orderId");
  try { await confirmDelivery(id, user.id, user.role === "admin"); }
  catch (e) { err(`/siparisler/${orderId}`, e instanceof Error ? e.message : "Teslimat onaylanamadı."); }
  revalidatePath(`/siparisler/${orderId}`);
  redirect(`/siparisler/${orderId}?success=Teslimat+onaylandı`);
}

export async function submitBankReferenceAction(form: FormData) {
  const user = await requireUser();
  const orderId = field(form, "orderId"), reference = field(form, "reference").slice(0, 150);
  if (reference.length < 3) err(`/siparisler/${orderId}`, "Transfer referansı giriniz.");
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, user.id)));
  const [payment] = order ? await db.select().from(payments).where(eq(payments.orderId, orderId)) : [null];
  if (!payment || payment.method !== "bank_transfer" || payment.status !== "pending_verification") err("/siparisler", "Ödeme kaydı bulunamadı.");
  await db.update(payments).set({ reference }).where(eq(payments.id, payment.id));
  await db.insert(auditLogs).values({ actorId: user.id, action: "payment.reference_submitted", entityType: "payment", entityId: payment.id, after: { reference } });
  revalidatePath(`/siparisler/${orderId}`);
  redirect(`/siparisler/${orderId}?success=Referans+kaydedildi.+Ödeme+finans+onayı+bekliyor`);
}

export async function checkoutAction(form: FormData) {
  const user = await requireUser();
  const name = field(form, "name").slice(0, 150), phone = field(form, "phone").slice(0, 30);
  const city = field(form, "city").slice(0, 100), address = field(form, "address").slice(0, 2000);
  const method = field(form, "method") === "card" ? "card" : "bank_transfer";
  const identityNumber = field(form, "identityNumber");
  if (name.length < 2 || phone.length < 10 || !city || address.length < 10) err("/sepet", "Teslimat bilgilerini eksiksiz girin.");
  if (method === "bank_transfer") {
    const [bank] = await db.select().from(platformSettings).where(eq(platformSettings.key, "bank_iban"));
    if (!bank?.value) err("/sepet", "Banka transferi henüz yapılandırılmadı. Lütfen daha sonra tekrar deneyin.");
  }
  if (method === "card" && (!isCardConfigured() || !/^\d{11}$/.test(identityNumber))) err("/sepet", "Kart ödemesi için iyzico yapılandırması ve 11 haneli T.C. kimlik numarası gereklidir.");

  type PreparedItem = { storeId: string; name: string; oemNo: string | null; brand: string; type: "original" | "aftermarket" | "equivalent";
    sku: string | null; unitCents: number; quantity: number; storeProductId: string | null; quoteOfferId: string | null;
    productId: string | null; categoryId: string | null; storeRate: string; cartId: string; commissionRate?: string; commissionCents?: number };
  let created: { id: string; number: string; total: string; items: { id: string; name: string; price: string; category: string }[] };
  try {
    created = await db.transaction(async (tx) => {
      const cart = await tx.select().from(cartItems).where(eq(cartItems.userId, user.id)).for("update");
      if (!cart.length) throw new Error("Sepetiniz boş.");
      const prepared: PreparedItem[] = [];
      for (const row of cart) {
        if (!Number.isInteger(row.quantity) || row.quantity < 1) throw new Error("Geçersiz ürün adedi.");
        if (row.storeProductId) {
          const [offer] = await tx.select().from(storeProducts).where(eq(storeProducts.id, row.storeProductId)).for("update");
          if (!offer || !offer.active || offer.stock < row.quantity) throw new Error("Ürünlerden birinin stoğu değişti. Sepetinizi kontrol edin.");
          const [catalog] = await tx.select().from(products).where(eq(products.id, offer.catalogProductId));
          const [store] = await tx.select().from(stores).where(eq(stores.id, offer.storeId));
          if (!catalog?.isActive || store?.status !== "approved") throw new Error("Bir ürün artık satışta değil.");
          prepared.push({ storeId: store.id, name: catalog.productName, oemNo: catalog.oemNo, brand: offer.brand,
            type: offer.productType, sku: offer.storeSku, unitCents: cents(offer.price), quantity: row.quantity,
            storeProductId: offer.id, quoteOfferId: null, productId: catalog.id, categoryId: catalog.categoryId,
            storeRate: store.commissionRate, cartId: row.id });
        } else if (row.quoteOfferId) {
          const [offer] = await tx.select().from(quoteOffers).where(eq(quoteOffers.id, row.quoteOfferId)).for("update");
          if (!offer || offer.status !== "active" || offer.validityUntil < new Date() || offer.stock < row.quantity) throw new Error("Sepetinizdeki teklif artık geçerli değil.");
          const [request] = await tx.select().from(quoteRequests).where(eq(quoteRequests.id, offer.quoteRequestId));
          const [store] = await tx.select().from(stores).where(eq(stores.id, offer.storeId));
          if (!request || request.customerId !== user.id || store?.status !== "approved") throw new Error("Teklif erişimi geçersiz.");
          const [catalog] = offer.catalogProductId ? await tx.select().from(products).where(eq(products.id, offer.catalogProductId)) : [null];
          prepared.push({ storeId: store.id, name: catalog?.productName || request.description.slice(0, 250),
            oemNo: catalog?.oemNo || request.oemNo, brand: offer.brand, type: offer.productType, sku: null,
            unitCents: cents(offer.price), quantity: row.quantity, storeProductId: null, quoteOfferId: offer.id,
            productId: catalog?.id || null, categoryId: catalog?.categoryId || null, storeRate: store.commissionRate, cartId: row.id });
        } else throw new Error("Geçersiz sepet satırı.");
      }
      const rules = await tx.select().from(commissionRules).where(eq(commissionRules.active, true));
      for (const item of prepared) {
        const rule = rules.find((r) => r.productId && r.productId === item.productId)
          || rules.find((r) => r.storeId && r.storeId === item.storeId && !r.productId)
          || rules.find((r) => r.categoryId && r.categoryId === item.categoryId && !r.storeId && !r.productId);
        const rate = rule?.rate || item.storeRate;
        const basisPoints = Math.round(Number(rate) * 100);
        if (basisPoints < 0 || basisPoints > 10000) throw new Error("Komisyon kuralı geçersiz.");
        item.commissionRate = Number(rate).toFixed(2);
        item.commissionCents = Math.round(item.unitCents * item.quantity * basisPoints / 10000);
      }
      const totalCents = prepared.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
      if (totalCents <= 0) throw new Error("Sepet toplamı geçersiz.");
      const orderNumber = `DV-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const [order] = await tx.insert(orders).values({ orderNumber, userId: user.id, total: money(totalCents), shippingName: name,
        shippingPhone: phone, shippingCity: city, shippingAddress: address, paymentMethod: method }).returning();
      const groups = new Map<string, PreparedItem[]>();
      for (const item of prepared) groups.set(item.storeId, [...(groups.get(item.storeId) || []), item]);
      const basket: { id: string; name: string; price: string; category: string }[] = [];
      for (const [storeId, items] of groups) {
        const subtotal = items.reduce((n, item) => n + item.unitCents * item.quantity, 0);
        const commission = items.reduce((n, item) => n + (item.commissionCents || 0), 0);
        const [part] = await tx.insert(storeOrders).values({ orderId: order.id, storeId, subtotal: money(subtotal), commissionTotal: money(commission), payoutAmount: money(subtotal - commission) }).returning();
        for (const item of items) {
          const line = item.unitCents * item.quantity;
          const [snapshot] = await tx.insert(orderItems).values({ orderId: order.id, storeOrderId: part.id, storeProductId: item.storeProductId,
            quoteOfferId: item.quoteOfferId, productName: item.name, oemNo: item.oemNo, brand: item.brand, productType: item.type,
            sku: item.sku, unitPrice: money(item.unitCents), quantity: item.quantity, lineTotal: money(line),
            commissionRate: item.commissionRate!, commissionAmount: money(item.commissionCents!) }).returning({ id: orderItems.id });
          if (item.storeProductId) await tx.update(storeProducts).set({ stock: sql`${storeProducts.stock} - ${item.quantity}`, updatedAt: new Date() }).where(and(eq(storeProducts.id, item.storeProductId), gt(storeProducts.stock, item.quantity - 1)));
          if (item.quoteOfferId) {
            const [quote] = await tx.select({ requestId: quoteOffers.quoteRequestId }).from(quoteOffers).where(eq(quoteOffers.id, item.quoteOfferId));
            await tx.update(quoteOffers).set({ stock: sql`${quoteOffers.stock} - ${item.quantity}`, status: "converted" }).where(eq(quoteOffers.id, item.quoteOfferId));
            await tx.update(quoteRequests).set({ status: "fulfilled" }).where(eq(quoteRequests.id, quote.requestId));
          }
          basket.push({ id: snapshot.id, name: item.name, price: money(line), category: "Otomotiv yedek parça" });
        }
      }
      await tx.insert(payments).values({ orderId: order.id, method, amount: money(totalCents), status: method === "card" ? "card_pending" : "pending_verification" });
      await tx.delete(cartItems).where(eq(cartItems.userId, user.id));
      await tx.insert(auditLogs).values({ actorId: user.id, action: "order.created", entityType: "order", entityId: order.id, after: { orderNumber, storeCount: groups.size, method } });
      return { id: order.id, number: orderNumber, total: money(totalCents), items: basket };
    });
  } catch (e) { err("/sepet", e instanceof Error ? e.message : "Sipariş oluşturulamadı."); }

  if (method === "card") {
    try {
      const h = await headers();
      const host = h.get("x-forwarded-host") || h.get("host") || "";
      const protocol = h.get("x-forwarded-proto") || "https";
      const origin = process.env.APP_URL || `${protocol}://${host}`;
      if (!/^https:\/\//.test(origin)) throw new Error("Kart ödemesi için HTTPS adresi gerekli.");
      const payment = await initializeCardPayment({ orderId: created!.id, orderNumber: created!.number, total: created!.total,
        name, email: user.email, phone, identityNumber, city, address, ip: (h.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim(), callbackOrigin: origin,
        items: created!.items });
      await db.update(payments).set({ providerToken: payment.token }).where(eq(payments.orderId, created!.id));
      revalidatePath("/siparisler");
      redirect(payment.url);
    } catch (e) {
      // A redirect is thrown internally by Next.js and must not be treated as a payment error.
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
      await cancelUnpaidOrder(created!.id, null, true);
      err("/sepet", e instanceof Error ? e.message : "Ödeme sayfası başlatılamadı.");
    }
  }
  revalidatePath("/siparisler");
  redirect(`/siparisler/${created!.id}?success=Siparişiniz+oluşturuldu`);
}

export async function isSignedIn() { return !!(await getCurrentUser()); }
