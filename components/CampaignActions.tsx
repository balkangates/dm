"use client";

import { useState } from "react";
import { Button, Icon, ToastProvider, useToast } from "@/components/ds";
import type { Lang } from "@/lib/money";

function Inner({
  campaignId,
  businessId,
  businessSlug,
  code,
  userId,
  lang,
}: {
  campaignId: string;
  businessId: string;
  businessSlug: string;
  code: string;
  qrCode: string | null;
  userId: string | null;
  lang: Lang;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function save(next: boolean) {
    if (!userId) {
      toast.push({ title: "Giriş gerekli", desc: "Kampanyayı kaydetmek için hesabına giriş yap.", tone: "warning" });
      return;
    }
    setBusy("save");
    await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: next ? "save" : "unsave", campaignId }) });
    setSaved(next);
    setBusy(null);
    toast.push({ title: next ? "Kampanya kaydedildi" : "Kayıtlardan çıkarıldı", tone: next ? "positive" : "neutral" });
  }

  async function scan() {
    setBusy("scan");
    const res = await fetch("/api/qr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "scan", code }) });
    const json = await res.json();
    setBusy(null);
    if (json.ok) {
      toast.push({
        title: "QR okutuldu — kayıt QR_SCANNED",
        desc: json.notice,
        tone: "positive",
      });
    } else {
      toast.push({ title: json.error ?? "Okutma başarısız", tone: "danger" });
    }
  }

  async function share() {
    const url = `${window.location.origin}/kampanya/${code}`;
    if (navigator.share) await navigator.share({ url, title: "DampingVar kampanyası" }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.push({ title: "Bağlantı kopyalandı", desc: url, tone: "positive" });
    }
  }

  async function report() {
    if (!userId) {
      toast.push({ title: "Giriş gerekli", desc: "Bildirim için hesabına giriş yap.", tone: "warning" });
      return;
    }
    await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "report-campaign", campaignId, reason: "Kullanıcı bildirimi" }) });
    toast.push({ title: "Bildirim alındı", desc: "Kampanya moderasyon ekibine iletildi.", tone: "positive" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button loading={busy === "scan"} onClick={() => void scan()} icon={<Icon.qr size={16} />}>
        {lang === "en" ? "Kampanyayı Kullan" : "Kampanyayı Kullan / QR okut"}
      </Button>
      <Button href={`/isletme/${businessSlug}`} variant="secondary" icon={<Icon.store size={16} />}>İşletmeye Git</Button>
      <Button variant="ghost" loading={busy === "save"} onClick={() => void save(!saved)} icon={<Icon.bookmark size={15} />}>
        {saved ? "Kaydedildi" : "Kaydet"}
      </Button>
      <Button variant="ghost" onClick={() => void share()} icon={<Icon.share size={15} />}>Paylaş</Button>
      <Button variant="ghost" onClick={() => void report()} icon={<Icon.flag size={15} />}>Bildir</Button>
      <span className="tabular ml-auto hidden text-[0.76rem] text-muted-2 sm:inline">{businessId.slice(0, 8)}</span>
    </div>
  );
}

export function CampaignActions(props: {
  campaignId: string; businessId: string; businessSlug: string; code: string; qrCode: string | null; userId: string | null; lang: Lang;
}) {
  return (
    <ToastProvider>
      <Inner {...props} />
    </ToastProvider>
  );
}

export default CampaignActions;
