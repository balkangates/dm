import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { ArrowLeft, ArrowRight, BadgeCheck, Box, CircleCheck, CreditCard, Landmark, Package, Store, Truck } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { orderItems, orders, payments, platformSettings, shipments, storeOrders, storeSalesInvoices, stores } from "@/db/schema";
import { cancelOrderAction, confirmDeliveryAction, submitBankReferenceAction } from "@/app/actions/customer";
import { TypeBadge } from "@/components/catalog-ui";
import { requireUser } from "@/lib/auth";
import { externalUrl, formatDate, formatPrice } from "@/lib/core";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { awaiting_payment: "Ödeme bekleniyor", paid: "Ödendi", preparing: "Hazırlanıyor", shipped: "Kargoda", delivered: "Teslim edildi", partially_delivered: "Kısmen teslim edildi", cancelled: "İptal", refunded: "İade edildi", partially_refunded: "Kısmen iade" };
export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const user = await requireUser(), { id } = await params, query = await searchParams;
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order || (order.userId !== user.id && user.role !== "admin")) notFound();
  const [parts, items, [payment], settings] = await Promise.all([
    db.select({ part: storeOrders, storeName: stores.name }).from(storeOrders).innerJoin(stores, eq(storeOrders.storeId, stores.id)).where(eq(storeOrders.orderId, id)),
    db.select().from(orderItems).where(eq(orderItems.orderId, id)), db.select().from(payments).where(eq(payments.orderId, id)),
    db.select().from(platformSettings).where(inArray(platformSettings.key, ["bank_iban", "bank_name", "bank_holder"])),
  ]);
  const partIds = parts.map((p) => p.part.id);
  const [tracking, invoices] = await Promise.all([
    partIds.length ? db.select().from(shipments).where(inArray(shipments.storeOrderId, partIds)) : [],
    partIds.length ? db.select().from(storeSalesInvoices).where(inArray(storeSalesInvoices.storeOrderId, partIds)) : [],
  ]);
  const bank = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / <Link href="/siparisler">Siparişlerim</Link> / {order.orderNumber}</div><Link href="/siparisler" className="section-link"><ArrowLeft size={15} /> Tüm siparişlere dön</Link><div className="page-heading" style={{ marginTop: 22 }}><span className="eyebrow"><Package size={14} /> SİPARİŞ DETAYI</span><h1>#{order.orderNumber}</h1><p>{formatDate(order.createdAt)} tarihinde oluşturuldu · {parts.length} mağazadan ayrı gönderim</p></div>
    {query.error && <div className="notice notice-error">{query.error}</div>}{query.success && <div className="notice notice-success"><CircleCheck size={16} /> {query.success}</div>}
    <div className="panel-grid" style={{ gridTemplateColumns: "1.35fr .65fr" }}><div className="stack">
      {parts.map(({ part, storeName }) => <div className="surface surface-pad" key={part.id}><div className="order-part-head"><div><span className="eyebrow"><Store size={13} /> MAĞAZA GÖNDERİSİ</span><h2 style={{ fontSize: 17, fontWeight: 800, margin: "5px 0 0" }}>{storeName}</h2></div><span className={`status-badge status-${part.status}`}>{statusLabels[part.status] || part.status}</span></div><div className="divider" />
        {items.filter((item) => item.storeOrderId === part.id).map((item) => <div className="order-line" key={item.id}><div><strong>{item.productName}</strong><div className="muted" style={{ marginTop: 5 }}>OEM: {item.oemNo || "Teklif ürünü"} · {item.brand} · {item.quantity} adet <TypeBadge type={item.productType} compact /></div></div><strong>{formatPrice(item.lineTotal)}</strong></div>)}
        <div className="divider" /><div className="order-line"><span>Mağaza alt toplamı</span><strong>{formatPrice(part.subtotal)}</strong></div>
        {tracking.filter((s) => s.storeOrderId === part.id).map((shipment) => <div className="help-card" key={shipment.id} style={{ marginTop: 15 }}><h3><Truck size={16} style={{ display: "inline" }} /> Kargo Takibi · {shipment.carrier}</h3><p>Takip No: <strong>{shipment.trackingNumber}</strong> · {shipment.status === "delivered" ? "Teslim edildi" : "Yolda"}</p></div>)}
        {invoices.filter((invoice) => invoice.storeOrderId === part.id).map((invoice) => <div className="notice notice-info" key={invoice.id} style={{ marginTop: 12 }}><BadgeCheck size={16} /> Mağazanın satış faturası: <strong>{invoice.invoiceNumber}</strong> {invoice.pdfUrl && externalUrl(invoice.pdfUrl) && <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>PDF Görüntüle ↗</a>}</div>)}
        {part.status === "shipped" && order.userId === user.id && <form action={confirmDeliveryAction} style={{ marginTop: 15 }}><input type="hidden" name="storeOrderId" value={part.id} /><input type="hidden" name="orderId" value={order.id} /><button className="btn btn-accent btn-small" type="submit"><CircleCheck size={15} /> Ürünleri Teslim Aldım</button></form>}
      </div>)}
    </div><div className="stack"><div className="surface surface-pad"><h2 className="surface-title">Ödeme Özeti</h2><div className="total-row"><span>Ödeme şekli</span><strong>{order.paymentMethod === "card" ? "Kart / iyzico" : "Banka transferi"}</strong></div><div className="total-row"><span>Ödeme durumu</span><span className={`status-badge status-${payment?.status}`}>{payment?.status === "paid" ? "Onaylandı" : payment?.status === "pending_verification" ? "Doğrulama bekliyor" : payment?.status === "card_pending" ? "Kart bekleniyor" : payment?.status || "-"}</span></div><div className="total-row total-final"><strong>Toplam</strong><strong>{formatPrice(order.total)}</strong></div></div>
      {order.paymentMethod === "bank_transfer" && payment?.status === "pending_verification" && <div className="surface surface-pad"><h2 className="surface-title"><Landmark size={18} style={{ display: "inline" }} /> EFT bilgileri</h2><p className="muted small-text">Ödeme açıklamasına <strong>{order.orderNumber}</strong> yazın. Transfer otomatik olarak onaylanmaz; finans ekibi doğrular.</p>{bank.bank_iban && <div className="help-card"><p><strong>{bank.bank_name} · {bank.bank_holder}</strong></p><p style={{ overflowWrap: "anywhere", fontWeight: 800, color: "#1d3027" }}>{bank.bank_iban}</p></div>}<form action={submitBankReferenceAction} style={{ marginTop: 14 }}><input type="hidden" name="orderId" value={order.id} /><label className="form-field"><span>Transfer / dekont referansı</span><input name="reference" defaultValue={payment.reference || ""} placeholder="Banka işlem referansı" required /></label><button className="btn btn-outline btn-small" type="submit">Referansı Kaydet</button></form></div>}
      <div className="surface surface-pad"><h2 className="surface-title">Teslimat adresi</h2><p style={{ fontSize: 12, lineHeight: 1.7 }}><strong>{order.shippingName}</strong><br />{order.shippingPhone}<br />{order.shippingAddress}<br />{order.shippingCity}</p></div>
      {order.status === "awaiting_payment" && order.userId === user.id && <form action={cancelOrderAction}><input type="hidden" name="orderId" value={order.id} /><button className="btn btn-danger" type="submit">Ödenmemiş siparişi iptal et</button></form>}
    </div></div>
  </main>;
}
