import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Notice, PaperHead, Stamp } from "@/components/ds";
import { Icon } from "@/components/icons";
import { VideoLibrary } from "@/components/VideoLibrary";
import { ensureSeeded, listVideos } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Video Anlatımlar",
  description:
    "DampingVar'ın nasıl çalıştığını anlatan kısa storyboard videolar: online fırsatlar, affiliate bağlantıları, yerel indirimler, QR takibi, davet ve Damping Bonus.",
};

export default async function VideosPage() {
  await ensureSeeded();
  const [user, locale, videos] = await Promise.all([currentUser(), getLocale(), listVideos()]);
  const session: SessionLite = user
    ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }
    : null;

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <PaperHead
          eyebrow="Kısa video anlatımlar"
          title="Uzun talimat okumadan öğren."
          note="Her anlatım; poster, oynatma kontrolü, süre, altyazı (TR/EN/KA — çevirisi olanlarda), oynatma durumu ve yazılı adım adım alternatif içerir. Ses otomatik oynatılmaz."
          action={<Stamp tone="warning">Storyboard · demo</Stamp>}
        />

        <Notice tone="info" icon={<Icon.video size={16} />} className="mb-6">
          Gerçek video üretimi veya barındırma servisi <strong>bağlı değildir</strong>. Bu nedenle oynatıcı, sahne
          sahne ilerleyen animasyonlu storyboard ve altyazı gösterir; “video hazır” izlenimi vermez. AI video üretimi
          işletme panelinde ayrı bir iş akışı olarak, durumları açık biçimde sunulur.
        </Notice>

        <VideoLibrary videos={videos} lang={locale.lang} />
      </div>
    </PublicShell>
  );
}
