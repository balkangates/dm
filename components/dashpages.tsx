"use client";

import { ToastProvider, useSectionParam } from "@/components/ds";
import { DashShell } from "@/components/Dash";
import CustomerDashboard, { CUSTOMER_NAV } from "@/components/customer";
import BusinessDashboard, { BUSINESS_NAV } from "@/components/business";
import AdminDashboard, { ADMIN_NAV } from "@/components/admin";
import type { SessionLite } from "@/components/Shell";
import type { CampaignCard } from "@/lib/queries";
import type { Currency, Lang } from "@/lib/money";

type Loc = { lang: Lang; currency: Currency; country: string };

export function CustomerDash({ user, data, campaigns, locale, initial, offers = [] }: {
  user: NonNullable<SessionLite>;
  data: Awaited<ReturnType<typeof import("@/lib/queries").getCustomerData>>;
  campaigns: CampaignCard[];
  locale: Loc;
  initial: string;
  offers?: import("@/lib/queries").OfferCard[];
}) {
  return (
    <ToastProvider>
      <Inner
        nav={CUSTOMER_NAV}
        initial={initial}
        locale={locale}
        user={user}
        variant="customer"
        render={(s) => <CustomerDashboard data={data} campaigns={campaigns} user={user} lang={locale.lang} currency={locale.currency} section={s} offers={offers} />}
        titles={{
          overview: ["Hesabım", "Kampanyaların, davetlerin ve mağazaya bağlı bonus hakların"],
          discover: ["Kampanyaları keşfet", "Konum ve kategoriye göre filtrele"],
          saved: ["Kayıtlı kampanyalar", ""], followed: ["Takip edilen işletmeler", ""],
          referrals: ["Davetlerim", "Tek seviye davet · doğrulanmış alışverişten sonra bonus"],
          bonus: ["Damping Bonus", "Mağazaya bağlı indirim hakları"],
          activity: ["QR ve kampanya etkinliği", ""], notifications: ["Bildirimler", ""],
          profile: ["Profil ve tercihler", ""],
        }}
      />
    </ToastProvider>
  );
}

export function BusinessDash({ user, data, locale, initial, videos = [], range = 14 }: {
  user: NonNullable<SessionLite>;
  data: NonNullable<Awaited<ReturnType<typeof import("@/lib/queries").getBusinessData>>>;
  locale: Loc;
  initial: string;
  videos?: import("@/components/business").StudioVideo[];
  range?: number;
}) {
  return (
    <ToastProvider>
      <Inner
        nav={BUSINESS_NAV}
        initial={initial}
        locale={locale}
        user={user}
        variant="business"
        businessName={data.biz.name}
        render={(s) => <BusinessDashboard data={data} lang={locale.lang} currency={locale.currency} section={s} videos={videos} range={range} />}
        titles={{
          overview: ["Genel bakış", "Ölçülen olaylar: gösterim, tıklama, ziyaret, QR okutma, doğrulanmış kullanım"],
          profile: ["İşletme profili", ""], campaigns: ["Kampanyalar", ""], qr: ["QR kampanyaları", ""],
          traffic: ["Müşteri trafiği", ""], referrals: ["Yönlendirme etkinliği", ""], advertising: ["Reklam", ""],
          ai: ["AI Pazarlama", ""], growth: ["28 Günlük Büyüme Programı", ""],
          studio: ["Video ve İçerik Stüdyosu", "Storyboard, altyazı ve hizmet talepleri"], analytics: ["Analitik", ""],
          plans: ["Planlar ve hizmetler", ""], invoices: ["Faturalar", ""], settings: ["Ayarlar", ""],
        }}
      />
    </ToastProvider>
  );
}

export function AdminDash({ user, data, locale, initial, affiliate }: {
  user: NonNullable<SessionLite>;
  data: Awaited<ReturnType<typeof import("@/lib/queries").getAdminData>>;
  locale: Loc;
  initial: string;
  affiliate: Awaited<ReturnType<typeof import("@/lib/queries").getAffiliateData>>;
}) {
  return (
    <ToastProvider>
      <Inner
        nav={ADMIN_NAV.map((n) => (n.key === "moderation" ? { ...n, badge: data.counts.pendingModeration } : n))}
        initial={initial}
        locale={locale}
        user={user}
        variant="admin"
        businessName="DampingVar Platform"
        render={(s) => <AdminDashboard data={data} lang={locale.lang} currency={locale.currency} section={s} affiliate={affiliate} />}
        titles={{
          overview: ["Platform özeti", ""], customers: ["Müşteriler", ""], businesses: ["İşletmeler ve markalar", ""],
          moderation: ["Kampanya moderasyonu", ""], qr: ["QR etkinliği", ""], referrals: ["Yönlendirme izleme", ""],
          bonusRules: ["Damping Bonus kuralları", ""], ads: ["Reklam paketleri", ""], ai: ["AI pazarlama hizmetleri", ""],
          fees: ["Hizmet bedelleri", ""], invoices: ["Faturalar", ""], analytics: ["Analitik", ""],
          reports: ["Raporlar", "CSV dışa aktarım · hizmet geliri ile müşteri indirimleri ayrı"],
          fraud: ["Fraud izleme", ""], settings: ["Sistem ayarları", ""], audit: ["Denetim kayıtları", ""],
        }}
      />
    </ToastProvider>
  );
}

function Inner({ nav, initial, locale, user, variant, businessName, render, titles }: {
  nav: { key: string; label: string; icon: React.ReactNode; badge?: number; group?: string }[];
  initial: string; locale: Loc; user: NonNullable<SessionLite>;
  variant: "customer" | "business" | "admin"; businessName?: string;
  render: (section: string) => React.ReactNode;
  titles: Record<string, [string, string]>;
}) {
  const [section, setSection] = useSectionParam(initial);
  const key = nav.some((n) => n.key === section) ? section : nav[0].key;
  const [title, subtitle] = titles[key] ?? [key, ""];
  return (
    <DashShell
      user={user} nav={nav} section={key} onSection={setSection}
      title={title} subtitle={subtitle || undefined}
      lang={locale.lang} currency={locale.currency} country={locale.country}
      variant={variant} businessName={businessName}
    >
      {render(key)}
    </DashShell>
  );
}
