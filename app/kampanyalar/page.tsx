import { Suspense } from "react";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { ToastProvider, SectionHead } from "@/components/ds";
import Discovery, { DiscoverySkeleton } from "@/components/discovery";
import { ensureSeeded, getCustomerData, listCampaignCards, listCategories, listDistricts, trackEvent } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Kampanyalar",
  description: "Yakınındaki kampanyaları keşfet: kategori, konum, indirim oranı, minimum sepet ve geçerlilik tarihine göre filtrele.",
};


export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureSeeded();
  const sp = await searchParams;
  const [user, locale, campaigns, districts, categories] = await Promise.all([
    currentUser(), getLocale(), listCampaignCards({ limit: 80 }), listDistricts(), listCategories(),
  ]);
  const q = typeof sp.q === "string" ? sp.q : "";
  const konum = typeof sp.konum === "string" ? sp.konum : "";
  const kategori = typeof sp.kategori === "string" ? sp.kategori : "";
  await trackEvent("filter_used", { meta: { q, konum, kategori, userId: user?.id ?? null } });
  const saved = user?.role === "CUSTOMER" ? (await getCustomerData(user.id)).savedIds : [];

  const session: SessionLite = user
    ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }
    : null;

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <SectionHead
          eyebrow="Kampanya keşfi"
          title="Yakınındaki kampanyalar"
          desc="İndirim oranı, minimum sepet, geçerlilik tarihi ve mağaza konumuna göre filtrele. Sponsorlu yerleşimler etiketlidir."
        />
        <ToastProvider>
          <Suspense fallback={<DiscoverySkeleton />}>
            <Discovery
              campaigns={campaigns}
              districts={districts}
              categories={categories}
              lang={locale.lang}
              currency={locale.currency}
              initialQuery={q}
              initialDistrict={konum}
              initialCategory={kategori}
              savedIds={saved}
              userId={user?.id ?? null}
            />
          </Suspense>
        </ToastProvider>
      </div>
    </PublicShell>
  );
}
