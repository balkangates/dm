import Link from "next/link";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Badge, Button, Card, Notice, QrPanel, SectionHead } from "@/components/ds";
import { Icon } from "@/components/icons";
import { QrScanner } from "@/components/QrScanner";
import { ensureSeeded, listCampaignCards } from "@/lib/queries";
import { money, type Currency } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "QR Deneyimi", description: "Mağazada kampanya QR'ını okut, koşulları gör, kullanımı işletme doğrulasın." };

export default async function QrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensureSeeded();
  const sp = await searchParams;
  const [user, locale, campaigns] = await Promise.all([currentUser(), getLocale(), listCampaignCards({ limit: 12 })]);
  const session: SessionLite = user ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode } : null;
  const prefill = typeof sp.kod === "string" ? sp.kod : "";
  const qrCampaigns = campaigns.filter((c) => c.qrEnabled);

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <SectionHead eyebrow="Mağaza içi QR" title="QR kampanya akışı"
          desc="Mobil öncelikli akış: kampanyayı bul, mağazaya git, QR'ı okut, koşulları gör, alışverişi işletmeyle tamamla." />

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <QrScanner prefill={prefill} userId={user?.id ?? null} />

            <div className="mt-6">
              <Notice tone="warning" icon={<Icon.alert size={16} />} title="QR okutmak satış demek değildir">
                Okutma kaydı <strong className="tabular">QR_SCANNED</strong> olarak tutulur. Müşteri kullanımı
                doğrulamaya gönderebilir; <strong className="tabular">VERIFIED</strong> durumu yalnızca işletmenin yetkili
                personeli onayladığında oluşur. İndirim, koşullar sağlandığında işletme tarafından kasada uygulanır.
              </Notice>
            </div>

            <Card className="mt-6">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Olayların anlamı</p>
              <ul className="mt-3 divide-y divide-line-soft">
                {[
                  ["Kampanya görüntülendi", "Listeleme veya detay sayfası açıldı"],
                  ["QR okutuldu", "Mağazada kod okutuldu — satış kanıtı değil"],
                  ["Kullanım gönderildi", "Müşteri doğrulama talebi oluşturdu"],
                  ["Kullanım doğrulandı", "İşletme personeli onayladı"],
                  ["İndirim uygulandı", "İşletmenin bildirdiği tutar (opsiyonel)"],
                ].map(([h, d]) => (
                  <li key={h} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <span className="text-[0.88rem] font-medium text-ink">{h}</span>
                    <span className="text-[0.82rem] text-muted">{d}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div>
            <Card>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">QR kampanyaları</p>
              <div className="mt-4 space-y-3">
                {qrCampaigns.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-start gap-4 rounded-[4px] border border-line bg-canvas p-3">
                    <QrPanel value={`QR-${c.code}`} size={78} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/kampanya/${c.slug ?? c.code}`} className="font-display text-[0.95rem] font-bold hover:text-accent">{c.title}</Link>
                      <p className="mt-0.5 text-[0.8rem] text-muted">{c.businessName} · {c.district}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone="accent">{c.discountPercent ? `%${c.discountPercent}` : money(c.discountAmountCents, c.currency as Currency, locale.lang)}</Badge>
                        {c.minBasketCents ? <Badge tone="neutral">min. {money(c.minBasketCents, c.currency as Currency, locale.lang)}</Badge> : null}
                        <span className="tabular text-[0.72rem] text-muted-2">QR-{c.code}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button href="/kampanyalar" variant="secondary" className="mt-5 w-full" iconRight={<Icon.arrowRight size={15} />}>
                Tüm QR kampanyaları
              </Button>
            </Card>

            <Card className="mt-5">
              <p className="font-display text-[1rem] font-bold">İşletme tarafı</p>
              <p className="mt-2 text-[0.86rem] leading-relaxed text-muted">
                İşletme panelinde QR&apos;ı oluştur veya sergile, okutmaları izle, uygun kullanımı doğrula ve kampanya
                performansını ölç. Personel rolü QR okutabilir; doğrulama yetkisi yönetici ve işletme sahibindedir.
              </p>
              <Button href="/panel?s=qr" size="sm" className="mt-4" icon={<Icon.qr size={14} />}>QR panelini aç</Button>
            </Card>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
