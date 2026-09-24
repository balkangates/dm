import Link from "next/link";
import { ArrowRight, BadgeCheck, TrendingDown } from "lucide-react";
import { EmptyState, ProductCard } from "@/components/catalog-ui";
import { getOfferRows, groupOffers } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export default async function DealsPage() {
  const products = groupOffers(await getOfferRows({}, 200));
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Fırsatlar</div><div className="page-heading"><span className="eyebrow"><TrendingDown size={14} /> FİYATLARI KARŞILAŞTIR</span><h1>İyi fiyatı, doğru bilgiyle bul.</h1><p>Stoktaki tekliflerin en uygun fiyatlı olanları önce. Her kartta marka ve ürün tipi açıkça gösterilir; indirim iddiası yapılmaz.</p></div>
    <div className="notice notice-info"><BadgeCheck size={17} /> En düşük fiyatlı muadil, orijinal ürün olarak gösterilmez. Detayda tüm mağaza tekliflerini karşılaştır.</div>
    {products.length ? <div className="product-grid">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div> : <EmptyState title="Karşılaştırılacak aktif teklif yok" description="Mağazalar stoklu teklif eklediğinde en uygun fiyatları burada görebileceksin." href="/teklif-al" action="Parça için teklif iste" />}
    <div style={{ marginTop: 24 }}><Link href="/parcalar" className="section-link">Tüm parçaları keşfet <ArrowRight size={16} /></Link></div>
  </main>;
}
