import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Icon, Notice } from "@/components/ds";
import { BusinessSignupForm } from "@/components/BusinessSignup";

export const dynamic = "force-dynamic";

export const metadata = { title: "İşletme Aç" };

/**
 * FAZ 10 — İşletme öz-kayıdı sayfası.
 * Erişim: girişli kullanıcılar (middleware: /hesabim* → customer|business).
 * - Zaten bağlı işletmesi olan → /panel
 * - ADMIN → /admin
 * Formu dolduran müşteri, dv_business_signup ile işletme sahibi olur
 * ve rolü 'business' olur (RPC içinde) → başarıda /panel'e geçilir.
 */
export default async function OpenBusinessPage() {
  const user = await getSessionUser();
  if (!user) redirect("/giris?next=/hesabim/isletme-ac");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.businessId) redirect("/panel");

  const locale = await getLocale();
  const session: SessionLite = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    businessId: user.businessId,
    referralCode: user.referralCode,
  };

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[760px] px-4 py-12">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">İşletme hesabı</p>
        <h1 className="mt-1 font-display text-[1.8rem] font-bold">İşletmeni Aç</h1>
        <p className="mt-2 max-w-[58ch] text-[0.95rem] leading-relaxed text-muted">
          Birkaç bilgiyle işletme kaydını oluştur; işletme paneli, kampanya yönetimi, QR takibi ve
          analitik araçlarına hemen eriş.
        </p>
        <Notice tone="info" className="mt-5" icon={<Icon.info size={16} />}>
          Kayıt anında hesabın &quot;İşletme&quot; rolüne geçer ve panelin otomatik açılır. Bilgileri
          daha sonra işletme panelinden güncelleyebilirsin.
        </Notice>
        <BusinessSignupForm />
      </div>
    </PublicShell>
  );
}
