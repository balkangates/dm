import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { AuthCard } from "@/components/AuthCard";
import { ensureSeeded } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giriş yap" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensureSeeded();
  const user = await currentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : user.role === "BUSINESS" ? "/panel" : "/hesabim");
  const sp = await searchParams;
  const locale = await getLocale();
  const session: SessionLite = null;
  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country} footer={false}>
      <div className="mx-auto grid max-w-[1080px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_460px] lg:items-center">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">DampingVar hesabı</p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4.4vw,3.1rem)] font-extrabold leading-[1.03] tracking-[-0.035em]">
            Alışverişten önce<br />kampanyalarına bak.
          </h1>
          <p className="mt-5 max-w-[52ch] text-[1rem] leading-relaxed text-muted">
            Kampanyaları kaydet, işletmeleri takip et, arkadaşını davet et ve mağazaya bağlı Damping Bonus haklarını gör.
            DampingVar ödeme bilgisi istemez ve cüzdan oluşturmaz.
          </p>
          <ul className="mt-6 space-y-2 text-[0.9rem] text-ink-700">
            {["Kayıtlı kampanyalar ve takip listesi", "Davet bağlantısı ve yönlendirme geçmişi", "Mağazaya bağlı Damping Bonus hakları", "QR ve kampanya etkinlik geçmişi"].map((x) => (
              <li key={x} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{x}</li>
            ))}
          </ul>
          <p className="mt-6 text-[0.88rem] text-muted">
            Hesabın yok mu? <Link href="/kayit" className="font-semibold text-accent hover:underline">Kayıt ol</Link>
          </p>
        </div>
        <AuthCard mode="login" next={typeof sp.next === "string" ? sp.next : undefined} lang={locale.lang} />
      </div>
    </PublicShell>
  );
}
