import Link from "next/link";
import { ArrowRight, BadgeCheck, Box, Heart, Package, Store, Tag } from "lucide-react";
import { addToCartAction } from "@/app/actions/customer";
import { formatPrice, productTypeLabels, type OfferType } from "@/lib/core";
import type { OfferRow } from "@/lib/catalog";

export function TypeBadge({ type, compact = false }: { type: OfferType; compact?: boolean }) {
  return <span className={`type-badge type-${type}${compact ? " type-compact" : ""}`}><span className="type-dot" />{productTypeLabels[type]}</span>;
}

export function EmptyState({ icon, title, description, href, action }: { icon?: React.ReactNode; title: string; description: string; href?: string; action?: string }) {
  return <div className="empty-state"><div className="empty-icon">{icon || <Package size={27} />}</div><h3>{title}</h3><p>{description}</p>{href && <Link href={href} className="btn btn-dark">{action || "Keşfet"} <ArrowRight size={16} /></Link>}</div>;
}

export function ProductCard({ product }: { product: { id: string; productName: string; oemNo: string; categoryName: string | null; imageUrl: string | null; offers: OfferRow[] } }) {
  const best = product.offers[0];
  return <article className="product-card">
    <Link href={`/parca/${product.id}`} className="product-image"><span className="product-category-label">{product.categoryName || "Oto yedek parça"}</span>{product.imageUrl ? <img src={product.imageUrl} alt={product.productName} /> : <span className="part-placeholder"><Box size={60} strokeWidth={1.15} /><span>OEM PARÇA</span></span>}</Link>
    <div className="product-card-body">
      <div className="product-meta"><span><BadgeCheck size={13} /> OEM: {product.oemNo}</span>{product.offers.length > 1 && <span>{product.offers.length} teklif</span>}</div>
      <Link href={`/parca/${product.id}`} className="product-title">{product.productName}</Link>
      <div className="product-offer-info"><span className="product-brand">{best.brand}</span><TypeBadge type={best.productType} compact /></div>
      <p className="product-store"><Store size={13} /> {best.storeName} <span className="stock-dot" /> Stokta</p>
      <div className="product-card-bottom"><div><small>Başlayan fiyatlarla</small><strong>{formatPrice(best.price)}</strong></div><Link href={`/parca/${product.id}`} className="round-arrow" aria-label={`${product.productName} tekliflerini gör`}><ArrowRight size={19} /></Link></div>
    </div>
  </article>;
}

export function OfferCard({ offer, returnTo }: { offer: OfferRow; returnTo?: string }) {
  return <article className="offer-card">
    <div className="offer-card-top"><div className="offer-store-icon"><Store size={23} /></div><div><Link href={`/magazalar/${offer.storeSlug}`} className="offer-store-name">{offer.storeName}</Link><p>{offer.storeCity || "Türkiye"} · <span className="in-stock"><span className="stock-dot" /> Stokta ({offer.stock})</span></p></div></div>
    <div className="offer-card-middle"><div><p className="label-xs">MARKA</p><strong>{offer.brand}</strong></div><TypeBadge type={offer.productType} /></div>
    <div className="offer-card-footer"><div><span className="label-xs">SATIŞ FİYATI</span><strong>{formatPrice(offer.price)}</strong></div><form action={addToCartAction}><input type="hidden" name="productId" value={offer.id} /><input type="hidden" name="quantity" value="1" /><input type="hidden" name="returnTo" value={returnTo || `/parca/${offer.catalogProductId}`} /><button className="btn btn-dark" type="submit">Sepete Ekle <ArrowRight size={15} /></button></form></div>
  </article>;
}

export function SectionHeading({ eyebrow, title, description, href, linkText }: { eyebrow?: string; title: string; description?: string; href?: string; linkText?: string }) {
  return <div className="section-heading"><div>{eyebrow && <span className="eyebrow"><Tag size={13} /> {eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{href && <Link href={href} className="section-link">{linkText || "Tümünü gör"} <ArrowRight size={17} /></Link>}</div>;
}
