import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, csvImports, products, storeProducts } from "@/db/schema";
import { getCurrentUser, getMyStore } from "@/lib/auth";
import { analyzeCsv, validatedImportValues, verifyPreviewToken } from "@/lib/csv-import";
import { normalizeOem } from "@/lib/core";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const store = user ? await getMyStore(user.id) : null;
  if (!user || !store || store.status !== "approved") return Response.json({ error: "Onaylı mağaza hesabı gereklidir." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return Response.json({ error: "Geçersiz kaynak." }, { status: 403 });
  try {
    const body = await request.json() as { csv?: string; token?: string; fileName?: string };
    const csv = body.csv || "";
    if (!verifyPreviewToken(store.id, csv, body.token || "")) throw new Error("Önizleme onayı geçersiz veya süresi dolmuş. Dosyayı yeniden önizleyin.");
    const analysis = await analyzeCsv(csv, store.id);
    if (!analysis.summary.valid) throw new Error("İçe aktarılabilecek geçerli satır yok.");
    const imported = await db.transaction(async (tx) => {
      let count = 0;
      for (const row of analysis.rows) {
        if (row.errors.length) continue;
        const values = validatedImportValues(row);
        const [catalog] = await tx.select().from(products).where(eq(products.normalizedOem, normalizeOem(row.oemNo)));
        if (!catalog || !catalog.isActive || catalog.id !== values.catalogProductId) throw new Error(`${row.line}. satır: OEM eşleşmesi değişti; yeniden önizleyin.`);
        const [existing] = await tx.select().from(storeProducts).where(and(eq(storeProducts.storeId, store.id), eq(storeProducts.storeSku, values.storeSku))).for("update");
        if (existing) {
          if (existing.catalogProductId !== catalog.id || existing.brand.toLocaleLowerCase("tr-TR") !== values.brand.toLocaleLowerCase("tr-TR")) throw new Error(`${row.line}. satır: SKU kimliği değişti; yeniden önizleyin.`);
          await tx.update(storeProducts).set({ productType: values.productType, price: values.price, stock: values.stock,
            barcode: values.barcode, imageUrl: values.imageUrl, active: true, updatedAt: new Date() }).where(eq(storeProducts.id, existing.id));
          await tx.insert(auditLogs).values({ actorId: user.id, action: "csv.offer_updated", entityType: "store_product", entityId: existing.id,
            before: { productType: existing.productType, price: existing.price, stock: existing.stock },
            after: { productType: values.productType, price: values.price, stock: values.stock } });
        } else {
          const [created] = await tx.insert(storeProducts).values({ storeId: store.id, ...values }).returning({ id: storeProducts.id });
          await tx.insert(auditLogs).values({ actorId: user.id, action: "csv.offer_created", entityType: "store_product", entityId: created.id,
            after: { catalogProductId: catalog.id, brand: values.brand, productType: values.productType, price: values.price, stock: values.stock } });
        }
        count++;
      }
      const [log] = await tx.insert(csvImports).values({ storeId: store.id, fileName: (body.fileName || "urunler.csv").slice(0, 255), totalRows: analysis.summary.total,
        importedRows: count, failedRows: analysis.summary.total - count, report: { summary: analysis.summary, rejected: analysis.rows.filter((r) => r.errors.length).map((r) => ({ line: r.line, oemNo: r.oemNo, errors: r.errors })) } }).returning({ id: csvImports.id });
      await tx.insert(auditLogs).values({ actorId: user.id, action: "csv.imported", entityType: "csv_import", entityId: log.id, after: { imported: count, rejected: analysis.summary.total - count } });
      return count;
    });
    return Response.json({ imported, rejected: analysis.summary.total - imported });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "İçe aktarma başarısız." }, { status: 400 });
  }
}
