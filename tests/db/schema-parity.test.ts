/**
 * ŞEMA EŞİTLİĞİ (M3 çıkış kriteri: "şema farkı = 0").
 * Mevcut Drizzle şemasından kurulan DB ile supabase/migrations'dan kurulan DB'yi karşılaştırır:
 * kolonlar (tip, null, varsayılan), PK/UNIQUE/FK, indeksler. Migration'ın EKLEDİĞİ şeyler (CHECK, trigger, RLS)
 * ayrıca ve açıkça doğrulanır.
 */
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { Client } from "pg";
import { prepareDb } from "../support/prepare-db";

const dbReady = inject("dbReady");
const base = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/damping_test";
const urlFor = (name: string) => {
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
};

describe.skipIf(!dbReady)("şema eşitliği: Drizzle ↔ supabase/migrations", () => {
  let a: Client;
  let b: Client;

  beforeAll(async () => {
    await prepareDb(urlFor("damping_parity_drizzle"), "drizzle");
    await prepareDb(urlFor("damping_parity_migrations"), "migrations");
    a = new Client({ connectionString: urlFor("damping_parity_drizzle") });
    b = new Client({ connectionString: urlFor("damping_parity_migrations") });
    await Promise.all([a.connect(), b.connect()]);
  }, 180_000);
  afterAll(async () => {
    await Promise.all([a?.end(), b?.end()]);
  });

  const q = async (c: Client, sql: string) => (await c.query(sql)).rows;

  const SQL = {
    columns: `select table_name, column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
                from information_schema.columns where table_schema='public' order by 1,2`,
    constraints: `select conrelid::regclass::text as t, contype, pg_get_constraintdef(oid) as def
                    from pg_constraint where connamespace='public'::regnamespace and contype in ('p','u','f')
                    order by 1,2,3`,
    indexes: `select tablename, indexdef from pg_indexes where schemaname='public' order by 1,2`,
  };

  it("tablo/kolon/tip/null/varsayılan farkı = 0", async () => {
    const [x, y] = await Promise.all([q(a, SQL.columns), q(b, SQL.columns)]);
    expect(x.length).toBeGreaterThan(200);
    expect(y).toEqual(x);
  });
  it("PK / UNIQUE / FK farkı = 0 (31 FK)", async () => {
    const [x, y] = await Promise.all([q(a, SQL.constraints), q(b, SQL.constraints)]);
    expect(x.filter((r) => r.contype === "f")).toHaveLength(31);
    expect(y).toEqual(x);
  });
  it("indeks farkı = 0", async () => {
    const [x, y] = await Promise.all([q(a, SQL.indexes), q(b, SQL.indexes)]);
    expect(y).toEqual(x);
  });

  it("migration'ın eklediği şeyler: 29 tabloda RLS açık, 18 CHECK, 3 defterde değiştirme engeli", async () => {
    const rls = await q(b, `select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'`);
    expect(rls).toHaveLength(29);
    expect(rls.every((r) => r.relrowsecurity === true)).toBe(true);
    const base_rls = await q(a, `select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity`);
    expect(base_rls[0].n).toBe(0); // Drizzle şemasında RLS yoktu → migration gerçekten ekliyor
    const checks = await q(b, `select count(*)::int n from pg_constraint where connamespace='public'::regnamespace and contype='c'`);
    expect(checks[0].n).toBe(18);
    const trg = await q(b, `select distinct c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal order by 1`);
    expect(trg.map((r) => r.relname)).toEqual(["audit_logs", "pool_ledger", "wallet_ledger"]);
  });

  it("append-only defterler: UPDATE/DELETE/TRUNCATE reddedilir; geçersiz durum değeri reddedilir", async () => {
    await expect(b.query(`update audit_logs set action='x'`)).resolves.toBeDefined(); // boş tablo → 0 satır, hata yok
    await b.query(`insert into audit_logs(actor,role,action,entity_type) values ('a','SYSTEM','T','t')`);
    await expect(b.query(`update audit_logs set action='x'`)).rejects.toThrow(/append-only/);
    await expect(b.query(`delete from audit_logs`)).rejects.toThrow(/append-only/);
    await expect(b.query(`truncate audit_logs`)).rejects.toThrow(/append-only/);
    await expect(b.query(`insert into fraud_reviews(reason,status) values ('r','NOPE')`)).rejects.toThrow(/fraud_reviews_status_check/);
  });

  it("anon/authenticated: tablolarda satır göremez (deny-by-default) ve finans tablolarına yazamaz", async () => {
    for (const role of ["anon", "authenticated"]) {
      await b.query("begin");
      await b.query(`set local role ${role}`);
      const seen = await b.query(`select count(*)::int n from audit_logs`);
      expect(seen.rows[0].n).toBe(0); // RLS: politika yok → satır yok (hata değil, boş)
      await expect(b.query(`insert into damping_wallets(user_id) values (gen_random_uuid())`)).rejects.toThrow(/permission denied/);
      await b.query("rollback");
    }
    const sr = await b.query(`select count(*)::int n from audit_logs`); // postgres sahibi RLS'i aşar
    expect(sr.rows[0].n).toBe(1);
  });
});
