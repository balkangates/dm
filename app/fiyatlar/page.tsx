import { getSessionUser } from "@/lib/authz";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Badge, Button, Card, Notice, Reveal, SectionHead } from "@/components/ds";
import { Icon } from "@/components/icons";
import { listPackagesPublic, listFeeRulesPublic } from "@/lib/queries";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "İşletme Paketleri", description: "DampingVar işletme paketleri: ücretsiz profil, görünürlük, QR kampanya yönetimi, AI pazarlama ve reklam hizmetleri." };

export default async function PricingPage() {
  const [user, locale, pkgs, rules] = await Promise.all([
    getSessionUser(), getLocale(), listPackagesPublic(), listFeeRulesPublic(),
  ]);
  const session: SessionLite = user ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode } : null;

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[1280px] px-4 py-14 sm:px-6">
        <SectionHead eyebrow="İşletmeler için" title="Paketler ve hizmet bedelleri"
          desc="Fiyatlar yapılandırılabilir ve yönetim panelinden güncellenir; koda gömülü değildir. DampingVar yalnızca işletmelere sunduğu hizmetleri faturalandırır." />

        <Notice tone="info" icon={<Icon.info size={16} />} className="mb-8">
          Müşteri ödemesi doğrudan işletmeye yapılır. DampingVar cashback, müşteri cüzdanı, ortak puan havuzu veya
          işletmeler arası mahsup sunmaz. Aşağıdaki tüm tutarlar <strong>işletmeye kesilen hizmet bedelleridir</strong>.
        </Notice>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {pkgs.map((p, i) => (
            <Reveal key={p.code} delay={i * 60}>
              <Card className={`h-full ${p.code === "BOOST" ? "border-accent ring-1 ring-accent/20" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-[1.1rem] font-bold">{p.name}</p>
                  {p.code === "BOOST" ? <Badge tone="accent">Popüler</Badge> : null}
                </div>
                <p className="tabular mt-1 text-[0.74rem] uppercase tracking-[0.12em] text-muted">{p.code}</p>
                <p className="tabular mt-4 text-[2rem] font-semibold leading-none text-ink">
                  {p.priceMonthlyCents === 0 ? "Ücretsiz" : money(p.priceMonthlyCents, locale.currency, locale.lang)}
                </p>
                <p className="mt-1 text-[0.78rem] text-muted">{p.priceMonthlyCents === 0 ? "süresiz" : "aylık · sözleşmeyle"}</p>
                <ul className="mt-5 space-y-2">
                  {(p.features ?? []).map((f) => (
                    <li key={f} className="flex gap-2 text-[0.86rem] leading-snug text-ink-700">
                      <Icon.check size={14} className="mt-0.5 shrink-0 text-positive" />{f}
                    </li>
                  ))}
                </ul>
                <p className="tabular mt-4 border-t border-line-soft pt-3 text-[0.78rem] text-muted">
                  AI içerik kotası: {p.aiQuotaMonthly}/ay
                </p>
                <Button href={p.priceMonthlyCents === 0 ? "/kayit?tip=isletme" : "/panel?s=plans"} className="mt-5 w-full" variant={p.code === "BOOST" ? "primary" : "secondary"}>
                  {p.priceMonthlyCents === 0 ? "Ücretsiz başla" : "Paketi seç"}
                </Button>
              </Card>
            </Reveal>
          ))}
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <SectionHead eyebrow="Hizmet türleri" title="Neler faturalandırılır?" />
            <div className="card overflow-hidden p-0">
              <table className="w-full text-[0.88rem]">
                <thead><tr className="border-b border-line bg-canvas text-left text-[0.7rem] uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-3">Hizmet türü</th><th className="px-4 py-3">Tür</th><th className="px-4 py-3 text-right">Tutar / oran</th><th className="px-4 py-3">Hesaplama</th>
                </tr></thead>
                <tbody>
                  {rules.slice(0, 10).map((r) => (
                    <tr key={r.id} className="border-b border-line-soft last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{r.serviceType}{r.packageCode ? <span className="ml-2 text-[0.74rem] text-muted">{r.packageCode}</span> : null}</td>
                      <td className="px-4 py-3 text-muted">{r.kind === "FIXED" ? "Sabit" : "Yüzde"}</td>
                      <td className="tabular px-4 py-3 text-right font-semibold">{r.kind === "FIXED" ? money(r.amountCents, locale.currency, locale.lang) : `%${(r.rate * 100).toFixed(1)}`}</td>
                      <td className="px-4 py-3 text-muted">{r.calculationBase}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[0.8rem] leading-relaxed text-muted">
              Kural değiştiğinde geçmiş faturalar geriye dönük değiştirilmez; her faturada uygulanan kural ve oran kayıt
              altında tutulur. Yönlendirme hizmeti bedeli yalnızca <strong>doğrulanmış kullanım</strong> üzerinden hesaplanır.
            </p>
          </div>

          <div className="space-y-5">
            <Card>
              <p className="font-display text-[1.05rem] font-bold">Faturalandırma nasıl işler?</p>
              <ol className="mt-3 space-y-2.5 text-[0.88rem] leading-relaxed text-muted">
                {["Sözleşme ve paket seçilir; hizmet bedeli kuralları tanımlanır.", "Dönem boyunca kullanılan hizmetler (abonelik, reklam, QR yönetimi, AI paketi, doğrulanmış yönlendirme) toplanır.", "Dönem sonunda fatura kaydı oluşturulur: ara toplam, vergi ve toplam.", "Fatura durumu (kesildi / gönderildi / ödendi / gecikmiş) panelden izlenir."].map((s, i) => (
                  <li key={s} className="flex gap-2.5"><span className="tabular shrink-0 font-semibold text-accent">{i + 1}</span>{s}</li>
                ))}
              </ol>
            </Card>
            <Notice tone="warning" icon={<Icon.alert size={16} />} title="Mevzuat">
              Fatura kesimi, muhasebe entegrasyonu ve e-fatura süreçleri ilgili ülke mevzuatına göre ayrıca
              doğrulanmalıdır. Bu sayfadaki kayıtlar hizmet bedeli takibidir; resmî e-fatura entegrasyonu iddiası içermez.
            </Notice>
            <Card>
              <p className="font-display text-[1.05rem] font-bold">İptal ve koşullar</p>
              <p className="mt-2 text-[0.86rem] leading-relaxed text-muted">
                Abonelik dönem sonunda iptal edilebilir. İptal edilmiş dönemde tahakkuk eden hizmet bedelleri faturalanmaya
                devam eder. Reklam harcaması yalnızca yönetici onayıyla yayına giren kampanyalar için tahakkuk eder.
              </p>
              <Button href="/kayit?tip=isletme" className="mt-4 w-full">İşletmeni ekle</Button>
            </Card>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
