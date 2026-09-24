import { and, asc, desc, eq, gt, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, categories, products, quoteOffers, quoteRequests, storeProducts, stores } from "@/db/schema";
import { cents, isOfferType, normalizeOem } from "@/lib/core";
import { getCurrentUser, getMyStore } from "@/lib/auth";

export type CatalogFilters = {
  q?: string; category?: string; brand?: string; type?: string; store?: string; catalogId?: string;
  min?: string; max?: string; vehicleBrand?: string; vehicleModel?: string; year?: string; engine?: string;
};

export async function getCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

export async function getOfferRows(filters: CatalogFilters = {}, maxRows = 240) {
  const conditions = [eq(storeProducts.active, true), gt(storeProducts.stock, 0), eq(stores.status, "approved"), eq(products.isActive, true)];
  const viewer = await getCurrentUser();
  if (viewer?.role === "store") {
    const ownStore = await getMyStore(viewer.id);
    conditions.push(ownStore ? eq(storeProducts.storeId, ownStore.id) : sql`false`);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().slice(0, 100);
    const normalized = normalizeOem(q);
    conditions.push(or(ilike(products.productName, `%${q}%`), ilike(storeProducts.brand, `%${q}%`), normalized ? ilike(products.normalizedOem, `%${normalized}%`) : undefined)!);
  }
  if (filters.category) conditions.push(eq(categories.slug, filters.category));
  if (filters.catalogId) conditions.push(eq(products.id, filters.catalogId));
  if (filters.brand) conditions.push(ilike(storeProducts.brand, filters.brand));
  if (filters.store) conditions.push(eq(stores.slug, filters.store));
  if (filters.type && isOfferType(filters.type)) conditions.push(eq(storeProducts.productType, filters.type));
  try { if (filters.min) conditions.push(gte(storeProducts.price, (cents(filters.min) / 100).toFixed(2))); } catch { /* Invalid search parameters are ignored. */ }
  try { if (filters.max) conditions.push(lte(storeProducts.price, (cents(filters.max) / 100).toFixed(2))); } catch { /* Invalid search parameters are ignored. */ }
  if (filters.vehicleBrand?.trim() || filters.vehicleModel?.trim() || filters.year || filters.engine?.trim()) {
    const brand = filters.vehicleBrand?.trim() || "";
    const model = filters.vehicleModel?.trim() || "";
    const engine = filters.engine?.trim() || "";
    const year = Number(filters.year) || 0;
    conditions.push(sql`exists (
      select 1 from product_vehicle_fitments f
      join vehicle_models vm on vm.id = f.vehicle_model_id
      join vehicle_brands vb on vb.id = vm.brand_id
      where f.product_id = ${products.id}
      ${brand ? sql`and vb.name ilike ${brand}` : sql``}
      ${model ? sql`and vm.name ilike ${model}` : sql``}
      ${year ? sql`and (f.year_from is null or f.year_from <= ${year}) and (f.year_to is null or f.year_to >= ${year})` : sql``}
      ${engine ? sql`and (f.engine is null or f.engine ilike ${`%${engine}%`})` : sql``}
    )`);
  }
  return db.select({
    id: storeProducts.id,
    catalogProductId: products.id,
    productName: products.productName,
    oemNo: products.oemNo,
    description: products.description,
    categoryName: categories.name,
    categorySlug: categories.slug,
    brand: storeProducts.brand,
    productType: storeProducts.productType,
    price: storeProducts.price,
    stock: storeProducts.stock,
    imageUrl: storeProducts.imageUrl,
    storeId: stores.id,
    storeName: stores.name,
    storeSlug: stores.slug,
    storeCity: stores.city,
  }).from(storeProducts)
    .innerJoin(products, eq(storeProducts.catalogProductId, products.id))
    .innerJoin(stores, eq(storeProducts.storeId, stores.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions)).orderBy(asc(storeProducts.price)).limit(maxRows);
}

export type OfferRow = Awaited<ReturnType<typeof getOfferRows>>[number];
export function groupOffers(rows: OfferRow[]) {
  const map = new Map<string, { id: string; productName: string; oemNo: string; categoryName: string | null; imageUrl: string | null; offers: OfferRow[] }>();
  for (const row of rows) {
    const item = map.get(row.catalogProductId);
    if (item) {
      item.offers.push(row);
      if (!item.imageUrl && row.imageUrl) item.imageUrl = row.imageUrl;
    } else {
      map.set(row.catalogProductId, { id: row.catalogProductId, productName: row.productName, oemNo: row.oemNo, categoryName: row.categoryName, imageUrl: row.imageUrl, offers: [row] });
    }
  }
  return [...map.values()];
}

export async function getCartRows(userId: string) {
  return db.select({
    id: cartItems.id, quantity: cartItems.quantity, storeProductId: cartItems.storeProductId, quoteOfferId: cartItems.quoteOfferId,
    storeId: stores.id, storeName: stores.name, storeStatus: stores.status, commissionRate: stores.commissionRate,
    productName: products.productName, productActive: products.isActive, oemNo: products.oemNo, categoryId: products.categoryId,
    catalogProductId: products.id, brand: storeProducts.brand, productType: storeProducts.productType,
    price: storeProducts.price, stock: storeProducts.stock, active: storeProducts.active, sku: storeProducts.storeSku, imageUrl: storeProducts.imageUrl,
    quoteBrand: quoteOffers.brand, quoteProductType: quoteOffers.productType, quotePrice: quoteOffers.price, quoteStock: quoteOffers.stock,
    quoteStatus: quoteOffers.status, quoteValidity: quoteOffers.validityUntil, quoteDescription: quoteRequests.description,
    quoteOem: quoteRequests.oemNo, quoteCustomerId: quoteRequests.customerId, quoteRequestId: quoteRequests.id,
  }).from(cartItems)
    .leftJoin(storeProducts, eq(cartItems.storeProductId, storeProducts.id))
    .leftJoin(products, eq(storeProducts.catalogProductId, products.id))
    .leftJoin(quoteOffers, eq(cartItems.quoteOfferId, quoteOffers.id))
    .leftJoin(quoteRequests, eq(quoteOffers.quoteRequestId, quoteRequests.id))
    .leftJoin(stores, sql`${stores.id} = coalesce(${storeProducts.storeId}, ${quoteOffers.storeId})`)
    .where(eq(cartItems.userId, userId)).orderBy(desc(cartItems.createdAt));
}

export type CartRow = Awaited<ReturnType<typeof getCartRows>>[number];
export function cartRowPrice(row: CartRow) { return cents(row.quoteOfferId ? (row.quotePrice ?? "0") : (row.price ?? "0")); }
export function cartRowName(row: CartRow) { return row.quoteOfferId ? (row.productName || row.quoteDescription || "Talep edilen parça") : (row.productName || "Parça"); }
export function cartRowBrand(row: CartRow) { return row.quoteOfferId ? row.quoteBrand : row.brand; }
export function cartRowType(row: CartRow) { return row.quoteOfferId ? row.quoteProductType : row.productType; }
