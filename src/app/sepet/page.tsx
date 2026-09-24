import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { ArrowRight, Box, CreditCard, Info, Landmark, PackageCheck, ShieldCheck, ShoppingBag, Store, Trash2 } from "lucide-react";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { checkoutAction, updateCartAction } from "@/app/actions/customer";
import { EmptyState, TypeBadge } from "@/components/catalog-ui";
import { requireUser } from "@/lib/auth";
import { cartRowBrand, cartRowName, cartRowPrice, cartRowType, getCartRows, type CartRow } from "@/lib/catalog";
import { formatPrice, money } from "@/lib/core";
import { isCardConfigured } from "@/lib/iyzico";

export const dynamic = "force-dynamic";
export default async function CartPage({ searchParams }: { searchParams: Promise<{ error?: string; added?: string }> }) {
  const user = await requireUser(), query = await searchParams;
  const [rows, settings] = await Promise.all([getCartRows(user.id), db.select().from(platformSettings).where(inArray(platformSettings.key, ["bank_iban", "bank_name", "bank_holder"]))]);
  const bank = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const cardEnabled = isCardConfigured(), bankEnabled = !!bank.bank_iban;
  const groups = new Map<string, CartRow[]>();
  for (const row of rows) groups.set(row.storeId || "unavailable", [...(groups.get(row.storeId || "unavailable") || []), row]);
  const total = rows.reduce((n, r) => n + cartRowPrice(r) * r.quantity, 0);
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Sepet</div><div className="page-heading"><span className="eyebrow"><ShoppingBag size={14} /> SEPETİM</span><h1>Seçtiklerin bir arada.</h1><p>Farklı mağazalardan aldığın tüm parçalar tek sepette. Gönderimler mağaza bazında takip edilir.</p></div>
    {query.error && <div className="notice notice-error">{query.error}</div>}{query.added && <div className="notice notice-success"><PackageCheck size={16} /> Ürün sepete eklendi.</div>}
    {!rows.length ? <EmptyState icon={<ShoppingBag size={28} />} title="Sepetin henüz boş" description="Aracına uygun parçaları keşfet, farklı mağazalardan dilediklerini tek sepette topla." href="/parcalar" action="Parçaları keşfet" /> : <div className="cart-layout"><div>
      {[...groups.entries()].map(([storeId, items]) => <section className="cart-store-group" key={storeId}><div className="cart-store-head"><Store size={17} /> {items[0].storeName || "Mağaza erişilemiyor"}<span className="pill" style={{ marginLeft: "auto" }}>{items.length} ürün</span></div>{items.map((r) => {
        const type = cartRowType(r), price = cartRowPrice(r);
        return <div className="cart-item" key={r.id}><span className="cart-item-visual"><Box size={30} /></span><div className="cart-item-info"><strong>{cartRowName(r)}</strong><p>{r.quoteOfferId ? "Özel mağaza teklifi" : `OEM: ${r.oemNo || "-"}`} · {cartRowBrand(r) || "Marka belirtilmedi"}</p>{type && <TypeBadge type={type} compact />}</div><div><div className="cart-item-price">{formatPrice(money(price * r.quantity))}</div><form action={updateCartAction} className="qty-control" style={{ marginTop: 7 }}><input type="hidden" name="id" value={r.id} /><input type="number" name="quantity" min="1" max="100" defaultValue={r.quantity} aria-label="Adet" /><button type="submit" className="btn btn-outline btn-small" style={{ minHeight: 32 }}>Güncelle</button></form><form action={updateCartAction} style={{ marginTop: 6, textAlign: "right" }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="quantity" value="0" /><button type="submit" className="small-text muted"><Trash2 size={12} style={{ display: "inline" }} /> Kaldır</button></form></div></div>;
      })}</section>)}
      <div className="notice notice-info"><Info size={17} /> Fiyat, marka, ürün tipi ve komisyon oranı sipariş anında kaydedilir; geçmiş siparişler fiyat değişimlerinden etkilenmez.</div>
    </div><div className="surface checkout-card"><h3>Sipariş Özeti</h3><div className="total-row"><span>Ürünler ({rows.length})</span><strong>{formatPrice(money(total))}</strong></div><div className="total-row"><span>Mağaza sayısı</span><strong>{groups.size}</strong></div><div className="total-row"><span>Kargo</span><strong>Mağazaya göre</strong></div><div className="total-row total-final"><strong>Toplam</strong><strong>{formatPrice(money(total))}</strong></div><div className="divider" />
      <form action={checkoutAction}><h3 style={{ fontSize: 14 }}>Teslimat bilgileri</h3><label className="form-field"><span>Ad Soyad *</span><input name="name" defaultValue={user.name} required /></label><label className="form-field"><span>Telefon *</span><input name="phone" type="tel" defaultValue={user.phone || ""} placeholder="05xx xxx xx xx" required /></label><label className="form-field"><span>Şehir *</span><input name="city" placeholder="İstanbul" required /></label><label className="form-field"><span>Açık Adres *</span><textarea name="address" placeholder="Mahalle, sokak, bina ve daire numarası" required minLength={10} /></label>
        <h3 style={{ fontSize: 14 }}>Ödeme yöntemi</h3>{bankEnabled && <label className="payment-choice"><input type="radio" name="method" value="bank_transfer" defaultChecked /> <Landmark size={17} /> Banka Transferi / EFT</label>}{cardEnabled && <label className="payment-choice"><input type="radio" name="method" value="card" defaultChecked={!bankEnabled} /> <CreditCard size={17} /> Kart ile Ödeme (iyzico)</label>}
        {cardEnabled && <label className="form-field"><span>Kart ödemesi için T.C. kimlik numarası</span><input name="identityNumber" inputMode="numeric" maxLength={11} placeholder="Kart seçilirse 11 haneli numara girin" /><small className="form-hint">Yalnızca iyzico ödeme isteğine gönderilir; hesapta saklanmaz.</small></label>}
        {bankEnabled && <div className="help-card" style={{ margin: "12px 0" }}><h3>Banka transferi bilgileri</h3><p><strong>{bank.bank_name}</strong> · {bank.bank_holder}</p><p style={{ overflowWrap: "anywhere", fontWeight: 800, color: "#273a31" }}>{bank.bank_iban}</p><p>Ödeme açıklamasına sipariş numaranızı yazın. Ödeme finans ekibi doğrulayana kadar onaylanmaz.</p></div>}
        {!bankEnabled && !cardEnabled && <div className="notice notice-error">Ödeme yöntemleri henüz yapılandırılmadı. Sipariş alınamıyor.</div>}
        <button type="submit" className="btn btn-accent" disabled={!bankEnabled && !cardEnabled} style={{ opacity: bankEnabled || cardEnabled ? 1 : .5 }}>Siparişi Tamamla <ArrowRight size={16} /></button><p className="muted" style={{ fontSize: 10.5, lineHeight: 1.6, marginTop: 13 }}><ShieldCheck size={13} style={{ display: "inline" }} /> Kart bilgileriniz DampingVar sunucularında tutulmaz. Mağazalar kendi satış faturasını düzenler.</p>
      </form></div></div>}
  </main>;
}
