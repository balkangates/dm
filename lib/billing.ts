/**
 * Faturalama / cari hesap — saf yardımcılar (sunucu, admin arayüzü ve testler ortak kullanır).
 * Kaynak doğruluk: supabase/migrations/20261110000001_billing_cari.sql
 *
 * Cari mantığı: bakiye = Σ borç − Σ alacak.  (+) bakiye = işletmenin DampingVar'a borcu.
 *  fatura → borç · ödeme/iptal/iade faturası → alacak · iade ödemesi → borç
 */

export type InvoiceStatus = "DRAFT" | "ISSUED" | "SENT" | "PARTIALLY_PAID" | "OVERDUE" | "PAID" | "CANCELLED" | "REFUNDED";

export type PaymentState = "PENDING" | "PAID" | "CANCELLED" | "REFUNDED";

const PENDING_SET = new Set<string>(["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"]);

export function paymentState(status: string): PaymentState {
  if (status === "PAID") return "PAID";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "REFUNDED") return "REFUNDED";
  return "PENDING";
}

export const PAYMENT_LABEL: Record<PaymentState, string> = {
  PENDING: "Ödeme bekliyor",
  PAID: "Ödeme geldi",
  CANCELLED: "İptal",
  REFUNDED: "İade",
};

export const isPending = (status: string) => PENDING_SET.has(status);

/** Bir faturanın gidebileceği durumlar (sunucu RPC'siyle aynı kurallar). */
export function allowedTargets(status: string): ("PAID" | "CANCELLED" | "REFUNDED")[] {
  if (isPending(status)) return ["PAID", "CANCELLED"];
  if (status === "PAID") return ["REFUNDED"];
  return [];
}

export type EntryKind = "INVOICE" | "PAYMENT" | "CANCEL" | "REFUND_NOTE" | "REFUND_PAYOUT" | "ADJUSTMENT";

export const ENTRY_LABEL: Record<EntryKind, string> = {
  INVOICE: "Fatura",
  PAYMENT: "Ödeme",
  CANCEL: "İptal",
  REFUND_NOTE: "İade faturası",
  REFUND_PAYOUT: "İade ödemesi",
  ADJUSTMENT: "Düzeltme",
};

export type Entry = {
  id: string;
  entryDate: string; // YYYY-MM-DD
  createdAt?: string;
  kind: EntryKind;
  description: string;
  debitCents: number;
  creditCents: number;
  invoiceId?: string | null;
};

export type StatementRow = Entry & { balanceCents: number };

/** Hesap ekstresi: açılış bakiyesinden başlayarak tarih sırasıyla yürüyen bakiye. */
export function buildStatement(openingCents: number, entries: Entry[]) {
  const sorted = [...entries].sort(
    (a, b) => a.entryDate.localeCompare(b.entryDate) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
  );
  let bal = openingCents;
  let debit = 0;
  let credit = 0;
  const rows: StatementRow[] = sorted.map((e) => {
    bal += e.debitCents - e.creditCents;
    debit += e.debitCents;
    credit += e.creditCents;
    return { ...e, balanceCents: bal };
  });
  return { openingCents, rows, totalDebitCents: debit, totalCreditCents: credit, closingCents: bal };
}

/** Bakiye = Σ borç − Σ alacak. */
export const balanceOf = (entries: Pick<Entry, "debitCents" | "creditCents">[]) =>
  entries.reduce((s, e) => s + e.debitCents - e.creditCents, 0);

/** KDV (kuruş) = yuvarlanmış ara toplam × oran — veritabanı RPC'siyle aynı. */
export const taxCents = (subtotalCents: number, rate: number) => Math.round(subtotalCents * rate);

export type InvoiceLine = { description: string; quantity: number; unitPriceCents: number; amountCents: number };
export const linesSubtotal = (lines: Pick<InvoiceLine, "amountCents">[]) => lines.reduce((s, l) => s + l.amountCents, 0);

export const isValidPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

/** Son n ay (en yenisi başta), 'YYYY-MM'. */
export function recentPeriods(now: Date, n = 12): string[] {
  const out: string[] = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/** Ay sonu (YYYY-MM-DD) — fatura tarihi önerisi. */
export function monthEnd(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}
