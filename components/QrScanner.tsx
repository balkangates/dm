"use client";

import { useState } from "react";
import { Badge, Button, Card, Icon, Input, Notice, QrPanel, ToastProvider, useToast } from "@/components/ds";
import { dateTime } from "@/lib/money";

type ScanResult = {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
  notice?: string;
  problems?: string[];
  usage?: { id: string; status: string; scannedAt: string | null };
  campaign?: {
    title: string; terms: string | null; businessName: string; address: string; district: string;
    minBasketCents: number; discountPercent: number; currency: string; endsAt: string | null;
  };
};

function Inner({ prefill, userId }: { prefill: string; userId: string | null }) {
  const toast = useToast();
  const [code, setCode] = useState(prefill);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function scan() {
    if (!code.trim()) return;
    setBusy("scan");
    const res = await fetch("/api/qr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "scan", code: code.trim() }) });
    const json = (await res.json()) as ScanResult;
    setResult(json);
    setBusy(null);
    toast.push(json.ok
      ? { title: json.duplicate ? "Bu kod bugün zaten okutuldu" : "QR okutuldu", desc: "Kayıt: QR_SCANNED", tone: json.duplicate ? "warning" : "positive" }
      : { title: json.error ?? "Okutma başarısız", tone: "danger" });
  }

  async function submit() {
    if (!result?.usage?.id) return;
    if (!userId) { toast.push({ title: "Giriş gerekli", desc: "Doğrulama talebi için hesabına giriş yap.", tone: "warning" }); return; }
    setBusy("submit");
    const res = await fetch("/api/qr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit", usageId: result.usage.id }) });
    const json = await res.json();
    setBusy(null);
    if (json.ok) {
      setResult({ ...result, usage: { ...result.usage!, status: "SUBMITTED" } });
      toast.push({ title: "Doğrulama talebi gönderildi", desc: "İşletme onayladığında bildirim alırsın.", tone: "positive" });
    } else toast.push({ title: json.error ?? "Gönderilemedi", tone: "danger" });
  }

  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          <QrPanel value={code.trim() || "DAMPINGVAR-QR"} scanning={busy === "scan"} size={150} caption={code.trim() || "kod gir"} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[1.08rem] font-bold">Mağazada QR okut</p>
          <p className="mt-1 text-[0.86rem] leading-relaxed text-muted">
            Kamerayla okutulan kod buraya düşer. Demo ortamında kodu elle de girebilirsin.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="QR-KPA-20" className="min-w-[180px] flex-1 tabular" />
            <Button loading={busy === "scan"} onClick={() => void scan()} icon={<Icon.qr size={16} />}>Okut</Button>
          </div>

          {result ? (
            <div className="mt-5 space-y-3">
              {result.ok && result.campaign ? (
                <>
                  <div className="rounded-[4px] border border-line bg-canvas p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={result.usage?.status === "SUBMITTED" ? "info" : "neutral"}>{result.usage?.status ?? "QR_SCANNED"}</Badge>
                      {result.duplicate ? <Badge tone="warning">bugün tekrar okutuldu</Badge> : null}
                    </div>
                    <p className="mt-2.5 font-display text-[1.05rem] font-bold">{result.campaign.title}</p>
                    <p className="mt-1 text-[0.84rem] text-muted">{result.campaign.businessName} · {result.campaign.district}</p>
                    <p className="tabular mt-2 text-[0.84rem] text-ink-700">
                      {result.campaign.discountPercent ? `%${result.campaign.discountPercent} indirim` : ""}
                      {result.campaign.minBasketCents ? ` · min. sepet ${(result.campaign.minBasketCents / 100).toLocaleString("tr-TR")} ${result.campaign.currency}` : ""}
                    </p>
                    <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-[0.84rem] leading-relaxed text-muted">
                      {result.campaign.terms ?? "Koşul metni yok."}
                    </p>
                    <p className="mt-2 text-[0.78rem] text-muted-2">
                      {result.usage?.scannedAt ? `Okutulma: ${dateTime(result.usage.scannedAt)}` : ""}
                    </p>
                  </div>
                  {result.problems?.length ? <Notice tone="warning" icon={<Icon.alert size={16} />}>{result.problems.join(" ")}</Notice> : null}
                  <Notice tone="info" icon={<Icon.info size={16} />}>{result.notice}</Notice>
                  <div className="flex flex-wrap gap-2">
                    <Button loading={busy === "submit"} onClick={() => void submit()} icon={<Icon.verified size={15} />}>
                      Kullanımı doğrulamaya gönder
                    </Button>

                  </div>
                </>
              ) : (
                <Notice tone="danger" icon={<Icon.alert size={16} />}>{result.error ?? "Kod çözümlenemedi."}</Notice>
              )}
            </div>
          ) : (
            <p className="mt-4 text-[0.82rem] text-muted">
              Önce bir kampanya seç veya mağazadaki QR&apos;ı okut. Örnek kodlar: <span className="tabular">QR-KPA-20</span>,{" "}
              <span className="tabular">QR-MK-SABAH-15</span>.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function QrScanner(props: { prefill: string; userId: string | null }) {
  return <ToastProvider><Inner {...props} /></ToastProvider>;
}

export default QrScanner;
