import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, CircleCheck, Clock3, FileQuestion, MapPin, Package, Store } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { products, quoteOffers, quoteRequests, stores } from "@/db/schema";
import { addToCartAction } from "@/app/actions/customer";
import { EmptyState, TypeBadge } from "@/components/catalog-ui";
import { requireUser } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/core";

export const dynamic = "force-dynamic";
export default async function QuoteDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await requireUser(), { id } = await params, query = await searchParams;
  const [request] = await db.select().from(quoteRequests).where(and(eq(quoteRequests.id, id), eq(quoteRequests.customerId, user.id)));
  if (!request) notFound();
  const offers = await db.select({ offer: quoteOffers, storeName: stores.name, storeCity: stores.city, catalogName: products.productName }).from(quoteOffers)
    .innerJoin(stores, eq(quoteOffers.storeId, stores.id)).leftJoin(products, eq(quoteOffers.catalogProductId, products.id))
    .where(and(eq(quoteOffers.quoteRequestId, id), eq(stores.status, "approved"))).orderBy(asc(quoteOffers.price));
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / <Link href="/teklif-al">Teklif taleplerim</Link> / Talep detayı</div><Link href="/teklif-al" className="section-link"><ArrowLeft size={15} /> Taleplerime dön</Link>
    <div className="page-heading" style={{ marginTop: 20 }}><span className="eyebrow"><FileQuestion size={14} /> PARÇA TALEBİ</span><h1>Tekliflerini karşılaştır.</h1><p>Mağazalar birbirinin fiyatını görmez. Sana gelen tüm teklifleri burada şeffaf şekilde inceleyebilirsin.</p></div>
    {query.success && <div className="notice notice-success"><CircleCheck size={16} /> {query.success}</div>}{query.error && <div className="notice notice-error">{query.error}</div>}
    <div className="surface surface-pad" style={{ marginBottom: 30 }}><div className="page-heading-row"><div><h2 className="surface-title" style={{ marginBottom: 7 }}>{request.description}</h2><p className="muted small-text"><CalendarDays size={13} style={{ display: "inline" }} /> {formatDate(request.createdAt)} · <MapPin size={13} style={{ display: "inline" }} /> {request.city} · {request.quantity} adet</p><p className="muted small-text">Araç: {[request.vehicleBrand, request.vehicleModel, request.vehicleYear].filter(Boolean).join(" ") || "Belirtilmedi"} · OEM: {request.oemNo || "Belirtilmedi"}</p></div>{request.photoUrl && <img src={request.photoUrl} alt="Talep fotoğrafı" style={{ width: 125, height: 100, objectFit: "cover", borderRadius: 8 }} />}</div></div>
    <div className="page-heading"><span className="eyebrow">MAĞAZA TEKLİFLERİ</span><h2 style={{ fontSize: 25, fontWeight: 800 }}>{offers.length} teklif alındı</h2></div>
    {offers.length ? <div className="offer-grid">{offers.map(({ offer, storeName, storeCity, catalogName }) => <article className="quote-offer-card" key={offer.id}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div><span className="eyebrow"><Store size={13} /> {storeName}</span><h3 style={{ margin: "9px 0" }}>{catalogName || request.description.slice(0, 85)}</h3><span className="muted small-text">{storeCity || "Türkiye"} · {offer.brand}</span></div><TypeBadge type={offer.productType} /></div><div className="divider" /><div className="field-grid"><div><span className="label-xs">BİRİM FİYAT</span><div className="price">{formatPrice(offer.price)}</div></div><div><span className="label-xs">HAZIRLIK / STOK</span><p className="small-text">{offer.preparationDays ?? "-"} gün · {offer.stock} adet</p></div></div>{offer.shippingInfo && <p className="muted small-text"><Package size={13} style={{ display: "inline" }} /> {offer.shippingInfo}</p>}{offer.notes && <p className="muted small-text">{offer.notes}</p>}<p className="muted small-text"><Clock3 size={13} style={{ display: "inline" }} /> Geçerlilik: {formatDate(offer.validityUntil)}</p>
      {offer.status === "active" && offer.validityUntil > new Date() && offer.stock > 0 ? <form action={addToCartAction}><input type="hidden" name="quoteOfferId" value={offer.id} /><input type="hidden" name="quantity" value="1" /><input type="hidden" name="returnTo" value={`/teklif-al/${id}`} /><button className="btn btn-dark" type="submit">Teklifi Sepete Ekle <ArrowRight size={15} /></button></form> : <span className="status-badge status-cancelled">Teklif süresi doldu veya kullanıldı</span>}</article>)}</div> : <EmptyState title="Henüz teklif gelmedi" description="Talebin mağazalara iletildi. Uygun mağazalar bağımsız teklif verdiğinde burada görüntülenecek." href="/parcalar" action="Parçaları keşfet" />}
  </main>;
}
