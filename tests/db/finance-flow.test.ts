/**
 * KARAKTERİZASYON TESTİ — completeSale / reverseTransaction'ın DB üzerindeki etkisini dondurur.
 * Gerçek PostgreSQL (test DB) kullanır. Seed Math.random içerdiği için mutlak bakiyeler değil,
 * İŞLEM ÖNCESİ/SONRASI FARKLAR (delta) ve yeni satırlar (normalize edilmiş) karşılaştırılır.
 * Migration sonrası (S7/M7) aynı senaryolar RPC yolunda aynı çıktıyı vermelidir.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import type { Pool } from "pg";

const dbReady = inject("dbReady");

type Row = Record<string, unknown>;
const TABLES = ["store_transactions", "wallet_ledger", "pool_ledger", "referral_rewards", "audit_logs", "fraud_reviews"];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const RECEIPT = /(?:DMP|IAD)-\d{8}-[A-Z0-9]{5}/g;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g;

function normalize<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v).replace(UUID, "<uuid>").replace(RECEIPT, "<receipt>").replace(ISO, "<ts>")
  );
}

describe.skipIf(!dbReady)("completeSale / reverseTransaction (DB karakterizasyonu)", () => {
  let pool: Pool;
  let finance: typeof import("@/lib/finance");
  let kadikoyId: string;

  const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as Row[];

  async function ids(table: string) {
    return new Set((await q(`select id from ${table}`)).map((r) => String(r.id)));
  }
  async function newRows(table: string, before: Set<string>) {
    const rows = await q(`select to_jsonb(t) as j from ${table} t`);
    const fresh = rows.map((r) => r.j as Row).filter((r) => !before.has(String(r.id)));
    const clean = fresh.map((r) => {
      const { id: _id, created_at: _c, ...rest } = r;
      return rest;
    });
    return normalize(clean).map((r) => JSON.stringify(r)).sort();
  }
  async function snapshotIds() {
    const out: Record<string, Set<string>> = {};
    for (const t of TABLES) out[t] = await ids(t);
    return out;
  }
  async function diffTables(before: Record<string, Set<string>>) {
    const out: Record<string, string[]> = {};
    for (const t of TABLES) {
      const rows = await newRows(t, before[t]);
      if (rows.length) out[t] = rows;
    }
    return out;
  }
  async function walletOf(qrCode: string) {
    const rows = await q(
      `select w.available_cents, w.pending_cents, w.reserved_cents, w.lifetime_earned_cents, w.lifetime_spent_cents
         from qr_codes c join damping_wallets w on w.user_id = c.customer_id where c.code = $1`,
      [qrCode]
    );
    return Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)])) as Record<string, number>;
  }
  async function poolBalance() {
    return Number((await q(`select balance_cents from damping_pool where key = 'GLOBAL'`))[0].balance_cents);
  }
  const delta = (a: Record<string, number>, b: Record<string, number>) =>
    Object.fromEntries(Object.keys(a).map((k) => [k, b[k] - a[k]]));
  async function qrStatus(code: string) {
    return String((await q(`select status from qr_codes where code = $1`, [code]))[0].status);
  }

  beforeAll(async () => {
    const dbMod = await import("@/db");
    pool = dbMod.pool;
    const { ensureSeed } = await import("@/lib/seed");
    await ensureSeed();
    finance = await import("@/lib/finance");
    kadikoyId = String(
      (await q(`select id from businesses where slug = 'kadikoy-pizza-atolyesi'`))[0].id
    );
  });

  const actor = { actorEmail: "kasiyer@kadikoy-pizza-atolyesi.com", actorRole: "CASHIER" };
  const strip = <T extends { dampingRemainingCents?: number }>(r: T) => {
    const { dampingRemainingCents: _d, ...rest } = r;
    return normalize(rest);
  };

  let saleBTxId: string;

  it("S1: QR ile satış, damping kullanımı yok", async () => {
    const code = "QR-KADIKO-1000";
    const w0 = await walletOf(code);
    const p0 = await poolBalance();
    const t0 = await snapshotIds();
    const res = await finance.completeSale({ businessId: kadikoyId, code, grossAmountCents: 40000, ...actor });
    expect(res.ok).toBe(true);
    const w1 = await walletOf(code);
    expect(res.dampingRemainingCents).toBe(w1.available_cents); // sonuç ile DB tutarlı
    expect({
      result: strip(res),
      walletDelta: delta(w0, w1),
      poolDelta: (await poolBalance()) - p0,
      qrStatus: await qrStatus(code),
      newRows: await diffTables(t0),
    }).toMatchSnapshot();
  });

  it("S2: QR ile satış, 5000 kuruş damping kullanımı", async () => {
    const code = "QR-KADIKO-1001";
    const w0 = await walletOf(code);
    const p0 = await poolBalance();
    const t0 = await snapshotIds();
    const res = await finance.completeSale({
      businessId: kadikoyId,
      code,
      grossAmountCents: 40000,
      dampingUseCents: 5000,
      ...actor,
    });
    expect(res.ok).toBe(true);
    saleBTxId = res.transactionId as string;
    const w1 = await walletOf(code);
    expect(res.dampingRemainingCents).toBe(w1.available_cents);
    expect({
      result: strip(res),
      walletDelta: delta(w0, w1),
      poolDelta: (await poolBalance()) - p0,
      qrStatus: await qrStatus(code),
      newRows: await diffTables(t0),
    }).toMatchSnapshot();
  });

  it("S3: kullanılmış QR tekrar kullanılamaz (QR_USED), yan etki yok", async () => {
    const t0 = await snapshotIds();
    const res = await finance.completeSale({
      businessId: kadikoyId,
      code: "QR-KADIKO-1000",
      grossAmountCents: 40000,
      ...actor,
    });
    expect({ ok: res.ok, codes: res.issues.map((i) => i.code), newRows: await diffTables(t0) }).toMatchSnapshot();
    expect(res.ok).toBe(false);
  });

  it("S4: başka işletmenin QR'ı reddedilir", async () => {
    const t0 = await snapshotIds();
    const res = await finance.completeSale({
      businessId: kadikoyId,
      code: "QR-MODA-K-1001",
      grossAmountCents: 40000,
      ...actor,
    });
    expect({ ok: res.ok, codes: res.issues.map((i) => i.code), newRows: await diffTables(t0) }).toMatchSnapshot();
    expect(await qrStatus("QR-MODA-K-1001")).toBe("ACTIVE");
  });

  it("S5: yetersiz damping bakiyesi reddedilir, işlem geri alınır", async () => {
    const code = "QR-KADIKO-1002";
    const w0 = await walletOf(code);
    const t0 = await snapshotIds();
    const res = await finance.completeSale({
      businessId: kadikoyId,
      code,
      grossAmountCents: 40000,
      dampingUseCents: 100_000_000,
      ...actor,
    });
    expect({
      ok: res.ok,
      codes: res.issues.map((i) => i.code),
      walletDelta: delta(w0, await walletOf(code)),
      qrStatus: await qrStatus(code),
      newRows: await diffTables(t0),
    }).toMatchSnapshot();
    expect(res.ok).toBe(false);
  });

  it("S6: iade (reversal) ve çift iade engeli", async () => {
    const code = "QR-KADIKO-1001";
    const w0 = await walletOf(code);
    const p0 = await poolBalance();
    const t0 = await snapshotIds();
    const first = await finance.reverseTransaction(saleBTxId, "sahip@kadikoy-pizza-atolyesi.com", "Müşteri talebi");
    const second = await finance.reverseTransaction(saleBTxId, "sahip@kadikoy-pizza-atolyesi.com", "Tekrar");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect({
      first: normalize(first),
      second: normalize(second),
      walletDelta: delta(w0, await walletOf(code)),
      poolDelta: (await poolBalance()) - p0,
      qrStatus: await qrStatus(code),
      newRows: await diffTables(t0),
    }).toMatchSnapshot();
  });

  it("S7: aynı QR'ı iki paralel istek kullanır → yalnızca biri başarılı (çift harcama yok)", async () => {
    const code = "QR-KADIKO-1002";
    const w0 = await walletOf(code);
    const results = await Promise.all([
      finance.completeSale({ businessId: kadikoyId, code, grossAmountCents: 30000, ...actor }),
      finance.completeSale({ businessId: kadikoyId, code, grossAmountCents: 30000, ...actor }),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const failCodes = results.filter((r) => !r.ok).flatMap((r) => r.issues.map((i) => i.code));
    expect(okCount).toBe(1);
    expect(failCodes).toEqual(["QR_USED"]);
    const tx = await q(`select count(*)::int as n from store_transactions where qr_code_id = (select id from qr_codes where code = $1) and status = 'COMPLETED'`, [code]);
    expect(Number(tx[0].n)).toBe(1);
    expect({ okCount, failCodes, walletDelta: delta(w0, await walletOf(code)) }).toMatchSnapshot();
  });
});
