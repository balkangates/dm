import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, MapPin, Store } from "lucide-react";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { EmptyState, ProductCard } from "@/components/catalog-ui";
import { getOfferRows, groupOffers } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export default async function StoreDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [store] = await db.select({ id: stores.id, name: stores.name, slug: stores.slug, city: stores.city, description: stores.description, status: stores.status }).from(stores).where(eq(stores.slug, slug));
  if (!store || store.status !== "approved") notFound();
  const products = groupOffers(await getOfferRows({ store: slug }, 200));
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / <Link href="/magazalar">Mağazalar</Link> / {store.name}</div>
    <div className="surface surface-pad" style={{ padding: 30, marginBottom: 35, display: "flex", gap: 20, alignItems: "center" }}><div className="category-icon" style={{ width: 76, height: 76 }}><Store size={33} /></div><div><span className="eyebrow"><BadgeCheck size={14} /> ONAYLI MAĞAZA</span><h1 className="page-title" style={{ margin: "5px 0" }}>{store.name}</h1><p className="muted small-text"><MapPin size={13} style={{ display: "inline" }} /> {store.city || "Türkiye"} · {products.length} merkezi üründe aktif teklif</p>{store.description && <p className="small-text">{store.description}</p>}</div></div>
    <div className="page-heading page-heading-row"><div><h2 style={{ fontWeight: 800, fontSize: 23 }}>Mağaza teklifleri</h2><p>Ürün tipine ve markasına göre açıkça listelenir.</p></div><Link href="/magazalar" className="section-link">Diğer mağazalar <ArrowRight size={15} /></Link></div>
    {products.length ? <div className="product-grid">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div> : <EmptyState title="Bu mağazanın aktif teklifi yok" description="Mağaza ürün eklediğinde tekliflerini burada görebilirsin." href="/parcalar" action="Diğer parçaları gör" />}
  </main>;
}
