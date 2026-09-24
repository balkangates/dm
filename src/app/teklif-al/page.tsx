import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, Camera, ClipboardList, FileQuestion, Search, Store } from "lucide-react";
import { db } from "@/db";
import { quoteRequests } from "@/db/schema";
import { createQuoteRequestAction } from "@/app/actions/customer";
import { EmptyState } from "@/components/catalog-ui";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/core";

export const dynamic = "force-dynamic";
export default async function QuotePage({ searchParams }: { searchParams: Promise<{ oem?: string; error?: string }> }) {
  const user = await requireUser(), query = await searchParams;
  const requests = await db.select().from(quoteRequests).where(eq(quoteRequests.customerId, user.id)).orderBy(desc(quoteRequests.createdAt));
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Mağazalardan teklif al</div><div className="page-heading"><span className="eyebrow"><FileQuestion size={14} /> ARADIĞIN PARÇA YOK MU?</span><h1>Anlat, mağazalar teklif etsin.</h1><p>Parçanı tarif et; uygun mağazalar birbirlerinin fiyatını görmeden sana kendi tekliflerini sunsun.</p></div>
    {query.error && <div className="notice notice-error">{query.error}</div>}
    <div className="panel-grid" style={{ gridTemplateColumns: "1.1fr .9fr" }}><div className="surface surface-pad"><h2 className="surface-title">Yeni parça talebi oluştur</h2><form action={createQuoteRequestAction} encType="multipart/form-data"><div className="field-grid three"><label className="form-field"><span>Araç markası</span><input name="vehicleBrand" placeholder="Örn. BMW" /></label><label className="form-field"><span>Model</span><input name="vehicleModel" placeholder="Örn. 3 Serisi" /></label><label className="form-field"><span>Yıl</span><input type="number" name="vehicleYear" min="1950" max={new Date().getFullYear() + 1} placeholder="2021" /></label></div>
      <div className="field-grid"><label className="form-field"><span>OEM / Parça No (biliyorsan)</span><input name="oemNo" defaultValue={query.oem || ""} placeholder="Parça numarası" /></label><label className="form-field"><span>Tercih edilen marka</span><input name="brandPreference" placeholder="Varsa marka tercihin" /></label></div>
      <label className="form-field"><span>Aradığın parçayı anlat *</span><textarea name="description" required minLength={8} placeholder="Parçanın adı, konumu, özellikleri ve bildiğin diğer bilgiler..." /></label><div className="field-grid"><label className="form-field"><span>Adet *</span><input type="number" name="quantity" required min="1" max="100" defaultValue="1" /></label><label className="form-field"><span>Teslimat şehri *</span><input name="city" required placeholder="İstanbul" /></label></div><label className="form-field"><span>Parça fotoğrafı (isteğe bağlı)</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" /><small className="form-hint">JPG, PNG veya WebP · en fazla 2 MB</small></label><button className="btn btn-accent" type="submit">Teklif Talebi Gönder <ArrowRight size={16} /></button></form></div>
      <div className="stack"><div className="help-card"><h3><Store size={18} style={{ display: "inline" }} /> Nasıl çalışır?</h3><p>Talebin onaylı mağazalara açılır. Her mağaza bağımsız teklif verir; mağazalar rakip teklif fiyatlarını göremez. Sen tüm tekliflerini karşılaştırabilirsin.</p></div><div className="surface surface-pad"><h2 className="surface-title"><ClipboardList size={18} style={{ display: "inline" }} /> Taleplerim</h2>{requests.length ? requests.map((r) => <Link key={r.id} href={`/teklif-al/${r.id}`} className="list-card" style={{ margin: "0 -24px" }}><div><h3>{r.description.slice(0, 65)}{r.description.length > 65 ? "..." : ""}</h3><p>{formatDate(r.createdAt)} · {r.city} · {r.oemNo || "OEM belirtilmedi"}</p></div><ArrowRight size={15} /></Link>) : <p className="muted small-text">Henüz talebin yok. Yukarıdaki formdan ilk talebini oluştur.</p>}</div></div>
    </div>
  </main>;
}
