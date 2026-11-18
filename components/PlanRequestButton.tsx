"use client";
import { useState } from "react";
import { Button, useToast } from "@/components/ds";

/** Fiyatlar sayfasında "Paketi seç": işletme hesabıysa talep yöneticiye gider; değilse giriş/kayıt'a yönlendirir. */
export function PlanRequestButton({ planCode, planName, role, variant, label }: {
  planCode: string; planName: string; role: string | null; variant: "primary" | "secondary"; label: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!role) { window.location.href = `/giris?next=${encodeURIComponent("/fiyatlar")}`; return; }
    if (role !== "BUSINESS") { window.location.href = "/kayit?tip=isletme"; return; }
    setBusy(true);
    const res = await fetch("/api/business", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "plan_request", planCode }) });
    const j = await res.json().catch(() => ({ ok: false }));
    setBusy(false);
    toast.push(j.ok
      ? { title: "Talebin yöneticiye iletildi", desc: `${planName} paketi için onay bekleniyor.`, tone: "positive" }
      : { title: j.error ?? "Talep gönderilemedi", tone: "danger" });
  }
  return <Button className="mt-5 w-full" variant={variant} loading={busy} onClick={() => void go()}>{label}</Button>;
}
