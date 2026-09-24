import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { ArrowRight, ChevronDown, CircleHelp, Headphones, Heart, Menu, PackageSearch, ShoppingBag, UserRound, Wrench } from "lucide-react";
import { db } from "@/db";
import { cartItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const [cartCount] = user ? await db.select({ count: count() }).from(cartItems).where(eq(cartItems.userId, user.id)) : [{ count: 0 }];
  return (
    <header className="site-header">
      <div className="utility-bar">
        <div className="shell utility-inner">
          <span><span className="utility-dot" /> Doğru parça, güvenli alışveriş.</span>
          <div className="utility-links"><Link href="/teklif-al"><CircleHelp size={13} /> Parça bulamadın mı?</Link><span className="utility-divider" /><Link href="/magaza-basvurusu">Mağaza aç <ArrowRight size={13} /></Link></div>
        </div>
      </div>
      <div className="shell main-header">
        <Link href="/" className="brand-logo" aria-label="DampingVar ana sayfa">
          <span className="brand-mark"><Wrench size={20} strokeWidth={2.8} /></span>
          <span>damping<span className="brand-var">var</span><span className="brand-period">.</span></span>
        </Link>
        <nav className="desktop-nav" aria-label="Ana menü">
          <Link href="/parcalar">Oto Yedek Parça</Link>
          <Link href="/#kategoriler">Kategoriler</Link>
          <Link href="/markalar">Markalar</Link>
          <Link href="/firsatlar">Fırsatlar</Link>
          <Link href="/magazalar">Mağazalar</Link>
        </nav>
        <div className="header-actions">
          <Link href="/garajim" className="header-icon-link" title="Garajım"><Wrench size={19} /><span>Garajım</span></Link>
          <Link href="/favoriler" className="header-icon-link" title="Favoriler"><Heart size={19} /><span>Favoriler</span></Link>
          <Link href="/sepet" className="header-icon-link cart-link" title="Sepet"><ShoppingBag size={20} /><span>Sepet</span>{cartCount.count > 0 && <b className="cart-bubble">{cartCount.count}</b>}</Link>
          <span className="header-divider" />
          <Link href={user ? "/hesabim" : "/giris"} className="account-link"><UserRound size={18} /><span>{user ? user.name.split(" ")[0] : "Giriş Yap"}</span></Link>
        </div>
        <details className="mobile-menu"><summary aria-label="Menüyü aç"><Menu size={24} /></summary><nav>
          <Link href="/parcalar">Oto Yedek Parça</Link><Link href="/#kategoriler">Kategoriler</Link><Link href="/markalar">Markalar</Link><Link href="/firsatlar">Fırsatlar</Link><Link href="/magazalar">Mağazalar</Link><Link href="/garajim">Garajım</Link><Link href="/favoriler">Favoriler</Link><Link href="/sepet">Sepet ({cartCount.count})</Link><Link href={user ? "/hesabim" : "/giris"}>{user ? "Hesabım" : "Giriş Yap"}</Link>
        </nav></details>
      </div>
      {user?.role === "admin" && <div className="role-bar"><div className="shell"><Link href="/admin">Yönetim paneli <ArrowRight size={13} /></Link></div></div>}
      {user?.role === "store" && <div className="role-bar"><div className="shell"><Link href="/magaza-paneli">Mağaza paneline git <ArrowRight size={13} /></Link></div></div>}
    </header>
  );
}

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="shell footer-main">
      <div className="footer-about"><Link href="/" className="brand-logo footer-logo"><span className="brand-mark"><Wrench size={19} strokeWidth={2.8} /></span><span>damping<span className="brand-var">var</span><span className="brand-period">.</span></span></Link><p>Aradığın otomotiv yedek parçasını, doğru mağazadan, ne aldığını bilerek bul.</p><div className="footer-trust"><span><PackageSearch size={17} /> Merkezi OEM kataloğu</span><span><Headphones size={17} /> Mağazayla doğrudan iletişim</span></div></div>
      <div className="footer-col"><h4>Keşfet</h4><Link href="/parcalar">Tüm parçalar</Link><Link href="/#kategoriler">Kategoriler</Link><Link href="/markalar">Markalar</Link><Link href="/magazalar">Mağazalar</Link></div>
      <div className="footer-col"><h4>Hesabım</h4><Link href="/garajim">Garajım</Link><Link href="/favoriler">Favorilerim</Link><Link href="/siparisler">Siparişlerim</Link><Link href="/teklif-al">Teklif taleplerim</Link></div>
      <div className="footer-col"><h4>DampingVar</h4><Link href="/nasil-calisir">Nasıl çalışır?</Link><Link href="/magaza-basvurusu">Mağaza aç</Link><Link href="/magaza-paneli">Mağaza paneli</Link><Link href="/hesabim">Yardım & destek <ChevronDown size={12} /></Link></div>
    </div>
    <div className="shell footer-bottom"><span>© {new Date().getFullYear()} DampingVar. Güvenle yola devam.</span><span>Her parçada şeffaflık. Her yolda güven.</span></div>
  </footer>;
}
