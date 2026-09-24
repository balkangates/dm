import Link from "next/link";
import { eq } from "drizzle-orm";
import { Heart } from "lucide-react";
import { db } from "@/db";
import { favorites, products } from "@/db/schema";
import { EmptyState, ProductCard } from "@/components/catalog-ui";
import { requireUser } from "@/lib/auth";
import { getOfferRows, groupOffers } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export default async function FavoritesPage() {
  const user = await requireUser();
  const saved = await db.select({ id: products.id }).from(favorites).innerJoin(products, eq(favorites.productId, products.id)).where(eq(favorites.userId, user.id));
  const all = groupOffers(await getOfferRows({}, 500));
  const visible = all.filter((p) => saved.some((s) => s.id === p.id));
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Favoriler</div><div className="page-heading"><span className="eyebrow"><Heart size={14} /> FAVORİLER</span><h1>Kaydettiğin parçalar.</h1><p>Sevdiğin ürünlere ve yeni mağaza tekliflerine hızlıca ulaş.</p></div>
    {saved.length === 0 ? <EmptyState icon={<Heart size={28} />} title="Henüz favorin yok" description="Bir ürünü favorilere ekleyerek burada kolayca bulabilirsin." href="/parcalar" action="Parçaları keşfet" /> : visible.length ? <div className="product-grid">{visible.map((p) => <ProductCard key={p.id} product={p} />)}</div> : <EmptyState title="Favori ürünlerinde aktif teklif yok" description="Kaydettiğin OEM ürünlerinde yeniden stoklu mağaza teklifi oluştuğunda burada görünecek." href="/parcalar" action="Diğer parçaları keşfet" />}
  </main>;
}
