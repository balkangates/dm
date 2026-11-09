"use client";

import { useCallback, useMemo, useState } from "react";
import { Button, Card, Dialog, EmptyState, Field, Icon, Input, Notice, Select, Table, Td, Th, useToast } from "@/components/ds";
import { DashSectionHead, StatusBadge } from "@/components/Dash";
import { ENTRY_LABEL, PAYMENT_LABEL, allowedTargets, buildStatement, monthEnd, paymentState, recentPeriods, taxCents, type Entry, type EntryKind } from "@/lib/billing";
import { money, num, shortDate, type Currency, type Lang } from "@/lib/money";
import type { AdminData } from "@/components/admin";

/**
 * Admin > Gelir: Faturalar (fatura kaydı formu + ödeme durumu), Hesap Ekstresi, Hesap Bakiyeleri.
 * Fatura e-Fatura modülünden kesilir; burada numara ve tarih girilerek KAYDEDİLİR, hizmet satırları
 * sunucuda otomatik hesaplanır. DampingVar müşteri ödemesi almaz — burada yalnızca platform hizmet
 * bedeli faturaları ve işletmeden gelen tahsilatlar izlenir.
 */

async function api(body: Record<string, unknown>) {
  const res = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ ok: false, error: "Beklenmeyen yanıt." }));
  return json as { ok: boolean; error?: string; [k: string]: unknown };
}

type Line = { source: string; description: string; quantity: number; unitPriceCents: number; amountCents: number };
type Preview = {
  business: { id: string; name: string; planCode: string; currency: string };
  period: string; lines: Line[]; subtotalCents: number;
  existing: { number: string; status: string }[]; suggestedTaxRate: number | null; suggestedDate: string;
};
type ExtraRow = { description: string; quantity: string; unit: string };

const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/*  FATURALAR                                                          */
/* ------------------------------------------------------------------ */
export function InvoicesView({ data, lang }: { data: AdminData; lang: Lang; currency: Currency }) {
  const toast = useToast();
  const reload = () => setTimeout(() => window.location.reload(), 600);
  const periods = useMemo(() => recentPeriods(new Date(), 12), []);

  const [businessId, setBusinessId] = useState("");
  const [period, setPeriod] = useState(periods[0]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [number, setNumber] = useState("");
  const [invDate, setInvDate] = useState("");
  const [taxPct, setTaxPct] = useState("");
  const [note, setNote] = useState("");
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [additional, setAdditional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "PAID" | "CANCELLED" | "REFUNDED">("ALL");

  const [action, setAction] = useState<null | { id: string; number: string; target: "PAID" | "CANCELLED" | "REFUNDED" }>(null);
  const [aDate, setADate] = useState(today());
  const [aMethod, setAMethod] = useState("");
  const [aNote, setANote] = useState("");
  const [aBusy, setABusy] = useState(false);

  const cur = (preview?.business.currency ?? "TRY") as Currency;

  const fetchPreview = useCallback(async () => {
    if (!businessId) { toast.push({ title: "Önce işletme seçin", tone: "warning" }); return; }
    setLoading(true);
    const r = await api({ action: "billing_preview", businessId, period });
    setLoading(false);
    if (!r.ok) { toast.push({ title: r.error ?? "Hizmetler getirilemedi", tone: "danger" }); return; }
    const p = r.preview as Preview;
    setPreview(p);
    setInvDate(p.suggestedDate ?? monthEnd(period));
    setTaxPct(p.suggestedTaxRate == null ? "" : String(Math.round(p.suggestedTaxRate * 10000) / 100));
    setExtras([]);
    setAdditional(false);
    setNumber("");
    setNote("");
  }, [businessId, period, toast]);

  const extraLines = extras
    .filter((x) => x.description.trim())
    .map((x) => ({ description: x.description.trim(), quantity: Math.max(1, Math.trunc(Number(x.quantity) || 1)), unitPriceCents: Math.round((Number(x.unit) || 0) * 100) }));
  const subtotal = (preview?.subtotalCents ?? 0) + extraLines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  const rate = taxPct.trim() === "" ? null : Number(taxPct) / 100;
  const tax = rate == null || !Number.isFinite(rate) ? 0 : taxCents(subtotal, rate);
  const total = subtotal + tax;
  const hasExisting = (preview?.existing.length ?? 0) > 0;
  const canSave = !!preview && number.trim() !== "" && invDate !== "" && rate != null && Number.isFinite(rate) && rate >= 0 && rate <= 1
    && subtotal > 0 && (!hasExisting || additional);

  async function save() {
    if (!preview || !canSave) return;
    setSaving(true);
    const r = await api({
      action: "billing_invoice_create", businessId: preview.business.id, period: preview.period,
      number: number.trim(), invoiceDate: invDate, taxRatePct: Number(taxPct), note, extra: extraLines, allowAdditional: additional,
    });
    setSaving(false);
    if (!r.ok) { toast.push({ title: r.error ?? "Fatura kaydedilemedi", tone: "danger" }); return; }
    toast.push({ title: "Fatura kaydedildi — ödeme bekliyor", tone: "positive" });
    reload();
  }

  async function runAction() {
    if (!action) return;
    setABusy(true);
    const r = await api({ action: "billing_set_status", id: action.id, status: action.target, date: aDate, method: aMethod, note: aNote });
    setABusy(false);
    if (!r.ok) { toast.push({ title: r.error ?? "İşlem başarısız", tone: "danger" }); return; }
    toast.push({ title: action.target === "PAID" ? "Ödeme kaydedildi" : action.target === "CANCELLED" ? "Fatura iptal edildi" : "İade kaydedildi", tone: "positive" });
    setAction(null);
    reload();
  }

  const rows = data.invoices.filter((i) => filter === "ALL" || paymentState(i.status) === filter);
  const actionTitle = action?.target === "PAID" ? "Ödeme geldi" : action?.target === "CANCELLED" ? "Faturayı iptal et" : "İade";

  return (
    <div>
      <DashSectionHead
        title="Faturalar ve tahsilat"
        desc="DampingVar hizmet bedeli faturaları. Fatura e-Fatura modülünden kesilir; burada numara ve tarih girilerek kaydedilir. Müşteri ödemesi burada yer almaz."
      />

      <Card className="mb-8">
        <p className="font-display text-[1.05rem] font-bold">Yeni fatura kaydı</p>
        <p className="mt-0.5 text-[0.82rem] text-muted">İşletme ve ay seçin; dönemin hizmetleri otomatik gelir. e-Fatura numarasını ve tarihini girip kaydedin.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_0.8fr_auto] md:items-end">
          <Field label="İşletme">
            <Select value={businessId} onChange={(e) => { setBusinessId(e.target.value); setPreview(null); }}>
              <option value="">Seçin…</option>
              {data.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Dönem (ay)">
            <Select value={period} onChange={(e) => { setPeriod(e.target.value); setPreview(null); }}>
              {periods.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Button onClick={() => void fetchPreview()} loading={loading} variant="secondary">Hizmetleri getir</Button>
        </div>

        {preview ? (
          <div className="mt-6 border-t border-line-soft pt-5">
            {hasExisting ? (
              <Notice tone="warning" icon={<Icon.alert size={16} />} className="mb-4">
                Bu işletme için {preview.period} dönemine ait fatura var: {preview.existing.map((e) => e.number).join(", ")}.{" "}
                <label className="ml-1 inline-flex items-center gap-1.5 font-semibold">
                  <input type="checkbox" checked={additional} onChange={(e) => setAdditional(e.target.checked)} /> Ek fatura olarak kaydet
                </label>
              </Notice>
            ) : null}

            {preview.lines.length === 0 && extraLines.length === 0 ? (
              <Notice tone="info" icon={<Icon.info size={16} />} className="mb-4">
                Bu dönem için otomatik faturalanacak hizmet yok (ücretsiz paket veya tutarı 0 olan kural). Gerekirse aşağıdan ek satır ekleyin.
              </Notice>
            ) : null}

            <Table>
              <thead><tr><Th>Hizmet</Th><Th right>Adet</Th><Th right>Birim fiyat</Th><Th right>Tutar</Th></tr></thead>
              <tbody>
                {preview.lines.map((l, i) => (
                  <tr key={i}><Td>{l.description}</Td><Td right className="tabular">{num(l.quantity, lang)}</Td>
                    <Td right className="tabular">{money(l.unitPriceCents, cur, lang)}</Td><Td right className="tabular">{money(l.amountCents, cur, lang)}</Td></tr>
                ))}
                {extraLines.map((l, i) => (
                  <tr key={`x${i}`}><Td>{l.description} <span className="text-[0.72rem] text-muted">(ek satır)</span></Td><Td right className="tabular">{num(l.quantity, lang)}</Td>
                    <Td right className="tabular">{money(l.unitPriceCents, cur, lang)}</Td><Td right className="tabular">{money(l.quantity * l.unitPriceCents, cur, lang)}</Td></tr>
                ))}
              </tbody>
            </Table>

            <div className="mt-3 space-y-2">
              {extras.map((x, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[2fr_0.6fr_0.9fr_auto]">
                  <Input placeholder="Ek hizmet açıklaması" value={x.description} onChange={(e) => setExtras(extras.map((r, k) => (k === i ? { ...r, description: e.target.value } : r)))} />
                  <Input type="number" min={1} placeholder="Adet" value={x.quantity} onChange={(e) => setExtras(extras.map((r, k) => (k === i ? { ...r, quantity: e.target.value } : r)))} />
                  <Input type="number" min={0} step="0.01" placeholder="Birim fiyat" value={x.unit} onChange={(e) => setExtras(extras.map((r, k) => (k === i ? { ...r, unit: e.target.value } : r)))} />
                  <Button variant="ghost" size="sm" onClick={() => setExtras(extras.filter((_, k) => k !== i))}>Kaldır</Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setExtras([...extras, { description: "", quantity: "1", unit: "" }])}>+ Ek satır</Button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <Field label="Fatura numarası (e-Fatura)" required>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Örn. e-Fatura numarası" />
              </Field>
              <Field label="Fatura tarihi" required>
                <Input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
              </Field>
              <Field label="KDV (%)" required hint={preview.suggestedTaxRate == null ? "İlk fatura: oranı girin." : "Son faturadan önerildi."}>
                <Input type="number" min={0} max={100} step="0.01" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
              </Field>
              <Field label="Not (isteğe bağlı)">
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <dl className="tabular grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-[0.88rem]">
                <dt className="text-muted">Ara toplam</dt><dd className="text-right">{money(subtotal, cur, lang)}</dd>
                <dt className="text-muted">KDV</dt><dd className="text-right">{rate == null ? "—" : money(tax, cur, lang)}</dd>
                <dt className="font-semibold">Genel toplam</dt><dd className="text-right font-semibold">{rate == null ? "—" : money(total, cur, lang)}</dd>
              </dl>
              <Button onClick={() => void save()} loading={saving} disabled={!canSave}>Faturayı kaydet</Button>
            </div>
            <p className="mt-3 text-[0.76rem] text-muted">
              Kayıtla birlikte fatura &quot;ödeme bekliyor&quot; olur ve cari hesaba borç yazılır. Faturaya giren sipariş bakiyesi eklemeleri tekrar faturalanmaz.
              Otomatik satırlar sunucuda hesaplanır; yalnızca ek satır ekleyebilirsiniz.
            </p>
          </div>
        ) : null}
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["ALL", "PENDING", "PAID", "CANCELLED", "REFUNDED"] as const).map((f) => (
          <button
            key={f} type="button" onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-[0.8rem] font-medium ${filter === f ? "border-ink bg-ink text-white" : "border-line text-ink-700 hover:border-ink-500"}`}
          >
            {f === "ALL" ? "Tümü" : PAYMENT_LABEL[f]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? <EmptyState icon={<Icon.receipt size={22} />} title="Fatura bulunamadı" /> : (
        <Table>
          <thead><tr><Th>Fatura</Th><Th>İşletme</Th><Th>Dönem</Th><Th>Fatura tarihi</Th><Th right>Tutar</Th><Th>Durum</Th><Th>Ödeme</Th><Th right>İşlem</Th></tr></thead>
          <tbody>
            {rows.map((i) => {
              const targets = allowedTargets(i.status);
              return (
                <tr key={i.id}>
                  <Td strong className="tabular">{i.number}</Td>
                  <Td>{i.businessName}</Td>
                  <Td className="tabular">{i.period ?? "—"}</Td>
                  <Td>{i.invoiceDate ? shortDate(i.invoiceDate, lang) : "—"}</Td>
                  <Td right className="tabular">{money(i.totalCents, i.currency as Currency, lang)}</Td>
                  <Td><StatusBadge status={i.status} lang={lang} /></Td>
                  <Td>{i.paymentDate ? `${shortDate(i.paymentDate, lang)}${i.paymentMethod ? ` · ${i.paymentMethod}` : ""}` : "—"}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1.5">
                      {targets.map((t) => (
                        <Button key={t} size="sm" variant={t === "PAID" ? "primary" : "ghost"}
                          onClick={() => { setAction({ id: i.id, number: i.number, target: t }); setADate(today()); setAMethod(""); setANote(""); }}>
                          {t === "PAID" ? "Ödeme geldi" : t === "CANCELLED" ? "İptal" : "İade"}
                        </Button>
                      ))}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Dialog
        open={!!action} onClose={() => setAction(null)} title={`${actionTitle} — ${action?.number ?? ""}`}
        desc={action?.target === "PAID" ? "Tahsilatı kaydedin; cari hesaba alacak yazılır." : action?.target === "CANCELLED" ? "Ödeme beklenen fatura iptal edilir; cari hesapta borç kapanır ve sipariş bakiyesi eklemeleri yeniden faturalanabilir olur." : "Ödenmiş fatura için iade faturası ve iade ödemesi cari hesaba yazılır."}
        footer={<><Button variant="secondary" onClick={() => setAction(null)}>Vazgeç</Button><Button loading={aBusy} onClick={() => void runAction()}>Onayla</Button></>}
      >
        <div className="grid gap-3">
          <Field label={action?.target === "PAID" ? "Ödeme tarihi" : "İşlem tarihi"}><Input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} /></Field>
          {action?.target === "PAID" ? <Field label="Ödeme yöntemi (isteğe bağlı)"><Input value={aMethod} onChange={(e) => setAMethod(e.target.value)} placeholder="Havale / EFT, kart…" /></Field> : null}
          <Field label="Not (isteğe bağlı)"><Input value={aNote} onChange={(e) => setANote(e.target.value)} /></Field>
        </div>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HESAP EKSTRESİ                                                     */
/* ------------------------------------------------------------------ */
export function StatementView({ data, lang }: { data: AdminData; lang: Lang; currency: Currency }) {
  const toast = useToast();
  const [businessId, setBusinessId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [st, setSt] = useState<ReturnType<typeof buildStatement> | null>(null);
  const biz = data.businesses.find((b) => b.id === businessId);
  const cur = (biz?.currency ?? "TRY") as Currency;

  async function load() {
    if (!businessId) { toast.push({ title: "İşletme seçin", tone: "warning" }); return; }
    setLoading(true);
    const r = await api({ action: "billing_statement", businessId, from: from || undefined, to: to || undefined });
    setLoading(false);
    if (!r.ok) { toast.push({ title: r.error ?? "Ekstre alınamadı", tone: "danger" }); return; }
    setSt(buildStatement(Number(r.openingCents ?? 0), (r.entries ?? []) as Entry[]));
  }

  function csv() {
    if (!st) return;
    const head = ["Tarih", "Tür", "Açıklama", "Borç", "Alacak", "Bakiye"];
    const body = st.rows.map((r) => [r.entryDate, ENTRY_LABEL[r.kind as EntryKind] ?? r.kind, r.description, r.debitCents / 100, r.creditCents / 100, r.balanceCents / 100]);
    const text = [head, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
    a.download = `hesap-ekstresi-${biz?.slug ?? "isletme"}.csv`;
    a.click();
  }

  return (
    <div>
      <DashSectionHead title="Hesap ekstresi" desc="İşletme bazında cari hesap hareketleri: fatura, ödeme, iptal ve iade. Bakiye (+) işletmenin DampingVar'a borcudur." />
      <Card className="mb-6">
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
          <Field label="İşletme">
            <Select value={businessId} onChange={(e) => { setBusinessId(e.target.value); setSt(null); }}>
              <option value="">Seçin…</option>
              {data.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Başlangıç"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Bitiş"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button onClick={() => void load()} loading={loading}>Ekstreyi getir</Button>
        </div>
      </Card>

      {st ? (
        <>
          <Table>
            <thead><tr><Th>Tarih</Th><Th>Tür</Th><Th>Açıklama</Th><Th right>Borç</Th><Th right>Alacak</Th><Th right>Bakiye</Th></tr></thead>
            <tbody>
              <tr><Td>{from ? shortDate(from, lang) : "—"}</Td><Td strong>Açılış</Td><Td>Devreden bakiye</Td><Td right>—</Td><Td right>—</Td><Td right strong className="tabular">{money(st.openingCents, cur, lang)}</Td></tr>
              {st.rows.map((r) => (
                <tr key={r.id}>
                  <Td>{shortDate(r.entryDate, lang)}</Td><Td>{ENTRY_LABEL[r.kind as EntryKind] ?? r.kind}</Td><Td>{r.description}</Td>
                  <Td right className="tabular">{r.debitCents ? money(r.debitCents, cur, lang) : "—"}</Td>
                  <Td right className="tabular">{r.creditCents ? money(r.creditCents, cur, lang) : "—"}</Td>
                  <Td right strong className="tabular">{money(r.balanceCents, cur, lang)}</Td>
                </tr>
              ))}
              <tr className="bg-canvas">
                <Td strong>Toplam</Td><Td>{""}</Td><Td>{""}</Td>
                <Td right strong className="tabular">{money(st.totalDebitCents, cur, lang)}</Td>
                <Td right strong className="tabular">{money(st.totalCreditCents, cur, lang)}</Td>
                <Td right strong className="tabular">{money(st.closingCents, cur, lang)}</Td>
              </tr>
            </tbody>
          </Table>
          {st.rows.length === 0 ? <p className="mt-3 text-[0.82rem] text-muted">Bu aralıkta hareket yok.</p> : null}
          <div className="mt-4"><Button variant="secondary" size="sm" onClick={csv}>CSV indir</Button></div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HESAP BAKİYELERİ                                                   */
/* ------------------------------------------------------------------ */
type BalRow = {
  businessId: string; name: string; planCode: string; currency: string;
  debitCents: number; creditCents: number; balanceCents: number; openInvoices: number; lastPaymentDate: string | null;
};

export function BalancesView({ lang }: { data: AdminData; lang: Lang; currency: Currency }) {
  const toast = useToast();
  const [asOf, setAsOf] = useState("");
  const [rows, setRows] = useState<BalRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);

  async function load() {
    setLoading(true);
    const r = await api({ action: "billing_balances", asOf: asOf || undefined });
    setLoading(false);
    if (!r.ok) { toast.push({ title: r.error ?? "Bakiyeler alınamadı", tone: "danger" }); return; }
    setRows((r.balances ?? []) as BalRow[]);
  }

  const shown = (rows ?? []).filter((r) => !onlyOpen || r.balanceCents !== 0);
  const totalDebt = shown.filter((r) => r.balanceCents > 0).reduce((s, r) => s + r.balanceCents, 0);

  return (
    <div>
      <DashSectionHead title="Hesap bakiyeleri" desc="İşletmelerin cari bakiyesi: borç − alacak. Bakiye (+) işletmenin DampingVar'a borcudur." />
      <Card className="mb-6">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <Field label="Tarih itibarıyla (boş = bugün)"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
          <label className="flex items-center gap-2 pb-2 text-[0.84rem]"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Yalnız bakiyesi olanlar</label>
          <Button onClick={() => void load()} loading={loading}>{rows ? "Yenile" : "Listeyi getir"}</Button>
        </div>
      </Card>
      {rows ? (
        shown.length === 0 ? <EmptyState icon={<Icon.receipt size={22} />} title="Kayıt yok" /> : (
          <>
            <Table>
              <thead><tr><Th>İşletme</Th><Th>Paket</Th><Th right>Borç</Th><Th right>Alacak</Th><Th right>Bakiye</Th><Th right>Açık fatura</Th><Th>Son ödeme</Th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.businessId}>
                    <Td strong>{r.name}</Td><Td>{r.planCode}</Td>
                    <Td right className="tabular">{money(r.debitCents, r.currency as Currency, lang)}</Td>
                    <Td right className="tabular">{money(r.creditCents, r.currency as Currency, lang)}</Td>
                    <Td right strong className={`tabular ${r.balanceCents > 0 ? "text-danger" : ""}`}>{money(r.balanceCents, r.currency as Currency, lang)}</Td>
                    <Td right className="tabular">{num(r.openInvoices, lang)}</Td>
                    <Td>{r.lastPaymentDate ? shortDate(r.lastPaymentDate, lang) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="tabular mt-3 text-[0.84rem] text-muted">Toplam alacağımız (borçlu bakiyeler): <strong className="text-ink">{money(totalDebt, "TRY", lang)}</strong></p>
          </>
        )
      ) : null}
    </div>
  );
}
