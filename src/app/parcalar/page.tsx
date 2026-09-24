import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, Filter, Search, SlidersHorizontal } from "lucide-react";
import { db } from "@/db";
import { storeProducts, stores } from "@/db/schema";
import { EmptyState, ProductCard, SectionHeading } from "@/components/catalog-ui";
import { getCategories, getOfferRows, groupOffers } from "@/lib/catalog";
import { productTypeLabels } from "@/lib/core";

export const dynamic = "force-dynamic";
type Params = Promise<Record<string, string | string[] | undefined>>;
export default async function CatalogPage({ searchParams }: { searchParams: Params }) {
  const raw = await searchParams;
  const read = (key: string) => typeof raw[key] === "string" ? raw[key] as string : "";
  const filters = { q: read("q"), category: read("category"), brand: read("brand"), type: read("type"), store: read("store"), min: read("min"), max: read("max"), vehicleBrand: read("vehicleBrand"), vehicleModel: read("vehicleModel"), year: read("year"), engine: read("engine") };
  const [rows, categories, brands] = await Promise.all([
    getOfferRows(filters), getCategories(),
    db.selectDistinct({ brand: storeProducts.brand }).from(storeProducts).innerJoin(stores, eq(storeProducts.storeId, stores.id)).where(and(eq(stores.status, "approved"), eq(storeProducts.active, true))).orderBy(asc(storeProducts.brand)),
  ]);
  const grouped = groupOffers(rows);
  const url = (changes: Record<string, string>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...filters, ...changes })) if (v) p.set(k, v); return `/parcalar?${p.toString()}`; };
  const activeCategory = categories.find((c) => c.slug === filters.category);
  const title = filters.q ? `“${filters.q}” için sonuçlar` : activeCategory ? activeCategory.name : filters.vehicleBrand ? `${filters.vehicleBrand} ${filters.vehicleModel} parçaları` : "Tüm oto yedek parçalar";
  return <main className="shell page-main">
    <div className="breadcrumb"><Link href="/">Ana sayfa</Link><span>/</span><span>Oto yedek parça</span></div>
    <div className="page-heading page-heading-row"><div><span className="eyebrow">DOĞRU PARÇAYI BUL</span><h1>{title}</h1><p>OEM numarasıyla eşleşen teklifleri marka, ürün tipi ve fiyatına göre karşılaştır.</p></div><Link href="/teklif-al" className="btn btn-outline">Parçayı bulamadın mı? <ArrowRight size={15} /></Link></div>
    <form action="/parcalar" method="get" className="catalog-top-search"><input className="form-input" name="q" defaultValue={filters.q} placeholder="OEM numarası, parça adı veya marka ara..." aria-label="Parça ara" /><button className="btn btn-dark" type="submit"><Search size={17} /> Ara</button></form>
    <div className="catalog-layout"><aside className="surface filter-sidebar"><h3><SlidersHorizontal size={17} style={{ display: "inline", marginRight: 7 }} /> Filtreler</h3>
      <div className="filter-group"><h4>KATEGORİLER</h4><Link href={url({ category: "" })} className={!filters.category ? "selected" : ""}>Tüm kategoriler <ArrowRight size={12} /></Link>{categories.filter((c) => !c.parentId).map((c) => <Link key={c.id} href={url({ category: c.slug })} className={filters.category === c.slug ? "selected" : ""}>{c.name}<ArrowRight size={12} /></Link>)}</div>
      <div className="filter-group"><h4>ÜRÜN TİPİ</h4><Link href={url({ type: "" })} className={!filters.type ? "selected" : ""}>Tüm ürün tipleri <ArrowRight size={12} /></Link>{Object.entries(productTypeLabels).map(([key, label]) => <Link key={key} href={url({ type: key })} className={filters.type === key ? "selected" : ""}>{label}<ArrowRight size={12} /></Link>)}</div>
      <form action="/parcalar" method="get"><input type="hidden" name="q" value={filters.q} /><input type="hidden" name="category" value={filters.category} /><input type="hidden" name="type" value={filters.type} /><input type="hidden" name="store" value={filters.store} />
        <div className="filter-group"><h4>MARKA</h4><select className="form-input" name="brand" defaultValue={filters.brand}><option value="">Tüm markalar</option>{brands.map((b) => <option key={b.brand} value={b.brand}>{b.brand}</option>)}</select></div>
        <div className="filter-group"><h4>FİYAT ARALIĞI (₺)</h4><div className="field-grid"><div className="form-field" style={{ marginBottom: 0 }}><input name="min" type="number" min="0" step="0.01" defaultValue={filters.min} placeholder="Min" /></div><div className="form-field" style={{ marginBottom: 0 }}><input name="max" type="number" min="0" step="0.01" defaultValue={filters.max} placeholder="Maks" /></div></div></div>
        <button className="btn btn-dark" type="submit"><Filter size={14} /> Filtreleri Uygula</button>
      </form>
      <div className="filter-group"><p className="small-text muted">Yalnızca aktif ve stokta olan mağaza teklifleri gösterilir.</p></div>
    </aside>
    <div><div className="catalog-results-head"><strong>{grouped.length} merkezi ürün · {rows.length} aktif teklif</strong><span>Stoktaki en uygun fiyatlar önce</span></div>
      {grouped.length ? <div className="catalog-grid">{grouped.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <EmptyState icon={<Search size={28} />} title="Bu aramayla eşleşen parça bulunamadı" description="Farklı bir OEM numarası deneyebilir veya parça bilgilerini paylaşarak mağazalardan kişisel teklif isteyebilirsin." href={`/teklif-al${filters.q ? `?oem=${encodeURIComponent(filters.q)}` : ""}`} action="Mağazalardan Teklif Al" />}
    </div></div>
  </main>;
}
