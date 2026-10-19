import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { getLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Notice } from "@/components/ds";
import { Icon } from "@/components/icons";
import { BusinessSignupForm } from "@/components/BusinessSignup";

export const dynamic = "force-dynamic";

export const metadata = { title: "İşletme Aç" };

/**
 * FAZ 10 (revize) — İşletme açma TALEBİ sayfası (onay akışlı).
 * Erişim: girişli kullanıcılar (middleware: /hesabim* → customer|business).
 * - Zaten bağlı işletmesi olan → /panel
 * - ADMIN → /admin
 * Form gönderimi dv_business_request ile bekleyen talep açar; admin
 * "Onayla" dediğinde dv_admin_approve_business işletme + sahip personel
 * kaydını açar, rol business olur, kullanıcının paneli açılır.
 */
export default async function OpenBusinessPage() {
  const user = await getSessionUser();
  if (!user) redirect("/giris?next=/hesabim/isletme-ac");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.businessId) redirect("/panel");

  // Bekleyen işletme talebi (varsa form üstünde durum bilgisi gösterilir)
  const client = await createClient();
  const { data: reqRow } = await client
    .from("business_requests")
    .select("payload, created_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  const payload = (reqRow?.payload ?? null) as Record<string, unknown> | null;
  const pending = reqRow && payload
    ? {
        name: String(payload.name ?? ""),
        category: String(payload.category ?? ""),
        district: String(payload.district ?? ""),
      }
    : null;

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
          Gönderdiğin talep yönetici onayına düşer. Onaylandığında hesabın &quot;İşletme&quot; rolüne
          geçer, işletme kaydın açılır ve panelin otomatik olarak açılır.
        </Notice>
        <BusinessSignupForm pending={pending} />
      </div>
    </PublicShell>
  );
}
