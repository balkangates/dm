import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell } from "@/components/Shell";
import { AuthCard } from "@/components/AuthCard";
import { Badge, Card, Icon } from "@/components/ds";
import { ensureSeeded } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kayıt ol" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensureSeeded();
  const user = await currentUser();
  if (user) redirect("/hesabim");
  const sp = await searchParams;
  const locale = await getLocale();
  const ref = typeof sp.ref === "string" ? sp.ref.toUpperCase() : undefined;
  const tip = typeof sp.tip === "string" ? sp.tip : "musteri";

  return (
    <PublicShell user={null} lang={locale.lang} currency={locale.currency} country={locale.country} footer={false}>
      <div className="mx-auto grid max-w-[1080px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_460px] lg:items-center">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">
            {tip === "isletme" ? "İşletme kaydı" : "Müşteri kaydı"}
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4.4vw,3.1rem)] font-extrabold leading-[1.03] tracking-[-0.035em]">
            {tip === "isletme" ? "İşletmeni DampingVar'a ekle." : "DampingVar'a katıl."}
          </h1>
          <p className="mt-5 max-w-[54ch] text-[1rem] leading-relaxed text-muted">
            {tip === "isletme"
              ? "Ücretsiz işletme profili oluştur, kampanyanı yayınla, QR ile mağaza trafiğini ölç. Görünürlük ve AI hizmetleri için paket seç; DampingVar hizmet bedelini ayrıca faturalandırır."
              : "Kampanyaları kaydet, işletmeleri takip et, arkadaşını davet et. Ödeme bilgisi istemiyoruz; alışveriş doğrudan işletme ile senin aranda."}
          </p>

          {ref ? (
            <Card className="mt-6 border-accent/30 bg-accent-soft/40">
              <p className="flex items-center gap-2 text-[0.88rem] font-semibold text-accent-700"><Icon.users size={16} /> Davet kodu uygulandı</p>
              <p className="tabular mt-1.5 text-[0.95rem] font-bold">{ref}</p>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted">
                Kayıttan sonra yaptığın ilk alışveriş işletme tarafından doğrulanırsa, davet eden kişi o mağazaya bağlı Damping Bonus kazanabilir.
              </p>
            </Card>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {(tip === "isletme"
              ? [["Ücretsiz profil", "İşletme sayfası, kampanya ve QR bağlantısı"], ["Ölçülebilir trafik", "Gösterim, tıklama, QR okutma, doğrulanmış kullanım"], ["AI pazarlama", "28 günlük program, içerik ve reklam metinleri"], ["Faturalı hizmet", "Paket ve hizmet bedelleri sözleşmeye göre"]]
              : [["Yakınındaki fırsatlar", "Konum ve kategoriye göre kampanya keşfi"], ["Kaydet & takip et", "Süre dolmadan hatırlatma"], ["Davet et, kazan", "Mağazaya bağlı Damping Bonus"], ["Nakit yok", "Cüzdan, cashback ve ödeme bilgisi istenmez"]]
            ).map(([h, d]) => (
              <div key={h} className="rounded-[4px] border border-line bg-surface p-4">
                <p className="font-display text-[0.95rem] font-bold">{h}</p>
                <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Badge tone="neutral">TR · EN · KA</Badge>
            <Badge tone="neutral">TRY · USD · GEL · EUR</Badge>
            <Link href="/giris" className="text-[0.88rem] font-semibold text-accent hover:underline">Zaten hesabın var mı? Giriş yap</Link>
          </div>
        </div>

        <AuthCard mode="register" lang={locale.lang} initialRef={ref} />
      </div>
    </PublicShell>
  );
}
