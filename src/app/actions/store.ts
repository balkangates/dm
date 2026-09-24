"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, callRequests, oemProductRequests, products, quoteOffers, quoteRequests, shipments, storeOrders, storeProducts, storeSalesInvoices, stores } from "@/db/schema";
import { requireStore } from "@/lib/auth";
import { cents, externalUrl, field, isOfferType, normalizeOem } from "@/lib/core";

function panelError(message: string, tab = "urunler"): never { redirect(`/magaza-paneli?tab=${tab}&error=${encodeURIComponent(message)}`); }

export async function createStoreOfferAction(form: FormData) {
  const { user, store } = await requireStore();
  if (store.status !== "approved") panelError("Ürün eklemek için mağazanızın onaylanması gerekir.");
  const oemNo = field(form, "oemNo"), brand = field(form, "brand").slice(0, 120), type = field(form, "productType");
  const sku = field(form, "sku").slice(0, 120), barcode = field(form, "barcode").slice(0, 120);
  const stock = Number(field(form, "stock"));
  const imageUrl = field(form, "imageUrl");
  let price: number;
  try { price = cents(field(form, "price")); } catch { panelError("Fiyat geçersiz."); }
  if (!normalizeOem(oemNo) || !brand || !sku || !isOfferType(type) || price! <= 0 || !Number.isSafeInteger(stock) || stock < 0 || (imageUrl && !externalUrl(imageUrl))) panelError("OEM, marka, ürün tipi, SKU, fiyat ve stok bilgilerini kontrol edin.");
  const [catalog] = await db.select().from(products).where(eq(products.normalizedOem, normalizeOem(oemNo)));
  if (!catalog || !catalog.isActive) panelError("OEM_NOT_FOUND: Önce OEM ürün talebi oluşturun.");
  try {
    const [offer] = await db.insert(storeProducts).values({ storeId: store.id, catalogProductId: catalog.id, brand, productType: type,
      storeSku: sku, barcode: barcode || null, price: (price! / 100).toFixed(2), stock, imageUrl: imageUrl || null }).returning({ id: storeProducts.id });
    await db.insert(auditLogs).values({ actorId: user.id, action: "offer.created", entityType: "store_product", entityId: offer.id, after: { oemNo: catalog.oemNo, brand, productType: type, price: price! / 100, stock } });
  } catch { panelError("Bu SKU mağazanızda zaten kullanımda."); }
  revalidatePath("/", "layout");
  redirect("/magaza-paneli?tab=urunler&success=Teklif+eklendi");
}

export async function updateStoreOfferAction(form: FormData) {
  const { user, store } = await requireStore();
  const id = field(form, "id"), type = field(form, "productType"), stock = Number(field(form, "stock"));
  const active = field(form, "active") === "on";
  let price: number;
  try { price = cents(field(form, "price")); } catch { panelError("Fiyat geçersiz."); }
  if (!isOfferType(type) || price! <= 0 || !Number.isSafeInteger(stock) || stock < 0) panelError("Fiyat, stok veya ürün tipi geçersiz.");
  const [current] = await db.select().from(storeProducts).where(and(eq(storeProducts.id, id), eq(storeProducts.storeId, store.id)));
  if (!current) panelError("Teklif bulunamadı.");
  await db.transaction(async (tx) => {
    await tx.update(storeProducts).set({ productType: type, price: (price! / 100).toFixed(2), stock, active, updatedAt: new Date() }).where(eq(storeProducts.id, id));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "offer.updated", entityType: "store_product", entityId: id,
      before: { price: current.price, stock: current.stock, productType: current.productType, active: current.active },
      after: { price: (price! / 100).toFixed(2), stock, productType: type, active } });
  });
  revalidatePath("/", "layout");
  redirect("/magaza-paneli?tab=urunler&success=Teklif+güncellendi");
}

export async function requestOemAction(form: FormData) {
  const { user, store } = await requireStore();
  const oemNo = field(form, "oemNo").slice(0, 100), normalizedOem = normalizeOem(oemNo);
  if (!normalizedOem) panelError("Geçerli OEM numarası giriniz.", "yukle");
  const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.normalizedOem, normalizedOem));
  if (existing) panelError("Bu OEM zaten katalogda bulunuyor.", "yukle");
  const suggestedName = field(form, "suggestedName").slice(0, 250) || null;
  const [request] = await db.insert(oemProductRequests).values({ storeId: store.id, oemNo, normalizedOem,
    suggestedName }).onConflictDoUpdate({ target: [oemProductRequests.storeId, oemProductRequests.normalizedOem], set: { oemNo, suggestedName, status: "pending", productId: null } }).returning({ id: oemProductRequests.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "oem.requested", entityType: "oem_request", entityId: request.id, after: { oemNo } });
  revalidatePath("/admin");
  redirect("/magaza-paneli?tab=yukle&success=OEM+talebi+oluşturuldu");
}

export async function submitQuoteOfferAction(form: FormData) {
  const { user, store } = await requireStore();
  if (store.status !== "approved") panelError("Teklif vermek için mağazanızın onaylanması gerekir.", "teklifler");
  const requestId = field(form, "requestId"), brand = field(form, "brand").slice(0, 120), type = field(form, "productType");
  const stock = Number(field(form, "stock")), days = Number(field(form, "validDays"));
  const preparationDays = Number(field(form, "preparationDays"));
  let price: number;
  try { price = cents(field(form, "price")); } catch { panelError("Teklif fiyatı geçersiz.", "teklifler"); }
  if (!brand || !isOfferType(type) || price! <= 0 || !Number.isSafeInteger(stock) || stock < 1 || !Number.isInteger(days) || days < 1 || days > 90 || !Number.isInteger(preparationDays) || preparationDays < 0 || preparationDays > 90) panelError("Teklif bilgilerini kontrol edin.", "teklifler");
  const [request] = await db.select().from(quoteRequests).where(eq(quoteRequests.id, requestId));
  if (!request || request.status !== "open") panelError("Bu talep artık açık değil.", "teklifler");
  const [existing] = await db.select({ id: quoteOffers.id }).from(quoteOffers).where(and(eq(quoteOffers.storeId, store.id), eq(quoteOffers.quoteRequestId, requestId)));
  if (existing) panelError("Bu talebe zaten teklif verdiniz. Rakip teklifler görüntülenemez.", "teklifler");
  const catalogOem = normalizeOem(field(form, "catalogOem"));
  const [catalog] = catalogOem ? await db.select({ id: products.id }).from(products).where(eq(products.normalizedOem, catalogOem)) : [null];
  if (catalogOem && !catalog) panelError("İlişkilendirmek istediğiniz OEM katalogda bulunamadı.", "teklifler");
  const [offer] = await db.insert(quoteOffers).values({ quoteRequestId: requestId, storeId: store.id, catalogProductId: catalog?.id || null,
    brand, productType: type, price: (price! / 100).toFixed(2), stock, shippingInfo: field(form, "shippingInfo").slice(0, 250) || null,
    preparationDays, validityUntil: new Date(Date.now() + days * 86400000), notes: field(form, "notes").slice(0, 1000) || null }).returning({ id: quoteOffers.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "quote.offer_created", entityType: "quote_offer", entityId: offer.id, after: { storeId: store.id, requestId, price: (price! / 100).toFixed(2), productType: type } });
  revalidatePath(`/teklif-al/${requestId}`);
  redirect("/magaza-paneli?tab=teklifler&success=Teklifiniz+gönderildi");
}

export async function createShipmentAction(form: FormData) {
  const { user, store } = await requireStore();
  const storeOrderId = field(form, "storeOrderId"), carrier = field(form, "carrier").slice(0, 100), trackingNumber = field(form, "trackingNumber").slice(0, 120);
  if (!carrier || !trackingNumber) panelError("Kargo firması ve takip numarası gereklidir.", "siparisler");
  await db.transaction(async (tx) => {
    const [part] = await tx.select().from(storeOrders).where(and(eq(storeOrders.id, storeOrderId), eq(storeOrders.storeId, store.id))).for("update");
    if (!part || !["preparing", "shipped"].includes(part.status)) throw new Error("Bu sipariş henüz gönderime uygun değil.");
    await tx.insert(shipments).values({ storeOrderId, carrier, trackingNumber });
    await tx.update(storeOrders).set({ status: "shipped" }).where(eq(storeOrders.id, storeOrderId));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "shipment.created", entityType: "store_order", entityId: storeOrderId, after: { carrier, trackingNumber } });
  }).catch((e) => panelError(e instanceof Error ? e.message : "Kargo kaydedilemedi.", "siparisler"));
  revalidatePath("/siparisler", "layout");
  redirect("/magaza-paneli?tab=siparisler&success=Kargo+bilgileri+kaydedildi");
}

export async function uploadSalesInvoiceAction(form: FormData) {
  const { user, store } = await requireStore();
  const storeOrderId = field(form, "storeOrderId"), invoiceNumber = field(form, "invoiceNumber").slice(0, 100), pdfUrl = field(form, "pdfUrl");
  if (!invoiceNumber || (pdfUrl && !externalUrl(pdfUrl))) panelError("Fatura numarası ve geçerli HTTPS PDF bağlantısı girin.", "siparisler");
  const [part] = await db.select().from(storeOrders).where(and(eq(storeOrders.id, storeOrderId), eq(storeOrders.storeId, store.id)));
  if (!part || part.status === "awaiting_payment") panelError("Bu sipariş için henüz fatura eklenemez.", "siparisler");
  const [existing] = await db.select().from(storeSalesInvoices).where(eq(storeSalesInvoices.storeOrderId, storeOrderId));
  await db.transaction(async (tx) => {
    if (existing) await tx.update(storeSalesInvoices).set({ invoiceNumber, pdfUrl: pdfUrl || null }).where(eq(storeSalesInvoices.id, existing.id));
    else await tx.insert(storeSalesInvoices).values({ storeId: store.id, storeOrderId, invoiceNumber, pdfUrl: pdfUrl || null });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "store_invoice.recorded", entityType: "store_order", entityId: storeOrderId, before: existing ? { invoiceNumber: existing.invoiceNumber } : null, after: { invoiceNumber, pdfUrl: pdfUrl || null } });
  });
  revalidatePath("/siparisler", "layout");
  redirect("/magaza-paneli?tab=siparisler&success=Satış+faturası+kaydedildi");
}

export async function updateCallStatusAction(form: FormData) {
  const { user, store } = await requireStore();
  const id = field(form, "callId"), status = field(form, "status");
  if (!["active", "closed"].includes(status)) panelError("Durum geçersiz.", "canli");
  const [call] = await db.select().from(callRequests).where(and(eq(callRequests.id, id), eq(callRequests.storeId, store.id)));
  if (!call) panelError("Görüşme bulunamadı.", "canli");
  await db.update(callRequests).set({ status }).where(eq(callRequests.id, id));
  await db.insert(auditLogs).values({ actorId: user.id, action: "live.status_changed", entityType: "call_request", entityId: id, before: { status: call.status }, after: { status } });
  revalidatePath(`/canli/${id}`);
  redirect(`/canli/${id}`);
}

export async function updateStoreProfileAction(form: FormData) {
  const { user, store } = await requireStore();
  const description = field(form, "description").slice(0, 1000), iban = field(form, "iban").replace(/\s/g, "").toUpperCase();
  if (iban && !/^TR\d{24}$/.test(iban)) panelError("IBAN geçersiz.", "ayarlar");
  await db.update(stores).set({ description, iban: iban || null, updatedAt: new Date() }).where(eq(stores.id, store.id));
  await db.insert(auditLogs).values({ actorId: user.id, action: "store.profile_updated", entityType: "store", entityId: store.id, after: { ibanChanged: iban !== store.iban } });
  redirect("/magaza-paneli?tab=ayarlar&success=Mağaza+bilgileri+güncellendi");
}
