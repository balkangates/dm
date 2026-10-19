"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Icon, Input, Notice, Textarea } from "@/components/ds";

/** Yaygın kategoriler — serbest metin girişi için öneri listesi. */
const KATEGORILER = [
  "Market",
  "Yapı Market",
  "Kuaför & Güzellik",
  "Kahve & Tatlı",
  "Restoran",
  "Pizza & İtalyan",
  "Eczane",
  "Spor Salonu",
  "Giyim",
  "Elektronik",
];

type Form = {
  name: string;
  category: string;
  district: string;
  city: string;
  address: string;
  phone: string;
  description: string;
};

const EMPTY: Form = { name: "", category: "", district: "", city: "", address: "", phone: "", description: "" };

/**
 * FAZ 10 — "İşletme Aç" öz-kayıt formu.
 * POST /api/business { action: "open" } → dv_business_signup RPC
 * (businesses + business_staff(owner) + profiles.role → business).
 * Başarıda /panel'e yönlendirir; hata Türkçe mesajla form içinde gösterilir.
 */
export function BusinessSignupForm() {
  const router = useRouter();
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setF((p) => ({ ...p, [k]: e.target.value }));
    };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "open", ...f }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok !== true) {
        setError(String(json.error || "İşletme açılamadı. Lütfen tekrar dene."));
        setBusy(false);
        return;
      }
      router.push("/panel");
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar dene.");
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      {error ? (
        <Notice tone="warning" className="mb-4" icon={<Icon.alert size={16} />}>
          {error}
        </Notice>
      ) : null}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="İşletme Adı" required>
          <Input value={f.name} onChange={set("name")} required minLength={2} maxLength={120} placeholder="Örn: Bandırma Market" />
        </Field>
        <Field label="Kategori" required hint="Serbest metin — örn: Market, Kuaför">
          <Input value={f.category} onChange={set("category")} required list="dv-kategoriler" maxLength={60} placeholder="Örn: Market" />
          <datalist id="dv-kategoriler">
            {KATEGORILER.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>
        <Field label="İlçe" required>
          <Input value={f.district} onChange={set("district")} required maxLength={60} placeholder="Örn: Bandırma" />
        </Field>
        <Field label="İl" hint="Boş bırakılırsa İstanbul">
          <Input value={f.city} onChange={set("city")} maxLength={60} placeholder="İstanbul" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Adres" required hint="Mahalle, cadde, no (5-240 karakter)">
            <Textarea value={f.address} onChange={set("address")} required minLength={5} maxLength={240} rows={2} placeholder="Örn: Çarşı Mah. Demokrasi Cad. No:1" />
          </Field>
        </div>
        <Field label="Telefon" hint="Opsiyonel">
          <Input value={f.phone} onChange={set("phone")} maxLength={20} inputMode="tel" placeholder="0266 000 00 00" />
        </Field>
        <Field label="Kısa Açıklama" hint="Opsiyonel">
          <Input value={f.description} onChange={set("description")} maxLength={400} placeholder="Ne satıyorsun?" />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy}>
            İşletmemi Aç
          </Button>
        </div>
      </form>
    </Card>
  );
}
