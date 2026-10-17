"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Avatar, Badge, Button, DemoTag, Icon, Logo, useToast } from "@/components/ds";
import { LocaleSwitcher, type SessionLite } from "@/components/Shell";
import { makeT } from "@/lib/i18n";
import type { Currency, Lang } from "@/lib/money";

export type NavItem = { key: string; label: string; icon: ReactNode; badge?: number; group?: string };

export function DashShell({
  user,
  nav,
  section,
  onSection,
  title,
  subtitle,
  actions,
  children,
  lang,
  currency,
  country,
  variant = "business",
  businessName,
}: {
  user: SessionLite;
  nav: NavItem[];
  section: string;
  onSection: (k: string) => void;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  lang: Lang;
  currency: Currency;
  country: string;
  variant?: "customer" | "business" | "admin";
  businessName?: string;
}) {
  const t = makeT(lang);
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [drawer, setDrawer] = useState(false);

  const groups = Array.from(new Set(nav.map((n) => n.group ?? "")));

  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    toast.push({ title: "Çıkış yapıldı", tone: "neutral" });
    router.push("/");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-4">
        <Logo light href="/" size={26} />
      </div>

      {businessName ? (
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-white/45">
            {variant === "admin" ? "Platform" : "İşletme"}
          </p>
          <p className="mt-0.5 truncate text-[0.9rem] font-semibold text-white">{businessName}</p>
        </div>
      ) : null}

      <nav className="thin-scroll flex-1 overflow-y-auto px-2.5 py-3">
        {groups.map((g) => (
          <div key={g} className="mb-4">
            {g ? (
              <p className="mb-1.5 px-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/35">{g}</p>
            ) : null}
            <ul className="space-y-0.5">
              {nav
                .filter((n) => (n.group ?? "") === g)
                .map((n) => {
                  const active = n.key === section;
                  return (
                    <li key={n.key}>
                      <button
                        onClick={() => {
                          onSection(n.key);
                          setDrawer(false);
                        }}
                        aria-current={active ? "page" : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left text-[0.85rem] font-medium transition-colors ${
                          active ? "bg-surface text-ink shadow-sm" : "text-white/70 hover:bg-surface/10 hover:text-white"
                        }`}
                      >
                        <span className={active ? "text-accent" : "text-white/50"}>{n.icon}</span>
                        <span className="flex-1 truncate">{n.label}</span>
                        {n.badge ? (
                          <span className="tabular rounded-full bg-accent px-1.5 py-0.5 text-[0.64rem] font-bold text-white">
                            {n.badge}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/"
          className="mb-1.5 flex items-center gap-2 rounded-[3px] px-2.5 py-2 text-[0.82rem] font-medium text-white/65 hover:bg-surface/10 hover:text-white"
        >
          <Icon.external size={15} /> Siteyi görüntüle
        </Link>
        <button
          onClick={() => void logout()}
          className="flex w-full items-center gap-2 rounded-[3px] px-2.5 py-2 text-[0.82rem] font-medium text-white/65 hover:bg-surface/10 hover:text-white"
        >
          <Icon.logout size={15} /> {t("nav.logout")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* masaüstü sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] bg-ink md:block">{sidebar}</aside>

      {/* mobil çekmece */}
      {drawer ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
          <aside className="anim-rise absolute inset-y-0 left-0 w-[268px] bg-ink">{sidebar}</aside>
        </div>
      ) : null}

      <div className="md:pl-[248px]">
        {/* üst bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-surface/92 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setDrawer(true)}
              aria-label="Menüyü aç"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[3px] border border-line text-ink-700 md:hidden"
            >
              <Icon.menu size={17} />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[1.05rem] font-bold leading-tight text-ink">{title}</h1>
              {subtitle ? <p className="truncate text-[0.78rem] text-muted">{subtitle}</p> : null}
            </div>

            <DemoTag />
            <LocaleSwitcher lang={lang} currency={currency} country={country} compact />

            <div className="hidden items-center gap-2 sm:flex">
              <Avatar name={user?.name ?? "DV"} size={32} />
              <div className="leading-tight">
                <p className="max-w-[140px] truncate text-[0.82rem] font-semibold text-ink">{user?.name ?? "—"}</p>
                <p className="text-[0.7rem] text-muted">
                  {user?.role === "ADMIN" ? "Platform yöneticisi" : user?.role === "BUSINESS" ? "İşletme" : "Müşteri"}
                </p>
              </div>
            </div>

            {actions}
          </div>
        </header>

        <main className="px-4 pb-24 pt-6 sm:px-6 md:pb-10">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>

      {/* mobil alt navigasyon */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/97 backdrop-blur md:hidden">
        <ul className="flex items-stretch justify-around">
          {nav.slice(0, 5).map((n) => {
            const active = n.key === section;
            return (
              <li key={n.key} className="flex-1">
                <button
                  onClick={() => onSection(n.key)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-1 px-1 py-2.5 text-[0.62rem] font-semibold ${
                    active ? "text-accent" : "text-muted"
                  }`}
                >
                  {n.icon}
                  <span className="max-w-full truncate">{n.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <span className="sr-only">{pathname}</span>
    </div>
  );
}

export function DashSectionHead({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        ) : null}
        <h2 className="font-display text-[1.35rem] font-bold leading-tight text-ink sm:text-[1.6rem]">{title}</h2>
        {desc ? <p className="mt-1.5 max-w-2xl text-[0.88rem] leading-relaxed text-muted">{desc}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ status, lang = "tr" }: { status: string; lang?: Lang }) {
  const map: Record<string, { tone: "positive" | "warning" | "info" | "neutral" | "danger" | "accent"; tr: string; en: string }> = {
    VERIFIED: { tone: "positive", tr: "Doğrulandı", en: "Verified" },
    SUBMITTED: { tone: "info", tr: "Doğrulama bekliyor", en: "Awaiting verification" },
    QR_SCANNED: { tone: "neutral", tr: "QR okutuldu", en: "QR scanned" },
    REJECTED: { tone: "danger", tr: "Reddedildi", en: "Rejected" },
    CANCELLED: { tone: "neutral", tr: "İptal", en: "Cancelled" },
    AVAILABLE: { tone: "positive", tr: "Kullanılabilir", en: "Available" },
    PENDING_VERIFICATION: { tone: "info", tr: "Doğrulama bekliyor", en: "Pending" },
    USED: { tone: "neutral", tr: "Kullanıldı", en: "Used" },
    EXPIRED: { tone: "warning", tr: "Süresi doldu", en: "Expired" },
    DRAFT: { tone: "neutral", tr: "Taslak", en: "Draft" },
    PUBLISHED: { tone: "positive", tr: "Yayında", en: "Published" },
    PAUSED: { tone: "warning", tr: "Duraklatıldı", en: "Paused" },
    ENDED: { tone: "neutral", tr: "Bitti", en: "Ended" },
    PENDING: { tone: "info", tr: "Onay bekliyor", en: "Pending" },
    APPROVED: { tone: "positive", tr: "Onaylandı", en: "Approved" },
    PAID: { tone: "positive", tr: "Ödendi", en: "Paid" },
    ISSUED: { tone: "info", tr: "Kesildi", en: "Issued" },
    SENT: { tone: "info", tr: "Gönderildi", en: "Sent" },
    OVERDUE: { tone: "danger", tr: "Gecikmiş", en: "Overdue" },
    ACTIVE: { tone: "positive", tr: "Aktif", en: "Active" },
    INVITED: { tone: "neutral", tr: "Davet edildi", en: "Invited" },
    REGISTERED: { tone: "info", tr: "Kayıt oldu", en: "Registered" },
    PURCHASE_PENDING_VERIFICATION: { tone: "warning", tr: "Doğrulama bekliyor", en: "Awaiting verification" },
    QUALIFIED: { tone: "positive", tr: "Koşul sağlandı", en: "Qualified" },
    BONUS_AVAILABLE: { tone: "positive", tr: "Bonus hazır", en: "Bonus available" },
    BONUS_USED: { tone: "neutral", tr: "Bonus kullanıldı", en: "Bonus used" },
    FRAUD_REVIEW: { tone: "danger", tr: "İncelemede", en: "Under review" },
    OPEN: { tone: "warning", tr: "Açık", en: "Open" },
    CLEARED: { tone: "positive", tr: "Temizlendi", en: "Cleared" },
    BLOCKED: { tone: "danger", tr: "Engellendi", en: "Blocked" },
    PENDING_APPROVAL: { tone: "warning", tr: "Onay bekliyor", en: "Pending approval" },
    REVERSED: { tone: "neutral", tr: "Geri alındı", en: "Reversed" },
  };
  const m = map[status] ?? { tone: "neutral" as const, tr: status, en: status };
  return (
    <Badge tone={m.tone}>
      {lang === "en" ? m.en : m.tr}
    </Badge>
  );
}

export { Button };
