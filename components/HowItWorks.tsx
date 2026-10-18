"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Journey, Tabs, type JourneyStep } from "@/components/ds";
import { Icon } from "@/components/icons";

type Flow = {
  key: string;
  label: string;
  promise: string;
  steps: { label: string; note: string; verified?: boolean }[];
  cta: { href: string; label: string };
  facts: string[];
  icon: React.ReactNode;
};

const FLOWS: Flow[] = [
  {
    key: "online",
    label: "Online fırsat",
    promise: "Markanın kendi sitesinde alışveriş; DampingVar yalnızca yönlendirir ve ölçer.",
    icon: <Icon.external size={16} />,
    steps: [
      { label: "Fırsatı keşfet", note: "Fiyat yalnızca doğrulanmışsa gösterilir." },
      { label: "İfşayı oku", note: "Uygun alışverişlerden DampingVar komisyon kazanabilir." },
      { label: "İzlenen bağlantıya bas", note: "Benzersiz click id ile kayıt oluşur." },
      { label: "Satıcının sitesine geç", note: "Sepet, ödeme ve teslimat satıcıdadır." },
      { label: "Ağ dönüşümü raporlar", note: "Rapor yoksa “dönüşüm bekleniyor” görünür." },
      { label: "Komisyon durumu güncellenir", note: "Bekleyen komisyon gelir sayılmaz.", verified: true },
    ],
    cta: { href: "/online-firsatlar", label: "Online fırsatları gör" },
    facts: [
      "Tıklama satın alma değildir.",
      "DampingVar ödeme almaz veya checkout sunmaz.",
      "Komisyon, ağın gerçek raporuna ve sözleşme kurallarına göre hesaplanır.",
    ],
  },
  {
    key: "local",
    label: "Yerel kampanya (QR)",
    promise: "Mağazada geçerli indirim; kasada işletme uygular, DampingVar etkinliği ölçer.",
    icon: <Icon.qr size={16} />,
    steps: [
      { label: "Kampanyayı bul", note: "Konum, kategori ve indirim oranına göre filtrele." },
      { label: "Koşulları incele", note: "Minimum sepet, geçerli ürünler, istisnalar." },
      { label: "Mağazaya git", note: "Adres, çalışma saatleri ve yol tarifi." },
      { label: "QR'ı okut", note: "Kayıt QR_SCANNED olarak tutulur." },
      { label: "Alışverişi işletmeyle tamamla", note: "Ödeme doğrudan işletmeye yapılır." },
      { label: "İşletme doğrulasın", note: "Yetkili onayıyla VERIFIED olur.", verified: true },
    ],
    cta: { href: "/kampanyalar", label: "Yerel kampanyaları gör" },
    facts: [
      "QR okutma tek başına satış kanıtı değildir.",
      "İndirim birikmez, devretmez, nakde çevrilmez.",
      "İşletme bildirirse uygulanan indirim tutarı kayda eklenir.",
    ],
  },
  {
    key: "referral",
    label: "Davet & Damping Bonus",
    promise: "Tek seviye davet; bonus alışverişin yapıldığı mağazaya bağlanır.",
    icon: <Icon.users size={16} />,
    steps: [
      { label: "Bağlantını paylaş", note: "Kendine ait davet kodu ve linki." },
      { label: "Arkadaşın kayıt olsun", note: "İlişki sunucuda doğrulanır." },
      { label: "Uygun alışveriş", note: "Bir mağazadan, koşullara uygun alışveriş." },
      { label: "İşletme doğrulasın", note: "Doğrulanmamış alışverişten bonus doğmaz." },
      { label: "Bonus oluşsun", note: "Yalnızca o mağazaya bağlı indirim hakkı.", verified: true },
      { label: "Mağazada kullan", note: "Kasada indirim olarak uygulanır." },
    ],
    cta: { href: "/hesabim?s=referrals", label: "Davet merkezine git" },
    facts: [
      "Bonus nakit, cashback veya cüzdan bakiyesi değildir.",
      "Başka mağazada kullanılamaz, devredilemez.",
      "Aynı alışverişten birden fazla bonus üretilemez.",
    ],
  },
];

export default function HowItWorks() {
  const [tab, setTab] = useState(FLOWS[0].key);
  const flow = FLOWS.find((f) => f.key === tab) ?? FLOWS[0];

  const steps: JourneyStep[] = flow.steps.map((s, i) => ({
    label: s.label,
    note: s.note,
    state: i < 2 ? "done" : i === 2 ? "active" : "pending",
    verified: s.verified,
  }));

  return (
    <div>
      <div className="mb-5">
        <Tabs items={FLOWS.map((f) => ({ key: f.key, label: f.label }))} value={tab} onChange={setTab} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border-2 border-accent bg-accent-soft text-accent">
              {flow.icon}
            </span>
            <div>
              <p className="font-display text-[1.08rem] font-bold leading-tight">{flow.label}</p>
              <p className="text-[0.84rem] text-muted">{flow.promise}</p>
            </div>
            <Badge tone="neutral" className="ml-auto">6 aşama</Badge>
          </div>

          <Journey steps={steps} orientation="vertical" caption={`${flow.label} akışı`} />

          <div className="mt-5 border-t-2 border-dashed border-line pt-4">
            <Button href={flow.cta.href} size="sm" iconRight={<Icon.arrowRight size={14} />}>
              {flow.cta.label}
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-accent">Bu akışta kesin olanlar</p>
            <ul className="mt-3 space-y-2.5">
              {flow.facts.map((f) => (
                <li key={f} className="flex gap-2.5 text-[0.88rem] leading-relaxed text-ink-700">
                  <Icon.check size={15} className="mt-0.5 shrink-0 text-positive" />
                  {f}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="bg-canvas">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">Neden ayrı tutuluyor?</p>
            <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-700">
              Online fırsatta para akışı satıcı ile müşteri arasındadır ve gelir DampingVar&apos;a komisyon olarak
              döner. Yerel kampanyada indirim işletmenin kendi kararıdır ve DampingVar hizmet bedeli faturalar.
              Davet akışında ise ortaya çıkan hak yalnızca bir mağazada geçerli indirimdir. Üçü tek bir “satın alma”
              hikâyesinde birleştirilmez.
            </p>
            <Link href="/islem-akisi" className="link-sweep mt-3 inline-flex items-center gap-1.5 text-[0.84rem] font-semibold text-accent">
              İşlem akışı merkezini aç <Icon.arrowRight size={14} />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
