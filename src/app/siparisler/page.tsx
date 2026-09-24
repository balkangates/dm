import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, Package, Store } from "lucide-react";
import { db } from "@/db";
import { orders, storeOrders } from "@/db/schema";
import { EmptyState } from "@/components/catalog-ui";
import { requireUser } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/core";

export const dynamic = "force-dynamic";
const labels: Record<string, string> = { awaiting_payment: "Ödeme bekleniyor", paid: "Ödendi", preparing: "Hazırlanıyor", shipped: "Kargoda", delivered: "Teslim edildi", partially_delivered: "Kısmen teslim edildi", cancelled: "İptal", refunded: "İade edildi", partially_refunded: "Kısmen iade" };
export default async function OrdersPage() {
  const user = await requireUser();
  const list = await db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt));
  const parts = list.length ? await db.select().from(storeOrders).where(inArray(storeOrders.orderId, list.map((o) => o.id))) : [];
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Siparişlerim</div><div className="page-heading"><span className="eyebrow"><Package size={14} /> SİPARİŞLERİM</span><h1>Her siparişin, her gönderin burada.</h1><p>Tek siparişin altındaki tüm mağazaların gönderim ve teslimat durumlarını ayrı ayrı izle.</p></div>
    {list.length ? list.map((order) => <article className="order-card" key={order.id}><div className="order-card-head"><div><h3>#{order.orderNumber}</h3><small>{formatDate(order.createdAt)} · {parts.filter((p) => p.orderId === order.id).length} mağaza</small></div><span className={`status-badge status-${order.status}`}>{labels[order.status] || order.status}</span></div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14 }}><div><span className="muted small-text">Sipariş toplamı</span><strong style={{ display: "block", fontSize: 18 }}>{formatPrice(order.total)}</strong></div><Link href={`/siparisler/${order.id}`} className="btn btn-dark btn-small">Detayları Gör <ArrowRight size={14} /></Link></div></article>) : <EmptyState title="Henüz siparişin yok" description="İhtiyacın olan parçaları bul, farklı mağazalardan seç ve tek sepette satın al." href="/parcalar" action="Parçaları keşfet" />}
  </main>;
}
