"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Badge, Button, Card, EmptyState, Field, Icon, IconButton, Input, Kpi, Notice, Progress, QrPanel,
  Select, Table, Td, Th, ToastProvider, useToast,
} from "@/components/ds";
import { DashSectionHead, StatusBadge, type NavItem } from "@/components/Dash";
import { CampaignCardView } from "@/components/discovery";
import { OfferCardView } from "@/components/offers";
import type { OfferCard } from "@/lib/queries";
import { makeT } from "@/lib/i18n";
import { money, relative, shortDate, type Currency, type Lang } from "@/lib/money";
import type { CampaignCard } from "@/lib/queries";
import type { SessionLite } from "@/components/Shell";
import { getBrowserSupabase } from "@/lib/supabase/client";

export type CustomerData = Awaited<ReturnType<typeof import("@/lib/queries").getCustomerData>>;

export const CUSTOMER_NAV: NavItem[] = [
  { key: "overview", label: "Genel Bakış", icon: <Icon.chart size={16} />, group: "Keşif" },
  { key: "discover", label: "Kampanyaları Keşfet", icon: <Icon.search size={16} />, group: "Keşif" },
  { key: "saved", label: "Kayıtlı Kampanyalar", icon: <Icon.bookmark size={16} />, group: "Keşif" },
  { key: "followed", label: "Takip Edilen İşletmeler", icon: <Icon.store size={16} />, group: "Keşif" },
  { key: "referrals", label: "Davetlerim", icon: <Icon.users size={16} />, group: "Kazançlar" },
  { key: "bonus", label: "Damping Bonus", icon: <Icon.bonus size={16} />, group: "Kazançlar" },
  { key: "activity", label: "QR ve Kampanya Etkinliği", icon: <Icon.qr size={16} />, group: "Kazançlar" },
  { key: "notifications", label: "Bildirimler", icon: <Icon.bell size={16} />, group: "Hesap" },
  { key: "profile", label: "Profil ve Tercihler", icon: <Icon.settings size={16} />, group: "Hesap" },
];

export default function CustomerDashboard({
  data, campaigns, user, lang, currency, section, offers = [],
}: {
  data: CustomerData;
  campaigns: CampaignCard[];
  user: NonNullable<SessionLite>;
  lang: Lang;
  currency: Currency;
  section: string;
  offers?: OfferCard[];
}) {
  const t = makeT(lang);
  const toast = useToast();
  const [local, setLocal] = useState(data);

  // FAZ 11 — Gerçek zamanlı bildirimler: yalnızca KENDİ bildirim satırlarınız
  // dinlenir (postgres_changes + user_id filtresi + RLS publish_restricted).
  // Sahte/üretilmiş canlı veri üretilmez; yalnızca gerçek INSERT'ler gösterilir.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  useEffect(() => {
    if (section !== "notifications") return;
    const sb = getBrowserSupabase();
    const ch = sb
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const x = payload.new as Record<string, unknown>;
          const incoming = {
            id: String(x.id),
            kind: String(x.kind ?? "SYSTEM"),
            title: String(x.title ?? ""),
            body: x.body == null ? null : String(x.body),
            link: x.link == null ? null : String(x.link),
            read: Boolean(x.read),
            createdAt: x.created_at == null ? null : String(x.created_at),
          };
          setLocal((p) =>
            p.notifications.some((n) => n.id === incoming.id)
              ? p
              : { ...p, notifications: [incoming, ...p.notifications] },
          );
          toastRef.current.push({ title: "Yeni bildirim", desc: incoming.title, tone: "positive" });
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [section, user.id]);

  async function api(body: Record<string, unknown>, okMsg: string) {
    const res = await fetch(body._route ? String(body._route) : "/api/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) toast.push({ title: json.error ?? "İşlem başarısız", tone: "danger" });
    else toast.push({ title: okMsg, tone: "positive" });
    return json;
  }

  const available = local.bonuses.filter((b) => b.status === "AVAILABLE");

  /* ------------------------------- OVERVIEW ------------------------------ */
  if (section === "overview") {
    return (
      <div>
        <DashSectionHead
          eyebrow={t("cust.overview")}
          title={`Merhaba ${user.name.split(" ")[0]}`}
          desc="Yakınındaki fırsatlar, kayıtlı kampanyaların, davetlerin ve mağazaya bağlı Damping Bonus hakların."
          action={<Button href="/kampanyalar" icon={<Icon.search size={15} />}>{t("hero.cta1")}</Button>}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Kullanılabilir Damping Bonus" value={available.length} hint="Yalnızca kazanıldığı mağazada geçerli" icon={<Icon.bonus size={16} />} />
          <Kpi label="Kayıtlı kampanya" value={local.savedIds.length} icon={<Icon.bookmark size={16} />} />
          <Kpi label="Takip edilen işletme" value={local.followedIds.length} icon={<Icon.store size={16} />} />
          <Kpi label="Davet edilen arkadaş" value={local.referrals.length} icon={<Icon.users size={16} />} />
        </div>

        {!user.businessId && (
          <Card className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Kendi işletmeni aç</p>
                <p className="mt-1 text-[0.86rem] leading-relaxed text-muted">
                  İşletme paneli, kampanya yönetimi ve QR takibi için işletme kaydı oluştur — birkaç alan doldur yeter.
                </p>
              </div>
              <Button href="/hesabim/isletme-ac" variant="primary" icon={<Icon.store size={15} />}>
                İşletme Aç
              </Button>
            </div>
          </Card>
        )}

        <Card className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-accent">İlerleme</p>
              <h3 className="mt-1 font-display text-[1.1rem] font-bold">Keşif, davet ve öğrenme adımların</h3>
              <p className="mt-1 max-w-[70ch] text-[0.84rem] leading-relaxed text-muted">
                Rozetler yalnızca <strong className="text-ink">doğrulanmış</strong> olaylarla kazanılır. Doğrulanmamış
                tıklama veya okutma için başarı verilmez; bu göstergeler bilgilendirme amaçlıdır, zorunlu değildir.
              </p>
            </div>
            <Badge tone="neutral">{local.progress.verifiedUsages + local.progress.verifiedReferrals} doğrulanmış adım</Badge>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Kampanya keşfi", value: local.progress.discoveryCount, goal: 5, unit: "kampanya", verified: false },
              { label: "Kayıtlı fırsat", value: local.progress.savedCount, goal: 3, unit: "kayıt", verified: false },
              { label: "Davet milestone", value: local.progress.verifiedReferrals, goal: 1, unit: "doğrulanmış davet", verified: true },
              { label: "Eğitim adımları", value: local.progress.learningCount, goal: 3, unit: "video anlatım", verified: false },
            ].map((p) => (
              <div key={p.label} className="border-2 border-line bg-canvas p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[0.8rem] font-semibold text-ink">{p.label}</p>
                  <p className="tabular text-[0.86rem] font-semibold text-ink">{Math.min(p.value, p.goal)}/{p.goal}</p>
                </div>
                <div className="mt-2"><Progress value={(Math.min(p.value, p.goal) / p.goal) * 100} tone={p.verified ? "positive" : "accent"} /></div>
                <p className="mt-2 text-[0.72rem] text-muted">
                  {p.value} {p.unit}
                  {p.verified ? " · yalnızca işletme onaylı olanlar sayılır" : ""}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t-2 border-dashed border-line pt-4">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">Başarılar</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { key: "first-verified", label: "İlk doğrulanmış kullanım", earned: local.progress.verifiedUsages > 0, need: "Bir kampanya kullanımın işletme tarafından doğrulansın." },
                { key: "verified-referral", label: "Doğrulanmış davet", earned: local.progress.verifiedReferrals > 0, need: "Davet ettiğin arkadaşının alışverişi doğrulansın." },
                { key: "bonus", label: "Damping Bonus kazandı", earned: local.progress.bonusEarned > 0, need: "Doğrulanmış alışverişten mağazaya bağlı bonus oluşsun." },
                { key: "learner", label: "3 video anlatım izlendi", earned: local.progress.learningCount >= 3, need: "Video kütüphanesinden 3 anlatım aç." },
              ].map((a) => (
                <span
                  key={a.key}
                  title={a.earned ? "Kazanıldı" : a.need}
                  className={`inline-flex items-center gap-1.5 border-2 px-3 py-1.5 text-[0.76rem] font-semibold ${
                    a.earned ? "border-positive bg-positive-soft text-positive" : "border-line bg-surface text-muted-2"
                  }`}
                >
                  {a.earned ? <Icon.check size={13} strokeWidth={2.6} /> : <Icon.lock size={13} />}
                  {a.label}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <DashSectionHead title="Yakınındaki fırsatlar" desc="Konumuna ve ilgine göre öne çıkan kampanyalar." />
            {campaigns.length === 0 ? (
              <EmptyState title="Şu an yakınlarında kampanya yok" desc="Filtreleri genişletmeyi dene." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {campaigns.slice(0, 4).map((c) => (
                  <CampaignCardView key={c.id} c={c} lang={lang} compact saved={local.savedIds.includes(c.id)} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Online fırsatlar</p>
                  <p className="mt-1 text-[0.84rem] leading-relaxed text-ink-700">
                    Marka teklifleri satıcının kendi sitesinde tamamlanır; DampingVar ödeme almaz.
                  </p>
                </div>
                <Button href="/online-firsatlar" size="sm" variant="ghost" iconRight={<Icon.arrowRight size={14} />}>Tümü</Button>
              </div>
              <ul className="mt-3 space-y-2.5">
                {offers.slice(0, 3).map((o) => (
                  <li key={o.id} className="flex items-center gap-3 border-b border-line-soft pb-2.5 last:border-0">
                    <img src={o.imageUrl ?? "/images/magaza-ic.jpg"} alt="" className="h-10 w-10 shrink-0 rounded-[3px] object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.85rem] font-medium text-ink">{o.title}</span>
                      <span className="block truncate text-[0.74rem] text-muted">{o.merchant} · {o.category}</span>
                    </span>
                    {o.priceVerified && o.priceCents != null ? (
                      <span className="tabular shrink-0 text-[0.8rem] font-semibold">{money(o.priceCents, o.currency as Currency, lang)}</span>
                    ) : <span className="shrink-0 text-[0.72rem] text-muted-2">satıcıda</span>}
                  </li>
                ))}
                {offers.length === 0 ? <li className="text-[0.85rem] text-muted">Şu an online fırsat yok.</li> : null}
              </ul>
            </Card>

            <Card>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Son etkinliklerin</p>
              <ul className="mt-3 divide-y divide-line-soft">
                {local.activity.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[0.85rem] font-medium text-ink">{a.campaignTitle}</p>
                      <p className="text-[0.74rem] text-muted">{a.businessName} · {a.scannedAt ? relative(a.scannedAt, lang) : ""}</p>
                    </div>
                    <StatusBadge status={a.status} lang={lang} />
                  </li>
                ))}
                {local.activity.length === 0 ? <li className="py-3 text-[0.85rem] text-muted">Henüz etkinlik yok.</li> : null}
              </ul>
            </Card>

            <Card>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Son görüntülediklerin</p>
              <ul className="mt-3 space-y-2.5">
                {local.recentlyViewed.map((b) => (
                  <li key={b.id}>
                    <Link href={`/isletme/${b.slug}`} className="flex items-center gap-3 rounded-[3px] p-1.5 hover:bg-canvas">
                      <img src={b.coverImage ?? "/images/magaza-ic.jpg"} alt="" className="h-10 w-10 rounded-[3px] object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.85rem] font-medium text-ink">{b.name}</span>
                        <span className="block text-[0.74rem] text-muted">{b.district} · {b.category}</span>
                      </span>
                      <Icon.chevronRight size={15} className="text-muted-2" />
                    </Link>
                  </li>
                ))}
                {local.recentlyViewed.length === 0 ? <li className="text-[0.85rem] text-muted">Henüz işletme görüntülemedin.</li> : null}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------- DISCOVER ------------------------------ */
  if (section === "discover") {
    return (
      <div>
        <DashSectionHead title={t("cust.discover")} desc="Yerel kampanyalar ve online fırsatlar ayrı bölümlerde listelenir; ikisi birbirine karıştırılmaz." />

        {offers.length ? (
          <div className="mb-10">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-info">Online fırsatlar · affiliate</p>
                <p className="mt-1 font-display text-[1.2rem] font-bold">Marka ve mağaza teklifleri</p>
              </div>
              <Button href="/online-firsatlar" size="sm" variant="secondary" iconRight={<Icon.arrowRight size={14} />}>Tümünü gör</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {offers.slice(0, 3).map((o) => <OfferCardView key={o.id} o={o} lang={lang} />)}
            </div>
          </div>
        ) : null}

        <div className="mb-4 border-b-2 border-ink pb-3">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-accent">Yerel kampanyalar</p>
          <p className="mt-1 font-display text-[1.2rem] font-bold">Yakınındaki işletmeler</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <CampaignCardView key={c.id} c={c} lang={lang} saved={local.savedIds.includes(c.id)} />
          ))}
        </div>
      </div>
    );
  }

  /* -------------------------------- SAVED -------------------------------- */
  if (section === "saved") {
    return (
      <div>
        <DashSectionHead title={t("cust.saved")} desc="Kaydettiğin kampanyalar; süre dolmadan hatırlatırız." />
        {local.savedCampaigns.length === 0 ? (
          <EmptyState icon={<Icon.bookmark size={22} />} title="Kayıtlı kampanya yok" desc="Beğendiğin kampanyaları kaydet, süresi dolmadan gör." action={<Button href="/kampanyalar">Kampanyalara göz at</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {local.savedCampaigns.map((c) => <CampaignCardView key={c.id} c={c} lang={lang} saved />)}
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ FOLLOWED ------------------------------- */
  if (section === "followed") {
    return (
      <div>
        <DashSectionHead title={t("cust.followed")} desc="Takip ettiğin işletmeler yeni kampanya yayınladığında bildirilir." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {local.businesses.filter((b) => b.followed).map((b) => (
            <Card key={b.id} className="hover-lift p-0">
              <img src={b.coverImage ?? "/images/magaza-ic.jpg"} alt="" className="h-32 w-full rounded-t-[3px] object-cover" />
              <div className="p-4">
                <Link href={`/isletme/${b.slug}`} className="font-display text-[1rem] font-bold hover:text-accent">{b.name}</Link>
                <p className="mt-1 text-[0.8rem] text-muted">{b.district}, {b.city} · {b.category}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Badge tone="positive"><Icon.check size={11} /> Takiptesin</Badge>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { await api({ action: "unfollow", businessId: b.id }, "Takipten çıkıldı"); setLocal((p) => ({ ...p, followedIds: p.followedIds.filter((x) => x !== b.id), businesses: p.businesses.map((x) => x.id === b.id ? { ...x, followed: false } : x) })); }}>
                    Takibi bırak
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {local.businesses.filter((b) => b.followed).length === 0 ? (
            <div className="sm:col-span-2 xl:col-span-3">
              <EmptyState icon={<Icon.store size={22} />} title="Takip ettiğin işletme yok" desc="İşletme sayfalarından takip ederek yeni kampanyalardan haberdar ol." />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  /* ------------------------------ REFERRALS ------------------------------ */
  if (section === "referrals") {
    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/kayit?ref=${user.referralCode}`;
    return (
      <div>
        <DashSectionHead title={t("cust.referrals")} desc="Arkadaşını davet et; doğrulanmış alışverişinden sonra o mağazaya bağlı Damping Bonus kazan." />

        <Card className="mb-6 border-accent/30 bg-accent-soft/40">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-accent-700">Davet bağlantın</p>
              <p className="tabular mt-1.5 truncate text-[0.95rem] font-semibold text-ink">{link}</p>
              <p className="mt-1 text-[0.78rem] text-muted">Davet kodun: <span className="tabular font-semibold text-ink">{user.referralCode}</span></p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" icon={<Icon.copy size={15} />} onClick={async () => { try { await navigator.clipboard.writeText(link); toast.push({ title: t("common.copied"), tone: "positive" }); } catch { toast.push({ title: "Kopyalanamadı", tone: "warning" }); } }}>
                {t("common.copy")}
              </Button>
              <Button icon={<Icon.share size={15} />} onClick={() => { if (typeof navigator !== "undefined" && navigator.share) navigator.share({ url: link, title: "DampingVar" }).catch(() => undefined); else toast.push({ title: "Paylaşım desteklenmiyor", desc: "Bağlantıyı kopyalayıp gönderebilirsin.", tone: "warning" }); }}>
                {t("common.share")}
              </Button>
            </div>
          </div>
        </Card>

        <Notice tone="info" icon={<Icon.info size={16} />} title="Nasıl çalışır?">
          Tek seviye davet: yalnızca doğrudan davet eden kişi kazanır. Ödül, arkadaşının alışverişi <strong>işletme tarafından doğrulandıktan sonra</strong> oluşur ve alışverişin yapıldığı mağazaya bağlanır. Doğrulanmamış alışverişten bonus kazanılmaz.
        </Notice>

        <div className="mt-6">
          <Table>
            <thead><tr><Th>Davet edilen</Th><Th>Durum</Th><Th>Kayıt</Th><Th>Bonus</Th></tr></thead>
            <tbody>
              {local.referrals.map((r) => {
                const bonus = local.bonuses.find((b) => b.status !== "REJECTED");
                return (
                  <tr key={r.id}>
                    <Td strong>{r.inviteeName}</Td>
                    <Td><StatusBadge status={r.status} lang={lang} />{r.fraudFlags.length ? <span className="ml-2 text-[0.7rem] text-danger">inceleme: {r.fraudFlags.join(", ")}</span> : null}</Td>
                    <Td>{r.registeredAt ? shortDate(r.registeredAt, lang) : "—"}</Td>
                    <Td>{r.status === "BONUS_AVAILABLE" || r.status === "BONUS_USED" ? <span className="tabular">{bonus ? money(bonus.valueCents, bonus.currency as Currency, lang) : "—"}</span> : <span className="text-muted">—</span>}</Td>
                  </tr>
                );
              })}
              {local.referrals.length === 0 ? <tr><Td><span className="text-muted">Henüz davet yok.</span></Td><Td /><Td /><Td /></tr> : null}
            </tbody>
          </Table>
        </div>
      </div>
    );
  }

  /* -------------------------------- BONUS -------------------------------- */
  if (section === "bonus") {
    return (
      <div>
        <DashSectionHead title={t("bonus.title")} desc="Mağazaya bağlı indirim hakların. Bunlar nakit, cüzdan bakiyesi veya puan değildir." />

        <Notice tone="warning" icon={<Icon.alert size={16} />} className="mb-6">
          {t("bonus.notCash")} Bonus devredilemez, başka mağazaya taşınamaz ve DampingVar tarafından ödenmez; indirim işletme kasasında uygulanır.
        </Notice>

        {local.bonuses.length === 0 ? (
          <EmptyState
            icon={<Icon.bonus size={22} />}
            title="Henüz Damping Bonus hakkın yok"
            desc="Arkadaşını davet et; alışverişi işletme tarafından doğrulandığında, o mağazaya bağlı indirim hakkı kazanırsın."
            action={<Button href="/hesabim?s=referrals" icon={<Icon.users size={15} />}>Davetlerime git</Button>}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {local.bonuses.map((b) => (
              <Card key={b.id} className={`p-0 overflow-hidden ${b.status === "AVAILABLE" ? "border-positive/40" : ""}`}>
                <div className="flex items-start gap-4 p-5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-ink text-white">
                    <Icon.bonus size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-accent">Damping Bonus</p>
                      <StatusBadge status={b.status} lang={lang} />
                    </div>
                    <p className="mt-1 font-display text-[1.08rem] font-bold text-ink">{b.businessName}</p>
                    <p className="mt-1 text-[0.9rem] text-ink-700">
                      Sonraki uygun alışverişinde <strong className="tabular">{money(b.valueCents, b.currency as Currency, lang)}</strong> indirim
                    </p>
                    <p className="mt-1.5 text-[0.8rem] text-muted">
                      <Icon.pin size={12} className="mr-1 inline" />{t("bonus.restricted")}
                    </p>
                  </div>
                </div>
                <div className="border-t border-line-soft bg-canvas px-5 py-3.5">
                  <dl className="grid grid-cols-2 gap-3 text-[0.78rem]">
                    <div><dt className="text-muted">Minimum alışveriş</dt><dd className="tabular font-semibold">{b.minPurchaseCents ? money(b.minPurchaseCents, b.currency as Currency, lang) : "—"}</dd></div>
                    <div><dt className="text-muted">Son geçerlilik</dt><dd className="tabular font-semibold">{b.expiresAt ? shortDate(b.expiresAt, lang) : "—"}</dd></div>
                  </dl>
                  {b.status === "AVAILABLE" ? (
                    <div className="mt-3.5 flex items-center gap-2">
                      <Button size="sm" href={`/isletme/${b.businessSlug}`} icon={<Icon.qr size={14} />}>Mağazada kullan</Button>
                      <span className="text-[0.74rem] text-muted">Kasada bu hakkı göster; işletme indirimi uygular.</span>
                    </div>
                  ) : null}
                  {b.status === "USED" && b.redeemedAt ? <p className="mt-3 text-[0.76rem] text-muted">Kullanıldı: {shortDate(b.redeemedAt, lang)}</p> : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------- ACTIVITY ------------------------------ */
  if (section === "activity") {
    return (
      <div>
        <DashSectionHead title={t("cust.activity")} desc="QR okutma, doğrulamaya gönderme ve işletme onayı ayrı olaylardır." />
        <Notice tone="info" icon={<Icon.qr size={16} />} className="mb-5">
          {t("qr.scannedNote")} Doğrulanmış kullanım, işletme yetkilisinin onayıyla kaydedilir.
        </Notice>
        <Table>
          <thead><tr><Th>Kampanya</Th><Th>İşletme</Th><Th>Okutulma</Th><Th>Durum</Th><Th>İşletmenin bildirdiği indirim</Th></tr></thead>
          <tbody>
            {local.activity.map((a) => (
              <tr key={a.id}>
                <Td strong>{a.campaignTitle}</Td>
                <Td>{a.businessName}</Td>
                <Td>{a.scannedAt ? shortDate(a.scannedAt, lang) : "—"}</Td>
                <Td><StatusBadge status={a.status} lang={lang} /></Td>
                <Td right>{a.reportedDiscountCents ? <span className="tabular">{money(a.reportedDiscountCents, a.currency as Currency, lang)}</span> : <span className="text-muted">bildirilmedi</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  /* ---------------------------- NOTIFICATIONS ---------------------------- */
  if (section === "notifications") {
    return (
      <div>
        <DashSectionHead title={t("cust.notifications")} action={
          <Button size="sm" variant="secondary" onClick={async () => { await api({ action: "read-all-notifications" }, "Tümü okundu"); setLocal((p) => ({ ...p, notifications: p.notifications.map((n) => ({ ...n, read: true })) })); }}>
            Tümünü okundu işaretle
          </Button>
        } />
        {local.notifications.length === 0 ? <EmptyState icon={<Icon.bell size={22} />} title="Bildirim yok" /> : (
          <ul className="space-y-3">
            {local.notifications.map((n) => (
              <li key={n.id}>
                <Card className={`flex items-start gap-4 ${n.read ? "opacity-70" : ""}`}>
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] ${n.kind === "BONUS" ? "bg-positive-soft text-positive" : n.kind === "REFERRAL" ? "bg-accent-soft text-accent-700" : "bg-canvas text-muted"}`}>
                    {n.kind === "BONUS" ? <Icon.bonus size={17} /> : n.kind === "REFERRAL" ? <Icon.users size={17} /> : <Icon.bell size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9rem] font-semibold text-ink">{n.title}</p>
                    <p className="mt-0.5 text-[0.84rem] leading-relaxed text-muted">{n.body}</p>
                    <p className="mt-1.5 text-[0.74rem] text-muted-2">{n.createdAt ? relative(n.createdAt, lang) : ""}</p>
                  </div>
                  {n.link ? <Button size="sm" variant="ghost" href={n.link}>Aç</Button> : null}
                  {!n.read ? <IconButton label="Okundu işaretle" onClick={async () => { await api({ action: "read-notification", id: n.id }, "Okundu"); setLocal((p) => ({ ...p, notifications: p.notifications.map((x) => x.id === n.id ? { ...x, read: true } : x) })); }}><Icon.check size={15} /></IconButton> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /* ------------------------------- PROFILE ------------------------------- */
  return <ProfileSection user={user} lang={lang} currency={currency} onSaved={(p) => { toast.push({ title: "Tercihler kaydedildi", tone: "positive" }); void p; }} />;
}

function ProfileSection({ user, lang, currency, onSaved }: { user: NonNullable<SessionLite>; lang: Lang; currency: Currency; onSaved: (p: Record<string, string>) => void }) {
  const [form, setForm] = useState<{ name: string; district: string; lang: Lang; currency: Currency; country: string }>({
    name: user.name,
    district: "",
    lang,
    currency,
    country: "TR",
  });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "preferences", ...form }) });
    const json = await res.json();
    setBusy(false);
    if (json.ok) { onSaved(form); window.location.reload(); }
    else toast.push({ title: json.error ?? "Kaydedilemedi", tone: "danger" });
  }

  return (
    <div>
      <DashSectionHead title="Profil ve Tercihler" desc="Dil, ülke ve para birimi ayrı ayarlardır; para birimi seçimi fiyatları dönüştürmez." />
      <Card className="max-w-2xl">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad Soyad"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="İlçe / Semt"><Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="Kadıköy" /></Field>
          <Field label="Dil">
            <Select value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value as Lang })}>
              <option value="tr">Türkçe</option><option value="en">English</option><option value="ka">ქართული</option>
            </Select>
          </Field>
          <Field label="Görüntüleme para birimi" hint="Kampanyalar işletmenin tanımladığı para biriminde gösterilir.">
            <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
              <option value="TRY">TRY — Türk Lirası</option><option value="USD">USD — Dolar</option>
              <option value="GEL">GEL — Lari</option><option value="EUR">EUR — Euro</option>
            </Select>
          </Field>
          <div className="sm:col-span-2"><Button type="submit" loading={busy}>Değişiklikleri kaydet</Button></div>
        </form>
      </Card>
      <div className="mt-6 max-w-2xl">
        <Card>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Hesap</p>
          <div className="mt-3 space-y-2 text-[0.86rem]">
            <p><span className="text-muted">E-posta:</span> <strong>{user.email}</strong></p>
            <p><span className="text-muted">Rol:</span> <strong>{user.role === "ADMIN" ? "Yönetici" : user.role === "BUSINESS" ? "İşletme" : "Müşteri"}</strong></p>
            <p><span className="text-muted">Davet kodu:</span> <strong className="tabular">{user.referralCode}</strong></p>
          </div>
          <div className="mt-4"><Progress value={70} tone="positive" /><p className="mt-2 text-[0.78rem] text-muted">Profil tamamlama %70 — telefon ve konum ekleyerek kişiselleştirmeyi artır.</p></div>
        </Card>
      </div>
    </div>
  );
}

export function CustomerProviders({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

export { QrPanel };
