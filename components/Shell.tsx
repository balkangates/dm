"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, Badge, Button, Icon, Logo } from "@/components/ds";
import { COUNTRIES, LANGS, makeT } from "@/lib/i18n";
import { CURRENCIES, type Currency, type Lang } from "@/lib/money";

export type SessionLite = {
  id: string;
  name: string;
  email: string;
  role: string;
  businessId: string | null;
  referralCode: string;
} | null;

async function postLocale(patch: Record<string, string>) {
  await fetch("/api/locale", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function LocaleSwitcher({
  lang,
  currency,
  country,
  compact = false,
}: {
  lang: Lang;
  currency: Currency;
  country: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function apply(patch: Record<string, string>) {
    await postLocale(patch);
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-surface px-2.5 py-1.5 text-[0.78rem] font-semibold text-ink-700 transition-colors hover:border-ink-500 ${
          compact ? "h-8" : "h-9"
        }`}
      >
        <Icon.globe size={14} />
        <span className="tabular">{lang.toUpperCase()}</span>
        <span className="text-muted-2">·</span>
        <span className="tabular">{currency}</span>
        <Icon.chevronDown size={13} className="text-muted" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Dil, ülke ve para birimi"
          className="anim-rise absolute right-0 z-50 mt-2 w-[286px] rounded-[4px] border border-line bg-surface p-4 shadow-[var(--shadow-pop)]"
        >
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">Dil</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => void apply({ lang: l.code })}
                className={`rounded-full border px-3 py-1.5 text-[0.78rem] font-medium ${
                  lang === l.code ? "border-ink bg-ink text-white" : "border-line text-ink-700 hover:border-ink-500"
                }`}
              >
                {l.native}
              </button>
            ))}
          </div>

          <p className="mt-4 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">Ülke / konum</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                onClick={() => void apply({ country: c.code })}
                className={`rounded-full border px-3 py-1.5 text-[0.78rem] font-medium ${
                  country === c.code ? "border-ink bg-ink text-white" : "border-line text-ink-700 hover:border-ink-500"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">Para birimi</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => void apply({ currency: c.code })}
                className={`tabular rounded-full border px-3 py-1.5 text-[0.78rem] font-medium ${
                  currency === c.code ? "border-accent bg-accent-soft text-accent-700" : "border-line text-ink-700 hover:border-ink-500"
                }`}
              >
                {c.symbol} {c.code}
              </button>
            ))}
          </div>

          <p className="mt-4 border-t border-line-soft pt-3 text-[0.72rem] leading-relaxed text-muted">
            Dil, ülke ve para birimi ayrı ayarlardır. Kampanya fiyatları işletmenin tanımladığı para biriminde
            gösterilir; kur dönüşümü yapılmaz.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function Header({
  user,
  lang,
  currency,
  country,
}: {
  user: SessionLite;
  lang: Lang;
  currency: Currency;
  country: string;
}) {
  const t = makeT(lang);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/");
    router.refresh();
  }

  const dashHref = user?.role === "ADMIN" ? "/admin" : user?.role === "BUSINESS" ? "/panel" : "/hesabim";

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/92 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-4 sm:px-6">
        <Logo />

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {[
            { href: "/kampanyalar", label: t("nav.campaigns") },
            { href: "/online-firsatlar", label: t("nav.online") },
            { href: "/isletmeler", label: t("nav.businesses") },
            { href: "/#kategoriler", label: t("nav.categories") },
            { href: "/#nasil-calisir", label: t("nav.how") },
            { href: "/#ai-program", label: t("nav.ai28") },
            { href: "/fiyatlar", label: t("nav.solutions") },
            { href: "/islem-akisi", label: t("nav.flow") },
            { href: "/videolar", label: t("nav.videos") },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="link-sweep rounded-[3px] px-3 py-2 text-[0.86rem] font-medium text-ink-700 transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher lang={lang} currency={currency} country={country} compact />

          {user ? (
            <>
              <Link
                href={dashHref}
                className="hidden items-center gap-2 rounded-[3px] border border-line bg-surface px-2.5 py-1.5 text-[0.82rem] font-semibold text-ink transition-colors hover:border-ink-500 sm:inline-flex"
              >
                <Avatar name={user.name} size={22} tone="accent" />
                <span className="max-w-[120px] truncate">{user.name.split(" ")[0]}</span>
              </Link>
              <Button size="sm" variant="ghost" onClick={() => void logout()} icon={<Icon.logout size={15} />}>
                <span className="hidden sm:inline">{t("nav.logout")}</span>
              </Button>
            </>
          ) : (
            <>
              <Button href="/giris" size="sm" variant="ghost" className="hidden sm:inline-flex">
                {t("nav.login")}
              </Button>
              <Button href="/kayit" size="sm">
                {t("nav.register")}
              </Button>
            </>
          )}

          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Menü"
            aria-expanded={open}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[3px] border border-line text-ink-700 lg:hidden"
          >
            {open ? <Icon.x size={17} /> : <Icon.menu size={17} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="anim-rise border-t border-line bg-surface px-4 py-3 lg:hidden">
          <nav className="grid gap-1">
            {[
              { href: "/kampanyalar", label: t("nav.campaigns") },
              { href: "/online-firsatlar", label: t("nav.online") },
              { href: "/isletmeler", label: t("nav.businesses") },
              { href: "/#nasil-calisir", label: t("nav.how") },
              { href: "/#ai-program", label: t("nav.ai28") },
              { href: "/fiyatlar", label: t("nav.solutions") },
              { href: "/islem-akisi", label: t("nav.flow") },
              { href: "/videolar", label: t("nav.videos") },
              ...(user ? [{ href: dashHref, label: t("nav.account") }] : [{ href: "/giris", label: t("nav.login") }]),
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-[3px] px-3 py-2.5 text-[0.9rem] font-medium text-ink-700 hover:bg-canvas"
              >
                {l.label}
                <Icon.chevronRight size={15} className="text-muted-2" />
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function Footer({
  lang,
  currency,
  country,
}: {
  lang: Lang;
  currency: Currency;
  country: string;
}) {
  const t = makeT(lang);
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-[1280px] px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-[42ch] text-[0.88rem] leading-relaxed text-muted">
              DampingVar; işletmelerin kampanyalarını yönettiği, müşteri trafiği yönlendirdiği, QR ve yönlendirme
              etkinliklerini ölçtüğü ve AI destekli pazarlama hizmeti satın aldığı dijital müşteri kazanım
              platformudur.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge tone="neutral" icon={<Icon.shield size={12} />}>
                Ödeme alınmaz
              </Badge>
              <Badge tone="neutral" icon={<Icon.info size={12} />}>
                Cashback yok
              </Badge>
            </div>
            <div className="mt-5">
              <LocaleSwitcher lang={lang} currency={currency} country={country} />
            </div>
          </div>

          {[
            {
              title: "Müşteriler",
              links: [
                { href: "/kampanyalar", label: t("nav.campaigns") },
                { href: "/online-firsatlar", label: t("nav.online") },
                { href: "/qr", label: "QR nasıl çalışır" },
                { href: "/islem-akisi", label: t("nav.flow") },
                { href: "/hesabim?s=bonus", label: t("cust.bonus") },
                { href: "/hesabim?s=referrals", label: t("cust.referrals") },
              ],
            },
            {
              title: "İşletmeler",
              links: [
                { href: "/fiyatlar", label: t("nav.pricing") },
                { href: "/panel?s=growth", label: "28 Günlük AI Programı" },
                { href: "/panel?s=studio", label: "Video ve içerik stüdyosu" },
                { href: "/panel?s=advertising", label: "Reklam ve görünürlük" },
                { href: "/kayit?tip=isletme", label: "İşletmeni ekle" },
              ],
            },
            {
              title: "Platform",
              links: [
                { href: "/isletmeler", label: t("nav.businesses") },
                { href: "/videolar", label: t("nav.videos") },
                { href: "/giris", label: t("nav.login") },
                { href: "/admin", label: t("nav.admin") },
                { href: "/api/health", label: "Sistem durumu" },
              ],
            },
          ].map((col) => (
            <div key={col.title}>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-accent">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="link-sweep text-[0.88rem] text-ink-500 hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-[4px] border border-line bg-canvas p-5">
          <p className="text-[0.82rem] font-semibold text-ink">Finansal sınır</p>
          <p className="mt-1.5 max-w-[110ch] text-[0.82rem] leading-relaxed text-muted">
            DampingVar müşteri ödemesini tahsil etmez, işletmeye aktarmaz, cashback veya nakit iade sunmaz, müşteri
            cüzdanı oluşturmaz ve işletmeler arasında ortak puan havuzu veya mahsuplaşma yapmaz. Müşteri ürünü ve
            hizmeti doğrudan işletmeden alır, ödemesini doğrudan işletmeye yapar. DampingVar&apos;ın geliri; reklam,
            kampanya yönetimi, görünürlük, yönlendirme ve AI pazarlama hizmetleri için işletmelere kestiği ve ayrıca
            faturalandırdığı hizmet bedelleridir.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[0.8rem] text-muted">
          <p>© {new Date().getFullYear()} DampingVar. Tüm hakları saklıdır.</p>
          <nav className="flex flex-wrap items-center gap-5">
            <Link href="/yasal/kosullar" className="link-sweep hover:text-ink">Kullanım Koşulları</Link>
            <Link href="/yasal/gizlilik" className="link-sweep hover:text-ink">Gizlilik</Link>
            <Link href="/yasal/cikolata" className="link-sweep hover:text-ink">Çerezler</Link>
            <span className="tabular">TR · EN · KA</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export function MobileTabBar({
  items,
  active,
}: {
  items: { href: string; label: string; icon: ReactNode }[];
  active?: string;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/96 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-[560px] items-stretch justify-around">
        {items.map((it) => (
          <li key={it.href} className="flex-1">
            <Link
              href={it.href}
              aria-current={active === it.href}
              className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[0.64rem] font-semibold ${
                active === it.href ? "text-accent" : "text-muted"
              }`}
            >
              {it.icon}
              <span className="truncate">{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PublicShell({
  user,
  lang,
  currency,
  country,
  children,
  footer = true,
}: {
  user: SessionLite;
  lang: Lang;
  currency: Currency;
  country: string;
  children: ReactNode;
  footer?: boolean;
}) {
  const t = makeT(lang);
  // Mobilde müşteri deneyimi için alt navigasyon (mağazada telefonla kullanım öncelikli).
  const dashHref = user?.role === "ADMIN" ? "/admin" : user?.role === "BUSINESS" ? "/panel" : "/hesabim";
  const tabs = [
    { href: "/", label: t("nav.campaigns") === "Kampanyalar" ? "Ana sayfa" : "Home", icon: <Icon.store size={17} /> },
    { href: "/kampanyalar", label: t("nav.campaigns"), icon: <Icon.tag size={17} /> },
    { href: "/online-firsatlar", label: t("nav.online"), icon: <Icon.external size={17} /> },
    { href: "/islem-akisi", label: t("nav.flow"), icon: <Icon.layers size={17} /> },
    { href: user ? dashHref : "/giris", label: user ? t("nav.account") : t("nav.login"), icon: <Icon.users size={17} /> },
  ];

  return (
    <div className="flex min-h-screen flex-col pb-[68px] md:pb-0">
      <Header user={user} lang={lang} currency={currency} country={country} />
      <main className="flex-1">{children}</main>
      {footer ? <Footer lang={lang} currency={currency} country={country} /> : null}
      <MobileTabBar items={tabs} />
    </div>
  );
}
