import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parse } from "csv-parse/sync";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { products, storeProducts } from "@/db/schema";
import { cents, externalUrl, isOfferType, normalizeOem, type OfferType } from "@/lib/core";

const columns = ["oem_no", "brand", "product_type", "store_sku", "barcode", "price", "stock", "image_url"];
export const csvHeader = columns.join(",") + "\r\n";

export type ImportRow = {
  line: number; oemNo: string; normalizedOem: string; productName: string | null; catalogProductId: string | null;
  brand: string; productType: string; storeSku: string; barcode: string; price: string; stock: number; imageUrl: string;
  action: "new" | "update" | "error"; errors: string[];
};

export async function analyzeCsv(csv: string, storeId: string) {
  if (!csv || Buffer.byteLength(csv, "utf8") > 2_000_000) throw new Error("CSV dosyası boş veya 2 MB sınırını aşıyor.");
  let rows: Record<string, string>[];
  try {
    rows = parse(csv, {
      bom: true, trim: true, skip_empty_lines: true,
      columns: (headers: string[]) => {
        const actual = headers.map((h) => h.trim().toLowerCase());
        if (actual.includes("product_name")) throw new Error("PRODUCT_NAME_NOT_ALLOWED: Ürün adı merkezi katalog tarafından yönetilir.");
        if (new Set(actual).size !== actual.length) throw new Error("DUPLICATE_COLUMN: CSV başlıkları tekrar edemez.");
        const missing = columns.filter((key) => !actual.includes(key));
        if (missing.length) throw new Error(`MISSING_COLUMN: ${missing.join(", ")}`);
        return actual;
      },
    });
  } catch (err) { throw new Error(err instanceof Error ? err.message : "CSV okunamadı."); }
  if (rows.length > 1000) throw new Error("Tek seferde en fazla 1000 satır yükleyebilirsiniz.");
  if (rows.length === 0) throw new Error("CSV dosyasında ürün satırı bulunamadı.");
  const normalized = [...new Set(rows.map((r) => normalizeOem(r.oem_no || "")).filter(Boolean))];
  const catalog = normalized.length ? await db.select({ id: products.id, oem: products.normalizedOem, name: products.productName, active: products.isActive }).from(products).where(inArray(products.normalizedOem, normalized)) : [];
  const existing = await db.select().from(storeProducts).where(eq(storeProducts.storeId, storeId));
  const byOem = new Map(catalog.map((p) => [p.oem, p]));
  const bySku = new Map(existing.map((p) => [p.storeSku, p]));
  const identity = (productId: string, brand: string, type: string) => `${productId}:${brand.toLocaleLowerCase("tr-TR")}:${type}`;
  const byIdentity = new Map(existing.map((p) => [identity(p.catalogProductId, p.brand, p.productType), p]));
  const seen = new Set<string>();
  const seenIdentities = new Set<string>();
  const result: ImportRow[] = rows.map((raw, i) => {
    const oemNo = (raw.oem_no || "").trim().slice(0, 100);
    const normalizedOem = normalizeOem(oemNo);
    const brand = (raw.brand || "").trim().slice(0, 120);
    const productType = (raw.product_type || "").trim().toLowerCase();
    const storeSku = (raw.store_sku || "").trim().slice(0, 120);
    const barcode = (raw.barcode || "").trim().slice(0, 120);
    const price = (raw.price || "").trim();
    const imageUrl = (raw.image_url || "").trim();
    const stockRaw = (raw.stock || "").trim();
    const stock = Number(stockRaw);
    const match = byOem.get(normalizedOem);
    const current = bySku.get(storeSku);
    const errors: string[] = [];
    if (!normalizedOem || !brand || !storeSku || !price || !stockRaw || !productType) errors.push("MISSING_REQUIRED_FIELD");
    if (!isOfferType(productType)) errors.push("INVALID_PRODUCT_TYPE");
    try { if (cents(price) <= 0) errors.push("INVALID_PRICE"); } catch { errors.push("INVALID_PRICE"); }
    if (!/^\d+$/.test(stockRaw) || !Number.isSafeInteger(stock) || stock < 0) errors.push("INVALID_STOCK");
    if (storeSku && seen.has(storeSku)) errors.push("DUPLICATE_SKU");
    seen.add(storeSku);
    if (normalizedOem && (!match || !match.active)) errors.push("OEM_NOT_FOUND");
    if (current && match && (current.catalogProductId !== match.id || current.brand.toLocaleLowerCase("tr-TR") !== brand.toLocaleLowerCase("tr-TR"))) errors.push("SKU_IDENTITY_CONFLICT");
    if (match && brand && isOfferType(productType)) {
      const key = identity(match.id, brand, productType);
      const sameOffer = byIdentity.get(key);
      if (seenIdentities.has(key) || (sameOffer && sameOffer.storeSku !== storeSku)) errors.push("DUPLICATE_OFFER_IDENTITY");
      seenIdentities.add(key);
    }
    if (imageUrl && !externalUrl(imageUrl)) errors.push("INVALID_IMAGE_URL");
    return { line: i + 2, oemNo, normalizedOem, productName: match?.name ?? null, catalogProductId: match?.id ?? null, brand, productType, storeSku, barcode, price, stock, imageUrl, action: errors.length ? "error" : current ? "update" : "new", errors };
  });
  const count = (code: string) => result.filter((r) => r.errors.includes(code)).length;
  return {
    rows: result,
    summary: {
      total: result.length, valid: result.filter((r) => !r.errors.length).length, new: result.filter((r) => r.action === "new").length,
      update: result.filter((r) => r.action === "update").length, matched: result.filter((r) => !!r.catalogProductId).length,
      oemNotFound: count("OEM_NOT_FOUND"), invalidType: count("INVALID_PRODUCT_TYPE"), invalidPrice: count("INVALID_PRICE"),
      invalidStock: count("INVALID_STOCK"), duplicateSku: count("DUPLICATE_SKU"), missing: count("MISSING_REQUIRED_FIELD"),
    },
  };
}

function signingKey() {
  const key = process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!key) throw new Error("Oturum anahtarı bulunamadı.");
  return key;
}

export function createPreviewToken(storeId: string, csv: string) {
  const digest = createHash("sha256").update(csv).digest("hex");
  const payload = Buffer.from(JSON.stringify({ storeId, digest, expires: Date.now() + 20 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPreviewToken(storeId: string, csv: string, token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { storeId: string; digest: string; expires: number };
    return data.storeId === storeId && data.digest === createHash("sha256").update(csv).digest("hex") && data.expires > Date.now();
  } catch { return false; }
}

export function validatedImportValues(row: ImportRow) {
  if (row.errors.length || !row.catalogProductId || !isOfferType(row.productType)) throw new Error("Geçersiz CSV satırı.");
  return { catalogProductId: row.catalogProductId, brand: row.brand, productType: row.productType as OfferType,
    storeSku: row.storeSku, barcode: row.barcode || null, price: (cents(row.price) / 100).toFixed(2),
    stock: row.stock, imageUrl: row.imageUrl || null };
}
