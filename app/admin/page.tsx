import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionUser } from "@/lib/authz";
import { currentUser } from "@/lib/session";
import { ensureSeeded, getAdminData, getAffiliateData } from "@/lib/queries";
import { getLocale } from "@/lib/locale";
import { AdminDash } from "@/components/dashpages";

export const dynamic = "force-dynamic";

export const metadata = { title: "Yönetim Paneli" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* --------------------- SUPABASE MODU (FAZ 5) ------------------------ */
  if (isSupabaseConfigured()) {
    const user = await getSessionUser();
    if (!user) redirect("/giris?next=/admin");
    if (user.role !== "ADMIN") redirect("/hesabim");

    const sp = await searchParams;
    const locale = await getLocale();
    const [data, affiliate] = await Promise.all([getAdminData(), getAffiliateData()]);

    return (
      <AdminDash
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          businessId: user.businessId,
          referralCode: user.referralCode,
        }}
        data={data}
        affiliate={affiliate}
        locale={locale}
        initial={typeof sp.s === "string" ? sp.s : "overview"}
      />
    );
  }

  await ensureSeeded();
  const user = await currentUser();
  if (!user) redirect("/giris?next=/admin");
  if (user.role !== "ADMIN") redirect("/hesabim");

  const sp = await searchParams;
  const locale = await getLocale();
  const [data, affiliate] = await Promise.all([getAdminData(), getAffiliateData()]);

  return (
    <AdminDash
      user={{ id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }}
      data={data}
      affiliate={affiliate}
      locale={locale}
      initial={typeof sp.s === "string" ? sp.s : "overview"}
    />
  );
}
