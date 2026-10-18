"use client";

import { useMemo, useState } from "react";
import {
  Badge, Button, Card, Chip, EmptyState, Journey, Notice, Pagination, Tabs, type JourneyStep,
} from "@/components/ds";
import { Icon as I } from "@/components/icons";
import { dateTime, type Lang } from "@/lib/money";

export type FlowEvent = {
  id: string;
  journey: "affiliate" | "local" | "referral" | "platform";
  kind: string;
  label: string;
  subject: string;
  status: string;
  verified: boolean;
  at: string | null;
  note?: string;
};

const JOURNEYS = [
  {
    key: "affiliate",
    label: "Online fırsat (affiliate)",
    stages: [
      { key: "VIEWED", label: "Fırsat görüntülendi" },
      { key: "CLICKED", label: "Bağlantıya tıklandı" },
      { key: "REDIRECTED", label: "Satıcıya yönlendirildi" },
      { key: "REPORTED", label: "Ağ raporu bekleniyor" },
      { key: "PENDING", label: "Komisyon onay bekliyor" },
      { key: "APPROVED", label: "Komisyon onaylandı" },
    ],
    hint: "Dış satıcıya giden tıklama satın alma değildir. Komisyon yalnızca ağ raporuyla oluşur.",
  },
  {
    key: "local",
    label: "Yerel kampanya (QR)",
    stages: [
      { key: "CAMPAIGN_VIEW", label: "Kampanya görüntülendi" },
      { key: "QR_SCANNED", label: "QR okutuldu" },
      { key: "TERMS_VIEWED", label: "Koşullar incelendi" },
      { key: "SUBMITTED", label: "Doğrulamaya gönderildi" },
      { key: "VERIFIED", label: "İşletme doğruladı" },
      { key: "DISCOUNT_APPLIED", label: "İndirim uygulandı (işletme bildirdi)" },
    ],
    hint: "QR okutma ile işletme doğrulaması ayrı olaylardır; okutma satış kanıtı değildir.",
  },
  {
    key: "referral",
    label: "Davet & Damping Bonus",
    stages: [
      { key: "SHARED", label: "Davet paylaşıldı" },
      { key: "REGISTERED", label: "Arkadaş kayıt oldu" },
      { key: "PURCHASE_PENDING_VERIFICATION", label: "Alışveriş doğrulama bekliyor" },
      { key: "QUALIFIED", label: "Koşul sağlandı" },
      { key: "AVAILABLE", label: "Mağazaya bağlı bonus oluştu" },
      { key: "USED", label: "Bonus kullanıldı" },
    ],
    hint: "Bonus, alışverişin yapıldığı mağazaya bağlı indirim hakkıdır; nakit veya ortak bakiye değildir.",
  },
] as const;

const STATUS_TONE: Record<string, "positive" | "warning" | "info" | "danger" | "neutral" | "accent"> = {
  VERIFIED: "positive", APPROVED: "positive", PAID: "positive", AVAILABLE: "positive", USED: "neutral",
  QUALIFIED: "positive", DISCOUNT_APPLIED: "positive", REGISTERED: "info", REDIRECTED: "info",
  REPORTED: "info", PENDING: "warning", PURCHASE_PENDING_VERIFICATION: "warning", SUBMITTED: "warning",
  CLICKED: "neutral", QR_SCANNED: "neutral", CAMPAIGN_VIEW: "neutral", VIEWED: "neutral",
  TERMS_VIEWED: "neutral", SHARED: "neutral", REJECTED: "danger", REVERSED: "danger", FAILED: "danger",
  CANCELLED: "neutral", EXPIRED: "warning", RECORDED: "neutral",
};

function stageIndex(journeyKey: string, status: string): number {
  const j = JOURNEYS.find((x) => x.key === journeyKey);
  if (!j) return 0;
  const idx = j.stages.findIndex((s) => s.key === status);
  return idx < 0 ? 0 : idx;
}

function nextStep(journeyKey: string, status: string): string {
  const j = JOURNEYS.find((x) => x.key === journeyKey);
  if (!j) return "—";
  const idx = j.stages.findIndex((s) => s.key === status);
  if (idx < 0 || idx >= j.stages.length - 1) return "Akış tamamlandı veya ek adım beklenmiyor.";
  return `${j.stages[idx + 1].label} — bu adım ilgili tarafın aksiyonuna bağlıdır.`;
}

export default function FlowCenter({
  events,
  lang,
  isDemo,
  lastUpdate,
}: {
  events: FlowEvent[];
  lang: Lang;
  isDemo: boolean;
  lastUpdate: string | null;
}) {
  const [tab, setTab] = useState<string>("affiliate");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 8;

  const journey = JOURNEYS.find((j) => j.key === tab) ?? JOURNEYS[0];

  const scoped = useMemo(
    () => events.filter((e) => (tab === "all" ? true : e.journey === tab) && (!onlyVerified || e.verified)),
    [events, tab, onlyVerified]
  );

  const pages = Math.max(1, Math.ceil(scoped.length / perPage));
  const safePage = Math.min(page, pages);
  const rows = scoped.slice((safePage - 1) * perPage, safePage * perPage);

  // Aşama diyagramı: her aşamada GERÇEK olay sayısı (uydurma sayaç yok).
  const steps: JourneyStep[] = journey.stages.map((s) => {
    const count = events.filter((e) => e.journey === journey.key && e.status === s.key).length;
    const related = events.filter((e) => e.journey === journey.key);
    const reached = related.some((e) => stageIndex(journey.key, e.status) >= journey.stages.findIndex((x) => x.key === s.key));
    return {
      label: s.label,
      state: count > 0 ? "done" : reached ? "active" : "pending",
      note: count > 0 ? `${count} kayıt` : reached ? "kayıt bekleniyor" : undefined,
      verified: ["VERIFIED", "APPROVED", "PAID", "QUALIFIED", "AVAILABLE", "DISCOUNT_APPLIED"].includes(s.key) && count > 0,
    };
  });

  return (
    <div>
      {isDemo ? (
        <Notice tone="warning" icon={<I.alert size={16} />} className="mb-5">
          <strong>Demo görünümü.</strong> Aşağıdaki kayıtlar örnek verilerden oluşur; canlı bir ağ, ödeme sistemi veya
          gerçek zamanlı akışa bağlı değildir. Gerçek bir olay geldiğinde ilgili durum animasyonla güncellenir.
          {lastUpdate ? ` Son güncelleme: ${dateTime(lastUpdate, lang)}` : ""}
        </Notice>
      ) : null}

      <div className="mb-6">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1); }}
          items={[
            ...JOURNEYS.map((j) => ({ key: j.key, label: j.label, count: events.filter((e) => e.journey === j.key).length })),
            { key: "all", label: "Tüm akışlar", count: events.length },
          ]}
        />
      </div>

      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-accent">DampingVar İşlem Akışı</p>
            <h3 className="mt-1 font-display text-[1.2rem] font-bold">{journey.label}</h3>
          </div>
          <Badge tone="neutral">{events.filter((e) => e.journey === journey.key).length} kayıt</Badge>
        </div>
        <Journey steps={steps} caption={`${journey.label} aşamaları`} />
        <p className="mt-4 border-t-2 border-dashed border-line pt-3 text-[0.84rem] leading-relaxed text-muted">
          {journey.hint}
        </p>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={onlyVerified} onClick={() => { setOnlyVerified((v) => !v); setPage(1); }} icon={<I.verified size={13} />}>
            Yalnızca doğrulanmış
          </Chip>
          <span className="text-[0.82rem] text-muted">
            <span className="tabular font-bold text-ink">{scoped.length}</span> etkinlik
          </span>
        </div>
        <Button size="sm" variant="ghost" href="/islem-akisi" icon={<I.refresh size={14} />}>
          Yenile
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<I.layers size={22} />}
          title="Bu akışta henüz kayıt yok"
          desc="Gerçek bir olay oluştuğunda burada durum animasyonuyla görünür. Uydurma etkinlik üretilmez."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((e, i) => (
            <li key={e.id} className="anim-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <Card className="p-0">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 ${
                      e.journey === "affiliate"
                        ? "border-info bg-info-soft text-info"
                        : e.journey === "local"
                          ? "border-accent bg-accent-soft text-accent"
                          : e.journey === "referral"
                            ? "border-positive bg-positive-soft text-positive"
                            : "border-line bg-canvas text-muted"
                    }`}
                  >
                    {e.journey === "affiliate" ? <I.external size={17} /> : e.journey === "local" ? <I.qr size={17} /> : e.journey === "referral" ? <I.users size={17} /> : <I.chart size={17} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-[0.98rem] font-bold">{e.label}</p>
                      <Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status}</Badge>
                      {e.verified ? (
                        <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-positive">
                          <I.verified size={12} /> doğrulandı
                        </span>
                      ) : (
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-2">
                          doğrulanmadı
                        </span>
                      )}
                      <span className="tabular ml-auto text-[0.74rem] text-muted-2">{e.at ? dateTime(e.at, lang) : "—"}</span>
                    </div>

                    <p className="mt-1.5 truncate text-[0.86rem] text-ink-700">{e.subject}</p>

                    {/* aşama göstergesi: gerçek duruma göre ilerler */}
                    <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
                      {JOURNEYS.find((j) => j.key === e.journey)?.stages.map((s, si) => {
                        const reached = si <= stageIndex(e.journey, e.status);
                        return (
                          <span key={s.key} className="flex flex-1 items-center gap-1.5">
                            <span className={`h-1.5 flex-1 rounded-full ${reached ? (e.verified ? "bg-positive" : "bg-accent") : "bg-line"}`} />
                          </span>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t-2 border-dashed border-line pt-3 text-[0.8rem]">
                      <span className="text-muted">
                        <strong className="font-semibold text-ink-700">Sıradaki adım:</strong> {nextStep(e.journey, e.status)}
                      </span>
                      {e.note ? <span className="text-muted-2">{e.note}</span> : null}
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={safePage} pages={pages} onPage={setPage} />

      <p className="mt-6 text-[0.78rem] leading-relaxed text-muted">
        Etkinlik akışında müşteri adı, e-postası, telefonu veya sipariş detayı gösterilmez. Affiliate komisyonu
        müşteriye ait bir kazanç değildir; DampingVar&apos;ın ağdan tahsil edeceği tutardır.
      </p>
    </div>
  );
}
