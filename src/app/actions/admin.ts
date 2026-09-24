"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, categories, commissionInvoices, commissionRules, oemProductRequests, platformSettings, products, storeBalances, storeLedger, storeOrders, storePayouts, storeProducts, stores, vehicleBrands, vehicleModels, productVehicleFitments } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { cents, externalUrl, field, isOfferType, normalizeOem, slugify } from "@/lib/core";
import { confirmPayment, reverseStoreOrder } from "@/lib/finance";

function adminError(message: string, tab = "katalog"): never { redirect(`/admin?tab=${tab}&error=${encodeURIComponent(message)}`); }

export async function createCatalogProductAction(form: FormData) {
  const user = await requireAdmin();
  const oemNo = field(form, "oemNo").slice(0, 100), normalizedOem = normalizeOem(oemNo);
  const productName = field(form, "productName").slice(0, 250);
  const categoryId = field(form, "categoryId") || null;
  if (!normalizedOem || productName.length < 3) adminError("OEM ve standart ürün adı gerekli.");
  if (categoryId) {
    const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId));
    if (!category) adminError("Kategori bulunamadı.");
  }
  try {
    const [product] = await db.insert(products).values({ oemNo, normalizedOem, productName, categoryId,
      description: field(form, "description").slice(0, 2000) || null, unit: field(form, "unit").slice(0, 30) || "Adet" }).returning({ id: products.id });
    await db.insert(auditLogs).values({ actorId: user.id, action: "catalog.created", entityType: "product", entityId: product.id, after: { oemNo, normalizedOem, productName } });
  } catch { adminError("Bu OEM merkezi katalogda zaten bulunuyor."); }
  revalidatePath("/", "layout");
  redirect("/admin?tab=katalog&success=Merkezi+ürün+oluşturuldu");
}

export async function updateCatalogProductAction(form: FormData) {
  const user = await requireAdmin();
  const id = field(form, "id"), productName = field(form, "productName").slice(0, 250);
  const description = field(form, "description").slice(0, 2000);
  const isActive = field(form, "isActive") === "on";
  if (productName.length < 3) adminError("Geçerli standart ürün adı gerekli.");
  const [current] = await db.select().from(products).where(eq(products.id, id));
  if (!current) adminError("Ürün bulunamadı.");
  await db.transaction(async (tx) => {
    await tx.update(products).set({ productName, description, isActive, updatedAt: new Date() }).where(eq(products.id, id));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "catalog.updated", entityType: "product", entityId: id,
      before: { productName: current.productName, description: current.description, isActive: current.isActive }, after: { productName, description, isActive } });
  });
  revalidatePath("/", "layout");
  redirect("/admin?tab=katalog&success=Merkezi+ürün+güncellendi");
}

export async function approveOemRequestAction(form: FormData) {
  const user = await requireAdmin();
  const id = field(form, "id"), productName = field(form, "productName").slice(0, 250), categoryId = field(form, "categoryId") || null;
  if (productName.length < 3) adminError("Standart ürün adı girilmelidir.", "oem");
  await db.transaction(async (tx) => {
    const [request] = await tx.select().from(oemProductRequests).where(eq(oemProductRequests.id, id)).for("update");
    if (!request || request.status !== "pending") throw new Error("Talep zaten işlenmiş.");
    let [product] = await tx.select({ id: products.id }).from(products).where(eq(products.normalizedOem, request.normalizedOem));
    if (!product) {
      [product] = await tx.insert(products).values({ oemNo: request.oemNo, normalizedOem: request.normalizedOem,
        productName, categoryId }).returning({ id: products.id });
    }
    await tx.update(oemProductRequests).set({ status: "approved", productId: product.id }).where(eq(oemProductRequests.id, id));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "oem.approved", entityType: "oem_request", entityId: id, after: { productId: product.id, productName } });
  }).catch((e) => adminError(e instanceof Error ? e.message : "OEM onaylanamadı.", "oem"));
  revalidatePath("/", "layout");
  redirect("/admin?tab=oem&success=OEM+merkezi+kataloğa+eklendi");
}

export async function rejectOemRequestAction(form: FormData) {
  const user = await requireAdmin();
  const id = field(form, "id");
  await db.update(oemProductRequests).set({ status: "rejected" }).where(and(eq(oemProductRequests.id, id), eq(oemProductRequests.status, "pending")));
  await db.insert(auditLogs).values({ actorId: user.id, action: "oem.rejected", entityType: "oem_request", entityId: id });
  revalidatePath("/admin");
  redirect("/admin?tab=oem&success=Talep+reddedildi");
}

export async function reviewStoreAction(form: FormData) {
  const user = await requireAdmin();
  const id = field(form, "id"), status = field(form, "status");
  if (!["approved", "suspended", "pending"].includes(status)) adminError("Durum geçersiz.", "magazalar");
  const [current] = await db.select().from(stores).where(eq(stores.id, id));
  if (!current) adminError("Mağaza bulunamadı.", "magazalar");
  await db.transaction(async (tx) => {
    await tx.update(stores).set({ status, updatedAt: new Date() }).where(eq(stores.id, id));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "store.reviewed", entityType: "store", entityId: id, before: { status: current.status }, after: { status } });
  });
  revalidatePath("/", "layout");
  redirect("/admin?tab=magazalar&success=Mağaza+durumu+güncellendi");
}

export async function verifyBankPaymentAction(form: FormData) {
  const user = await requireAdmin();
  const orderId = field(form, "orderId"), reference = field(form, "reference").slice(0, 150);
  if (reference.length < 3) adminError("Banka işlem referansı gereklidir.", "odemeler");
  try { await confirmPayment(orderId, "bank_transfer", reference, user.id); }
  catch (e) { adminError(e instanceof Error ? e.message : "Ödeme doğrulanamadı.", "odemeler"); }
  revalidatePath("/siparisler", "layout");
  redirect("/admin?tab=odemeler&success=Ödeme+doğrulandı");
}

export async function updateCommissionAction(form: FormData) {
  const user = await requireAdmin();
  const storeId = field(form, "storeId"), categoryId = field(form, "categoryId"), productId = field(form, "productId");
  const rate = Number(field(form, "rate").replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) adminError("Komisyon oranı 0–100 arasında olmalı.", "komisyon");
  if (!storeId && !categoryId && !productId) adminError("Mağaza, kategori veya ürün seçin.", "komisyon");
  if (storeId && !categoryId && !productId) {
    const [current] = await db.select().from(stores).where(eq(stores.id, storeId));
    if (!current) adminError("Mağaza bulunamadı.", "komisyon");
    await db.update(stores).set({ commissionRate: rate.toFixed(2) }).where(eq(stores.id, storeId));
    await db.insert(auditLogs).values({ actorId: user.id, action: "commission.store_rate_changed", entityType: "store", entityId: storeId, before: { rate: current.commissionRate }, after: { rate: rate.toFixed(2) } });
  } else {
    const [rule] = await db.insert(commissionRules).values({ storeId: storeId || null, categoryId: categoryId || null, productId: productId || null, rate: rate.toFixed(2) }).returning({ id: commissionRules.id });
    await db.insert(auditLogs).values({ actorId: user.id, action: "commission.rule_created", entityType: "commission_rule", entityId: rule.id, after: { rate, storeId, categoryId, productId } });
  }
  redirect("/admin?tab=komisyon&success=Komisyon+kuralı+kaydedildi");
}

export async function createCategoryAction(form: FormData) {
  const user = await requireAdmin();
  const name = field(form, "name").slice(0, 100), slug = slugify(name);
  if (!name || !slug) adminError("Kategori adı gerekli.", "katalog");
  try {
    const [item] = await db.insert(categories).values({ name, slug, parentId: field(form, "parentId") || null }).returning({ id: categories.id });
    await db.insert(auditLogs).values({ actorId: user.id, action: "category.created", entityType: "category", entityId: item.id, after: { name } });
  } catch { adminError("Bu kategori zaten var.", "katalog"); }
  revalidatePath("/", "layout");
  redirect("/admin?tab=katalog&success=Kategori+eklendi");
}

export async function createVehicleFitmentAction(form: FormData) {
  const user = await requireAdmin();
  const productId = field(form, "productId"), brandName = field(form, "brand").slice(0, 100), modelName = field(form, "model").slice(0, 100);
  const yearFrom = Number(field(form, "yearFrom")) || null, yearTo = Number(field(form, "yearTo")) || null;
  if (!productId || !brandName || !modelName || (yearFrom && yearTo && yearFrom > yearTo)) adminError("Araç uyumluluğu bilgileri geçersiz.", "katalog");
  const [catalog] = await db.select().from(products).where(eq(products.id, productId));
  if (!catalog) adminError("Merkezi ürün bulunamadı.", "katalog");
  await db.transaction(async (tx) => {
    let [brand] = await tx.select().from(vehicleBrands).where(eq(vehicleBrands.name, brandName));
    if (!brand) [brand] = await tx.insert(vehicleBrands).values({ name: brandName }).onConflictDoUpdate({ target: vehicleBrands.name, set: { name: brandName } }).returning();
    let [model] = await tx.select().from(vehicleModels).where(and(eq(vehicleModels.brandId, brand.id), eq(vehicleModels.name, modelName)));
    if (!model) [model] = await tx.insert(vehicleModels).values({ brandId: brand.id, name: modelName }).onConflictDoUpdate({ target: [vehicleModels.brandId, vehicleModels.name], set: { name: modelName } }).returning();
    const [fit] = await tx.insert(productVehicleFitments).values({ productId, vehicleModelId: model.id, yearFrom, yearTo, engine: field(form, "engine").slice(0, 100) || null }).returning({ id: productVehicleFitments.id });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "fitment.created", entityType: "product_fitment", entityId: fit.id, after: { productId, brandName, modelName, yearFrom, yearTo } });
  });
  redirect("/admin?tab=katalog&success=Araç+uyumluluğu+eklendi");
}

export async function createPayoutAction(form: FormData) {
  const user = await requireAdmin();
  const storeId = field(form, "storeId");
  let payoutCents: number;
  try { payoutCents = cents(field(form, "amount")); } catch { adminError("Tutar geçersiz.", "finans"); }
  if (payoutCents! <= 0) adminError("Tutar sıfırdan büyük olmalı.", "finans");
  await db.transaction(async (tx) => {
    const [balance] = await tx.select().from(storeBalances).where(eq(storeBalances.storeId, storeId)).for("update");
    if (!balance || cents(balance.availableAmount) < payoutCents!) throw new Error("Kullanılabilir bakiye yetersiz.");
    const [payout] = await tx.insert(storePayouts).values({ storeId, amount: (payoutCents! / 100).toFixed(2) }).returning({ id: storePayouts.id });
    await tx.update(storeBalances).set({ availableAmount: sql`${storeBalances.availableAmount} - ${(payoutCents! / 100).toFixed(2)}`, updatedAt: new Date() }).where(eq(storeBalances.storeId, storeId));
    await tx.insert(storeLedger).values({ storeId, type: "payout_reserved", amount: (-payoutCents! / 100).toFixed(2), description: "Hakediş ödemesi için ayrıldı", referenceKey: `payout:${payout.id}` });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "payout.created", entityType: "payout", entityId: payout.id, after: { storeId, amount: payoutCents! / 100 } });
  }).catch((e) => adminError(e instanceof Error ? e.message : "Ödeme oluşturulamadı.", "finans"));
  revalidatePath("/magaza-paneli");
  redirect("/admin?tab=finans&success=Hakediş+ödemesi+oluşturuldu");
}

export async function markPayoutPaidAction(form: FormData) {
  const user = await requireAdmin();
  const id = field(form, "id"), bankReference = field(form, "bankReference").slice(0, 150);
  if (bankReference.length < 3) adminError("Banka dekont referansı gerekli.", "finans");
  await db.transaction(async (tx) => {
    const [payout] = await tx.select().from(storePayouts).where(eq(storePayouts.id, id)).for("update");
    if (!payout || payout.status !== "pending") throw new Error("Ödeme bulunamadı veya zaten tamamlandı.");
    await tx.update(storePayouts).set({ status: "paid", bankReference, paidAt: new Date() }).where(eq(storePayouts.id, id));
    await tx.update(storeBalances).set({ paidTotal: sql`${storeBalances.paidTotal} + ${payout.amount}`, updatedAt: new Date() }).where(eq(storeBalances.storeId, payout.storeId));
    await tx.insert(storeLedger).values({ storeId: payout.storeId, type: "payout_confirmed", amount: "0.00", description: `Banka ödemesi doğrulandı · ${bankReference}`, referenceKey: `payout-paid:${id}` });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "payout.paid", entityType: "payout", entityId: id, after: { bankReference } });
  }).catch((e) => adminError(e instanceof Error ? e.message : "Ödeme kaydedilemedi.", "finans"));
  revalidatePath("/magaza-paneli");
  redirect("/admin?tab=finans&success=Hakediş+ödemesi+onaylandı");
}

export async function recordRefundAction(form: FormData) {
  const user = await requireAdmin();
  const reference = field(form, "reference").slice(0, 150), id = field(form, "storeOrderId");
  try { await reverseStoreOrder(id, user.id, reference); }
  catch (e) { adminError(e instanceof Error ? e.message : "İade kaydedilemedi.", "finans"); }
  revalidatePath("/siparisler", "layout");
  redirect("/admin?tab=finans&success=İade+ters+finans+hareketiyle+kaydedildi");
}

export async function issueCommissionInvoiceAction(form: FormData) {
  const user = await requireAdmin();
  const id = field(form, "id"), invoiceNumber = field(form, "invoiceNumber").slice(0, 100), pdfUrl = field(form, "pdfUrl");
  if (!invoiceNumber || !externalUrl(pdfUrl)) adminError("Gerçek fatura numarası ve HTTPS PDF bağlantısı gerekli.", "finans");
  const [invoice] = await db.select().from(commissionInvoices).where(eq(commissionInvoices.id, id));
  if (!invoice || invoice.status !== "draft") adminError("Fatura taslağı bulunamadı.", "finans");
  await db.update(commissionInvoices).set({ invoiceNumber, pdfUrl, status: "issued" }).where(eq(commissionInvoices.id, id));
  await db.insert(auditLogs).values({ actorId: user.id, action: "commission_invoice.issued", entityType: "commission_invoice", entityId: id, after: { invoiceNumber } });
  redirect("/admin?tab=finans&success=Komisyon+faturası+kaydedildi");
}

export async function savePayoutPeriodAction(form: FormData) {
  const user = await requireAdmin();
  const days = Number(field(form, "days"));
  if (!Number.isInteger(days) || days < 1 || days > 365) adminError("Periyot 1–365 gün arasında olmalı.", "finans");
  await db.insert(platformSettings).values({ key: "payout_interval_days", value: String(days) }).onConflictDoUpdate({ target: platformSettings.key, set: { value: String(days), updatedAt: new Date() } });
  await db.insert(auditLogs).values({ actorId: user.id, action: "settings.payout_period", entityType: "setting", entityId: "payout_interval_days", after: { days } });
  redirect("/admin?tab=finans&success=Ödeme+periyodu+güncellendi");
}

export async function saveBankDetailsAction(form: FormData) {
  const user = await requireAdmin();
  const iban = field(form, "iban").replace(/\s/g, "").toUpperCase();
  const bankName = field(form, "bankName").slice(0, 120);
  const accountHolder = field(form, "accountHolder").slice(0, 150);
  if (!/^TR\d{24}$/.test(iban) || !bankName || !accountHolder) adminError("Banka adı, hesap sahibi ve geçerli TR IBAN gereklidir.", "finans");
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries({ bank_iban: iban, bank_name: bankName, bank_holder: accountHolder })) {
      await tx.insert(platformSettings).values({ key, value }).onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
    }
    await tx.insert(auditLogs).values({ actorId: user.id, action: "settings.bank_details", entityType: "setting", entityId: "bank_transfer", after: { bankName, accountHolder, ibanLastFour: iban.slice(-4) } });
  });
  revalidatePath("/sepet");
  redirect("/admin?tab=finans&success=Banka+bilgileri+kaydedildi");
}

export async function adminCorrectOfferAction(form: FormData) {
  const user = await requireAdmin();
  const id = field(form, "id"), brand = field(form, "brand").slice(0, 120), type = field(form, "productType");
  if (!brand || !isOfferType(type)) adminError("Marka veya ürün tipi geçersiz.", "teklifler");
  const [current] = await db.select().from(storeProducts).where(eq(storeProducts.id, id));
  if (!current) adminError("Mağaza ürünü bulunamadı.", "teklifler");
  await db.update(storeProducts).set({ brand, productType: type, updatedAt: new Date() }).where(eq(storeProducts.id, id));
  await db.insert(auditLogs).values({ actorId: user.id, action: "offer.admin_corrected", entityType: "store_product", entityId: id,
    before: { brand: current.brand, productType: current.productType }, after: { brand, productType: type } });
  revalidatePath("/", "layout");
  redirect("/admin?tab=urunler&success=Teklif+düzeltildi");
}
