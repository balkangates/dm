import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { ArrowRight, Heart, KeyRound, LogOut, Package, Store, UserRound, Wrench } from "lucide-react";
import { db } from "@/db";
import { favorites, orders, quoteRequests } from "@/db/schema";
import { changePasswordAction, logoutAction } from "@/app/actions/auth";
import { getMyStore, requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/core";

export const dynamic = "force-dynamic";
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const [store, [orderCount], [favoriteCount], [quoteCount]] = await Promise.all([
    getMyStore(user.id), db.select({ count: count() }).from(orders).where(eq(orders.userId, user.id)),
    db.select({ count: count() }).from(favorites).where(eq(favorites.userId, user.id)),
    db.select({ count: count() }).from(quoteRequests).where(eq(quoteRequests.customerId, user.id)),
  ]);
  const links = [{ href: "/siparisler", icon: <Package size={22} />, title: "Siparişlerim", detail: `${orderCount.count} sipariş` },{ href: "/garajim", icon: <Wrench size={22} />, title: "Garajım", detail: "Araçlarını yönet" },{ href: "/favoriler", icon: <Heart size={22} />, title: "Favorilerim", detail: `${favoriteCount.count} parça` },{ href: "/teklif-al", icon: <Store size={22} />, title: "Teklif Taleplerim", detail: `${quoteCount.count} talep` }];
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Hesabım</div><div className="page-heading"><span className="eyebrow">HESABIM</span><h1>Merhaba, {user.name.split(" ")[0]} 👋</h1><p>Hesabınla ilgili her şey burada. Üyelik tarihi: {formatDate(user.createdAt)}</p></div>
    {query.error && <div className="notice notice-error">Bu alana erişim yetkiniz bulunmuyor.</div>}
    <div className="panel-grid"><div className="stack"><div className="surface surface-pad"><div style={{ display: "flex", alignItems: "center", gap: 14 }}><div className="category-icon"><UserRound size={26} /></div><div><strong>{user.name}</strong><p className="muted small-text" style={{ margin: 0 }}>{user.email} · {user.role === "admin" ? "Yönetici" : user.role === "store" ? "Mağaza hesabı" : "Müşteri"}</p></div></div></div>
      <div className="surface">{links.map((item) => <Link key={item.href} href={item.href} className="list-card"><div style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{ color: "#6b8e61" }}>{item.icon}</span><div><h3>{item.title}</h3><p>{item.detail}</p></div></div><ArrowRight size={17} /></Link>)}</div>
      {user.role === "admin" && <Link href="/admin" className="btn btn-dark">Yönetim paneline git <ArrowRight size={16} /></Link>}{store ? <Link href="/magaza-paneli" className="btn btn-dark">Mağaza paneline git <ArrowRight size={16} /></Link> : <Link href="/magaza-basvurusu" className="btn btn-outline">Mağaza aç <ArrowRight size={16} /></Link>}</div>
      <div className="stack"><div className="surface surface-pad"><h2 className="surface-title"><KeyRound size={18} style={{ display: "inline" }} /> Şifreni değiştir</h2><form action={changePasswordAction}><label className="form-field"><span>Mevcut şifre</span><input type="password" name="oldPassword" required /></label><label className="form-field"><span>Yeni şifre</span><input type="password" name="newPassword" required minLength={8} placeholder="En az 8 karakter" /></label><button className="btn btn-dark" type="submit">Şifreyi Güncelle</button></form></div><div className="surface surface-pad"><h2 className="surface-title">Oturum</h2><p className="muted small-text">Güvenliğin için işin bittiğinde hesabından çıkış yap.</p><form action={logoutAction}><button className="btn btn-outline" type="submit"><LogOut size={16} /> Çıkış Yap</button></form></div></div>
    </div>
  </main>;
}
