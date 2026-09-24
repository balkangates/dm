import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Headphones, MessageCircle, Send, Store } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { callRequests, messages, products, storeProducts, stores, users } from "@/db/schema";
import { sendMessageAction } from "@/app/actions/customer";
import { updateCallStatusAction } from "@/app/actions/store";
import { LiveRefresh } from "@/components/live-refresh";
import { LiveRoom } from "@/components/live-room";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(), { id } = await params;
  const [data] = await db.select({ call: callRequests, storeName: stores.name, storeOwner: stores.ownerId,
    brand: storeProducts.brand, productName: products.productName }).from(callRequests)
    .innerJoin(stores, eq(callRequests.storeId, stores.id))
    .leftJoin(storeProducts, eq(callRequests.storeProductId, storeProducts.id))
    .leftJoin(products, eq(storeProducts.catalogProductId, products.id))
    .where(eq(callRequests.id, id));
  if (!data || (data.call.customerId !== user.id && data.storeOwner !== user.id && user.role !== "admin")) notFound();
  const thread = await db.select({ id: messages.id, content: messages.content, createdAt: messages.createdAt, senderId: messages.senderId, senderName: users.name }).from(messages).innerJoin(users, eq(messages.senderId, users.id)).where(eq(messages.callRequestId, id)).orderBy(asc(messages.createdAt));
  const isStore = data.storeOwner === user.id;
  return <main className="shell page-main"><LiveRefresh /><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / <Link href={isStore ? "/magaza-paneli?tab=canli" : "/hesabim"}>Görüşmeler</Link> / Canlı destek</div><div className="page-heading page-heading-row"><div><span className="eyebrow"><Headphones size={14} /> BİREBİR MAĞAZA GÖRÜŞMESİ</span><h1>{data.storeName} ile görüşme</h1><p>{data.productName ? `${data.productName} · ${data.brand}` : "Ürün danışmanlığı"} · Durum: {data.call.status === "active" ? "Görüşme açık" : data.call.status === "closed" ? "Sona erdi" : "Temsilci bekleniyor"}</p></div>{isStore && data.call.status !== "closed" && <form action={updateCallStatusAction}><input type="hidden" name="callId" value={id} /><input type="hidden" name="status" value={data.call.status === "requested" ? "active" : "closed"} /><button className="btn btn-dark" type="submit">{data.call.status === "requested" ? "Görüşmeyi Kabul Et" : "Görüşmeyi Bitir"}</button></form>}</div>
    <div className="panel-grid" style={{ gridTemplateColumns: "1.2fr .8fr" }}><div className="stack"><div className="surface surface-pad"><h2 className="surface-title"><Headphones size={18} style={{ display: "inline" }} /> Canlı Video</h2><LiveRoom callId={id} closed={data.call.status === "closed"} /><p className="muted small-text" style={{ marginTop: 13 }}>Görüşme yalnızca müşteri ve bu mağazanın yetkili hesabına açıktır. Kamera ve mikrofon izni cihazından verilir.</p></div></div>
      <div className="surface surface-pad"><h2 className="surface-title"><MessageCircle size={18} style={{ display: "inline" }} /> Mesajlar</h2><div className="chat-box">{thread.length ? thread.map((message) => <div key={message.id} className={`chat-bubble ${message.senderId === user.id ? "mine" : ""}`}><strong style={{ fontSize: 10 }}>{message.senderName}</strong><div>{message.content}</div><small>{new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(message.createdAt)}</small></div>) : <p className="muted small-text">Henüz mesaj yok. Merhaba diyerek görüşmeyi başlatabilirsin.</p>}</div>{data.call.status !== "closed" && <form action={sendMessageAction} className="chat-form"><input type="hidden" name="callId" value={id} /><input className="form-input" name="content" placeholder="Mesajını yaz..." maxLength={2000} required /><button type="submit" className="btn btn-accent" aria-label="Mesaj gönder"><Send size={17} /></button></form>}</div></div>
  </main>;
}
