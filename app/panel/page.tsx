import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { getBusinessData, listBusinesses, listVideos } from "@/lib/queries";
import { getLocale } from "@/lib/locale";
import { BusinessDash } from "@/components/dashpages";

export const dynamic = "force-dynamic";

export const metadata = { title: "İşletme Paneli" };

/** İşletme paneli (FAZ 6 — Supabase). */
export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/giris?next=/panel");

  const sp = await searchParams;
  const locale = await getLocale();

  /**
   * Yetki: işletme paneli yalnızca işletme hesabına aittir.
   * - BUSINESS  → business_staff üzerinden çözülen kendi işletme kaydı
   *              (istemciden gelen değere güvenilmez)
   * - ADMIN     → denetim amacıyla ?biz= ile seçilen işletme
   * - CUSTOMER  → erişim yok, kendi hesabına yönlendirilir
   */
  let businessId: string | null = null;
  if (user.role === "BUSINESS") {
    businessId = user.businessId;
  } else if (user.role === "ADMIN") {
    const all = await listBusinesses();
    businessId =
      (typeof sp.biz === "string" ? (all.find((b) => b.slug === sp.biz)?.id ?? null) : null) ?? all[0]?.id ?? null;
  }
  if (!businessId) redirect(user.role === "ADMIN" ? "/admin" : "/hesabim");

  const range = [7, 14, 30].includes(Number(sp.gun)) ? Number(sp.gun) : 14;
  const [data, videos] = await Promise.all([getBusinessData(businessId, range), listVideos()]);
  if (!data) redirect("/giris");

  return (
    <BusinessDash
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
        referralCode: user.referralCode,
      }}
      data={data}
      locale={locale}
      videos={videos}
      range={range}
      initial={typeof sp.s === "string" ? sp.s : "overview"}
    />
  );
}
