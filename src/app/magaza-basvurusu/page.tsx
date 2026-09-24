import Link from "next/link";
import { ArrowRight, BadgeCheck, FileSpreadsheet, Store } from "lucide-react";
import { applyStoreAction } from "@/app/actions/auth";
import { getMyStore, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function StoreApplyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const existing = await getMyStore(user.id);
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Mağaza başvurusu</div><div className="page-heading"><span className="eyebrow"><Store size={14} /> DAMPINGVAR'DA SATIŞ YAP</span><h1>Mağazanı yeni müşterilerle buluştur.</h1><p>Merkezi OEM kataloğu, CSV ürün yükleme ve mağaza bazlı sipariş yönetimi tek panelde.</p></div>
    {existing ? <div className="surface surface-pad"><h2 className="surface-title">Başvurunuz mevcut</h2><p>Mağazanız: <strong>{existing.name}</strong> · Durum: <strong>{existing.status === "approved" ? "Onaylandı" : existing.status === "pending" ? "İnceleniyor" : "Askıya alındı"}</strong></p><Link href="/magaza-paneli" className="btn btn-dark">Mağaza Paneli <ArrowRight size={16} /></Link></div> : <div className="panel-grid"><div className="surface surface-pad"><h2 className="surface-title">Mağaza bilgileri</h2>{query.error && <div className="notice notice-error">{query.error}</div>}<form action={applyStoreAction}><label className="form-field"><span>Mağaza Adı *</span><input name="name" required minLength={3} placeholder="Örn. Otomotiv Parça Mağazam" /></label><label className="form-field"><span>Şehir *</span><input name="city" required placeholder="İstanbul" /></label><label className="form-field"><span>Mağaza Açıklaması</span><textarea name="description" placeholder="Mağazanız ve uzmanlık alanınız" /></label><label className="form-field"><span>Hakediş IBAN'ı (isteğe bağlı)</span><input name="iban" placeholder="TR..." /><small className="form-hint">IBAN bilgisi yalnızca finans ekibi tarafından kullanılır.</small></label><button className="btn btn-accent" type="submit">Başvuruyu Gönder <ArrowRight size={16} /></button></form></div>
      <div className="stack"><div className="help-card"><h3><BadgeCheck size={18} style={{ display: "inline" }} /> Tek OEM, doğru eşleşme</h3><p>Ürünlerini merkezi katalogdaki OEM numaralarına bağla. Standart ürün adını senin yerine DampingVar yönetir.</p></div><div className="help-card"><h3><FileSpreadsheet size={18} style={{ display: "inline" }} /> Kolay toplu yükleme</h3><p>Standart CSV şablonunu indir; marka, ürün tipi, fiyat ve stok bilgilerini tek seferde yükle.</p></div><div className="help-card"><h3><Store size={18} style={{ display: "inline" }} /> Kendi mağazan, kendi faturan</h3><p>Siparişlerini yönet, gönderilerini takip et. Müşteriye satış faturanı kendi mağazan adına düzenle.</p></div></div></div>}
  </main>;
}
