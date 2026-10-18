import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Card, Notice, PaperHead, Stamp, Tabs, ToastProvider } from "@/components/ds";
import { Icon } from "@/components/icons";
import FlowCenter, { type FlowEvent } from "@/components/flow";
import { VideoLibrary } from "@/components/VideoLibrary";
import { ensureSeeded, getFlowStream, listVideos } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "DampingVar İşlem Akışı",
  description:
    "Affiliate yönlendirme, yerel QR kampanya ve davet/bonus akışlarının ayrı ayrı izlendiği animasyonlu işlem merkezi.",
};

export default async function FlowPage() {
  await ensureSeeded();
  const [user, locale, events, videos] = await Promise.all([
    currentUser(), getLocale(), getFlowStream(60), listVideos(),
  ]);
  const session: SessionLite = user
    ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }
    : null;

  const howItWorks = videos.find((v) => v.topic === "HOW_DAMPINGVAR_WORKS") ?? videos[0];
  const lastUpdate = events.reduce<string | null>(
    (acc, e) => (e.at && (!acc || e.at > acc) ? e.at : acc),
    null
  );

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <PaperHead
          eyebrow="İşlem akışı merkezi"
          title="DampingVar İşlem Akışı"
          note="Üç ayrı akış: online fırsat yönlendirmesi, yerel QR kampanya kullanımı ve davet/Damping Bonus. Bu akışlar hiçbir zaman tek bir satın alma süreci gibi birleştirilmez."
          action={<Stamp tone="warning">Demo görünümü</Stamp>}
        />

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          {[
            { icon: <Icon.external size={18} />, title: "Online fırsat", body: "Fırsat görüntülendi → bağlantıya tıklandı → satıcıya yönlendirildi → ağ raporu → komisyon durumu.", tone: "info" as const },
            { icon: <Icon.qr size={18} />, title: "Yerel QR kampanya", body: "Kampanya görüntülendi → QR okutuldu → koşullar incelendi → işletme doğruladı → kullanım kaydı.", tone: "accent" as const },
            { icon: <Icon.users size={18} />, title: "Davet & bonus", body: "Davet paylaşıldı → arkadaş kayıt oldu → uygun alışveriş → doğrulama → mağazaya bağlı bonus.", tone: "positive" as const },
          ].map((c) => (
            <Card key={c.title}>
              <span className={`flex h-9 w-9 items-center justify-center border-2 ${
                c.tone === "info" ? "border-info bg-info-soft text-info" : c.tone === "accent" ? "border-accent bg-accent-soft text-accent" : "border-positive bg-positive-soft text-positive"
              }`}>{c.icon}</span>
              <p className="mt-3 font-display text-[1.02rem] font-bold">{c.title}</p>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted">{c.body}</p>
            </Card>
          ))}
        </div>

        <Notice tone="info" icon={<Icon.info size={16} />} className="mb-6">
          Durumlar yalnızca gerçek sistem olaylarıyla eşleştiğinde gösterilir. Gerçek zamanlı bir akışa bağlı
          olmadığımız için bu ekran <strong>demo görünümü</strong> olarak etiketlenmiştir; sahte “az önce satın aldı”
          bildirimi veya uydurma sayaç üretilmez.
        </Notice>

        <ToastProvider>
          <FlowCenter events={events as FlowEvent[]} lang={locale.lang} isDemo lastUpdate={lastUpdate} />
        </ToastProvider>

        <div className="mt-14">
          <PaperHead
            eyebrow="Video anlatım"
            title="Akışları 18 saniyede anlayın"
            note="Animasyonlu storyboard ve altyazı. Gerçek video üretimi/oynatımı bağlı değildir; her videonun yazılı adım adım alternatifi vardır."
          />
          {howItWorks ? (
            <VideoLibrary videos={[howItWorks, ...(videos.filter((v) => v.id !== howItWorks.id).slice(0, 2))]} lang={locale.lang} compact />
          ) : null}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <a href="/videolar" className="inline-flex items-center gap-2 border-2 border-ink bg-ink px-5 py-3 text-[0.82rem] font-bold uppercase tracking-[0.12em] text-surface hover:bg-ink-700">
            <Icon.play size={15} /> Tüm video anlatımları
          </a>
          <a href="/kampanyalar" className="inline-flex items-center gap-2 border-2 border-ink/25 bg-surface px-5 py-3 text-[0.82rem] font-bold uppercase tracking-[0.12em] text-ink hover:border-ink">
            Yerel kampanyalar
          </a>
        </div>
      </div>
    </PublicShell>
  );
}
