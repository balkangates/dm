import Link from "next/link";
import { currentUser } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Badge, Reveal, SectionHead } from "@/components/ds";
import { Icon } from "@/components/icons";
import { ensureSeeded, listBusinesses, listDistricts } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "İşletmeler", description: "DampingVar'daki doğrulanmış yerel işletmeler ve markalar." };

export default async function BusinessesPage() {
  await ensureSeeded();
  const [user, locale, businesses, districts] = await Promise.all([currentUser(), getLocale(), listBusinesses(), listDistricts()]);
  const session: SessionLite = user ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode } : null;

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <SectionHead eyebrow="İşletmeler ve markalar" title="Yerel mağazalar, markalar"
          desc="Doğrulanmış profiller, çalışma saatleri ve aktif kampanyalar. Konuma göre göz at." />

        <div className="mb-8 flex flex-wrap gap-2">
          {districts.map((d) => (
            <Link key={d.district} href={`/kampanyalar?konum=${encodeURIComponent(d.district)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[0.82rem] font-medium text-ink-700 hover:border-ink-500">
              <Icon.pin size={13} className="text-accent" />{d.district} <span className="tabular text-muted-2">{d.n}</span>
            </Link>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b, i) => (
            <Reveal key={b.id} delay={i * 45}>
              <Link href={`/isletme/${b.slug}`} className="card hover-lift group overflow-hidden p-0">
                <div className="relative h-40 overflow-hidden">
                  <img src={b.coverImage ?? "/images/magaza-ic.jpg"} alt={b.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
                  <span className="absolute bottom-3 left-3 text-[0.76rem] font-semibold text-white">{b.district}, {b.city}</span>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-display text-[1.05rem] font-bold">{b.name}</p>
                    {b.verified ? <Icon.verified size={14} className="shrink-0 text-positive" /> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[0.85rem] leading-relaxed text-muted">{b.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">★ {b.rating.toFixed(1)}</Badge>
                    <Badge tone="neutral">{b.subCategory ?? b.category}</Badge>
                    <Badge tone="accent">{b.planCode}</Badge>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
