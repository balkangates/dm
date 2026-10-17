import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Card, SectionHead } from "@/components/ds";
import { Icon } from "@/components/icons";
import { ensureSeeded } from "@/lib/queries";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ sayfa: string }> };

type LegalDoc = { title: string; updated: string; intro: string; sections: { head: string; body: string[] }[] };

const DOCS: Record<string, LegalDoc> = {
  kosullar: {
    title: "Kullanım Koşulları",
    updated: "Son güncelleme: Ocak 2026",
    intro:
      "DampingVar; işletmelerin kampanyalarını yönettiği, müşteri trafiğini yönlendirdiği, QR ve yönlendirme etkinliklerini ölçtüğü ve AI destekli pazarlama hizmetleri sunduğu bir dijital müşteri kazanım platformudur.",
    sections: [
      {
        head: "1. Hizmetin kapsamı",
        body: [
          "DampingVar bir reklam ajansı ve müşteri yönlendirme platformu gibi çalışır. İşletme profilleri, kampanya yayını, QR/kampanya bağlantısı takibi, yönlendirme kayıtları, reklam ve görünürlük hizmetleri ile AI pazarlama hizmetleri sunar.",
          "DampingVar, müşteri ile işletme arasındaki ticari ilişkinin tarafı değildir. Ürün ve hizmetin sağlanması, bedelinin tahsil edilmesi ve indirimlerin uygulanması ilgili işletmenin sorumluluğundadır.",
        ],
      },
      {
        head: "2. Ödeme ve finansal sınırlar",
        body: [
          "DampingVar müşteri ödemesini tahsil etmez, işletmeye aktarmaz ve işletme adına tahsilat yapmaz.",
          "Cashback, nakit iade, müşteri cüzdanı, nakit bakiye, işletmeler arası ortak puan veya ortak bakiye havuzu ve işletmeler arası mahsuplaşma sunulmaz.",
          "Müşteri, ürünü veya hizmeti doğrudan işletmeden alır ve ödemesini doğrudan işletmeye yapar.",
        ],
      },
      {
        head: "3. Kampanyalar ve indirimler",
        body: [
          "Kampanya koşulları (indirim türü ve oranı, minimum sepet, geçerlilik tarihleri, uygun ürün/hizmetler, istisnalar ve kullanım limitleri) işletme tarafından belirlenir.",
          "QR kodun okutulması tek başına alışverişin gerçekleştiğini kanıtlamaz. Doğrulanmış kampanya kullanımı, işletmenin yetkili personelinin onayıyla kaydedilir.",
          "İndirim, koşullar sağlandığında işletme tarafından uygulanır; kullanılmayan indirim birikmez, sonraki alışverişe devretmez ve nakde çevrilemez.",
        ],
      },
      {
        head: "4. Damping Bonus",
        body: [
          "Damping Bonus, davet edilen arkadaşın doğrulanmış alışverişinden sonra oluşan ve alışverişin yapıldığı mağazaya bağlı bir indirim hakkıdır.",
          "Bonus nakit değildir; çekilemez, başka bir kişiye devredilemez, başka bir mağazada kullanılamaz ve genel amaçlı bir para bakiyesi olarak değerlendirilemez.",
          "Kazanım koşulları, tutarı, minimum alışveriş şartı, geçerlilik süresi ve kullanım limitleri platform yöneticisi tarafından yapılandırılır.",
        ],
      },
      {
        head: "5. İşletme hizmet bedelleri",
        body: [
          "DampingVar'ın geliri; abonelik, kampanya yönetimi, görünürlük, reklam, QR kampanya yönetimi, yönlendirme hizmeti ve AI pazarlama hizmetlerinden doğar.",
          "Ücret ve komisyonlar işletme sözleşmesine göre hesaplanır ve ayrıca faturalandırılır. Hizmet bedelleri ile müşteriye uygulanan indirimler birbirinden ayrı tutulur.",
          "Fatura kesimi, muhasebe ve e-fatura süreçleri ilgili ülke mevzuatına göre ayrıca doğrulanır.",
        ],
      },
      {
        head: "6. Kullanıcı yükümlülükleri",
        body: [
          "Kullanıcılar doğru bilgi sağlamak, hesap güvenliğini korumak ve platformu kötüye kullanmamakla yükümlüdür.",
          "Sahte yönlendirme, kendi kendini davet etme, otomatik tıklama ve yanıltıcı kampanya içeriği incelemeye alınır ve gerekli durumda kısıtlanır.",
        ],
      },
    ],
  },
  gizlilik: {
    title: "Gizlilik Politikası",
    updated: "Son güncelleme: Ocak 2026",
    intro:
      "Bu politika, DampingVar'ı kullandığınızda hangi verilerin hangi amaçla işlendiğini açıklar. Yalnızca hizmetin sunulması için gerekli veriler tutulur.",
    sections: [
      {
        head: "1. İşlediğimiz veriler",
        body: [
          "Hesap bilgileri: ad, e-posta, varsa telefon, ilçe/şehir, dil, ülke ve görüntüleme para birimi tercihi.",
          "Etkinlik verileri: kampanya görüntüleme, tıklama, işletme sayfası ziyareti, QR okutma, doğrulamaya gönderme, doğrulanmış kullanım ve yönlendirme kayıtları.",
          "İşletme verileri: profil bilgileri, çalışma saatleri, kampanyalar, medya, hizmet bedeli kuralları ve fatura kayıtları.",
        ],
      },
      {
        head: "2. Ödeme verisi işlenmez",
        body: [
          "DampingVar ödeme kartı, banka hesabı veya müşteri finansal bakiyesi saklamaz; çünkü müşteri ödemesi doğrudan işletmeye yapılır.",
          "İşletmenin bildirdiği sepet veya indirim tutarları yalnızca kampanya performansının ölçülmesi amacıyla tutulur ve platform geliri olarak yorumlanmaz.",
        ],
      },
      {
        head: "3. Verilerin kullanımı",
        body: [
          "Kampanya keşfinin kişiselleştirilmesi, etkinlik ölçümü, işletme raporları, yönlendirme ve Damping Bonus haklarının hesaplanması ile hizmet güvenliğinin sağlanması.",
          "İşletmeler yalnızca kendi işletmelerine ait verileri görür. Yönetici işlemleri rol bazlı yetkilendirme ve denetim kaydı ile izlenir.",
        ],
      },
      {
        head: "4. Saklama ve güvenlik",
        body: [
          "Parolalar geri döndürülemez biçimde hash'lenir; oturumlar imzalı httpOnly çerez ile taşınır.",
          "Hizmet sağlayıcı anahtarları yalnızca sunucu tarafında tutulur ve tarayıcıya gönderilmez.",
          "Denetim kayıtları, kritik işlemlerin izlenebilirliği için saklanır; loglarda gereksiz kişisel veri ve gizli anahtar tutulmaz.",
        ],
      },
      {
        head: "5. Haklarınız",
        body: [
          "Hesap bilgilerinizi panel üzerinden güncelleyebilir, kayıt ve takip listelerinizi silebilirsiniz.",
          "Verilerinizin silinmesi veya aktarılmasına ilişkin talepler için destek kanalı üzerinden başvurabilirsiniz; yasal saklama yükümlülüğü olan kayıtlar korunur.",
        ],
      },
    ],
  },
  cikolata: {
    title: "Çerez Politikası",
    updated: "Son güncelleme: Ocak 2026",
    intro: "DampingVar, hizmetin çalışması için zorunlu olan az sayıda çerez kullanır. Reklam amaçlı üçüncü taraf takip çerezi kullanılmaz.",
    sections: [
      {
        head: "1. Zorunlu çerezler",
        body: [
          "dv_session: oturumunuzun sunucuda doğrulanması için imzalı, httpOnly çerez. 30 gün geçerlidir.",
          "dv_lang, dv_currency, dv_country: dil, para birimi görüntüleme ve ülke tercihleriniz. 1 yıl saklanır.",
        ],
      },
      {
        head: "2. Tercihler ve ayrım",
        body: [
          "Dil, ülke, konum ve para birimi ayrı ayarlardır. Para birimi tercihi fiyatları dönüştürmez; kampanyalar işletmenin tanımladığı para biriminde gösterilir.",
          "Giriş yaptığınızda tercihleriniz hesabınızda da saklanır, böylece cihazlar arasında tutarlı kalır.",
        ],
      },
      {
        head: "3. Kullanılmayan teknolojiler",
        body: [
          "Bu sürümde üçüncü taraf reklam çerezi, piksel tabanlı kullanıcı takibi ve ödeme çerezi kullanılmamaktadır.",
          "Kampanya etkinlik ölçümü çerezlerle değil, sunucu tarafında kaydedilen olaylarla yapılır.",
        ],
      },
    ],
  },
};

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { sayfa } = await params;
  const doc = DOCS[sayfa];
  return { title: doc ? `${doc.title} · DampingVar` : "Sayfa bulunamadı" };
}

export default async function LegalPage({ params }: P) {
  await ensureSeeded();
  const { sayfa } = await params;
  const doc = DOCS[sayfa];
  if (!doc) notFound();

  const [user, locale] = await Promise.all([currentUser(), getLocale()]);
  const session: SessionLite = user
    ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }
    : null;

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[860px] px-4 py-14 sm:px-6">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-[0.8rem] text-muted">
          <Link href="/" className="hover:text-accent">Ana sayfa</Link>
          <Icon.chevronRight size={13} />
          <span className="text-ink">{doc.title}</span>
        </nav>

        <SectionHead eyebrow="Yasal" title={doc.title} desc={doc.updated} />

        <Card className="mb-6 bg-canvas">
          <p className="text-[0.95rem] leading-relaxed text-ink-700">{doc.intro}</p>
        </Card>

        <div className="space-y-5">
          {doc.sections.map((s) => (
            <Card key={s.head}>
              <h2 className="font-display text-[1.08rem] font-bold text-ink">{s.head}</h2>
              <div className="mt-3 space-y-2.5">
                {s.body.map((p) => (
                  <p key={p} className="text-[0.92rem] leading-relaxed text-muted">{p}</p>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-line pt-6 text-[0.86rem]">
          {Object.entries(DOCS)
            .filter(([k]) => k !== sayfa)
            .map(([k, v]) => (
              <Link key={k} href={`/yasal/${k}`} className="link-sweep font-medium text-accent">{v.title}</Link>
            ))}
        </div>
      </div>
    </PublicShell>
  );
}
