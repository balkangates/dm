import Link from "next/link";
import { and, count, eq, sql } from "drizzle-orm";
import { ArrowRight, MapPin, Store } from "lucide-react";
import { db } from "@/db";
import { storeProducts, stores } from "@/db/schema";
import { EmptyState } from "@/components/catalog-ui";

export const dynamic = "force-dynamic";
export default async function StoresPage() {
  const rows = await db.select({ id: stores.id, name: stores.name, slug: stores.slug, city: stores.city, description: stores.description, total: count(storeProducts.id) }).from(stores).leftJoin(storeProducts, and(eq(storeProducts.storeId, stores.id), eq(storeProducts.active, true))).where(eq(stores.status, "approved")).groupBy(stores.id).orderBy(stores.name);
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Mağazalar</div><div className="page-heading"><span className="eyebrow"><Store size={14} /> DAMPINGVAR MAĞAZALARI</span><h1>Güvenle alışveriş yapacağın mağazalar.</h1><p>Onaylı mağazaları keşfet, sundukları otomotiv parçalarını incele.</p></div>
    {rows.length ? <div className="catalog-grid">{rows.map((s) => <Link href={`/magazalar/${s.slug}`} key={s.id} className="surface surface-pad" style={{ display: "block" }}><span className="category-icon"><Store size={28} /></span><h2 style={{ fontSize: 18, fontWeight: 800, margin: "16px 0 6px" }}>{s.name}</h2><p className="muted small-text" style={{ minHeight: 35 }}>{s.description?.slice(0, 100) || "DampingVar onaylı otomotiv yedek parça mağazası."}</p><div className="divider" /><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 700 }}><span className="muted"><MapPin size={13} style={{ display: "inline" }} /> {s.city || "Türkiye"} · {s.total} teklif</span><ArrowRight size={17} /></div></Link>)}</div> : <EmptyState title="Henüz onaylı mağaza yok" description="Mağaza başvuruları değerlendirildikten sonra satıcıları burada görebileceksin." href="/magaza-basvurusu" action="Mağaza başvurusu yap" />}
  </main>;
}
