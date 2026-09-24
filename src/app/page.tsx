import Link from "next/link";
import { ArrowDownRight, ArrowRight, BadgeCheck, Boxes, CircleCheck, ClipboardList, CreditCard, Headphones, Lightbulb, MoveUpRight, PackageCheck, Search, ShieldCheck, ShoppingBag, Sparkles, Wrench } from "lucide-react";
import { SearchPanel } from "@/components/search-panel";
import { EmptyState, ProductCard, SectionHeading } from "@/components/catalog-ui";
import { getCategories, getOfferRows, groupOffers } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const categoryIcons = ["●", "▤", "⚙", "⌁", "ϟ", "☼", "▰", "◈"];

export default async function HomePage() {
  const [categories, offers] = await Promise.all([getCategories(), getOfferRows({}, 120)]);
  const featured = groupOffers(offers).slice(0, 4);
  return <main>
    <div className="shell">
      <section className="hero">
        <div className="hero-content"><div className="hero-eyebrow"><span className="hero-eyebrow-line" /> OTOMOTİV YEDEK PARÇADA YENİ NESİL</div>
          <h1>Doğru parça.<br /><span>Her yol için.</span></h1>
          <p>Aracına tam uyumlu parçayı bul, markaları ve fiyatları karşılaştır. Ne aldığını bilerek güvenle yola devam et.</p>
          <div className="hero-actions"><Link href="/parcalar" className="btn btn-accent">Parçaları Keşfet <ArrowRight size={18} /></Link><Link href="/nasil-calisir" className="hero-secondary">Nasıl çalışır? <MoveUpRight size={17} /></Link></div>
          <div className="hero-proof"><span><CircleCheck size={17} /> Şeffaf ürün tipleri</span><span><CircleCheck size={17} /> Tek sepet, çok mağaza</span></div>
        </div>
        <div className="hero-corner">DAHA İYİ BİR YOLCULUK<br />BURADA BAŞLAR <ArrowDownRight size={17} /></div>
      </section>
      <SearchPanel />
    </div>

    <section className="shell home-section category-section" id="kategoriler">
      <SectionHeading eyebrow="İHTİYACIN OLAN HER ŞEY" title="Parçana giden kısa yol." description="Aradığın yedek parçayı kategorisinden keşfet." href="/parcalar" linkText="Tüm parçalar" />
      <div className="category-grid">{categories.filter((c) => !c.parentId).map((category, i) => <Link key={category.id} href={`/parcalar?category=${category.slug}`} className={`category-tile category-tile-${i % 8}`}><span className="category-icon">{categoryIcons[i % 8]}</span><span className="category-copy"><strong>{category.name}</strong><small>Parçaları incele</small></span><span className="category-arrow"><ArrowRight size={17} /></span></Link>)}</div>
    </section>

    <section className="shell home-section featured-section">
      <SectionHeading eyebrow="PİYASAYI KARŞILAŞTIR" title="Parçalar, tek bir yerde." description="Aynı OEM numarasına ait farklı marka ve ürün tiplerini yan yana gör." href="/parcalar" linkText="Tüm ürünlere göz at" />
      {featured.length ? <div className="product-grid">{featured.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="home-catalog-empty"><div className="home-empty-visual"><Boxes size={58} strokeWidth={1} /><span className="home-empty-orbit orbit-one" /><span className="home-empty-orbit orbit-two" /></div><div><span className="eyebrow">KATALOĞUMUZ GELİŞİYOR</span><h3>Aradığın parçayı birlikte bulalım.</h3><p>Şu anda listelenen ürün yok. Aradığın parça için mağazalara ücretsiz teklif talebi gönderebilirsin.</p><Link href="/teklif-al" className="btn btn-dark">Mağazalardan Teklif Al <ArrowRight size={16} /></Link></div></div>}
    </section>

    <section className="why-section"><div className="shell"><div className="why-header"><div><span className="eyebrow eyebrow-dark"><Sparkles size={14} /> DAMPINGVAR FARKI</span><h2>Parça aramak artık<br /><em>çok daha kolay.</em></h2></div><p>Her detayı düşünülmüş bir alışveriş deneyimi. Aracın için doğru kararı, ihtiyacın olan bilgiyle ver.</p></div>
      <div className="why-grid"><article className="why-card"><span className="why-number">01 /</span><div className="why-icon"><Search size={26} /></div><h3>Tek OEM, tüm seçenekler</h3><p>Aynı parça numarasına ait farklı mağaza ve marka tekliflerini tek yerde karşılaştır.</p><ArrowRight size={20} className="why-arrow" /></article>
        <article className="why-card"><span className="why-number">02 /</span><div className="why-icon"><ShieldCheck size={26} /></div><h3>Ne aldığını her zaman bil</h3><p>Orijinal, yan sanayi veya muadil: ürün tipi her teklifte açıkça gösterilir.</p><ArrowRight size={20} className="why-arrow" /></article>
        <article className="why-card"><span className="why-number">03 /</span><div className="why-icon"><ShoppingBag size={26} /></div><h3>Tek sepet, kolay takip</h3><p>Farklı mağazalardan seç, tek seferde sipariş ver. Her gönderiyi ayrı ayrı takip et.</p><ArrowRight size={20} className="why-arrow" /></article></div>
    </div></section>

    <section className="shell home-section type-section"><div className="type-intro"><span className="eyebrow">ŞEFFAF ALIŞVERİŞ</span><h2>Seçim senin.<br />Bilgi hep yanında.</h2><p>Her ürünün kaynağını ve niteliğini net gör. Fiyata bakarken ürün tipini asla gözden kaçırma.</p><Link href="/nasil-calisir" className="section-link">Ürün tiplerini öğren <ArrowRight size={17} /></Link></div><div className="type-explain-list"><div><span className="type-symbol symbol-original"><BadgeCheck size={22} /></span><div><h3>Orijinal</h3><p>Üretici / OEM markalı orijinal ürün.</p></div><ArrowRight size={17} /></div><div><span className="type-symbol symbol-aftermarket"><Wrench size={22} /></span><div><h3>Yan Sanayi</h3><p>OEM dışı üreticinin ürettiği alternatif parça.</p></div><ArrowRight size={17} /></div><div><span className="type-symbol symbol-equivalent"><Lightbulb size={22} /></span><div><h3>Muadil</h3><p>İstenen parçaya teknik olarak alternatif ürün.</p></div><ArrowRight size={17} /></div></div></section>

    <section className="shell quote-banner"><div className="quote-banner-content"><span className="eyebrow eyebrow-light"><Headphones size={15} /> YANINDAYIZ</span><h2>Parçayı bulamadın mı?<br /><span>Talebini mağazalara ilet.</span></h2><p>İhtiyacın olan parçayı anlat, uygun mağazalar sana kendi tekliflerini sunsun. Karşılaştır ve sana en uygun olanı seç.</p><Link href="/teklif-al" className="btn btn-accent">Mağazalardan Teklif Al <ArrowRight size={17} /></Link></div></section>

    <section className="shell reassurance"><div><PackageCheck size={24} /><span><strong>Doğru parça</strong><small>Merkezi OEM kataloğu</small></span></div><div><BadgeCheck size={24} /><span><strong>Net bilgi</strong><small>Açık ürün tipi ve marka</small></span></div><div><CreditCard size={24} /><span><strong>Güvenli süreç</strong><small>Doğrulanan ödeme akışı</small></span></div><div><ClipboardList size={24} /><span><strong>Kolay takip</strong><small>Mağaza bazlı gönderiler</small></span></div></section>

    <section className="shell seller-strip"><div><span className="eyebrow">MAĞAZALAR İÇİN</span><h2>Parçaların yeni adresi burada.</h2><p>Mağazanı DampingVar'a taşı, merkezi kataloğa bağlan ve daha fazla müşteriye ulaş.</p></div><Link href="/magaza-basvurusu" className="btn btn-dark">Mağaza Başvurusu Yap <ArrowRight size={17} /></Link></section>
  </main>;
}
