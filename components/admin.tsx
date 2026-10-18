"use client";

import { useState } from "react";
import {
  Badge, BarChart, Button, Card, Dialog, EmptyState, Field, Funnel, Icon, Input, Kpi, Notice, Pagination, QrPanel, Select,
  Table, Td, Th, Toggle, useToast,
} from "@/components/ds";
import { DashSectionHead, StatusBadge, type NavItem } from "@/components/Dash";
import { money, num, pct, shortDate, type Currency, type Lang } from "@/lib/money";
import type { getAdminData } from "@/lib/queries";

export type AdminData = Awaited<ReturnType<typeof getAdminData>>;

export const ADMIN_NAV: NavItem[] = [
  { key: "overview", label: "Platform Özeti", icon: <Icon.chart size={16} />, group: "Genel" },
  { key: "customers", label: "Müşteriler", icon: <Icon.users size={16} />, group: "Genel" },
  { key: "businesses", label: "İşletmeler ve Markalar", icon: <Icon.store size={16} />, group: "Genel" },
  { key: "moderation", label: "Kampanya Moderasyonu", icon: <Icon.shield size={16} />, group: "İçerik", badge: 0 },
  { key: "qr", label: "QR Etkinliği", icon: <Icon.qr size={16} />, group: "İçerik" },
  { key: "referrals", label: "Yönlendirme İzleme", icon: <Icon.share size={16} />, group: "İçerik" },
  { key: "bonusRules", label: "Damping Bonus Kuralları", icon: <Icon.bonus size={16} />, group: "İçerik" },
  { key: "affiliateOffers", label: "Affiliate Fırsatları", icon: <Icon.external size={16} />, group: "Affiliate" },
  { key: "affiliateNetworks", label: "Affiliate Ağ Durumu", icon: <Icon.globe size={16} />, group: "Affiliate" },
  { key: "affiliateCommissions", label: "Komisyon Raporları", icon: <Icon.receipt size={16} />, group: "Affiliate" },
  { key: "ads", label: "Reklam Paketleri", icon: <Icon.megaphone size={16} />, group: "Gelir" },
  { key: "ai", label: "AI Pazarlama Hizmetleri", icon: <Icon.spark size={16} />, group: "Gelir" },
  { key: "fees", label: "Hizmet Bedelleri", icon: <Icon.tag size={16} />, group: "Gelir" },
  { key: "invoices", label: "Faturalar", icon: <Icon.receipt size={16} />, group: "Gelir" },
  { key: "analytics", label: "Analitik", icon: <Icon.eye size={16} />, group: "Operasyon" },
  { key: "reports", label: "Raporlar", icon: <Icon.layers size={16} />, group: "Operasyon" },
  { key: "fraud", label: "Fraud ve Kötüye Kullanım", icon: <Icon.alert size={16} />, group: "Operasyon" },
  { key: "settings", label: "Sistem Ayarları", icon: <Icon.settings size={16} />, group: "Operasyon" },
  { key: "audit", label: "Denetim Kayıtları", icon: <Icon.lock size={16} />, group: "Operasyon" },
];

export type AffiliateData = Awaited<ReturnType<typeof import("@/lib/queries").getAffiliateData>>;

export default function AdminDashboard({ data, lang, currency, section, affiliate }: { data: AdminData; lang: Lang; currency: Currency; section: string; affiliate: AffiliateData }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | { title: string; desc: string; run: () => Promise<void> }>(null);
  const [page, setPage] = useState(1);
  const c = data.counts;

  async function act(body: Record<string, unknown>, ok: string) {
    const res = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({ ok: false }));
    if (json.ok) { toast.push({ title: ok, tone: "positive" }); setTimeout(() => window.location.reload(), 600); }
    else toast.push({ title: json.error ?? "İşlem başarısız", tone: "danger" });
  }
  const ask = (title: string, desc: string, run: () => Promise<void>) => setConfirm({ title, desc, run });

  if (section === "overview") return (
    <div>
      <DashSectionHead eyebrow="Platform" title="Genel durum" desc="Hizmet geliri ile müşteri indirimleri ayrı tutulur; burada yalnızca platform operasyonu görünür." action={<Badge tone="warning">Demo verisi</Badge>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="İşletme / marka" value={c.businesses} icon={<Icon.store size={16} />} />
        <Kpi label="Müşteri" value={c.customers} icon={<Icon.users size={16} />} />
        <Kpi label="Yayındaki kampanya" value={c.campaigns} icon={<Icon.tag size={16} />} />
        <Kpi label="Moderasyon bekleyen" value={c.pendingModeration} icon={<Icon.shield size={16} />} />
        <Kpi label="QR okutma" value={c.qrScans} icon={<Icon.qr size={16} />} />
        <Kpi label="Doğrulanmış kullanım" value={c.verifiedUsage} icon={<Icon.verified size={16} />} />
        <Kpi label="Açık fatura" value={c.invoicesOpen} icon={<Icon.receipt size={16} />} />
        <Kpi label="Fraud incelemesi" value={c.fraudOpen} icon={<Icon.alert size={16} />} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Hizmet geliri (faturalanan / tahsil edilen)</p>
          <BarChart data={[c.billed, c.revenue]} labels={["Faturalanan", "Tahsil edilen"]} formatValue={(v) => money(v, currency, lang)} />
          <Notice tone="info" className="mt-4" icon={<Icon.info size={16} />}>Bu tutarlar DampingVar&apos;ın işletmelere kestiği hizmet bedelleridir. Müşteri indirimi veya ciro değildir.</Notice>
        </Card>
        <Card>
          <p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Gelir ayrımı (asla toplanmaz)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border-2 border-line bg-canvas p-3">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-info">A) Affiliate komisyonu</p>
              <p className="tabular mt-2 text-[1.15rem] font-semibold">{money(affiliate.totals.confirmedCents, currency, lang)}</p>
              <p className="text-[0.74rem] text-muted">doğrulanmış (onaylı + ödenmiş)</p>
              <p className="tabular mt-2 text-[0.9rem] text-warning">{money(affiliate.totals.unconfirmedCents, currency, lang)}</p>
              <p className="text-[0.74rem] text-muted">bekleyen · gelir sayılmaz</p>
            </div>
            <div className="border-2 border-line bg-canvas p-3">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-accent">B) İşletme hizmet bedeli</p>
              <p className="tabular mt-2 text-[1.15rem] font-semibold">{money(c.billed, currency, lang)}</p>
              <p className="text-[0.74rem] text-muted">faturalanan</p>
              <p className="tabular mt-2 text-[0.9rem] text-positive">{money(c.revenue, currency, lang)}</p>
              <p className="text-[0.74rem] text-muted">tahsil edilen</p>
            </div>
          </div>
          <p className="mt-3 text-[0.76rem] leading-relaxed text-muted">
            Müşteri indirimleri (C) ve işletme satışları (D) bu tabloya dahil değildir; DampingVar işletme cirosunu
            varsaymaz veya raporlamaz.
          </p>
        </Card>
        <Card><p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Olay hacmi</p>
          <HBarsInline rows={Object.entries(c.events).map(([k, v]) => ({ label: k, value: v as number }))} /></Card>
      </div>
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );

  if (section === "customers") {
    const perPage = 8;
    const pages = Math.max(1, Math.ceil(data.customers.length / perPage));
    const safePage = Math.min(page, pages);
    const rows = data.customers.slice((safePage - 1) * perPage, safePage * perPage);
    return (
      <Wrap title="Müşteriler" desc="Kayıtlı müşteri hesapları ve etkinlik sayıları. Müşteri finansal bakiyesi tutulmaz.">
        <Table>
          <thead><tr><Th>Ad</Th><Th>E-posta</Th><Th>Rol</Th><Th>Konum</Th><Th>Dil / Para</Th><Th>Davet kodu</Th><Th right>Etkinlik</Th></tr></thead>
          <tbody>{rows.map((u) => (<tr key={u.id}><Td strong>{u.name}</Td><Td>{u.email}</Td><Td><Badge tone={u.role === "ADMIN" ? "accent" : u.role === "BUSINESS" ? "dark" : "neutral"}>{u.role}</Badge></Td>
            <Td>{u.district ?? "—"} / {u.country}</Td><Td className="tabular">{u.lang} · {u.currency}</Td><Td className="tabular">{u.referralCode}</Td><Td right>{u.usages}</Td></tr>))}</tbody>
        </Table>
        <Pagination page={safePage} pages={pages} onPage={setPage} />
      </Wrap>
    );
  }

  if (section === "reports") return <Reports data={data} lang={lang} currency={currency} />;

  if (section === "businesses") return <Wrap title="İşletmeler ve markalar" desc="Doğrulama, öne çıkarma ve paket ataması yönetici onayıyla yapılır.">
    <Table><thead><tr><Th>İşletme</Th><Th>Kategori</Th><Th>Konum</Th><Th>Paket</Th><Th>Kampanya</Th><Th>Durum</Th><Th right>İşlem</Th></tr></thead>
      <tbody>{data.businesses.map((b) => (<tr key={b.id}>
        <Td strong>{b.name}<span className="ml-2 text-[0.72rem] text-muted">{b.slug}</span></Td><Td>{b.category}</Td><Td>{b.district}, {b.city} · {b.country}</Td>
        <Td><Badge tone={b.planCode === "BOOST" ? "accent" : b.planCode === "PRO" ? "dark" : "neutral"}>{b.planCode}</Badge></Td><Td right>{b.campaigns}</Td>
        <Td>{b.verified ? <Badge tone="positive">Doğrulandı</Badge> : <Badge tone="warning">Bekliyor</Badge>}</Td>
        <Td right><span className="inline-flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => ask(b.verified ? "Doğrulamayı kaldır" : "İşletmeyi doğrula", `${b.name} — doğrulama durumu değişecek.`, () => act({ action: "business_verify", id: b.id, verified: !b.verified }, "Kayıt güncellendi"))}>{b.verified ? "Kaldır" : "Doğrula"}</Button>
          <Select value={b.planCode} onChange={(e) => void ask("Paket değiştir", `${b.name} → ${e.target.value}. Faturalandırma yeni pakete göre yapılır.`, () => act({ action: "business_plan", id: b.id, planCode: e.target.value }, "Paket güncellendi"))} className="h-8 py-0 text-[0.78rem]">
            {["FREE", "PRO", "BOOST", "AI28"].map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </span></Td></tr>))}</tbody></Table>
    <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
  </Wrap>;

  if (section === "moderation") return <Wrap title="Kampanya moderasyonu" desc="Koşulları eksik veya yanıltıcı kampanyaları reddet; onaylananlar müşteriye görünür.">
    <Table><thead><tr><Th>Kampanya</Th><Th>İşletme</Th><Th>İndirim</Th><Th>Bitiş</Th><Th>Durum</Th><Th right>Karar</Th></tr></thead>
      <tbody>{data.campaigns.map((cm) => (<tr key={cm.id}><Td strong>{cm.title}<span className="ml-2 text-[0.72rem] text-muted">{cm.code}</span></Td><Td>{cm.businessName}</Td>
        <Td className="tabular">{cm.discountPercent ? `%${cm.discountPercent}` : "—"}</Td><Td>{cm.endsAt ? shortDate(cm.endsAt, lang) : "—"}</Td>
        <Td><StatusBadge status={cm.moderationStatus} lang={lang} />{cm.isSponsored ? <span className="ml-2"><Badge tone="accent">Sponsorlu</Badge></span> : null}</Td>
        <Td right><span className="inline-flex gap-1.5">
          <Button size="sm" onClick={() => ask("Kampanyayı onayla", cm.title, () => act({ action: "campaign_moderate", id: cm.id, decision: "APPROVED" }, "Onaylandı"))}>Onayla</Button>
          <Button size="sm" variant="danger" onClick={() => ask("Kampanyayı reddet", `${cm.title} yayından kaldırılacak.`, () => act({ action: "campaign_moderate", id: cm.id, decision: "REJECTED" }, "Reddedildi"))}>Reddet</Button>
          <Button size="sm" variant="ghost" onClick={() => void act({ action: "campaign_feature", id: cm.id, isSponsored: !cm.isSponsored }, "Sponsorluk güncellendi")}>{cm.isSponsored ? "Sponsorluğu kaldır" : "Sponsorlu yap"}</Button>
        </span></Td></tr>))}</tbody></Table>
    <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
  </Wrap>;

  if (section === "qr") return <Wrap title="QR etkinliği" desc="Okutma, doğrulamaya gönderme ve doğrulanmış kullanım ayrı olaylardır.">
    <div className="mb-5 grid gap-4 sm:grid-cols-4">
      <Kpi label="QR okutma" value={c.qrScans} /><Kpi label="Onay bekliyor" value={c.pendingVerification} />
      <Kpi label="Doğrulanmış" value={c.verifiedUsage} /><Kpi label="Olay: qr_scanned" value={c.events.qr_scanned} />
    </div>
    <Table><thead><tr><Th>Kampanya</Th><Th>İşletme</Th><Th>Müşteri</Th><Th>Kanal</Th><Th>Okutulma</Th><Th>Durum</Th></tr></thead>
      <tbody>{data.usages.map((u) => (<tr key={u.id}><Td strong>{u.campaignTitle}</Td><Td>{u.businessName}</Td><Td>{u.customerName}</Td><Td>{u.channel}</Td>
        <Td>{u.scannedAt ? shortDate(u.scannedAt, lang) : "—"}</Td><Td><StatusBadge status={u.status} lang={lang} /></Td></tr>))}</tbody></Table>
  </Wrap>;

  if (section === "referrals") return <Wrap title="Yönlendirme izleme" desc="Tek seviye davet; şüpheli davranışlar işaretlenir.">
    <Table><thead><tr><Th>Kod</Th><Th>Davet eden</Th><Th>Davet edilen</Th><Th>Durum</Th><Th>Sinyaller</Th><Th>Tarih</Th></tr></thead>
      <tbody>{data.referrals.map((r) => (<tr key={r.id}><Td strong className="tabular">{r.code}</Td><Td>{r.inviter}</Td><Td>{r.invitee}</Td>
        <Td><StatusBadge status={r.status} lang={lang} /></Td><Td>{r.fraudFlags.length ? r.fraudFlags.map((f) => <Badge key={f} tone="danger" className="mr-1">{f}</Badge>) : <span className="text-muted">—</span>}</Td>
        <Td>{r.createdAt ? shortDate(r.createdAt, lang) : "—"}</Td></tr>))}</tbody></Table>
  </Wrap>;

  if (section === "bonusRules") return <BonusRules data={data} lang={lang} act={act} />;

  if (section === "ads") return <Wrap title="Reklam paketleri ve yayınlar" desc="Reklam yayını yönetici onayıyla başlar; gösterilmeyen reklam raporlanmaz.">
    <Table><thead><tr><Th>Reklam</Th><Th>İşletme</Th><Th>Yerleşim</Th><Th>Gösterim</Th><Th>Tıklama</Th><Th>CTR</Th><Th>Durum</Th><Th right>İşlem</Th></tr></thead>
      <tbody>{data.ads.map((a) => (<tr key={a.id}><Td strong>{a.name}</Td><Td>{a.businessName}</Td><Td>{a.placement}</Td><Td right>{num(a.impressions, lang)}</Td><Td right>{num(a.clicks, lang)}</Td>
        <Td right>{pct(a.impressions ? a.clicks / a.impressions : 0, 2)}</Td><Td><StatusBadge status={a.status} lang={lang} /></Td>
        <Td right><span className="inline-flex gap-1.5">
          <Button size="sm" onClick={() => ask("Reklamı yayınla", `${a.name} yayına alınacak.`, () => act({ action: "ad_status", id: a.id, status: "ACTIVE" }, "Reklam aktif"))}>Yayınla</Button>
          <Button size="sm" variant="secondary" onClick={() => void act({ action: "ad_status", id: a.id, status: "ENDED" }, "Reklam durduruldu")}>Durdur</Button>
        </span></Td></tr>))}</tbody></Table>
    <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
  </Wrap>;

  if (section === "ai") return <Wrap title="AI pazarlama hizmetleri" desc="Sağlayıcı, model ve limitler. Anahtarlar tarayıcıya gönderilmez.">
    <div className="grid gap-4 lg:grid-cols-2">
      {data.aiSettings.map((s) => (
        <Card key={s.id}><p className="tabular text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted">{s.key}</p>
          <p className="mt-1.5 text-[0.92rem] font-semibold text-ink">{s.key.toLowerCase().includes("key") ? "•••••••• (sunucu tarafında)" : s.value}</p>
          <p className="mt-1 text-[0.8rem] leading-relaxed text-muted">{s.description}</p></Card>
      ))}
    </div>
    <div className="mt-6"><Table><thead><tr><Th>İçerik</Th><Th>İşletme</Th><Th>Tür</Th><Th>Durum</Th><Th>Tarih</Th></tr></thead>
      <tbody>{data.contents.map((x) => (<tr key={x.id}><Td strong>{x.title}</Td><Td>{x.businessName}</Td><Td>{x.kind}</Td><Td><StatusBadge status={x.status} lang={lang} /></Td><Td>{x.createdAt ? shortDate(x.createdAt, lang) : "—"}</Td></tr>))}</tbody></Table></div>
  </Wrap>;

  if (section === "fees") return <Wrap title="Hizmet bedeli kuralları" desc="Kural değişince geçmiş faturalar değişmez; her faturada uygulanan oran dondurulur.">
    <Table><thead><tr><Th>İşletme</Th><Th>Hizmet türü</Th><Th>Tür</Th><Th right>Tutar / Oran</Th><Th>Hesaplama</Th><Th>Aktif</Th></tr></thead>
      <tbody>{data.feeRules.map((f) => (<tr key={f.id}><Td strong>{f.businessName}</Td><Td>{f.serviceType}{f.packageCode ? ` · ${f.packageCode}` : ""}</Td><Td>{f.kind === "FIXED" ? "Sabit" : "Yüzde"}</Td>
        <Td right className="tabular">{f.kind === "FIXED" ? money(f.amountCents, currency, lang) : pct(f.rate, 1)}</Td><Td>{f.calculationBase}</Td>
        <Td><Toggle checked={f.active} onChange={() => void act({ action: "fee_rule_update", id: f.id, amountCents: f.amountCents, rate: f.rate, active: !f.active }, "Kural güncellendi")} label="Aktif" /></Td></tr>))}</tbody></Table>
  </Wrap>;

  if (section === "invoices") return <Wrap title="Faturalar ve tahsilat durumu" desc="DampingVar hizmet bedeli faturaları. Müşteri ödemesi burada yer almaz.">
    <Table><thead><tr><Th>Fatura</Th><Th>İşletme</Th><Th>Dönem</Th><Th right>Tutar</Th><Th>Vade</Th><Th>Durum</Th><Th right>İşlem</Th></tr></thead>
      <tbody>{data.invoices.map((i) => (<tr key={i.id}><Td strong className="tabular">{i.number}</Td><Td>{i.businessName}</Td>
        <Td>{i.periodStart ? shortDate(i.periodStart, lang) : "—"} → {i.periodEnd ? shortDate(i.periodEnd, lang) : "—"}</Td>
        <Td right className="tabular">{money(i.totalCents, i.currency as Currency, lang)}</Td><Td>{i.dueDate ? shortDate(i.dueDate, lang) : "—"}</Td>
        <Td><StatusBadge status={i.status} lang={lang} /></Td>
        <Td right><Select value={i.status} onChange={(e) => void ask("Fatura durumu", `${i.number} → ${e.target.value}`, () => act({ action: "invoice_status", id: i.id, status: e.target.value }, "Fatura güncellendi"))} className="h-8 py-0 text-[0.78rem]">
          {["DRAFT", "ISSUED", "SENT", "PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Td></tr>))}</tbody></Table>
    <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
  </Wrap>;

  if (section === "analytics") return <Wrap title="Platform analitiği" desc="Olay türleri ayrı ölçülür; tıklama ile doğrulanmış kullanım aynı metrik değildir.">
    <Card><HBarsInline rows={Object.entries(c.events).map(([k, v]) => ({ label: k, value: v as number }))} /></Card>
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <Kpi label="QR okutma → doğrulanmış" value={c.qrScans ? Number(((c.verifiedUsage / c.qrScans) * 100).toFixed(1)) : 0} unit="%" />
      <Kpi label="Doğrulanmış kullanım" value={c.verifiedUsage} />
      <Kpi label="Bonus (kullanılabilir)" value={c.bonusAvailable} />
    </div>
  </Wrap>;

  if (section === "fraud") return <Wrap title="Fraud ve kötüye kullanım" desc="Self-referral, aynı cihaz, olağandışı sıklık sinyalleri.">
    {data.fraud.length === 0 ? <EmptyState icon={<Icon.shield size={22} />} title="Açık inceleme yok" /> : (
      <div className="space-y-3">{data.fraud.map((f) => (
        <Card key={f.id}><div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold text-ink">{f.reason}</p><p className="mt-1 text-[0.8rem] text-muted">{f.userName} · {f.createdAt ? shortDate(f.createdAt, lang) : ""}</p>
            <div className="mt-2 flex gap-1.5">{f.signals.map((s) => <Badge key={s} tone="danger">{s}</Badge>)}</div></div>
          <div className="flex items-center gap-2"><StatusBadge status={f.status} lang={lang} />
            {f.status === "OPEN" ? <>
              <Button size="sm" variant="secondary" onClick={() => void act({ action: "fraud_resolve", id: f.id, status: "CLEARED" }, "İnceleme kapatıldı")}>Temizle</Button>
              <Button size="sm" variant="danger" onClick={() => ask("Kaydı engelle", "İlgili bonus/işlem incelemeye alınır.", () => act({ action: "fraud_resolve", id: f.id, status: "BLOCKED" }, "Engellendi"))}>Engelle</Button>
            </> : null}</div></div></Card>))}</div>
    )}
    <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
  </Wrap>;

  if (section === "settings") return <PkgSettings data={data} lang={lang} act={act} />;

  if (section === "affiliateOffers") return <Wrap title="Affiliate fırsatları" desc="Örnek içerik etiketi, ağ bağlantı durumu ve etkinlik. Komisyon koşulları ağ tarafından sağlanmadıysa boş bırakılır.">
    <Notice tone="warning" icon={<Icon.alert size={16} />} className="mb-5">
      Hiçbir ağ <strong>CONNECTED</strong> değilken canlı dönüşüm verisi çekilemez. Bu ekrandaki kayıtlar demo/örnek
      olarak işaretlidir; gerçek bir markanın aktif teklifi değildir.
    </Notice>
    <Table><thead><tr><Th>Fırsat</Th><Th>Satıcı</Th><Th>Kategori</Th><Th>Ağ</Th><Th>Gösterim</Th><Th>Tıklama</Th><Th>Dönüşüm</Th><Th>Durum</Th><Th right>İşlem</Th></tr></thead>
      <tbody>{affiliate.offers.map((o) => (<tr key={o.id}>
        <Td strong><a className="link-sweep text-accent" href={`/firsat/${o.slug}`}>{o.title}</a>{o.isSample ? <span className="ml-2"><Badge tone="warning">örnek</Badge></span> : null}</Td>
        <Td>{o.merchant}</Td><Td>{o.category} · {o.country}</Td>
        <Td>{o.networkName} <Badge tone={o.networkStatus === "CONNECTED" ? "positive" : "warning"}>{o.networkStatus}</Badge></Td>
        <Td right>{num(o.impressions, lang)}</Td><Td right>{num(o.clicks, lang)}</Td><Td right>{o.conversions}</Td>
        <Td><StatusBadge status={o.status} lang={lang} /></Td>
        <Td right><span className="inline-flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => void act({ action: "offer-status", id: o.id, status: o.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }, "Fırsat durumu güncellendi")}>{o.status === "ACTIVE" ? "Duraklat" : "Aktifleştir"}</Button>
        </span></Td></tr>))}</tbody></Table>
  </Wrap>;

  if (section === "affiliateNetworks") return <Wrap title="Affiliate ağ durumu" desc="Bağlantı kurulmamışsa kurulum durumu gösterilir; sahte canlı entegrasyon gösterilmez.">
    <div className="grid gap-4 lg:grid-cols-2">
      {affiliate.networks.map((n) => (
        <Card key={n.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-display text-[1.05rem] font-bold">{n.name}</p>
              <p className="mt-1 text-[0.82rem] text-muted">{n.reportingMethod ?? "—"} · {n.commissionModel ?? "—"}</p></div>
            <StatusBadge status={n.status === "CONNECTED" ? "ACTIVE" : n.status === "SUSPENDED" ? "BLOCKED" : "PENDING"} lang={lang} />
          </div>
          <p className="mt-3 text-[0.86rem] leading-relaxed text-muted">{n.notes}</p>
          <p className="tabular mt-2 text-[0.76rem] text-muted-2">Son senkron: {n.lastSyncAt ? shortDate(n.lastSyncAt, lang) : "hiç"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["NOT_CONNECTED", "PENDING_CREDENTIALS", "CONNECTED", "SUSPENDED"].map((st) => (
              <Button key={st} size="sm" variant={n.status === st ? "primary" : "secondary"}
                onClick={() => ask("Ağ durumu değişecek", `${n.name} → ${st}. Bu değişiklik denetim kaydına yazılır.`, () => act({ action: "network-status", id: n.id, status: st }, "Ağ durumu güncellendi"))}>{st}</Button>
            ))}
          </div>
        </Card>
      ))}
    </div>
    <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
  </Wrap>;

  if (section === "affiliateCommissions") return <Wrap title="Komisyon raporları ve yaşam döngüsü" desc="Tıklama → ağ raporu → bekleyen → onay/red → iade → ödendi. Bekleyen komisyon gelir değildir.">
    <Card className="mb-5">
      <p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Komisyon yaşam döngüsü</p>
      <Funnel steps={[
        { label: "İzlenen tıklama", value: affiliate.totals.clicks, measured: true },
        { label: "Satıcıya yönlendirme (onaylı çıkış)", value: affiliate.totals.outbound, measured: true },
        { label: "Ağ raporu alındı", value: affiliate.totals.reported, measured: true, note: "Rapor yoksa dönüşüm var sayılmaz." },
        { label: "Onay bekleyen komisyon", value: affiliate.totals.pending, measured: true, note: `${money(affiliate.totals.unconfirmedCents, currency, lang)} — doğrulanmamış` },
        { label: "Onaylanan komisyon", value: affiliate.totals.approved, measured: true },
        { label: "Ödenen komisyon", value: affiliate.totals.paid, measured: true, note: `${money(affiliate.totals.paidCents, currency, lang)}` },
        { label: "Reddedilen / iade edilen", value: affiliate.totals.rejected + affiliate.totals.reversed, measured: true },
      ]} formatValue={(v) => num(v, lang)} />
    </Card>
    <Table><thead><tr><Th>Fırsat</Th><Th>Satıcı</Th><Th>Kaynak</Th><Th right>Tutar</Th><Th>Rapor</Th><Th>Durum</Th><Th right>Yaşam döngüsü</Th></tr></thead>
      <tbody>{affiliate.conversions.map((v) => (<tr key={v.id}>
        <Td strong>{v.offerTitle}</Td><Td>{v.merchant}</Td>
        <Td><Badge tone={v.source === "DEMO_SAMPLE" ? "warning" : "info"}>{v.source}</Badge>{v.networkReference ? <span className="tabular ml-2 text-[0.72rem] text-muted">{v.networkReference}</span> : null}</Td>
        <Td right><span className="tabular">{v.commissionCents != null ? money(v.commissionCents, v.currency as Currency, lang) : "—"}</span></Td>
        <Td>{v.reportedAt ? shortDate(v.reportedAt, lang) : "—"}</Td>
        <Td><StatusBadge status={v.status === "REPORTED" ? "SUBMITTED" : v.status} lang={lang} /></Td>
        <Td right><Select value={v.status} onChange={(e) => ask("Komisyon durumu", `${v.offerTitle} → ${e.target.value}. Ağ raporuna dayanmayan onay gelir yaratmaz.`, () => act({ action: "conversion-status", id: v.id, status: e.target.value }, "Komisyon durumu güncellendi"))} className="h-8 py-0 text-[0.76rem]">
          {["REPORTED", "PENDING", "APPROVED", "REJECTED", "REVERSED", "PAID"].map((st) => <option key={st} value={st}>{st}</option>)}
        </Select></Td></tr>))}</tbody></Table>
    <p className="mt-3 text-[0.78rem] text-muted">Demo kaynaklı kayıtlar <span className="tabular">DEMO_SAMPLE</span> olarak işaretlenir ve canlı ağ raporundan gelmiş gibi sunulmaz.</p>
    <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
  </Wrap>;

  return <Wrap title="Denetim kayıtları" desc="Kritik yönetici işlemleri izlenebilir şekilde saklanır.">
    <Table><thead><tr><Th>İşlem</Th><Th>Kim</Th><Th>Rol</Th><Th>Nesne</Th><Th>Tarih</Th></tr></thead>
      <tbody>{data.audit.map((a) => (<tr key={a.id}><Td strong>{a.action}</Td><Td>{a.actor}</Td><Td><Badge tone="neutral">{a.role}</Badge></Td><Td>{a.entityType ?? "—"}</Td><Td>{a.createdAt ? shortDate(a.createdAt, lang) : "—"}</Td></tr>))}</tbody></Table>
  </Wrap>;
}

function Wrap({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return <div><DashSectionHead title={title} desc={desc} />{children}</div>;
}

function HBarsInline({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return <ul className="space-y-2.5">{rows.map((r) => (<li key={r.label}>
    <div className="flex items-baseline justify-between text-[0.82rem]"><span className="text-ink-700">{r.label}</span><span className="tabular font-semibold">{num(r.value)}</span></div>
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas-2"><div className="bar-grow h-full rounded-full bg-ink-700" style={{ width: `${(r.value / max) * 100}%`, transformOrigin: "left" }} /></div></li>))}</ul>;
}

function ConfirmDialog({ confirm, onClose }: { confirm: { title: string; desc: string; run: () => Promise<void> } | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return <Dialog open={!!confirm} onClose={onClose} title={confirm?.title ?? ""} desc={confirm?.desc}
    footer={<><Button variant="secondary" onClick={onClose}>Vazgeç</Button>
      <Button loading={busy} onClick={async () => { if (!confirm) return; setBusy(true); await confirm.run(); setBusy(false); onClose(); }}>Onayla ve uygula</Button></>}>
    <Notice tone="warning" icon={<Icon.alert size={16} />}>Bu işlem denetim kaydına yazılır ve geri alınması ek işlem gerektirebilir.</Notice>
  </Dialog>;
}

function BonusRules({ data, lang, act }: { data: AdminData; lang: Lang; act: (b: Record<string, unknown>, m: string) => Promise<void> }) {
  return <Wrap title="Damping Bonus kuralları" desc="Bonus; mağazaya bağlı indirim hakkıdır. Nakit, cüzdan bakiyesi veya ortak puan değildir.">
    <Notice tone="info" icon={<Icon.info size={16} />} className="mb-5">
      Kazanım yalnızca işletme tarafından doğrulanmış alışverişten sonra oluşur. Bonus hangi mağazada kazanıldıysa yalnızca orada kullanılabilir; devredilemez, nakde çevrilemez.
    </Notice>
    <div className="grid gap-4 lg:grid-cols-2">
      {data.policies.map((p) => <PolicyCard key={p.id} p={p} lang={lang} act={act} />)}
    </div>
    <div className="mt-6"><Table><thead><tr><Th>Müşteri</Th><Th>Mağaza</Th><Th right>Değer</Th><Th>Durum</Th><Th>Son geçerlilik</Th></tr></thead>
      <tbody>{data.bonuses.map((b) => (<tr key={b.id}><Td strong>{b.userName}</Td><Td>{b.businessName}</Td><Td right className="tabular">{money(b.valueCents, b.currency as Currency, lang)}</Td>
        <Td><StatusBadge status={b.status} lang={lang} /></Td><Td>{b.expiresAt ? shortDate(b.expiresAt, lang) : "—"}</Td></tr>))}</tbody></Table></div>
  </Wrap>;
}

function PolicyCard({ p, lang, act }: { p: AdminData["policies"][number]; lang: Lang; act: (b: Record<string, unknown>, m: string) => Promise<void> }) {
  const [f, setF] = useState({
    rewardKind: p.rewardKind, rewardCents: p.rewardCents / 100, rewardPercent: p.rewardPercent * 100,
    maxRewardCents: p.maxRewardCents / 100, minPurchaseCents: p.minPurchaseCents / 100, validDays: p.validDays,
    maxPerInviter: p.maxPerInviter, requiresVerification: p.requiresVerification, active: p.active,
  });
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div><p className="tabular text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">{p.key}</p>
          <p className="mt-1 font-display text-[1.02rem] font-bold">{p.businessName}</p></div>
        <Badge tone={p.active ? "positive" : "neutral"}>{p.active ? "Aktif" : "Pasif"}</Badge>
      </div>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault();
        await act({ action: "bonus_policy_update", id: p.id, ...f, rewardCents: Math.round(f.rewardCents * 100), rewardPercent: f.rewardPercent / 100, maxRewardCents: Math.round(f.maxRewardCents * 100), minPurchaseCents: Math.round(f.minPurchaseCents * 100) }, "Bonus politikası güncellendi");
      }}>
        <Field label="Ödül türü"><Select value={f.rewardKind} onChange={(e) => setF({ ...f, rewardKind: e.target.value })}><option value="FIXED">Sabit tutar</option><option value="PERCENT_OF_BASKET">Sepet yüzdesi</option></Select></Field>
        <Field label={f.rewardKind === "FIXED" ? "Ödül (birim)" : "Ödül yüzdesi"}>
          {f.rewardKind === "FIXED"
            ? <Input type="number" min={0} value={f.rewardCents} onChange={(e) => setF({ ...f, rewardCents: Number(e.target.value) })} />
            : <Input type="number" min={0} max={50} value={f.rewardPercent} onChange={(e) => setF({ ...f, rewardPercent: Number(e.target.value) })} />}
        </Field>
        <Field label="Üst sınır"><Input type="number" min={0} value={f.maxRewardCents} onChange={(e) => setF({ ...f, maxRewardCents: Number(e.target.value) })} /></Field>
        <Field label="Minimum alışveriş"><Input type="number" min={0} value={f.minPurchaseCents} onChange={(e) => setF({ ...f, minPurchaseCents: Number(e.target.value) })} /></Field>
        <Field label="Geçerlilik (gün)"><Input type="number" min={1} value={f.validDays} onChange={(e) => setF({ ...f, validDays: Number(e.target.value) })} /></Field>
        <Field label="Davet başına limit"><Input type="number" min={0} value={f.maxPerInviter} onChange={(e) => setF({ ...f, maxPerInviter: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-2 flex flex-wrap gap-5">
          <Toggle checked={f.requiresVerification} onChange={(v) => setF({ ...f, requiresVerification: v })} label="Doğrulama zorunlu" />
          <span className="text-[0.82rem] text-ink-700">Doğrulama zorunlu {f.requiresVerification ? "açık" : "kapalı"}</span>
          <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Politika aktif" />
          <span className="text-[0.82rem] text-ink-700">Politika {f.active ? "aktif" : "pasif"}</span>
        </div>
        <div className="sm:col-span-2"><Button type="submit" size="sm">Politikayı kaydet</Button></div>
      </form>
      <p className="mt-3 text-[0.76rem] leading-relaxed text-muted">Örnek gösterim: <QrPanel value={`BONUS-${p.key}`} size={0} /></p>
      <span className="sr-only">{lang}</span>
    </Card>
  );
}

function PkgSettings({ data, lang, act }: { data: AdminData; lang: Lang; act: (b: Record<string, unknown>, m: string) => Promise<void> }) {
  return <Wrap title="Paketler ve sistem ayarları" desc="Paket fiyatları yapılandırılabilir; koda gömülü değildir.">
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      {data.packages.map((p) => <PackageCard key={p.id} p={p} lang={lang} act={act} />)}
    </div>
  </Wrap>;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function Reports({ data, lang, currency }: { data: AdminData; lang: Lang; currency: Currency }) {
  const toast = useToast();
  const c = data.counts;

  const campaignRows: (string | number)[][] = [
    ["kampanya", "isletme", "durum", "moderasyon", "gosterim", "tiklama"],
    ...data.campaigns.map((x) => [x.title, x.businessName, x.status, x.moderationStatus, x.views, x.clicks]),
  ];
  const usageRows: (string | number)[][] = [
    ["kampanya", "isletme", "musteri", "kanal", "durum", "okutulma"],
    ...data.usages.map((u) => [u.campaignTitle, u.businessName, u.customerName, u.channel, u.status, u.scannedAt ?? ""]),
  ];
  const feeRows: (string | number)[][] = [
    ["fatura", "isletme", "donem_baslangic", "donem_bitis", "ara_toplam", "vergi", "toplam", "durum", "para_birimi"],
    ...data.invoices.map((i) => [
      i.number, i.businessName, i.periodStart ?? "", i.periodEnd ?? "",
      (i.subtotalCents / 100).toFixed(2), (i.taxCents / 100).toFixed(2), (i.totalCents / 100).toFixed(2), i.status, i.currency,
    ]),
  ];

  function exportAll(name: string, rows: (string | number)[][]) {
    downloadCsv(name, rows);
    toast.push({ title: "Rapor indirildi", desc: `${name} · ${rows.length - 1} kayıt`, tone: "positive" });
  }

  return (
    <Wrap title="Raporlar" desc="Dönemsel operasyon raporları. Hizmet geliri ile müşteri indirimleri ayrı bölümlerde tutulur.">
      <Notice tone="info" icon={<Icon.info size={16} />} className="mb-5">
        Raporlarda yalnızca sistem tarafından toplanan olaylar yer alır. QR okutma sayısı doğrulanmış satış olarak
        raporlanmaz; tahmini değerler ayrıca işaretlenir.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Toplam kampanya" value={c.campaigns} icon={<Icon.tag size={16} />} />
        <Kpi label="QR okutma" value={c.qrScans} icon={<Icon.qr size={16} />} />
        <Kpi label="Doğrulanmış kullanım" value={c.verifiedUsage} icon={<Icon.verified size={16} />} />
        <Kpi label="Faturalanan hizmet bedeli" value={c.billed / 100} unit={currency} icon={<Icon.receipt size={16} />} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {[
          { key: "campaigns", title: "Kampanya performansı", desc: "Kampanya bazında durum, gösterim ve tıklama.", rows: campaignRows, file: "dampingvar-kampanya-raporu.csv" },
          { key: "usages", title: "QR ve kullanım kayıtları", desc: "Okutma, gönderim, doğrulama ve kanal bilgisi.", rows: usageRows, file: "dampingvar-qr-kullanim-raporu.csv" },
          { key: "fees", title: "Hizmet bedeli faturaları", desc: "Dönem, ara toplam, vergi, toplam ve tahsilat durumu.", rows: feeRows, file: "dampingvar-hizmet-fatura-raporu.csv" },
        ].map((r) => (
          <Card key={r.key}>
            <p className="font-display text-[1.02rem] font-bold">{r.title}</p>
            <p className="mt-1.5 text-[0.84rem] leading-relaxed text-muted">{r.desc}</p>
            <p className="tabular mt-3 text-[0.8rem] text-muted">{r.rows.length - 1} kayıt · {shortDate(new Date(), lang)}</p>
            <Button size="sm" variant="secondary" className="mt-4 w-full" icon={<Icon.upload size={14} />} onClick={() => exportAll(r.file, r.rows)}>
              CSV indir
            </Button>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">İşletme bazında doğrulanmış kullanım</p>
          <HBarsInline
            rows={data.businesses.map((b) => ({
              label: b.name,
              value: data.usages.filter((u) => u.businessName === b.name && u.status === "VERIFIED").length,
            }))}
          />
        </Card>
        <Card>
          <p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted">Bonus durum dağılımı</p>
          <HBarsInline
            rows={["AVAILABLE", "PENDING_VERIFICATION", "USED", "EXPIRED", "REJECTED", "CANCELLED"].map((s) => ({
              label: s,
              value: data.bonuses.filter((b) => b.status === s).length,
            }))}
          />
          <p className="mt-4 text-[0.78rem] leading-relaxed text-muted">
            Damping Bonus mağazaya bağlı indirim hakkıdır; platformun finansal borcu veya müşteri bakiyesi değildir.
          </p>
        </Card>
      </div>
    </Wrap>
  );
}

function PackageCard({ p, lang, act }: { p: AdminData["packages"][number]; lang: Lang; act: (b: Record<string, unknown>, m: string) => Promise<void> }) {
  const [price, setPrice] = useState(p.priceMonthlyCents / 100);
  const [quota, setQuota] = useState(p.aiQuotaMonthly);
  return (
    <Card>
      <p className="font-display text-[1.02rem] font-bold">{p.name}</p>
      <p className="tabular mt-1 text-[0.76rem] text-muted">{p.code}</p>
      <p className="tabular mt-2 text-[1.35rem] font-semibold">{money(p.priceMonthlyCents, "TRY", lang)}</p>
      <ul className="mt-3 space-y-1.5">{p.features.slice(0, 5).map((f) => <li key={f} className="flex gap-1.5 text-[0.8rem] text-ink-700"><Icon.check size={13} className="mt-0.5 shrink-0 text-positive" />{f}</li>)}</ul>
      <form className="mt-4 grid gap-3" onSubmit={async (e) => { e.preventDefault(); await act({ action: "package_update", code: p.code, priceMonthlyCents: Math.round(price * 100), aiQuotaMonthly: quota, active: p.active }, "Paket güncellendi"); }}>
        <Field label="Aylık fiyat (TRY)"><Input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
        <Field label="Aylık AI kotası"><Input type="number" min={0} value={quota} onChange={(e) => setQuota(Number(e.target.value))} /></Field>
        <Button type="submit" size="sm" variant="secondary">Kaydet</Button>
      </form>
    </Card>
  );
}
