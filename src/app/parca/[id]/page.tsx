import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowRight, BadgeCheck, Box, Heart, Headphones, Info, PackageCheck, ShieldCheck, Tag } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { favorites, productVehicleFitments, products, vehicleBrands, vehicleModels } from "@/db/schema";
import { startCallAction, toggleFavoriteAction } from "@/app/actions/customer";
import { OfferCard, SectionHeading } from "@/components/catalog-ui";
import { getOfferRows } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/auth";
import { formatPrice } from "@/lib/core";

export const dynamic = "force-dynamic";
export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string; error?: string }> }) {
  const { id } = await params, query = await searchParams;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product || !product.isActive) notFound();
  const [offers, fitments, user] = await Promise.all([
    getOfferRows({ catalogId: id }, 200),
    db.select({ brand: vehicleBrands.name, model: vehicleModels.name, yearFrom: productVehicleFitments.yearFrom, yearTo: productVehicleFitments.yearTo, engine: productVehicleFitments.engine }).from(productVehicleFitments).innerJoin(vehicleModels, eq(productVehicleFitments.vehicleModelId, vehicleModels.id)).innerJoin(vehicleBrands, eq(vehicleModels.brandId, vehicleBrands.id)).where(eq(productVehicleFitments.productId, id)),
    getCurrentUser(),
  ]);
  const [favorite] = user ? await db.select().from(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.productId, id))) : [null];
  return <main className="shell page-main">
    <div className="breadcrumb"><Link href="/">Ana sayfa</Link><span>/</span><Link href="/parcalar">Oto yedek parça</Link><span>/</span><span>{product.productName}</span></div>
    {query.added && <div className="notice notice-success"><PackageCheck size={16} /> Ürün sepete eklendi. <Link href="/sepet" style={{ textDecoration: "underline" }}>Sepete git →</Link></div>}
    {query.error && <div className="notice notice-error">{query.error}</div>}
    <div className="detail-layout"><div className="detail-image">{offers[0]?.imageUrl ? <img src={offers[0].imageUrl} alt={product.productName} /> : <span className="part-placeholder"><Box size={100} strokeWidth={1.1} /><span>MERKEZİ OEM KATALOĞU</span></span>}</div>
      <div className="detail-info"><span className="eyebrow"><BadgeCheck size={14} /> MERKEZİ KATALOG ÜRÜNÜ</span><h1>{product.productName}</h1><div className="detail-oem"><Tag size={16} /> OEM / PARÇA NO: {product.oemNo}</div><p className="detail-description">{product.description || "Bu ürün DampingVar merkezi OEM kataloğunda kayıtlıdır. Aşağıdaki mağaza tekliflerinde markayı, ürün tipini ve stok durumunu karşılaştırarak karar verebilirsin."}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 23, flexWrap: "wrap" }}><span className="pill"><ShieldCheck size={14} style={{ marginRight: 5 }} /> Doğrulanmış OEM kimliği</span><span className="pill">{offers.length} aktif mağaza teklifi</span></div>
        {offers.length > 0 && <div style={{ marginTop: 29, padding: "17px 20px", background: "#edf3ea", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><small className="muted">Başlayan fiyatlarla</small><strong style={{ display: "block", fontSize: 25, fontFamily: "Manrope, sans-serif" }}>{formatPrice(offers[0].price)}</strong></div><a className="btn btn-dark" href="#teklifler">Teklifleri Gör <ArrowRight size={16} /></a></div>}
        {user && <form action={toggleFavoriteAction} style={{ marginTop: 17 }}><input type="hidden" name="productId" value={id} /><button type="submit" className="btn btn-outline"><Heart size={16} fill={favorite ? "#c95368" : "none"} color={favorite ? "#c95368" : "currentColor"} /> {favorite ? "Favorilerden Çıkar" : "Favorilere Ekle"}</button></form>}
      </div></div>
    {fitments.length > 0 && <div className="surface surface-pad" style={{ marginTop: 25 }}><h3 className="surface-title">Araç uyumluluğu</h3><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{fitments.map((f, i) => <span className="pill" key={i}>{f.brand} {f.model} {f.yearFrom ? `${f.yearFrom}–${f.yearTo || "güncel"}` : ""} {f.engine || ""}</span>)}</div></div>}
    <section className="detail-offers" id="teklifler"><SectionHeading eyebrow="FİYAT KARŞILAŞTIR" title="Mağaza teklifleri" description="Fiyata göre sıralandı. Ürün tipi ve markayı kontrol ederek sana uygun olanı seç." />
      {offers.length ? <div className="offer-grid">{offers.map((offer) => <div key={offer.id}><OfferCard offer={offer} /><form action={startCallAction} style={{ marginTop: 8 }}><input type="hidden" name="storeProductId" value={offer.id} /><button type="submit" className="btn btn-outline" style={{ width: "100%" }}><Headphones size={16} /> {offer.storeName} ile Canlı Görüş</button></form></div>)}</div> : <div className="surface surface-pad"><Info size={20} /><p>Şu an bu OEM için aktif stoklu teklif bulunmuyor.</p><Link href="/teklif-al" className="btn btn-dark">Mağazalardan Teklif Al <ArrowRight size={15} /></Link></div>}
    </section>
    <div className="notice notice-info" style={{ marginTop: 28 }}><Info size={18} /><span>Orijinal, Yan Sanayi ve Muadil farklı ürün tipleridir. En düşük fiyatlı teklif, orijinal ürün olduğu anlamına gelmez. Sipariş öncesinde markayı ve ürün tipini inceleyin.</span></div>
  </main>;
}
