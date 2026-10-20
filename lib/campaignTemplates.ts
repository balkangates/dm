/**
 * Hazır kampanya taslak örnekleri (istek: yeni kampanya oluşturmak için hazır
 * taslak örneklerden seçebilme).
 *
 * Statik, sektörden bağımsız örnekler; seçim formu doldurur, işletme
 * "AI ile işletme profiline göre uyarla" ile içeriği kendi ad/ürün/hizmet
 * bilgilerine göre kişiselleştirir. Burada üretilen içerik YAYIN DEĞİLDİR;
 * yayın yine işletme onayı + moderasyon + görsel zorunluluğundan geçer.
 */

export type CampaignTemplate = {
  key: string;
  label: string;
  hint: string;
  type: "PERCENT";
  discountPercent: number;
  /** Minimum sepet — BİRİM (form alanı birim tutar; kaydetmede ×100). */
  minBasket: number;
  durationDays: number;
  timeStart: string;
  timeEnd: string;
  title: string;
  description: string;
  terms: string;
  eligibleItems: string;
};

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    key: "hafta-sonu",
    label: "%15 Hafta sonu indirimi",
    hint: "Cumartesi–pazar tüm ürünlerde geçerli; sepet alt limitli, 14 gün.",
    type: "PERCENT",
    discountPercent: 15,
    minBasket: 300,
    durationDays: 14,
    timeStart: "10:00",
    timeEnd: "22:00",
    title: "Hafta Sonu %15 Damping",
    description:
      "Cumartesi ve pazar günleri tüm ürünlerde geçerli %15 DampingVar indirimi. İndirim, DampingVar QR doğrulaması sonrası kasada uygulanır.",
    terms:
      "Kampanya Cumartesi ve Pazar günleri 10:00–22:00 arasında geçerlidir. Minimum sepet 300 TL. Diğer indirimlerle birleştirilemez; stoklarla sınırlıdır. İndirim kasada uygulanır.",
    eligibleItems: "Tüm ürünler",
  },
  {
    key: "aksam-saatleri",
    label: "%20 Akşam saatleri (restoran)",
    hint: "18:00–21:00 arası, paket serviste yoğunluk artırmak için; 21 gün.",
    type: "PERCENT",
    discountPercent: 20,
    minBasket: 0,
    durationDays: 21,
    timeStart: "18:00",
    timeEnd: "21:00",
    title: "Akşam Saatlerinde %20 Damping",
    description:
      "18:00–21:00 arasında DampingVar üzerinden gelen siparişlerde %20 indirim. Yoğunluğu dengelemek ve paket siparişleri artırmak için uygundur.",
    terms:
      "Kampanya her gün 18:00–21:00 arasında geçerlidir. DampingVar üzerinden doğrulanan siparişlerde uygulanır. Diğer kampanyalarla birleştirilemez; paket servis ve gel-al için geçerlidir.",
    eligibleItems: "Paket ve gel-al siparişleri",
  },
  {
    key: "ilk-musteri",
    label: "%10 İlk müşteriye özel",
    hint: "DampingVar üzerinden ilk kez gelen müşteriye; 30 gün.",
    type: "PERCENT",
    discountPercent: 10,
    minBasket: 0,
    durationDays: 30,
    timeStart: "",
    timeEnd: "",
    title: "İlk Ziyarete %10 Damping",
    description:
      "DampingVar üzerinden işletmeni ilk kez ziyaret eden müşterilere özel %10 indirim. Yeni müşteri kazanımını destekler.",
    terms:
      "Kampanya yalnızca DampingVar üzerinden ilk kez işlem yapan müşteriler için geçerlidir. İşletme onayı ve QR doğrulaması gerekir. Diğer indirimlerle birleştirilemez.",
    eligibleItems: "Yeni müşteriler",
  },
  {
    key: "sadakat",
    label: "%12 İkinci ziyarete (sadakat)",
    hint: "Geri dönen müşteriye %12; müşteri sadakatini güçlendirir; 30 gün.",
    type: "PERCENT",
    discountPercent: 12,
    minBasket: 200,
    durationDays: 30,
    timeStart: "",
    timeEnd: "",
    title: "İkinci Ziyarete %12 Damping",
    description:
      "İşletmemizi ikinci kez ziyaret eden DampingVar müşterilerine %12 indirim. Sadakati ödüllendirir, tekrar ziyareti artırır.",
    terms:
      "Kampanya, DampingVar üzerinden daha önce işlem yapmış müşterilerin ikinci ziyaretinde geçerlidir. Minimum sepet 200 TL. QR doğrulaması gerekir; diğer kampanyalarla birleştirilemez.",
    eligibleItems: "Geri dönen müşteriler",
  },
  {
    key: "min-sepet",
    label: "%10 Min. 500 TL sepete",
    hint: "Ortalama sepeti yükseltmek için; market/sepet alışkanlıkları; 14 gün.",
    type: "PERCENT",
    discountPercent: 10,
    minBasket: 500,
    durationDays: 14,
    timeStart: "",
    timeEnd: "",
    title: "500 TL Sepette %10 Damping",
    description:
      "500 TL ve üzeri sepetlerde geçerli %10 DampingVar indirimi. Ortalama sepet tutarını yükseltmek için ideal.",
    terms:
      "Kampanya 500 TL ve üzeri sepetlerde geçerlidir. Sepetteki tüm uygun ürünler için uygulanır. İstisnalar sepette belirtilir. Diğer indirimlerle birleştirilemez; stoklarla sınırlıdır.",
    eligibleItems: "Uygun tüm ürünler",
  },
  {
    key: "urun-ozel",
    label: "%25 Seçili ürüne özel",
    hint: "Stok eritmek veya vitrine çıkmak istenen ürüne; 14 gün.",
    type: "PERCENT",
    discountPercent: 25,
    minBasket: 0,
    durationDays: 14,
    timeStart: "",
    timeEnd: "",
    title: "Seçili Ürüne %25 Damping",
    description:
      "İşletmenin seçtiği vitrin ürünlerinde %25 DampingVar indirimi. Stok eritme ve yeni ürün tanıtımı için uygundur.",
    terms:
      "Kampanya yalnızca işletmenin belirlediği seçili ürünlerde geçerlidir. Ürün listesi mağazada ve DampingVar'da belirtilir. Diğer indirimlerle birleştirilemez; stoklarla sınırlıdır.",
    eligibleItems: "Seçili vitrin ürünleri",
  },
  {
    key: "hizmet-paketi",
    label: "%15 Hizmet paketinde",
    hint: "Hizmet/yapı sektörleri için paket kampanyası; 21 gün.",
    type: "PERCENT",
    discountPercent: 15,
    minBasket: 0,
    durationDays: 21,
    timeStart: "",
    timeEnd: "",
    title: "Hizmet Paketinde %15 Damping",
    description:
      "DampingVar üzerinden randevu oluşturulan hizmet paketlerinde %15 indirim. Hizmet satışlarını paketlemek ve doluluku artırmak için uygundur.",
    terms:
      "Kampanya DampingVar üzerinden randevu oluşturulan hizmet paketlerinde geçerlidir. Randevu tarihi ve kapsamı işletme tarafından onaylanır. Diğer kampanyalarla birleştirilemez.",
    eligibleItems: "Hizmet paketleri",
  },
];

/** Şablonu form alanlarına uygular (yalnız form alanları; para birimi/QR korunur). */
export function applyCampaignTemplate(tpl: CampaignTemplate) {
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  const start = new Date();
  const end = new Date(Date.now() + tpl.durationDays * 86400000);
  return {
    title: tpl.title,
    description: tpl.description,
    terms: tpl.terms,
    type: tpl.type,
    discountPercent: tpl.discountPercent,
    discountAmountCents: 0,
    minBasketCents: tpl.minBasket,
    startsAt: iso(start),
    endsAt: iso(end),
    timeStart: tpl.timeStart,
    timeEnd: tpl.timeEnd,
    eligibleItems: tpl.eligibleItems,
    exclusions: "",
  };
}
