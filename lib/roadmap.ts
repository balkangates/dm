/** İşletme kuracaklar için yol haritası (içerik). Mevzuat adımları genel çerçevedir; güncel şartlar ilgili kurumlardan doğrulanmalıdır. */
export type RoadmapStage = {
  id: string;
  title: string;
  goal: string;
  tasks: string[];
  tool?: { label: string; href: string };
};

export const ROADMAP: RoadmapStage[] = [
  { id: "fikir", title: "1 · Fikir ve pazar doğrulama", goal: "Kime, neyi, neden seninle satın alacaklarını netleştir.",
    tasks: ["Hedef müşteri: kim, nerede, ne kadar harcıyor?", "Ürün/menü çekirdeği: en çok 5-7 ürünle başla.", "Rakiplerden farkın tek cümle: fiyat mı, kalite mi, hız mı, konum mu?", "Çevrendeki 10 kişiyle görüş: bu fiyata alır mıydı?"] },
  { id: "konum", title: "2 · Bölge ve konum analizi", goal: "Rekabetin ve talebin nerede olduğunu gör.",
    tasks: ["Aşağıdaki bölge özetiyle aynı kategorideki işletme yoğunluğuna bak.", "Google Haritalar’da rakiplerin “şu an ne kadar yoğun” grafiğini farklı saatlerde incele.", "Kira, yaya/araç trafiği, otopark ve teslimat erişimini karşılaştır.", "Konumunu rakiplerden 1 km içinde mi, dışında mı seçeceğine karar ver."],
    tool: { label: "Bölge özetini gör", href: "#bolge" } },
  { id: "yasal", title: "3 · Yasal kuruluş", goal: "Faaliyete başlamak için gereken kayıt ve izinleri tamamla.",
    tasks: ["Şirket türü: şahıs / limited / anonim; mali müşavirle görüş.", "Vergi mükellefiyeti ve ticaret/esnaf sicil kaydı.", "İşyeri açma ve çalışma ruhsatı (belediye); gıda işletmeleri için Tarım ve Orman İl/İlçe Müdürlüğü kayıt/onayı.", "SGK işyeri tescili, varsa personel bildirimi.", "Güncel şartları belediye, ticaret odası ve mali müşavirden doğrula; mevzuat değişebilir."] },
  { id: "maliyet", title: "4 · Maliyet, fiyat ve marj", goal: "Zarar etmeden satabileceğin en düşük fiyatı ve başabaş ciroyu bil.",
    tasks: ["Ürün başına maliyet (hammadde, ambalaj, fire).", "Sabit giderler: kira, personel, enerji, muhasebe, yazılım.", "Hedef kâr marjı belirle; indirim üst sınırını marjına göre koy.", "Aşağıdaki başabaş hesaplayıcıyla aylık gereken sipariş sayısını bul."],
    tool: { label: "Başabaş hesapla", href: "#basabas" } },
  { id: "fiyat", title: "5 · Menü ve fiyat konumu", goal: "Rakiplere göre doğru fiyat bandını seç.",
    tasks: ["Aynı ürünler için rakiplerin online (platform) fiyatlarını not et.", "Fiyatı rakibin ±%5 bandında tut ya da farkını (porsiyon, kalite) açıkça anlat.", "Platform fiyatları genelde komisyon payı içerir; kendi kanalında (gel-al/QR) daha düşük fiyat ya da indirim verebilirsin."] },
  { id: "kanal", title: "6 · Satış kanalı stratejisi", goal: "Komisyon yükünü ve müşteri sahipliğini dengele.",
    tasks: ["Yalnızca platformda satmak: hızlı müşteri, yüksek komisyon, müşteri ilişkisi platformda.", "Kendi kanalın (DampingVar profili, QR, gel-al/rezerve): komisyonsuz, kampanyayı sen belirlersin.", "İlk aylarda ikisini birlikte yürüt; kendi kanalına yönlendiren QR ve masa kartları kullan."] },
  { id: "acilis", title: "7 · Açılış kampanyası", goal: "İlk 30 günde ilk müşteri tabanını kur.",
    tasks: ["İlk sipariş indirimi (marjına uygun, müşteri başına bir kez).", "Boş saatlere özel saat bazlı kampanya.", "Sepet eşikli kampanya: ortalama sepeti büyüt.", "Açılış duyurusunu site içi reklam olarak yayınla (abonelik pakete dahildir)."] },
  { id: "kurulum", title: "8 · DampingVar’da kurulum", goal: "Profilini ve siparişe hazır menünü yayına al.",
    tasks: ["İşletme profili: ad, kategori, adres (konum otomatik bulunur), çalışma saatleri.", "Menü: ürünler, fiyatlar, görseller.", "Teslimat: paket servis açıksa teslimat bölge sınırını (km) gir.", "İlk kampanyanı yayınla, QR’ı kasaya/vitrine as.", "Büyüme profilini doldur: ciro, marj, rakipler, platformlar."],
    tool: { label: "İşletme olarak kayıt ol", href: "/kayit?tip=isletme" } },
  { id: "olcum", title: "9 · Ölçüm ve büyüme", goal: "Haftalık ölçüp sürekli iyileştir.",
    tasks: ["Haftalık: sipariş sayısı, ortalama sepet, QR kullanımı, kampanya dönüşümü.", "Büyüme profilindeki rekabet dayanma gücü skorunu ayda bir yeniden hesapla.", "Skoru düşüren etkeni (fiyat, indirim payı, platform bağımlılığı) hedefle ve 30 günlük planla iyileştir."] },
];
