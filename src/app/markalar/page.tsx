import Link from "next/link";
import { and, count, eq, gt } from "drizzle-orm";
import { ArrowRight, BadgeCheck, Tags } from "lucide-react";
import { db } from "@/db";
import { storeProducts, stores } from "@/db/schema";
import { EmptyState } from "@/components/catalog-ui";

export const dynamic = "force-dynamic";
export default async function BrandsPage() {
  const brands = await db.select({ name: storeProducts.brand, total: count() }).from(storeProducts).innerJoin(stores, eq(storeProducts.storeId, stores.id)).where(and(eq(stores.status, "approved"), eq(storeProducts.active, true), gt(storeProducts.stock, 0))).groupBy(storeProducts.brand).orderBy(storeProducts.brand);
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Markalar</div><div className="page-heading"><span className="eyebrow"><Tags size={14} /> MARKALAR</span><h1>Markana göre keşfet.</h1><p>Mağazaların stokta sunduğu ürün markalarını incele. Her teklifte ürün tipini ayrıca kontrol et.</p></div>
    {brands.length ? <div className="category-grid">{brands.map((brand) => <Link key={brand.name} href={`/parcalar?brand=${encodeURIComponent(brand.name)}`} className="category-tile"><span className="category-icon"><BadgeCheck size={25} /></span><span className="category-copy"><strong>{brand.name}</strong><small>{brand.total} aktif teklif</small></span><span className="category-arrow"><ArrowRight size={17} /></span></Link>)}</div> : <EmptyState title="Henüz marka teklifi yok" description="Onaylı mağazalar katalogdaki OEM ürünlerine teklif ekledikçe markalar burada görünür." href="/parcalar" action="Parçaları incele" />}
  </main>;
}
