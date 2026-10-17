import { Suspense } from "react";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { PaperHead, Stamp, ToastProvider } from "@/components/ds";
import { Icon } from "@/components/icons";
import OfferDiscovery, { OfferSkeleton } from "@/components/offers";
import { ensureSeeded, listOfferCategories, listOffers, trackEvent } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Online Fırsatlar",
  description:
    "Marka ve mağazaların online fırsatları. Affiliate ifşası ile birlikte gösterilir; alışveriş ve ödeme doğrudan satıcının sitesinde tamamlanır.",
};

export default async function OnlineOffersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureSeeded();
  const sp = await searchParams;
  const [user, locale, offers, categories] = await Promise.all([
    currentUser(), getLocale(), listOffers({ limit: 60 }), listOfferCategories(),
  ]);
  const q = typeof sp.q === "string" ? sp.q : "";
  const cat = typeof sp.kategori === "string" ? sp.kategori : undefined;
  await trackEvent("affiliate_impression", { userId: user?.id ?? null, meta: { q, cat, count: offers.length } });

  const session: SessionLite = user
    ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode }
    : null;

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <PaperHead
          eyebrow="Online fırsatlar · affiliate"
          title="Marka ve mağazaların online teklifleri"
          note="Bu alan yerel işletme kampanyalarından ayrıdır. Teklifler izlenen bağlantıyla satıcının kendi sitesine yönlendirir; satın alma DampingVar içinde tamamlanmaz."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Stamp>Örnek içerik</Stamp>
              <span className="inline-flex items-center gap-1.5 border-2 border-line bg-surface px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted">
                <Icon.external size={12} /> Satıcıya yönlendirir
              </span>
            </div>
          }
        />

        <ToastProvider>
          <Suspense fallback={<OfferSkeleton />}>
            <OfferDiscovery
              offers={offers}
              categories={categories}
              lang={locale.lang}
              currency={locale.currency}
              initialQuery={q}
              userId={user?.id ?? null}
            />
          </Suspense>
        </ToastProvider>
      </div>
    </PublicShell>
  );
}
