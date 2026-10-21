"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Icon, Input, Notice, ToastProvider, useToast } from "@/components/ds";
import { makeT } from "@/lib/i18n";
import type { Lang } from "@/lib/money";
import { signInAction, signUpAction } from "@/lib/auth/actions";

const DEMO = [
  { label: "Müşteri", email: "musteri@dampingvar.demo", to: "/hesabim" },
  { label: "İşletme", email: "isletme@dampingvar.demo", to: "/panel" },
  { label: "Yönetici", email: "admin@dampingvar.demo", to: "/admin" },
];

function Inner({ mode, next, lang, initialRef, supabase, notice }: { mode: "login" | "register"; next?: string; lang: Lang; initialRef?: string; supabase?: boolean; notice?: string }) {
  const t = makeT(lang);
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ name: "", email: "", password: "", referralCode: initialRef ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(notice ?? "");

  async function submitSupabase() {
    // FAZ 12C-3 canlı testi: DEPLOY SONRASI UZUN AÇIK KALAN SEKMEDE server-action
    // kimlikleri eskir → action undefined DÖNER ve "r.ok" hatasıyla sessiz çöker
    // (mobilde kullanıcı "giriş yapamıyorum → sipariş eklenmiyor" görürdü).
    // Artık hem undefined yanıt hem de istisna yakalanıp kullanıcıya net söylenir.
    try {
      const r =
        mode === "login"
          ? await signInAction({ email: f.email, password: f.password, next })
          : await signUpAction({ name: f.name, email: f.email, password: f.password, referralCode: f.referralCode, lang, next });
      setBusy(false);
      if (!r || typeof r.ok !== "boolean") {
        setError("Sayfa güncelleme sonrası eski görünümde kalmış olabilir. Sayfayı yenileyip (F5) tekrar deneyin.");
        return;
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.needsConfirmation) {
        setInfo(r.message ?? "E-posta kutunu kontrol et.");
        return;
      }
      toast.push({ title: mode === "login" ? "Giriş yapıldı" : "Hesap oluşturuldu", tone: "positive" });
      router.push(r.redirectTo);
      router.refresh();
    } catch {
      setBusy(false);
      setError("Bağlantı kesildi veya sayfa eskidi. Sayfayı yenileyip tekrar deneyin.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    if (supabase) {
      await submitSupabase();
      return;
    }
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: mode === "login" ? "login" : "register", ...f }),
    });
    const json = await res.json().catch(() => ({ ok: false, error: "Bağlantı hatası" }));
    setBusy(false);
    if (!json.ok) {
      setError(json.error ?? "İşlem başarısız");
      return;
    }
    toast.push({ title: mode === "login" ? "Giriş yapıldı" : "Hesap oluşturuldu", tone: "positive" });
    const role = json.user?.role;
    router.push(next ?? (role === "ADMIN" ? "/admin" : role === "BUSINESS" ? "/panel" : "/hesabim"));
    router.refresh();
  }

  async function demo(email: string, to: string) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "login", email, password: "Demo1234!" }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    setBusy(false);
    if (json.ok) { router.push(to); router.refresh(); }
    else setError(json.error ?? "Demo girişi başarısız");
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-[1.3rem] font-bold">{mode === "login" ? t("auth.login") : t("auth.register")}</h2>
      <p className="mt-1.5 text-[0.86rem] text-muted">
        {mode === "login" ? (supabase ? "Oturum Supabase Auth ile sunucuda doğrulanır." : "Oturum, imzalı httpOnly çerez ile sunucuda doğrulanır.") : "Hesap oluşturmak ücretsizdir; ödeme bilgisi istenmez."}
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4">
        {mode === "register" ? (
          <Field label={t("auth.name")} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ad Soyad" required /></Field>
        ) : null}
        <Field label={t("auth.email")} required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="ornek@eposta.com" required /></Field>
        <Field label={t("auth.password")} required hint={mode === "register" ? "En az 8 karakter." : undefined}>
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="••••••••" required minLength={mode === "register" ? 8 : undefined} />
        </Field>
        {mode === "register" ? (
          <Field label={t("auth.referralCode")} hint="Davet edenin Damping Bonus kazanabilmesi için kodu gir.">
            <Input value={f.referralCode} onChange={(e) => setF({ ...f, referralCode: e.target.value.toUpperCase() })} placeholder="AHMET728" />
          </Field>
        ) : null}

        {info ? <Notice tone="neutral" icon={<Icon.alert size={16} />}>{info}</Notice> : null}
        {error ? <Notice tone="danger" icon={<Icon.alert size={16} />}>{error}</Notice> : null}

        <Button type="submit" size="lg" loading={busy} className="w-full">
          {mode === "login" ? t("auth.login") : t("auth.register")}
        </Button>
      </form>

      {supabase ? null : (
      <div className="mt-6 border-t border-line-soft pt-5">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("auth.demoTitle")}</p>
        <div className="mt-3 grid gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              onClick={() => void demo(d.email, d.to)}
              disabled={busy}
              className="flex items-center justify-between gap-3 rounded-[3px] border border-line bg-canvas px-3.5 py-2.5 text-left transition-colors hover:border-accent disabled:opacity-50"
            >
              <span>
                <span className="block text-[0.84rem] font-semibold text-ink">{d.label} hesabı</span>
                <span className="tabular block text-[0.74rem] text-muted">{d.email}</span>
              </span>
              <Icon.arrowRight size={15} className="shrink-0 text-accent" />
            </button>
          ))}
        </div>
        <p className="tabular mt-3 text-[0.74rem] text-muted">Şifre (tüm demo hesapları): Demo1234!</p>
      </div>
      )}
    </Card>
  );
}

export function AuthCard(props: { mode: "login" | "register"; next?: string; lang: Lang; initialRef?: string; supabase?: boolean; notice?: string }) {
  return (
    <ToastProvider>
      <Inner {...props} />
    </ToastProvider>
  );
}

export default AuthCard;
