import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { getCustomerData, listCampaignCards, listOffers } from "@/lib/queries";
import { getLocale } from "@/lib/locale";
import { CustomerDash } from "@/components/dashpages";

export const dynamic = "force-dynamic";

export const metadata = { title: "Hesabım" };

/** Hesap sayfası (FAZ 6 — Supabase). */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Kimlik auth.getUser() ile doğrulanır; rol profiles tablosundan RLS ile okunur.
  const user = await getSessionUser();
  if (!user) redirect("/giris?next=/hesabim");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "BUSINESS") redirect("/panel");

  const sp = await searchParams;
  const locale = await getLocale();
  const [data, campaigns, offers] = await Promise.all([
    getCustomerData(user.id),
    listCampaignCards({ limit: 12, district: user.district ?? undefined }),
    listOffers({ limit: 6 }),
  ]);

  return (
    <CustomerDash
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
        referralCode: user.referralCode,
      }}
      data={data}
      campaigns={campaigns}
      offers={offers}
      locale={locale}
      initial={typeof sp.s === "string" ? sp.s : "overview"}
    />
  );
}
