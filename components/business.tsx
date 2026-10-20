"use client";

import { useEffect, useState } from "react";
import {
  AreaLine, Badge, BarChart, Button, Card, Checkbox, Dialog, Donut, EmptyState, Field, Funnel, HBars,
  Icon, Input, Kpi, Notice, Progress, QrPanel, Select, Table, Tabs, Td, Textarea, Th, Toggle, VideoModule, useToast,
} from "@/components/ds";
import { DashSectionHead, StatusBadge, type NavItem } from "@/components/Dash";
import { makeT } from "@/lib/i18n";
import { CAMPAIGN_TEMPLATES, applyCampaignTemplate, type CampaignTemplate } from "@/lib/campaignTemplates";
import { daysUntil, money, num, pct, shortDate, type Currency, type Lang } from "@/lib/money";
import type { getBusinessData } from "@/lib/queries";
import { getBrowserSupabase } from "@/lib/supabase/client";

export type BusinessData = Awaited<ReturnType<typeof getBusinessData>>;
type NonNull<T> = T extends null ? never : T;
type BD = NonNull<BusinessData>;

export const BUSINESS_NAV: NavItem[] = [
  { key: "overview", label: "Genel Bakış", icon: <Icon.chart size={16} />, group: "İşletme" },
  { key: "profile", label: "İşletme Profili", icon: <Icon.store size={16} />, group: "İşletme" },
  { key: "campaigns", label: "Kampanyalar", icon: <Icon.tag size={16} />, group: "Pazarlama" },
  { key: "qr", label: "QR Kampanyaları", icon: <Icon.qr size={16} />, group: "Pazarlama" },
  { key: "traffic", label: "Müşteri Trafiği", icon: <Icon.users size={16} />, group: "Pazarlama" },
  { key: "referrals", label: "Yönlendirme Etkinliği", icon: <Icon.share size={16} />, group: "Pazarlama" },
  { key: "advertising", label: "Reklam", icon: <Icon.megaphone size={16} />, group: "Pazarlama" },
  { key: "ai", label: "AI Pazarlama", icon: <Icon.spark size={16} />, group: "AI" },
  { key: "growth", label: "28 Günlük Program", icon: <Icon.calendar size={16} />, group: "AI" },
  { key: "studio", label: "Video ve İçerik Stüdyosu", icon: <Icon.video size={16} />, group: "AI" },
  { key: "analytics", label: "Analitik", icon: <Icon.eye size={16} />, group: "AI" },
  { key: "plans", label: "Planlar ve Hizmetler", icon: <Icon.layers size={16} />, group: "Faturalandırma" },
  { key: "invoices", label: "Faturalar", icon: <Icon.receipt size={16} />, group: "Faturalandırma" },
  { key: "settings", label: "Ayarlar", icon: <Icon.settings size={16} />, group: "Faturalandırma" },
];

const EMPTY = {
  title: "", description: "", terms: "", type: "PERCENT", discountPercent: 15, discountAmountCents: 0,
  minBasketCents: 0, currency: "TRY", startsAt: "", endsAt: "", timeStart: "", timeEnd: "",
  eligibleItems: "", exclusions: "", imageUrl: "", perCustomerLimit: 2, usageLimit: 500, qrEnabled: true,
};

/* İSTEK (a): işletme sahibi işletme profilini EKSİKSİZ doldurmalı.
 * Zorunlu alanlar — istemci doğrulaması, eksiklik ölçer ve kampanya kapısı bu listeden türetilir;
 * sunucu tarafında birebir karşılığı lib/data/supabase-actions.ts'tedir (requireCompleteProfile). */
const PROFILE_REQUIRED = [
  { key: "name", label: "İşletme adı" },
  { key: "subCategory", label: "Alt kategori" },
  { key: "phone", label: "Telefon" },
  { key: "address", label: "Adres" },
  { key: "description", label: "Kısa açıklama" },
] as const;
const PROFILE_OPTIONAL = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
  { key: "website", label: "Web sitesi" },
  { key: "story", label: "İşletme hikâyesi" },
] as const;
type ProfileFieldKey = (typeof PROFILE_REQUIRED)[number]["key"] | (typeof PROFILE_OPTIONAL)[number]["key"];
type ProfileForm = Record<ProfileFieldKey, string>;
/** Eksik ZORUNLU profil alanlarının etiketleri (kampanya kapısı bunu kullanır). */
function profileMissingOf(vals: ProfileForm | Record<string, unknown>): string[] {
  return PROFILE_REQUIRED.filter((r) => String((vals as Record<string, unknown>)[r.key] ?? "").trim().length < 2).map((r) => r.label);
}

export type StudioVideo = {
  id: string; topic: string; title: string; durationSec: number;
  scenes: { at: string; visual: string; caption: string }[];
  captions: Record<string, string[]>; steps: string[]; poster: string | null;
  storagePath: string | null;
  renderStatus: string; status: string;
};

export default function BusinessDashboard({ data, lang, currency, section, videos = [], range = 14 }: { data: BD; lang: Lang; currency: Currency; section: string; videos?: StudioVideo[]; range?: number }) {
  const t = makeT(lang);
  const toast = useToast();
  const [d, setD] = useState<BD>(data);
  const m = d.metrics;

  async function post(route: string, body: Record<string, unknown>, ok: string, after?: () => void) {
    const res = await fetch(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({ ok: false }));
    if (json.ok) { toast.push({ title: ok, tone: "positive" }); after?.(); if (route !== "/api/qr") setTimeout(() => window.location.reload(), 700); }
    else toast.push({ title: json.error ?? "İşlem başarısız", desc: json.errors ? Object.values(json.errors).join(" ") : undefined, tone: "danger" });
    return json;
  }

  /* -------------------------------- OVERVIEW ------------------------------ */
  if (section === "overview") {
    const expiring = d.campaigns.filter((c) => { const l = daysUntil(c.endsAt); return c.status === "PUBLISHED" && l !== null && l >= 0 && l <= 7; });
    const best = [...d.campaigns].sort((a, b) => b.verifiedCount - a.verifiedCount)[0];
    return (
      <div>
        <DashSectionHead eyebrow={t("biz.overview")} title={`${d.biz.name} — genel bakış`}
          desc="Yalnızca sistem tarafından toplanan olaylar gösterilir. Tıklama, QR okutma ve doğrulanmış kullanım ayrı metriklerdir."
          action={<Badge tone="warning">Demo verisi</Badge>} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Kpi label={t("kpi.impressions")} value={m.impressions} icon={<Icon.eye size={16} />} spark={m.views14} delta={4.2} />
          <Kpi label={t("kpi.clicks")} value={m.clicks} icon={<Icon.cursor size={16} />} spark={m.clicks14} delta={-1.8} />
          <Kpi label={t("kpi.visits")} value={m.pageVisits} icon={<Icon.store size={16} />} />
          <Kpi label={t("kpi.scans")} value={m.qrScans} icon={<Icon.qr size={16} />} hint="QR okutma sayısı" />
          <Kpi label={t("kpi.verified")} value={m.verifiedUsage} icon={<Icon.verified size={16} />} hint="İşletme onayıyla doğrulanan kullanım" />
          <Kpi label={t("kpi.referralTraffic")} value={m.referralTraffic} icon={<Icon.share size={16} />} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <Card>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Son 14 gün · ölçülen olaylar</p>
            <div className="mt-4">
              <AreaLine
                labels={Array.from({ length: 14 }, (_, i) => `${i + 1}`)}
                series={[
                  { name: "Kampanya görüntüleme", data: m.views14, color: "#0b1220" },
                  { name: "Tıklama", data: m.clicks14, color: "#ff4a17" },
                  { name: "QR okutma", data: m.series14, color: "#0e9f6e" },
                ]}
              />
            </div>
          </Card>
          <div className="space-y-5">
            <Card>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">En iyi performans</p>
              {best ? (
                <div className="mt-3">
                  <p className="font-display text-[1.05rem] font-bold text-ink">{best.title}</p>
                  <p className="mt-1 text-[0.82rem] text-muted">{best.verifiedCount} doğrulanmış kullanım · {best.scans} QR okutma</p>
                  <div className="mt-3"><Progress value={best.views ? (best.verifiedCount / best.views) * 100 : 0} /></div>
                  <p className="mt-2 text-[0.76rem] text-muted">Dönüşüm (görüntüleme → doğrulanmış): <strong className="tabular text-ink">{pct(best.views ? best.verifiedCount / best.views : 0, 1)}</strong></p>
                </div>
              ) : <EmptyState title="Henüz kampanya yok" />}
            </Card>
            {expiring.length ? (
              <Notice tone="warning" icon={<Icon.clock size={16} />} title="Süresi yakında doluyor">
                {expiring.map((c) => <p key={c.id}>{c.title} — {daysUntil(c.endsAt)} gün kaldı ({shortDate(c.endsAt!, lang)})</p>)}
              </Notice>
            ) : null}
            <Card>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">AI pazarlama ilerlemesi</p>
                <Icon.spark size={16} className="text-accent" />
              </div>
              {(() => {
                const total = d.plan?.days.length ?? 28;
                const done = d.plan?.days.filter((x) => x.done).length ?? 0;
                const drafts = d.contents.filter((c) => c.status === "DRAFT").length;
                const published = d.contents.filter((c) => c.status === "PUBLISHED").length;
                return (
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between text-[0.84rem]">
                      <span className="text-muted">28 günlük program</span>
                      <span className="tabular font-semibold text-ink">{done}/{total} görev</span>
                    </div>
                    <div className="mt-2"><Progress value={total ? (done / total) * 100 : 0} /></div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line-soft pt-3 text-center">
                      {[["Üretilen", d.contents.length], ["Onay bekleyen", drafts], ["Yayında", published]].map(([l, v]) => (
                        <div key={String(l)}>
                          <dt className="tabular text-[1.15rem] font-semibold text-ink">{String(v)}</dt>
                          <dd className="mt-0.5 text-[0.68rem] uppercase tracking-[0.08em] text-muted">{String(l)}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-[0.76rem] leading-relaxed text-muted">
                      AI içerikleri taslak olarak üretilir; onayınız olmadan yayınlanmaz ve ücretli reklam başlatılmaz.
                    </p>
                  </div>
                );
              })()}
            </Card>

            <Card>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Aktif kampanyalar</p>
              <ul className="mt-3 space-y-2.5">
                {d.campaigns.filter((c) => c.status === "PUBLISHED").slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 border-b border-line-soft pb-2.5 last:border-0">
                    <span className="min-w-0 truncate text-[0.85rem] font-medium text-ink">{c.title}</span>
                    <StatusBadge status={c.moderationStatus} lang={lang} />
                  </li>
                ))}
                {d.campaigns.filter((c) => c.status === "PUBLISHED").length === 0 ? (
                  <li className="py-2 text-[0.84rem] text-muted">Yayında kampanya yok.</li>
                ) : null}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------------- PROFILE ------------------------------ */
  if (section === "profile") return <ProfileSection d={d} onPost={post} lang={lang} />;

  /* -------------------------------- CAMPAIGNS ----------------------------- */
  if (section === "campaigns") {
    // İSTEK (a): eksiksiz profil — kampanya oluşturma/yayınlama kapısı (sunucuda da zorlanır).
    const profileMissing = profileMissingOf(d.biz as unknown as Record<string, unknown>);
    return <CampaignsSection d={d} lang={lang} currency={currency} post={post} profileMissing={profileMissing} />;
  }

  /* ------------------------------------ QR -------------------------------- */
  if (section === "qr") return <QrSection d={d} lang={lang} post={post} />;


  /* --------------------------------- TRAFFIC ------------------------------ */
  if (section === "traffic") {
    const byChannel = [
      { label: "Mağaza içi QR", value: d.usages.filter((u) => u.channel === "IN_STORE").length },
      { label: "Kampanya bağlantısı", value: d.usages.filter((u) => u.channel === "LINK").length },
      { label: "Davet (referral)", value: d.usages.filter((u) => u.channel === "REFERRAL").length },
    ];
    return (
      <div>
        <DashSectionHead eyebrow={t("biz.traffic")} title="Müşteri trafiği" desc="Kanal bazlı yönlendirme; doğrulanmış kullanım ayrı gösterilir." />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Kanal dağılımı</p>
            <Donut slices={[{ label: byChannel[0].label, value: byChannel[0].value, color: "#0b1220" }, { label: byChannel[1].label, value: byChannel[1].value, color: "#ff4a17" }, { label: byChannel[2].label, value: byChannel[2].value, color: "#0e9f6e" }]} center={{ value: num(m.qrScans, lang), label: "toplam okutma" }} /></Card>
          <Card><p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Kampanya bazlı doğrulanmış kullanım</p>
            <HBars rows={d.campaigns.map((c) => ({ label: c.title, value: c.verifiedCount, sub: `${c.scans} QR okutma · ${num(c.clicks, lang)} tıklama` }))} /></Card>
        </div>
        <div className="mt-6"><Card><p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">14 günlük okutma</p>
          <BarChart data={m.series14} labels={m.series14.map((_, i) => `${i + 1}`)} formatValue={(v) => `${v} okutma`} /></Card></div>
      </div>
    );
  }

  /* -------------------------------- REFERRALS ----------------------------- */
  if (section === "referrals") return (
    <div>
      <DashSectionHead eyebrow={t("biz.referrals")} title="Yönlendirme etkinliği" desc="Davet yoluyla gelen müşteriler ve bu mağazaya bağlı oluşan Damping Bonus hakları." />
      <Notice tone="info" icon={<Icon.info size={16} />} className="mb-5">
        Bonus, müşterinin parası veya DampingVar&apos;ın borcu değildir; yalnızca <strong>bu mağazada</strong> geçerli indirim hakkıdır ve işletme kasasında uygulanır.
      </Notice>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Referral kaynaklı okutma" value={d.usages.filter((u) => u.channel === "REFERRAL").length} />
        <Kpi label="Oluşan bonus hakkı" value={d.bonusGrants.length} />
        <Kpi label="Kullanılan bonus" value={d.bonusGrants.filter((b) => b.status === "USED").length} />
      </div>
      <div className="mt-6">
        <Table>
          <thead><tr><Th>Müşteri</Th><Th>Durum</Th><Th>Tutar</Th><Th>Oluşturma</Th></tr></thead>
          <tbody>
            {d.bonusGrants.map((b) => (
              <tr key={b.id}><Td strong>{b.userName}</Td><Td><StatusBadge status={b.status} lang={lang} /></Td>
                <Td right><span className="tabular">{money(b.valueCents, b.currency as Currency, lang)}</span></Td>
                <Td>{b.createdAt ? shortDate(b.createdAt, lang) : "—"}</Td></tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );

  /* ------------------------------- ADVERTISING ---------------------------- */
  if (section === "advertising") return <AdvertisingSection d={d} lang={lang} post={post} />;

  /* ------------------------------------ AI -------------------------------- */
  if (section === "ai") return <AiSection d={d} post={post} />;

  /* --------------------------------- GROWTH ------------------------------- */
  if (section === "growth") return <GrowthSection d={d} post={post} lang={lang} />;

  /* --------------------------------- STUDIO ------------------------------- */
  if (section === "studio") return <StudioSection d={d} post={post} videos={videos} lang={lang} />;

  /* -------------------------------- ANALYTICS ----------------------------- */
  if (section === "analytics") return <AnalyticsSection d={d} lang={lang} range={range} />;

  /* ---------------------------------- PLANS ------------------------------- */
  if (section === "plans") return (
    <div>
      <DashSectionHead eyebrow={t("biz.plans")} title="Planlar ve hizmetler" desc="Paket fiyatları yapılandırılabilir; DampingVar hizmet bedelini ayrıca faturalandırır." />
      <Notice tone="info" icon={<Icon.info size={16} />} className="mb-5">Hizmet bedelleri ile müşteriye uygulanan indirimler ayrı alanlardır. DampingVar müşteri ödemesini tahsil etmez.</Notice>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {d.packages.map((p) => (
          <Card key={p.code} className={p.code === d.biz.planCode ? "border-accent ring-1 ring-accent/25" : ""}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-[1.05rem] font-bold">{p.name}</p>
              {p.code === d.biz.planCode ? <Badge tone="accent">Mevcut</Badge> : null}
            </div>
            <p className="tabular mt-2 text-[1.5rem] font-semibold text-ink">{p.priceMonthlyCents === 0 ? "Ücretsiz" : money(p.priceMonthlyCents, currency, lang)}<span className="text-[0.8rem] font-normal text-muted"> / ay</span></p>
            <ul className="mt-4 space-y-2">{p.features.slice(0, 6).map((f) => <li key={f} className="flex gap-2 text-[0.82rem] text-ink-700"><Icon.check size={14} className="mt-0.5 shrink-0 text-positive" />{f}</li>)}</ul>
            <Button className="mt-5 w-full" variant={p.code === d.biz.planCode ? "secondary" : "primary"} size="sm" disabled={p.code === d.biz.planCode}
              onClick={() => toast.push({ title: "Talep iletildi", desc: `${p.name} için sözleşme talebin satış ekibine iletildi. Faturalandırma sözleşmeye göre yapılır.`, tone: "positive" })}>
              {p.code === d.biz.planCode ? "Mevcut paketin" : "Paketi seç"}
            </Button>
          </Card>
        ))}
      </div>
      <div className="mt-6"><Card><p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Sözleşmendeki hizmet bedeli kuralları</p>
        <Table className="border-0"><thead><tr><Th>Hizmet türü</Th><Th>Tür</Th><Th right>Tutar / Oran</Th><Th>Hesaplama</Th><Th>Geçerlilik</Th></tr></thead>
          <tbody>{d.feeRules.map((f) => (<tr key={f.id}><Td strong>{f.serviceType}</Td><Td>{f.kind === "FIXED" ? "Sabit" : "Yüzde"}</Td>
            <Td right><span className="tabular">{f.kind === "FIXED" ? money(f.amountCents, currency, lang) : pct(f.rate, 1)}</span></Td>
            <Td>{f.calculationBase}</Td><Td>{f.validFrom ? shortDate(f.validFrom, lang) : "—"} {f.validTo ? `→ ${shortDate(f.validTo, lang)}` : ""}</Td></tr>))}</tbody></Table></Card></div>
    </div>
  );

  /* -------------------------------- INVOICES ------------------------------ */
  if (section === "invoices") return (
    <div>
      <DashSectionHead eyebrow={t("biz.invoices")} title="Faturalar" desc="DampingVar hizmet bedeli faturaları. Müşteri indirimi veya tahsilatı burada yer almaz." />
      <Notice tone="warning" icon={<Icon.alert size={16} />} className="mb-5">
        Fatura kesimi, muhasebe ve e-fatura entegrasyonu ülke mevzuatına göre ayrıca doğrulanmalıdır. Bu ekrandaki kayıtlar hizmet bedeli durum takibidir.
      </Notice>
      {d.invoices.map((inv) => (
        <Card key={inv.id} className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="tabular text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-muted">{inv.number}</p>
              <p className="mt-1 font-display text-[1.1rem] font-bold">Dönem: {inv.periodStart ? shortDate(inv.periodStart, lang) : "—"} → {inv.periodEnd ? shortDate(inv.periodEnd, lang) : "—"}</p>
              <p className="mt-1 text-[0.82rem] text-muted">Son ödeme: {inv.dueDate ? shortDate(inv.dueDate, lang) : "—"}{inv.paidAt ? ` · Ödendi: ${shortDate(inv.paidAt, lang)}` : ""}</p>
            </div>
            <div className="text-right">
              <StatusBadge status={inv.status} lang={lang} />
              <p className="tabular mt-2 text-[1.5rem] font-semibold">{money(inv.totalCents, inv.currency as Currency, lang)}</p>
              <p className="tabular text-[0.78rem] text-muted">ara toplam {money(inv.subtotalCents, inv.currency as Currency, lang)} + vergi {money(inv.taxCents, inv.currency as Currency, lang)}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-line-soft pt-3">
            <Table className="border-0"><thead><tr><Th>Hizmet</Th><Th right>Adet</Th><Th right>Birim</Th><Th right>Tutar</Th></tr></thead>
              <tbody>{inv.items.map((it) => (<tr key={it.id}><Td><span className="font-medium">{it.description}</span><span className="ml-2 text-[0.72rem] text-muted">{it.serviceType}{it.appliedRate ? ` · ${pct(it.appliedRate, 1)}` : ""}</span></Td>
                <Td right>{it.quantity}</Td><Td right><span className="tabular">{money(it.unitPriceCents, inv.currency as Currency, lang)}</span></Td>
                <Td right strong><span className="tabular">{money(it.amountCents, inv.currency as Currency, lang)}</span></Td></tr>))}</tbody></Table>
          </div>
          {inv.note ? <p className="mt-3 text-[0.78rem] text-muted">{inv.note}</p> : null}
        </Card>
      ))}
      {d.invoices.length === 0 ? <EmptyState icon={<Icon.receipt size={22} />} title="Fatura kaydı yok" /> : null}
    </div>
  );

  /* -------------------------------- SETTINGS ------------------------------ */
  return (
    <div>
      <DashSectionHead eyebrow={t("biz.settings")} title="Ayarlar" desc="Personel rolleri ve işletme tercihleri." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <p className="border-b border-line px-5 py-3.5 font-display text-[1rem] font-bold">Personel ve roller</p>
          <Table className="border-0 rounded-none"><thead><tr><Th>Ad</Th><Th>E-posta</Th><Th>Rol</Th></tr></thead>
            <tbody>{d.staff.map((s) => (<tr key={s.id}><Td strong>{s.name}</Td><Td>{s.email}</Td><Td><Badge tone={s.role === "OWNER" ? "accent" : s.role === "MANAGER" ? "dark" : "neutral"}>{s.role}</Badge></Td></tr>))}</tbody></Table>
          <div className="border-t border-line px-5 py-4 text-[0.8rem] leading-relaxed text-muted">
            Personel: QR okutabilir, kullanımı doğrulamaya gönderebilir. Yönetici: kampanya oluşturur, içerik onaylar, kullanım doğrular. Sahip: profil, reklam ve fatura görüntüleme dahil tüm yetkiler. Yetkiler sunucuda doğrulanır.
          </div>
        </Card>
        <Card>
          <p className="font-display text-[1rem] font-bold">Görünürlük tercihleri</p>
          <div className="mt-4 space-y-4">
            {[["Arama sonuçlarında göster", true], ["Sponsorlu yerleşimlere dahil ol", d.biz.featured], ["Kampanya bitişinde otomatik hatırlatma", true]].map(([label, val]) => (
              <div key={String(label)} className="flex items-center justify-between gap-4 border-b border-line-soft pb-3 last:border-0">
                <span className="text-[0.86rem] text-ink-700">{String(label)}</span>
                <Toggle checked={Boolean(val)} onChange={(v) => toast.push({ title: v ? "Etkinleştirildi" : "Devre dışı", desc: String(label), tone: "neutral" })} label={String(label)} />
              </div>
            ))}
          </div>
          <Notice tone="neutral" className="mt-5" icon={<Icon.lock size={16} />}>
            Ücretli yerleşimler “Sponsorlu” etiketiyle gösterilir. AI veya sistem, sen onaylamadan ücretli reklam başlatmaz.
          </Notice>
        </Card>
      </div>
    </div>
  );
}


/* ------------------------------ alt bölümler ------------------------------ */

function ProfileSection({ d, onPost, lang }: { d: BD; onPost: (r: string, b: Record<string, unknown>, m: string) => Promise<unknown>; lang: Lang }) {
  const [f, setF] = useState<ProfileForm>({
    name: d.biz.name, description: d.biz.description ?? "", story: d.biz.story ?? "", phone: d.biz.phone ?? "",
    whatsapp: d.biz.whatsapp ?? "", instagram: d.biz.instagram ?? "", website: d.biz.website ?? "", address: d.biz.address,
    subCategory: d.biz.subCategory ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // İSTEK (a): eksiksiz profil — canlı ölçer (tüm alanlar) + zorunlu alan doğrulaması.
  const missingNow = profileMissingOf(f);
  const filledAll = [...PROFILE_REQUIRED, ...PROFILE_OPTIONAL].filter((r) => String(f[r.key] ?? "").trim().length >= 2).length;
  const pctComplete = Math.round((filledAll / (PROFILE_REQUIRED.length + PROFILE_OPTIONAL.length)) * 100);
  return (
    <div>
      <DashSectionHead eyebrow={t2(lang)} title="İşletme profili" desc="Bu bilgiler kamuya açık işletme sayfanda, aramada ve AI içerik üretiminde kullanılır." />
      <Card>
        <div className="mb-5 rounded-[4px] border border-line bg-canvas px-4 py-3">
          <div className="flex items-center justify-between text-[0.84rem]">
            <span className="font-semibold text-ink">Profil tamamlama</span>
            <span className="tabular font-bold text-accent-700">%{pctComplete}</span>
          </div>
          <div className="mt-2"><Progress value={pctComplete} /></div>
          {missingNow.length ? (
            <p className="mt-2 text-[0.78rem] leading-relaxed text-warning">
              Eksik zorunlu alanlar: {missingNow.join(", ")}. Kampanya oluşturmak ve yayınlamak için profilinin eksiksiz olması gerekir.
            </p>
          ) : (
            <p className="mt-2 text-[0.78rem] text-muted">Tüm zorunlu alanlar dolu. İsteğe bağlı alanları doldurmak profilini öne çıkarır.</p>
          )}
        </div>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const errs: Record<string, string> = {};
          for (const r of PROFILE_REQUIRED) if (String(f[r.key] ?? "").trim().length < 2) errs[r.key] = `${r.label} zorunludur.`;
          if (Object.keys(errs).length) {
            setErrors(errs);
            toast.push({ title: "Profil eksiksiz", desc: `Zorunlu alanları doldur: ${Object.keys(errs).map((k) => PROFILE_REQUIRED.find((r) => r.key === k)?.label).join(", ")}.`, tone: "danger" });
            return;
          }
          setErrors({});
          setBusy(true);
          await onPost("/api/business", { action: "profile", ...f }, "Profil güncellendi");
          setBusy(false);
        }}>
          <Field label="İşletme adı" required error={errors.name}><Input value={f.name} invalid={!!errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Alt kategori" required error={errors.subCategory} hint="Örn. Ev yemekleri, Kahve, Kuaför"><Input value={f.subCategory} invalid={!!errors.subCategory} onChange={(e) => setF({ ...f, subCategory: e.target.value })} /></Field>
          <Field label="Telefon" required error={errors.phone}><Input value={f.phone} invalid={!!errors.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="WhatsApp"><Input value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></Field>
          <Field label="Instagram"><Input value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} /></Field>
          <Field label="Web sitesi"><Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></Field>
          <Field label="Adres" required error={errors.address} className="md:col-span-2"><Input value={f.address} invalid={!!errors.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Kısa açıklama" required error={errors.description} className="md:col-span-2" hint="AI içerikleri bu açıklamaya ve ürün/hizmet bilgilerine göre uyarlanır."><Textarea rows={3} value={f.description} invalid={!!errors.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="İşletme hikâyesi" className="md:col-span-2"><Textarea rows={3} value={f.story} onChange={(e) => setF({ ...f, story: e.target.value })} /></Field>
          <div className="md:col-span-2"><Button type="submit" loading={busy}>Değişiklikleri kaydet</Button></div>
        </form>
      </Card>
      <div className="mt-6"><Card><p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Çalışma saatleri</p>
        <ul className="space-y-2">{d.hours.map((h) => (<li key={h.id} className="flex items-center justify-between border-b border-line-soft pb-2 text-[0.85rem] last:border-0">
          <span className="text-ink-700">{["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"][h.dayOfWeek]}</span>
          <span className="tabular font-medium">{h.closed ? "Kapalı" : `${h.opensAt} – ${h.closesAt}`}</span></li>))}</ul></Card></div>
    </div>
  );
}
const t2 = (lang: Lang) => makeT(lang)("biz.profile");

function CampaignsSection({ d, lang, currency, post, profileMissing }: { d: BD; lang: Lang; currency: Currency; post: (r: string, b: Record<string, unknown>, m: string) => Promise<unknown>; profileMissing: string[] }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState<null | { id: string; status: string; title: string }>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [tplKey, setTplKey] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const t = makeT(lang);
  const toast = useToast();
  const [imgUploading, setImgUploading] = useState(false);

  function openNew() {
    // İSTEK (a): eksiksiz işletme profili olmadan yeni kampanya açılmaz (sunucuda da zorlanır).
    if (profileMissing.length) {
      toast.push({
        title: "İşletme profili eksiksiz",
        desc: `Eksik zorunlu alanlar: ${profileMissing.join(", ")}. Yeni kampanya oluşturmak için İşletme Profili'ni tamamla.`,
        tone: "danger",
      });
      return;
    }
    setEditing(null); setF({ ...EMPTY, currency: d.biz.currency ?? currency }); setErrors({}); setPreview(false); setTplKey(""); setOpen(true);
  }
  function openEdit(id: string) {
    const c = d.campaigns.find((x) => x.id === id); if (!c) return;
    setEditing(id);
    // Not: para alanları formda BİRİM tutar olarak tutulur; kaydetmede ×100'e çevrilir.
    setF({ ...EMPTY, title: c.title, description: c.description ?? "", terms: c.terms ?? "", type: c.type, discountPercent: c.discountPercent, discountAmountCents: c.discountAmountCents / 100, minBasketCents: c.minBasketCents / 100, currency: c.currency, startsAt: (c.startsAt ?? "").slice(0, 10), endsAt: (c.endsAt ?? "").slice(0, 10), timeStart: c.timeStart ?? "", timeEnd: c.timeEnd ?? "", eligibleItems: c.eligibleItems.join(", "), exclusions: c.exclusions.join(", "), imageUrl: c.imageUrl ?? "", perCustomerLimit: c.perCustomerLimit, usageLimit: c.usageLimit ?? 500, qrEnabled: c.qrEnabled });
    setErrors({}); setPreview(false); setTplKey(""); setOpen(true);
  }

  /** İSTEK (b): hazır taslak örneği seçimi formu doldurur (yayın hâlâ işletme onaylı). */
  function applyTpl(tpl: CampaignTemplate) {
    setTplKey(tpl.key);
    setF((prev) => ({ ...prev, ...applyCampaignTemplate(tpl) }));
    setErrors({});
  }

  /** İSTEK (c): AI, işletme profili + ürün/hizmetlere göre uyarlanmış taslağı forma aktarır (POST /api/ai — yine taslak). */
  async function aiAdapt() {
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "campaign",
          goal: tplKey ? `Hazır taslağı işletmeime uyarla: ${CAMPAIGN_TEMPLATES.find((x) => x.key === tplKey)?.label ?? "genel kampanya"}` : "Yeni kampanya taslağı hazırla",
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }) as Record<string, unknown>);
      if (json.ok && json.fields) {
        setF((prev) => ({ ...prev, ...(json.fields as Partial<typeof EMPTY>) }));
        setErrors({});
        toast.push({ title: "AI taslağı forma aktarıldı", desc: "İşletme adın, ilçen, kategorin, ürün ve hizmetlerine göre uyarlandı; yayın öncesi gözden geçir.", tone: "positive" });
      } else {
        toast.push({ title: String(json.error ?? "AI üretimi başarısız"), tone: "danger" });
      }
    } catch {
      toast.push({ title: "Ağ hatası oluştu", desc: "AI çağrısı tamamlanamadı; tekrar dene.", tone: "danger" });
    }
    setAiBusy(false);
  }

  /** Kampanya görselini tarayıcıdan doğrudan Supabase Storage'a yükler (FAZ 11). */
  async function uploadCampaignImage(file: File) {
    const MAX = 5 * 1024 * 1024;
    const okTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!okTypes.includes(file.type)) {
      toast.push({ title: "Geçersiz dosya türü", desc: "Yalnızca JPG, PNG veya WebP yüklenebilir.", tone: "danger" });
      return;
    }
    if (file.size > MAX) {
      toast.push({ title: "Dosya çok büyük", desc: "Görsel en fazla 5MB olabilir.", tone: "danger" });
      return;
    }
    setImgUploading(true);
    try {
      const sb = getBrowserSupabase();
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${d.biz.id}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await sb.storage.from("campaign-media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.push({ title: "Yükleme başarısız", desc: error.message, tone: "danger" });
        return;
      }
      const { data: pub } = sb.storage.from("campaign-media").getPublicUrl(data.path);
      setF((prev) => ({ ...prev, imageUrl: pub.publicUrl }));
      toast.push({ title: "Görsel yüklendi", desc: "Kampanya görseli forma eklendi.", tone: "positive" });
    } catch {
      toast.push({ title: "Yükleme başarısız", desc: "Ağ hatası oluştu; tekrar dene.", tone: "danger" });
    } finally {
      setImgUploading(false);
    }
  }

  function validate(publish: boolean) {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 5) e.title = "Başlık en az 5 karakter olmalı.";
    if (f.description.trim().length < 10) e.description = "Açıklama en az 10 karakter olmalı.";
    if (f.terms.trim().length < 20) e.terms = "Koşullar en az 20 karakter olmalı; müşteriye gösterilir.";
    if (f.type === "PERCENT" && (f.discountPercent <= 0 || f.discountPercent > 70)) e.discountPercent = "%1–70 aralığında olmalı.";
    if ((f.type === "FIXED" || f.type === "PRODUCT") && f.discountAmountCents <= 0) e.discountAmountCents = "Sabit indirim 0'dan büyük olmalı.";
    if (f.endsAt && f.startsAt && new Date(f.endsAt) <= new Date(f.startsAt)) e.endsAt = "Bitiş, başlangıçtan sonra olmalı.";
    // İSTEK (d): görsel olmadan yayınlama YOK (sunucuda da zorlanır).
    if (publish && !f.imageUrl.trim()) e.imageUrl = "Yayınlamak için kampanya görseli gerekli. Görsel yükle veya bağlantısını gir.";
    setErrors(e); return Object.keys(e).length === 0;
  }

  async function save(publish: boolean) {
    if (!validate(publish)) return;
    setBusy(true);
    await post("/api/campaigns", {
      action: "upsert", id: editing ?? undefined, publish, ...f,
      discountAmountCents: Math.round(f.discountAmountCents * 100), minBasketCents: Math.round(f.minBasketCents * 100),
      eligibleItems: f.eligibleItems.split(",").map((s) => s.trim()).filter(Boolean),
      exclusions: f.exclusions.split(",").map((s) => s.trim()).filter(Boolean),
      startsAt: f.startsAt || undefined, endsAt: f.endsAt || undefined,
    }, publish ? "Kampanya yayınlandı (moderasyon onayı bekliyor)" : "Taslak kaydedildi");
    setBusy(false); setOpen(false);
  }

  return (
    <div>
      <DashSectionHead eyebrow={t("biz.campaigns")} title="Kampanya yöneticisi"
        desc="Taslak / yayında / duraklatıldı / süresi doldu. Koşullar geçmiş kayıtları geriye dönük değiştirmez."
        action={<Button icon={<Icon.plus size={15} />} onClick={openNew}>Yeni kampanya</Button>} />

      {profileMissing.length ? (
        <Notice tone="warning" icon={<Icon.alert size={16} />} title="İşletme profili eksiksiz" className="mb-5">
          Eksik zorunlu alanlar: {profileMissing.join(", ")} — yeni kampanya oluşturmak ve yayınlamak için İşletme Profili bölümünü tamamla.
        </Notice>
      ) : null}

      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { key: "ALL", label: "Tümü", count: d.campaigns.length },
            { key: "PUBLISHED", label: "Yayında", count: d.campaigns.filter((c) => c.status === "PUBLISHED").length },
            { key: "DRAFT", label: "Taslak", count: d.campaigns.filter((c) => c.status === "DRAFT").length },
            { key: "PAUSED", label: "Duraklatıldı", count: d.campaigns.filter((c) => c.status === "PAUSED").length },
            { key: "EXPIRED", label: "Süresi doldu", count: d.campaigns.filter((c) => (daysUntil(c.endsAt) ?? 1) < 0).length },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {d.campaigns
          .filter((c) =>
            tab === "ALL" ? true : tab === "EXPIRED" ? (daysUntil(c.endsAt) ?? 1) < 0 : c.status === tab
          )
          .map((c) => {
          const left = daysUntil(c.endsAt);
          return (
            <Card key={c.id} className="hover-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="tabular text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">{c.code}</p>
                  <p className="mt-1 font-display text-[1.05rem] font-bold leading-snug">{c.title}</p>
                </div>
                <span className="tabular shrink-0 rounded-[3px] bg-accent-soft px-2.5 py-1.5 text-[0.95rem] font-bold text-accent-700">
                  {c.discountPercent > 0 ? `%${c.discountPercent}` : money(c.discountAmountCents, c.currency as Currency, lang)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-[0.84rem] leading-relaxed text-muted">{c.description}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line-soft pt-3 text-[0.78rem]">
                <div><dt className="text-muted">{t("common.minBasket")}</dt><dd className="tabular font-semibold">{c.minBasketCents ? money(c.minBasketCents, c.currency as Currency, lang) : "—"}</dd></div>
                <div><dt className="text-muted">{t("common.validUntil")}</dt><dd className="tabular font-semibold">{c.endsAt ? shortDate(c.endsAt, lang) : "—"}{left !== null && left >= 0 && left <= 7 ? <span className="text-warning"> · {left} gün</span> : null}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={c.status} lang={lang} /><StatusBadge status={c.moderationStatus} lang={lang} />
                {c.isSponsored ? <Badge tone="accent">{t("common.sponsored")}</Badge> : null}
                <span className="tabular ml-auto text-[0.74rem] text-muted">{num(c.views, lang)} gösterim · {num(c.clicks, lang)} tıklama · {c.verifiedCount} doğrulandı</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Icon.edit size={14} />} onClick={() => openEdit(c.id)}>{t("common.edit")}</Button>
                <Button size="sm" variant="ghost" href={`/kampanya/${c.slug ?? c.code}`}>Önizle</Button>
                {c.status === "PUBLISHED"
                  ? <Button size="sm" variant="danger" onClick={() => setConfirm({ id: c.id, status: "PAUSED", title: c.title })}>{t("common.pause")}</Button>
                  : <Button size="sm" onClick={() => {
                    // İSTEK (d): kart üzerinden yayınlama da görselsiz engellenir (sunucuda da zorlanır).
                    if (!c.imageUrl) { toast.push({ title: "Görsel olmadan yayınlanamaz", desc: "Önce Düzenle ile kampanyaya görsel ekle.", tone: "danger" }); return; }
                    setConfirm({ id: c.id, status: "PUBLISHED", title: c.title });
                  }}>{t("common.publish")}</Button>}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} width="max-w-3xl" title={editing ? "Kampanyayı düzenle" : "Yeni kampanya"}
        desc="İndirim türü, minimum sepet, tarihler, uygun ürünler ve istisnalar. Yayın öncesi önizleme kullan."
        footer={<>
          <Button variant="ghost" onClick={() => setPreview((p) => !p)} icon={<Icon.eye size={15} />}>{preview ? "Formu göster" : t("common.preview")}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="dark" loading={busy} onClick={() => void save(false)}>Taslak kaydet</Button>
          <Button loading={busy} onClick={() => void save(true)} icon={<Icon.check size={15} />}>{t("common.publish")}</Button>
        </>}>
        {!editing ? (
          <div className="mb-4 rounded-[4px] border border-line bg-canvas px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Hazır taslak örnekleri</p>
                <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">Bir örnek seç, form doldurulsun; AI ile işletme adını, ilçeni, kategorini ve ürün/hizmetlerini içerecek şekilde uyarlayabilirsin.</p>
              </div>
              <Button size="sm" variant="secondary" icon={<Icon.spark size={14} />} loading={aiBusy} onClick={() => void aiAdapt()}>AI ile işletme profiline göre uyarla</Button>
            </div>
            <div className="mt-3">
              <Select value={tplKey} onChange={(e) => { const tpl = CAMPAIGN_TEMPLATES.find((x) => x.key === e.target.value); if (tpl) applyTpl(tpl); }}>
                <option value="">Taslak seç…</option>
                {CAMPAIGN_TEMPLATES.map((tpl) => (<option key={tpl.key} value={tpl.key}>{tpl.label}</option>))}
              </Select>
            </div>
            {tplKey ? <p className="mt-2 text-[0.78rem] text-muted">{CAMPAIGN_TEMPLATES.find((x) => x.key === tplKey)?.hint}</p> : null}
            <p className="mt-2 text-[0.74rem] text-muted">Taslaklar örnek metinlerle gelir; yayınlamadan önce gözden geçir. Görsel eklemeden kampanya yayınlanamaz.</p>
          </div>
        ) : null}
        {preview ? (
          <Card className="border-accent/30 bg-accent-soft/30">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-accent-700">Müşterinin göreceği önizleme</p>
            <p className="mt-2 font-display text-[1.25rem] font-bold">{f.title || "Kampanya başlığı"}</p>
            <p className="mt-1 text-[0.9rem] text-ink-700">{f.description || "Açıklama burada görünecek."}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[0.8rem]">
              <Badge tone="accent">{f.type === "PERCENT" ? `%${f.discountPercent} indirim` : `${f.discountAmountCents} ${f.currency} indirim`}</Badge>
              <Badge tone="neutral">Min. sepet {f.minBasketCents || 0} {f.currency}</Badge>
              {f.endsAt ? <Badge tone="neutral">{shortDate(f.endsAt, lang)} tarihine kadar</Badge> : null}
            </div>
            <p className="mt-3 whitespace-pre-line text-[0.82rem] leading-relaxed text-muted">{f.terms || "Koşullar…"}</p>
            <p className="mt-3 text-[0.76rem] text-muted">İndirim, koşullar sağlandığında işletme tarafından kasada uygulanır.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kampanya başlığı" required error={errors.title} className="sm:col-span-2"><Input value={f.title} invalid={!!errors.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Hafta içi akşam %20 indirim" /></Field>
            <Field label="Açıklama" required error={errors.description} className="sm:col-span-2"><Textarea rows={2} value={f.description} invalid={!!errors.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Koşullar (müşteriye gösterilir)" required error={errors.terms} hint="Saat aralığı, minimum sepet, istisnalar, birleştirilebilirlik." className="sm:col-span-2"><Textarea rows={3} value={f.terms} invalid={!!errors.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
            <Field label="İndirim türü"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {["PERCENT", "FIXED", "PRODUCT", "HOUR", "DAY", "FIRST", "RETURN", "QR_ONLY"].map((v) => <option key={v} value={v}>{v}</option>)}
            </Select></Field>
            <Field label="Para birimi"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {["TRY", "USD", "GEL", "EUR"].map((v) => <option key={v} value={v}>{v}</option>)}
            </Select></Field>
            {f.type === "PERCENT"
              ? <Field label="İndirim oranı (%)" error={errors.discountPercent}><Input type="number" min={1} max={70} value={f.discountPercent} invalid={!!errors.discountPercent} onChange={(e) => setF({ ...f, discountPercent: Number(e.target.value) })} /></Field>
              : <Field label="Sabit indirim (birim)" error={errors.discountAmountCents}><Input type="number" min={0} value={f.discountAmountCents} invalid={!!errors.discountAmountCents} onChange={(e) => setF({ ...f, discountAmountCents: Number(e.target.value) })} /></Field>}
            <Field label="Minimum sepet (birim)"><Input type="number" min={0} value={f.minBasketCents} onChange={(e) => setF({ ...f, minBasketCents: Number(e.target.value) })} /></Field>
            <Field label="Başlangıç"><Input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
            <Field label="Bitiş" error={errors.endsAt}><Input type="date" value={f.endsAt} invalid={!!errors.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
            <Field label="Saat başlangıç (ops.)"><Input type="time" value={f.timeStart} onChange={(e) => setF({ ...f, timeStart: e.target.value })} /></Field>
            <Field label="Saat bitiş (ops.)"><Input type="time" value={f.timeEnd} onChange={(e) => setF({ ...f, timeEnd: e.target.value })} /></Field>
            <Field label="Kullanım limiti"><Input type="number" min={1} value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: Number(e.target.value) })} /></Field>
            <Field label="Müşteri başına"><Input type="number" min={1} value={f.perCustomerLimit} onChange={(e) => setF({ ...f, perCustomerLimit: Number(e.target.value) })} /></Field>
            <Field label="Uygun ürün/hizmetler" hint="Virgülle ayır" className="sm:col-span-2"><Input value={f.eligibleItems} onChange={(e) => setF({ ...f, eligibleItems: e.target.value })} /></Field>
            <Field label="İstisnalar" hint="Virgülle ayır" className="sm:col-span-2"><Input value={f.exclusions} onChange={(e) => setF({ ...f, exclusions: e.target.value })} /></Field>
            <Field label="Kampanya görseli" error={errors.imageUrl} hint="JPG, PNG veya WebP — en fazla 5MB. Görsel olmadan yayın yapılamaz. Yüklenen görsel herkese açık bucket'ta saklanır; bağlantıyı elle de girebilirsin." className="sm:col-span-2">
              <div className="flex gap-2">
                <Input value={f.imageUrl} invalid={!!errors.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} placeholder="https://… veya görsel yükle" />
                <label className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[4px] border-2 border-dashed px-3 text-[0.8rem] font-medium ${imgUploading ? "cursor-wait border-line text-muted" : "cursor-pointer border-line text-ink-700 hover:border-accent hover:text-accent"}`}>
                  <Icon.upload size={14} />
                  {imgUploading ? "Yükleniyor…" : "Yükle"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={imgUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadCampaignImage(file);
                    }}
                  />
                </label>
              </div>
              {f.imageUrl ? <img src={f.imageUrl} alt="Kampanya görseli önizlemesi" className="mt-2 h-24 w-full rounded-[3px] border border-line object-cover" /> : null}
            </Field>
            <div className="sm:col-span-2"><Checkbox checked={f.qrEnabled} onChange={(v) => setF({ ...f, qrEnabled: v })} label="Bu kampanya için QR kodu oluştur" /></div>
          </div>
        )}
      </Dialog>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.status === "PUBLISHED" ? "Kampanyayı yayınla" : "Kampanyayı duraklat"}
        desc={confirm?.title}
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
          <Button onClick={async () => { if (confirm) { await post("/api/campaigns", { action: "status", id: confirm.id, status: confirm.status }, confirm.status === "PUBLISHED" ? "Yayınlandı" : "Duraklatıldı"); } setConfirm(null); }}>{t("common.confirm")}</Button></>}>
        <Notice tone={confirm?.status === "PUBLISHED" ? "info" : "warning"} icon={<Icon.alert size={16} />}>
          {confirm?.status === "PUBLISHED"
            ? "Yayınlanan kampanya moderasyon onayından sonra müşteriye görünür. Geçmiş kullanım kayıtları etkilenmez."
            : "Duraklatılan kampanya müşterilere gösterilmez; daha önce oluşmuş kayıtlar korunur."}
        </Notice>
      </Dialog>
    </div>
  );
}

function AdvertisingSection({ d, lang, post }: { d: BD; lang: Lang; post: (r: string, b: Record<string, unknown>, m: string) => Promise<unknown> }) {
  const [f, setF] = useState({ name: "", placement: "ANASAYFA", district: d.biz.district, budgetCents: 250000, endsAt: "" });
  // Düzeltme: bu bölümün eyebrow'u yanlışlıkla profil anahtarını (biz.profile)
  // kullanıyordu; reklam bölümüne ait biz.advertising anahtarı TR/EN/KA'da mevcut.
  const t = makeT(lang);
  return (
    <div>
      <DashSectionHead eyebrow={t("biz.advertising")} title="Reklam ve görünürlük" desc="Kategori, şehir, ilçe ve tarih bazlı görünürlük satın al. Reklam talebi yönetici onayıyla yayına girer." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          {d.ads.map((a) => (
            <Card key={a.id} className="mb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-display text-[1.02rem] font-bold">{a.name}</p><p className="mt-1 text-[0.8rem] text-muted">{a.placement} · {a.district ?? "—"} · bütçe {money(a.budgetCents, a.currency as Currency, lang)}</p></div>
                <StatusBadge status={a.status} lang={lang} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line-soft pt-3 text-center">
                {[["Gösterim", num(a.impressions, lang)], ["Tıklama", num(a.clicks, lang)], ["CTR", pct(a.impressions ? a.clicks / a.impressions : 0, 2)]].map(([l, v]) => (
                  <div key={l}><p className="tabular text-[1.1rem] font-semibold">{v}</p><p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted">{l}</p></div>
                ))}
              </div>
            </Card>
          ))}
          {d.ads.length === 0 ? <EmptyState icon={<Icon.megaphone size={22} />} title="Reklam kaydın yok" /> : null}
        </div>
        <Card>
          <p className="font-display text-[1rem] font-bold">Yeni reklam talebi</p>
          <form className="mt-4 grid gap-4" onSubmit={async (e) => { e.preventDefault(); await post("/api/business", { action: "ad_request", ...f }, "Reklam talebi oluşturuldu (onay bekliyor)"); }}>
            <Field label="Reklam adı"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Kadıköy akşam görünürlüğü" /></Field>
            <Field label="Yerleşim"><Select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })}>
              {["ANASAYFA", "KATEGORI", "BOLGE", "KAMPANYA", "ARAMA"].map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>
            <Field label="İlçe"><Input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} /></Field>
            <Field label="Bütçe (birim)"><Input type="number" min={0} value={f.budgetCents / 100} onChange={(e) => setF({ ...f, budgetCents: Math.round(Number(e.target.value) * 100) })} /></Field>
            <Field label="Bitiş"><Input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
            <Button type="submit">Talebi gönder</Button>
          </form>
          <Notice tone="warning" className="mt-4" icon={<Icon.alert size={16} />}>
            Talep, yönetici onayı olmadan yayına girmez. Onaylanmamış reklam için ücret tahakkuk etmez.
          </Notice>
        </Card>
      </div>
    </div>
  );
}

function AiSection({ d, post }: { d: BD; post: (r: string, b: Record<string, unknown>, m: string) => Promise<unknown> }) {
  const [goal, setGoal] = useState("Bu hafta müşteri sayısını artırmak istiyorum.");
  const [busy, setBusy] = useState<string | null>(null);
  const actions = [
    { key: "ads", icon: <Icon.megaphone size={15} />, label: "Reklam metni üret (5 varyasyon)" },
    { key: "campaign", icon: <Icon.tag size={15} />, label: "Kampanya önerisi al" },
    { key: "social", icon: <Icon.share size={15} />, label: "Sosyal medya gönderisi" },
    { key: "video", icon: <Icon.video size={15} />, label: "15 sn video senaryosu" },
    { key: "plan", icon: <Icon.calendar size={15} />, label: "28 günlük programı oluştur" },
    { key: "analyse", icon: <Icon.chart size={15} />, label: "Performansımı analiz et" },
  ];
  return (
    <div>
      <DashSectionHead eyebrow="AI Pazarlama" title="Bugün işletmen için ne üretelim?"
        desc="AI yalnızca taslak üretir. Onaylamadan hiçbir içerik yayınlanmaz, ücretli reklam başlamaz ve kampanya koşulu değişmez." />
      <Card className="mb-6">
        <Field label="Hedefin"><Input value={goal} onChange={(e) => setGoal(e.target.value)} /></Field>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((a) => (
            <Button key={a.key} variant="secondary" className="justify-start" loading={busy === a.key} icon={a.icon}
              onClick={async () => { setBusy(a.key); await post("/api/ai", { action: a.key, goal }, "AI taslağı hazır"); setBusy(null); }}>{a.label}</Button>
          ))}
        </div>
      </Card>
      <Notice tone="info" icon={<Icon.info size={16} />} className="mb-5">
        Sağlayıcı: yerel şablon motoru (harici LLM anahtarı gerekmez). Sosyal medya yayınlama API&apos;si <strong>bağlı değil</strong>; içerikleri kopyalayıp kendi hesaplarında paylaşabilirsin. Video üretimi bağlı değil — senaryo ve sahne planı üretilir.
      </Notice>
      <div className="space-y-4">
        {d.contents.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{c.kind}</Badge>{c.variant ? <Badge tone="accent">Varyant {c.variant}</Badge> : null}
              <span className="text-[0.76rem] text-muted">{c.platform}</span>
              <span className="ml-auto"><StatusBadge status={c.status} /></span>
            </div>
            <p className="mt-2.5 font-display text-[1.02rem] font-bold">{c.title}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-[0.85rem] leading-relaxed text-muted">{c.body}</pre>
            {c.cta ? <p className="mt-2 text-[0.82rem] font-semibold text-accent">CTA: {c.cta}</p> : null}
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Icon.check size={14} />} onClick={() => void post("/api/business", { action: "content_decision", id: c.id, decision: "approve" }, "Onaylandı")}>Onayla</Button>
              <Button size="sm" icon={<Icon.share size={14} />} onClick={() => void post("/api/business", { action: "content_decision", id: c.id, decision: "publish" }, "Yayınlandı")}>Onayla ve yayınla</Button>
              <Button size="sm" variant="danger" onClick={() => void post("/api/business", { action: "content_decision", id: c.id, decision: "reject" }, "Reddedildi")}>Reddet</Button>
              <Button size="sm" variant="ghost" icon={<Icon.copy size={14} />} onClick={() => navigator.clipboard?.writeText(c.body).catch(() => undefined)}>Metni kopyala</Button>
              <Button size="sm" variant="ghost" icon={<Icon.trash size={14} />} onClick={() => void post("/api/business", { action: "content_delete", id: c.id }, "Silindi")}>Sil</Button>
            </div>
          </Card>
        ))}
        {d.contents.length === 0 ? <EmptyState icon={<Icon.spark size={22} />} title="Henüz AI içeriği yok" desc="Yukarıdaki seçeneklerden biriyle ilk taslağını üret." /> : null}
      </div>
    </div>
  );
}

function GrowthSection({ d, post, lang }: { d: BD; post: (r: string, b: Record<string, unknown>, m: string) => Promise<unknown>; lang: Lang }) {
  const [goal, setGoal] = useState("Bu hafta müşteri sayısını artırmak istiyorum.");
  const [busy, setBusy] = useState(false);
  const days = d.plan?.days ?? [];
  const weeks = [
    { n: 1, title: "Hafta 1 — Analiz et ve planla", range: [1, 7] },
    { n: 2, title: "Hafta 2 — İçerik üret", range: [8, 14] },
    { n: 3, title: "Hafta 3 — Yayınla ve müşteri çek", range: [15, 21] },
    { n: 4, title: "Hafta 4 — Ölç ve optimize et", range: [22, 28] },
  ];
  const done = days.filter((x) => x.done).length;
  return (
    <div>
      <DashSectionHead eyebrow="28 Günlük AI Büyüme Programı" title="28 Günde İşletmeni Dijitalde Büyüt"
        desc="Program görünürlük, içerik, kampanya ve müşteri kazanımını adım adım ilerletir. Gelir veya müşteri garantisi vermez."
        action={<Button loading={busy} icon={<Icon.spark size={15} />} onClick={async () => { setBusy(true); await post("/api/ai", { action: "plan", goal }, "28 günlük program oluşturuldu"); setBusy(false); }}>Programı oluştur / yenile</Button>} />

      <Card className="mb-6"><Field label="Program hedefi"><Input value={goal} onChange={(e) => setGoal(e.target.value)} /></Field>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="min-w-[200px] flex-1"><Progress value={days.length ? (done / days.length) * 100 : 0} /><p className="mt-2 text-[0.8rem] text-muted"><span className="tabular font-semibold text-ink">{done}</span> / {days.length || 28} görev tamamlandı</p></div>
          {days.length ? <Badge tone="positive">{d.plan?.status}</Badge> : <Badge tone="warning">Program henüz oluşturulmadı</Badge>}
        </div>
      </Card>

      {days.length === 0 ? <EmptyState icon={<Icon.calendar size={22} />} title="28 günlük program yok" desc="Programı oluşturduğunda haftalık görevler, teslim edilecekler ve onay akışı burada listelenir." /> : (
        <div className="space-y-6">
          {weeks.map((w) => {
            const items = days.filter((x) => x.day >= w.range[0] && x.day <= w.range[1]);
            const wDone = items.filter((i) => i.done).length;
            return (
              <div key={w.n}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-display text-[1.05rem] font-bold text-ink">{w.title}</p>
                  <div className="flex items-center gap-3"><Progress value={items.length ? (wDone / items.length) * 100 : 0} /><span className="tabular text-[0.78rem] text-muted">{wDone}/{items.length}</span></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {items.map((it) => (
                    <Card key={it.id} className={it.done ? "border-positive/40 bg-positive-soft/25" : ""}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="tabular text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-accent">Gün {String(it.day).padStart(2, "0")}</p>
                        <Checkbox checked={it.done} onChange={() => void post("/api/business", { action: "plan_day_toggle", id: it.id, done: !it.done }, "Görev güncellendi")} label="" />
                      </div>
                      <p className="mt-1.5 font-display text-[0.95rem] font-bold leading-snug">{it.theme}</p>
                      <p className="mt-1.5 text-[0.8rem] leading-relaxed text-muted">{it.task}</p>
                      <div className="mt-3 border-t border-line-soft pt-2.5 text-[0.74rem]">
                        <p className="font-semibold text-ink-700">{it.channel}</p>
                        <p className="mt-1 text-muted">Teslim: {it.day <= 7 ? "Analiz notu" : it.day <= 14 ? "İçerik taslağı" : it.day <= 21 ? "Yayınlanan kampanya" : "Haftalık rapor"}</p>
                        <p className="mt-1 text-muted">Bitiş: {shortDate(new Date(Date.now() + it.day * 86400000), lang)}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ------------------------------ QR BÖLÜMÜ ------------------------------ */

function QrSection({ d, lang, post }: { d: BD; lang: Lang; post: (r: string, b: Record<string, unknown>, m: string) => Promise<unknown> }) {
  const toast = useToast();
  const t = makeT(lang);
    const [scanCode, setScanCode] = useState("");
    const [scanResult, setScanResult] = useState<{ ok: boolean; usage?: { id: string; status: string }; campaign?: { title: string; terms: string | null; businessName: string }; problems?: string[]; notice?: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const active = d.campaigns.find((c) => c.status === "PUBLISHED") ?? d.campaigns[0];
    return (
      <div>
        <DashSectionHead eyebrow={t("biz.qr")} title="QR kampanyaları"
          desc="QR'ı mağazanda sergile; okutmaları izle ve uygun kullanımı yetkili personelin onayıyla doğrula." />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <Card className="flex flex-col items-center">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Mağaza QR&apos;ı</p>
            <div className="mt-4"><QrPanel value={active ? `QR-${active.code}` : d.biz.slug} caption={active?.code ?? d.biz.slug} scanning size={190} /></div>
            <p className="mt-4 max-w-[34ch] text-center text-[0.82rem] leading-relaxed text-muted">
              Müşteri bu kodu okuttuğunda kampanya koşulları açılır. Okutma kaydı <strong>QR_SCANNED</strong> olarak tutulur; satış anlamına gelmez.
            </p>
            <Button className="mt-4" variant="secondary" size="sm" icon={<Icon.upload size={14} />} onClick={() => toast.push({ title: "QR indirildi", desc: "PDF/PNG dışa aktarımı demo ortamında simüle edildi.", tone: "positive" })}>QR&apos;ı indir</Button>
          </Card>

          <div className="space-y-5">
            <Card>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Okutma simülasyonu</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Input value={scanCode} onChange={(e) => setScanCode(e.target.value)} placeholder="QR-KPA-20 veya kampanya kodu" className="min-w-[220px] flex-1" />
                <Button loading={busy} onClick={async () => {
                  setBusy(true);
                  const res = await fetch("/api/qr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "scan", code: scanCode }) });
                  setScanResult(await res.json()); setBusy(false);
                }}>Okut</Button>
                {d.qrCodes.slice(0, 2).map((q) => (
                  <Button key={q.code} size="sm" variant="ghost" onClick={() => setScanCode(q.code)}>{q.code}</Button>
                ))}
              </div>
              {scanResult ? (
                <div className="mt-4 space-y-2.5">
                  {scanResult.ok ? (
                    <>
                      <Notice tone="positive" icon={<Icon.check size={16} />} title="QR okutuldu — kayıt QR_SCANNED">
                        {scanResult.campaign?.title} · {scanResult.notice}
                      </Notice>
                      {scanResult.problems?.length ? <Notice tone="warning" icon={<Icon.alert size={16} />}>{scanResult.problems.join(" ")}</Notice> : null}
                    </>
                  ) : <Notice tone="danger" icon={<Icon.alert size={16} />}>{(scanResult as unknown as { error?: string }).error ?? "Okutma başarısız"}</Notice>}
                </div>
              ) : null}
            </Card>

            <Card padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <p className="font-display text-[1rem] font-bold">QR okutmaları ve doğrulama</p>
                <div className="flex gap-2">
                  <Badge tone="neutral">{d.usages.filter((u) => u.status === "QR_SCANNED").length} okutuldu</Badge>
                  <Badge tone="info">{d.usages.filter((u) => u.status === "SUBMITTED").length} onay bekliyor</Badge>
                  <Badge tone="positive">{d.usages.filter((u) => u.status === "VERIFIED").length} doğrulandı</Badge>
                </div>
              </div>
              <div className="thin-scroll max-h-[430px] overflow-y-auto">
                <Table className="border-0 rounded-none">
                  <thead><tr><Th>Kampanya</Th><Th>Müşteri</Th><Th>Okutulma</Th><Th>Durum</Th><Th right>İşlem</Th></tr></thead>
                  <tbody>
                    {d.usages.slice(0, 18).map((u) => (
                      <tr key={u.id}>
                        <Td strong>{u.campaignTitle}</Td>
                        <Td>{u.customerLabel}</Td>
                        <Td>{u.scannedAt ? shortDate(u.scannedAt, lang) : "—"}</Td>
                        <Td><StatusBadge status={u.status} lang={lang} /></Td>
                        <Td right>
                          {["QR_SCANNED", "SUBMITTED"].includes(u.status) ? (
                            <span className="inline-flex gap-1.5">
                              <Button size="sm" onClick={() => void post("/api/qr", { action: "verify", usageId: u.id, reportedBasketCents: u.reportedBasketCents ?? 50000 }, "Kullanım doğrulandı")}>Doğrula</Button>
                              <Button size="sm" variant="danger" onClick={() => void post("/api/qr", { action: "reject", usageId: u.id, note: "Koşul sağlanmadı" }, "Kayıt reddedildi")}>Reddet</Button>
                            </span>
                          ) : u.status === "VERIFIED" ? (
                            <Button size="sm" variant="ghost" onClick={() => void post("/api/qr", { action: "cancel", usageId: u.id, note: "İptal" }, "Kayıt iptal edildi")}>İptal et</Button>
                          ) : <span className="text-muted-2">—</span>}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
}

/* --------------------------- VİDEO / İÇERİK STÜDYOSU --------------------------- */

/** FAZ 11 — private bucket'daki video için imzalı URL ile oynatıcı. */
function SignedVideo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    getBrowserSupabase()
      .storage.from("business-video")
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setFailed(true);
        else setUrl(data.signedUrl);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [path]);
  if (failed) return <p className="mt-2 text-[0.78rem] text-muted">Video bağlantısı alınamadı (yetki veya ağ hatası).</p>;
  if (!url) return <p className="mt-2 text-[0.78rem] text-muted">Oynatıcı hazırlanıyor…</p>;
  return <video src={url} controls preload="metadata" className="mt-2 w-full rounded-[3px] bg-black" />;
}

function StudioSection({ d, post, videos, lang }: { d: BD; post: (r: string, b: Record<string, unknown>, m: string) => Promise<unknown>; videos: StudioVideo[]; lang: Lang }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ title: string; scenes: { at: string; visual: string; caption: string }[] } | null>(null);
  const [focus, setFocus] = useState("");
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploaded = videos.filter((v) => v.storagePath);

  /** Yüklenen videoyu tarayıcıdan doğrudan private Storage'a gönderir (FAZ 11). */
  async function uploadVideo(file: File) {
    const MAX = 100 * 1024 * 1024;
    const okTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!okTypes.includes(file.type)) {
      toast.push({ title: "Geçersiz dosya türü", desc: "Yalnızca MP4, WebM veya MOV yüklenebilir.", tone: "danger" });
      return;
    }
    if (file.size > MAX) {
      toast.push({ title: "Dosya çok büyük", desc: "Video en fazla 100MB olabilir.", tone: "danger" });
      return;
    }
    setUploading(true);
    try {
      const sb = getBrowserSupabase();
      const ext = file.name.includes(".") ? (file.name.split(".").pop() || "mp4").toLowerCase() : "mp4";
      const path = `${d.biz.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("business-video").upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.push({ title: "Yükleme başarısız", desc: error.message, tone: "danger" });
        return;
      }
      setUploadName(file.name);
      // Kayıt: video_assets (UPLOADED_EDIT) + hizmet talebi; sunucu yolu doğrular.
      await post("/api/business", { action: "video_upload", storagePath: path, title: file.name.slice(0, 120) }, "Video yüklendi — düzenleme talebi oluşturuldu");
    } catch {
      toast.push({ title: "Yükleme başarısız", desc: "Ağ hatası oluştu; tekrar dene.", tone: "danger" });
    } finally {
      setUploading(false);
    }
  }

  const businessVideos = videos.filter((v) =>
    ["HOW_BUSINESS_CAMPAIGN_WORKS", "HOW_AI_PROGRAM_WORKS", "HOW_TO_READ_ANALYTICS", "HOW_QR_TRACKING_WORKS"].includes(v.topic)
  );
  const active = businessVideos[0] ?? videos[0];

  async function generateStoryboard() {
    setBusy("video");
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "video", focus: focus || undefined }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    setBusy(null);
    if (json.ok && json.script) {
      setGenerated({
        title: json.script.title,
        scenes: (json.script.scenes ?? []).map((s: { time: string; visual: string; voiceover: string }) => ({
          at: s.time, visual: s.visual, caption: s.voiceover,
        })),
      });
      toast.push({ title: "Storyboard üretildi", desc: "Taslak olarak kaydedildi; onaylamadan yayınlanmaz.", tone: "positive" });
      setTimeout(() => window.location.reload(), 1200);
    } else {
      toast.push({ title: json.error ?? "Storyboard üretilemedi", tone: "danger" });
    }
  }

  return (
    <div>
      <DashSectionHead
        eyebrow="Video ve içerik stüdyosu"
        title="Kısa video, storyboard ve içerik üretimi"
        desc="AI senaryo ve sahne planı üretir; onayınız olmadan hiçbir içerik yayınlanmaz. Gerçek video render servisi bağlı değildir ve bu durum açıkça gösterilir."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          ["AI video üretimi", "NOT_CONNECTED", "Senaryo + sahne planı üretilir; video dosyası render edilmez."],
          ["Sosyal medya yayını", "NOT_CONNECTED", "Bağlantı doğrulanmadı; manuel paylaşım için dışa aktar."],
          ["Yüklenen video düzenleme", "SERVICE_REQUEST", "Ücretli hizmet talebi olarak kayda alınır."],
        ].map(([t, s, n]) => (
          <Card key={t}>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">{t}</p>
            <p className="mt-2">
              <Badge tone={s === "NOT_CONNECTED" ? "warning" : "info"}>{s === "NOT_CONNECTED" ? "Bağlantı gerekli" : "Hizmet talebi"}</Badge>
            </p>
            <p className="mt-2.5 text-[0.84rem] leading-relaxed text-muted">{n}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          {active ? (
            <VideoModule
              title={active.title}
              durationSec={active.durationSec}
              scenes={active.scenes}
              captions={active.captions}
              lang={lang}
              poster={active.poster ?? undefined}
              steps={active.steps}
            />
          ) : (
            <EmptyState icon={<Icon.video size={22} />} title="Video anlatımı yok" />
          )}

          {generated ? (
            <Card className="border-accent/40">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-accent">AI tarafından üretildi · taslak</p>
              <p className="mt-2 font-display text-[1.08rem] font-bold">{generated.title}</p>
              <ol className="mt-3 space-y-2.5">
                {generated.scenes.map((s, i) => (
                  <li key={i} className="border-l-4 border-line pl-3">
                    <p className="tabular text-[0.74rem] font-semibold text-muted">{s.at}</p>
                    <p className="text-[0.88rem] font-medium text-ink">{s.visual}</p>
                    <p className="mt-0.5 text-[0.82rem] text-muted">Seslendirme: {s.caption}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[0.78rem] leading-relaxed text-muted">
                Bu bir senaryo ve sahne planıdır; üretilmiş bir video dosyası değildir. Render servisi bağlandığında
                durum <span className="tabular">QUEUED → RENDERED</span> olarak güncellenir.
              </p>
            </Card>
          ) : null}

          <Card>
            <p className="font-display text-[1rem] font-bold">Yeni storyboard üret</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Odak: örn. akşam saatleri kampanyası" className="min-w-[220px] flex-1" />
              <Button loading={busy === "video"} onClick={() => void generateStoryboard()} icon={<Icon.spark size={15} />}>
                AI ile üret
              </Button>
            </div>
            <p className="mt-2.5 text-[0.78rem] text-muted">
              Çıktı taslak olarak kaydedilir; onay akışı AI Pazarlama bölümündedir.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <p className="font-display text-[1rem] font-bold">Yüklenen videoyu düzenle</p>
            <p className="mt-2 text-[0.86rem] leading-relaxed text-muted">
              Kendi videonu yükle; DampingVar ekibi kesim, altyazı ve marka uyumu düzenlemesini ücretli hizmet olarak
              yapar. Dosyan güvenli biçimde Supabase Storage&apos;a yüklenir (en fazla 100MB); kayıt düzenleme talebi
              olarak kaydedilir.
            </p>
            <label className={`mt-4 flex items-center justify-center gap-2 border-2 border-dashed bg-canvas px-4 py-6 text-[0.86rem] ${uploading ? "cursor-wait border-line text-muted" : "cursor-pointer border-line text-muted hover:border-accent hover:text-accent"}`}>
              <Icon.upload size={16} />
              {uploading ? "Yükleniyor…" : (uploadName ?? "Video dosyası seç (MP4, WebM veya MOV — en fazla 100MB)")}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadVideo(f);
                }}
              />
            </label>
            <Button
              className="mt-4 w-full"
              variant="secondary"
              loading={busy === "request"}
              onClick={async () => {
                setBusy("request");
                await post("/api/business", {
                  action: "video_request",
                  fileName: uploadName ?? "belirtilmedi",
                  note: focus || "Video düzenleme hizmeti talebi",
                }, "Hizmet talebi kaydedildi");
                setBusy(null);
              }}
            >
              Düzenleme hizmeti talep et
            </Button>
          </Card>

          {uploaded.length > 0 ? (
            <Card padded={false}>
              <p className="border-b-2 border-line px-4 py-3 font-display text-[1rem] font-bold">Yüklenen videolar</p>
              <ul className="divide-y-2 divide-line-soft">
                {uploaded.map((v) => (
                  <li key={v.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[0.86rem] font-semibold text-ink">{v.title}</p>
                        <p className="mt-0.5 text-[0.74rem] text-muted">Özel bucket · yalnızca izin verilen hesaplarda oynatılır</p>
                      </div>
                      <StatusBadge status={v.status} lang={lang} />
                    </div>
                    <SignedVideo path={v.storagePath!} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card padded={false}>
            <p className="border-b-2 border-line px-4 py-3 font-display text-[1rem] font-bold">Üretilen içerikler</p>
            <ul className="divide-y-2 divide-line-soft">
              {d.contents.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.86rem] font-semibold text-ink">{c.title}</p>
                    <p className="mt-0.5 text-[0.74rem] text-muted">{c.kind}{c.platform ? ` · ${c.platform}` : ""}</p>
                  </div>
                  <StatusBadge status={c.status} lang={lang} />
                </li>
              ))}
              {d.contents.length === 0 ? <li className="px-4 py-6 text-[0.86rem] text-muted">Henüz içerik üretilmedi.</li> : null}
            </ul>
            <div className="border-t-2 border-line px-4 py-3">
              <Button href="/panel?s=ai" size="sm" variant="ghost" iconRight={<Icon.arrowRight size={14} />}>
                AI Pazarlama onay akışına git
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------- ANALİTİK (tarih + kampanya filtreli) ------------------- */

function AnalyticsSection({ d, lang, range }: { d: BD; lang: Lang; range: number }) {
  const [campaignId, setCampaignId] = useState("ALL");
  const m = d.metrics;
  const camp = d.campaigns.find((c) => c.id === campaignId);

  const localFunnel = camp
    ? [
        { label: "Kampanya gösterimi", value: camp.views, measured: true },
        { label: "Kampanya tıklaması", value: camp.clicks, measured: true },
        { label: "İşletme sayfası ziyareti", value: m.pageVisits, measured: true, note: "İşletme bazlı ölçülür; kampanya kırılımı yoktur." },
        { label: "QR okutma", value: camp.scans, measured: true, note: "Okutma satış kanıtı değildir." },
        { label: "Doğrulanmış kampanya kullanımı", value: camp.verifiedCount, measured: true, note: "İşletme yetkilisinin onayıyla." },
      ]
    : [
        { label: "Kampanya gösterimi", value: m.impressions, measured: true },
        { label: "Kampanya tıklaması", value: m.clicks, measured: true },
        { label: "İşletme sayfası ziyareti", value: m.pageVisits, measured: true },
        { label: "QR okutma", value: m.qrScans, measured: true, note: "Okutma satış kanıtı değildir." },
        { label: "Doğrulanmış kampanya kullanımı", value: m.verifiedUsage, measured: true, note: "İşletme yetkilisinin onayıyla." },
      ];

  const labels = m.views14.map((_, i) => `${i + 1}`);

  return (
    <div>
      <DashSectionHead
        eyebrow="Analitik"
        title="Dönüşüm hunileri ve eğilimler"
        desc="Yalnızca ölçülen olaylar gösterilir. Tıklama veya QR okutmadan doğrulanmış satış çıkarılmaz; tahmini değerler ayrıca işaretlenir."
        action={<Badge tone="warning">Demo verisi · son {range} gün</Badge>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[0.74rem] font-bold uppercase tracking-[0.12em] text-muted">Tarih aralığı</span>
        {[7, 14, 30].map((r) => (
          <Button key={r} size="sm" href={`/panel?s=analytics&gun=${r}`} variant={range === r ? "primary" : "secondary"}>
            Son {r} gün
          </Button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <span className="text-[0.74rem] font-bold uppercase tracking-[0.12em] text-muted">Kampanya</span>
        <div className="min-w-[220px] flex-1">
          <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="ALL">Tüm kampanyalar</option>
            {d.campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Yerel kampanya hunisi</p>
            {camp ? <Badge tone="accent">{camp.title}</Badge> : <Badge tone="neutral">tümü</Badge>}
          </div>
          <Funnel steps={localFunnel} formatValue={(v) => num(v, lang)} />
          <p className="mt-4 border-t-2 border-dashed border-line pt-3 text-[0.78rem] leading-relaxed text-muted">
            Her aşama ayrı bir olaydır. Görüntüleme ile tıklama arasındaki ilişki nedensellik iddiası değildir.
          </p>
        </Card>

        <Card>
          <p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">AI pazarlama hunisi</p>
          <Funnel
            steps={[
              { label: "İçerik üretildi", value: m.contentCreated, measured: true },
              { label: "İşletme onayladı", value: m.contentApproved, measured: true, note: "Onaysız içerik yayınlanmaz." },
              { label: "DampingVar'da yayınlandı", value: m.contentPublished, measured: true },
              { label: "Etkileşim ölçüldü (tıklama)", value: m.clicks, measured: true },
              { label: "Performans incelendi", value: m.verifiedUsage, measured: true, note: "Doğrulanmış kullanım üzerinden." },
              { label: "Reddedilen içerik", value: m.contentRejected, measured: true },
            ]}
            formatValue={(v) => num(v, lang)}
          />
          <p className="mt-4 text-[0.78rem] leading-relaxed text-muted">
            Sosyal medya yayını bağlı olmadığı için “yayınlandı” yalnızca DampingVar içi yayını ifade eder.
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Son {range} gün · görüntüleme / tıklama / QR okutma
          </p>
          <AreaLine
            labels={labels}
            series={[
              { name: "Görüntüleme", data: m.views14, color: "#12212f" },
              { name: "Tıklama", data: m.clicks14, color: "#d6362b" },
              { name: "QR okutma", data: m.series14, color: "#1f6f4a" },
            ]}
          />
        </Card>

        <Card>
          <p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Organik ↔ ücretli ayrımı</p>
          <HBars
            rows={[
              { label: "Organik kampanya görüntüleme", value: m.campaignViews, sub: "Listeleme ve arama sonuçları" },
              { label: "Ücretli yerleşim gösterimi", value: d.ads.reduce((a, x) => a + x.impressions, 0), sub: "Reklam alanlarında ölçülen" },
              { label: "Ücretli yerleşim tıklaması", value: d.ads.reduce((a, x) => a + x.clicks, 0), sub: "Reklam kaynaklı çıkışlar" },
            ]}
          />
          <Notice tone="info" icon={<Icon.info size={16} />} className="mt-4">
            Ücretli yerleşim performansı yalnızca ölçülen gösterim/tıklama üzerinden raporlanır. Bir reklamın gelir
            ürettiği, doğrulanmış bir kaynak olmadan iddia edilmez.
          </Notice>
        </Card>
      </div>

      <div className="mt-6">
        <Card padded={false}>
          <p className="border-b-2 border-line px-5 py-3.5 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Kampanya bazlı karşılaştırma
          </p>
          <Table className="rounded-none border-0">
            <thead>
              <tr><Th>Kampanya</Th><Th right>Gösterim</Th><Th right>Tıklama</Th><Th right>QR okutma</Th><Th right>Doğrulanmış</Th><Th right>Dönüşüm</Th></tr>
            </thead>
            <tbody>
              {d.campaigns.map((c) => (
                <tr key={c.id}>
                  <Td strong>{c.title}</Td>
                  <Td right>{num(c.views, lang)}</Td>
                  <Td right>{num(c.clicks, lang)}</Td>
                  <Td right>{num(c.scans, lang)}</Td>
                  <Td right>{num(c.verifiedCount, lang)}</Td>
                  <Td right><span className="tabular">{pct(c.clicks ? c.verifiedCount / c.clicks : 0, 1)}</span></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
