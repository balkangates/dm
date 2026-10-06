/**
 * Migration doğrulaması — gerçek Postgres sözdizimi/davranışı (PGlite, bellekte) üzerinde:
 *  1) supabase/migrations/*.sql sırayla uygulanır
 *  2) dev seed (ensureSeed) çalıştırılır
 *  3) finans akışı (satış → iade) ve DB bütünlük kuralları test edilir
 * Çalıştırma: npm run db:verify
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

let failed = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failed++;
};

async function expectReject(pg: PGlite, name: string, sql: string, code?: string) {
  try {
    await pg.exec(sql);
    ok(name, false, "reddedilmeliydi ama kabul edildi");
  } catch (e) {
    const err = e as { code?: string; message?: string };
    ok(name, !code || err.code === code, `${err.code ?? ""} ${String(err.message).slice(0, 70)}`);
  }
}

async function main() {
  const pg = new PGlite();
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    await pg.exec(readFileSync(join(dir, f), "utf8"));
    ok(`migration uygulandı: ${f}`, true);
  }

  const t = await pg.query<{ n: number }>(`select count(*)::int n from pg_tables where schemaname='public'`);
  ok("29 tablo mevcut", t.rows[0].n === 29, String(t.rows[0].n));
  const rls = await pg.query<{ n: number }>(`select count(*)::int n from pg_tables where schemaname='public' and not rowsecurity`);
  ok("tüm tablolarda RLS açık", rls.rows[0].n === 0, `RLS kapalı: ${rls.rows[0].n}`);
  const ref = await pg.query<{ p: number; g: number }>(
    `select (select count(*) from packages)::int p, (select count(*) from damping_pool where key='GLOBAL')::int g`
  );
  ok("referans veri (3 paket, GLOBAL havuz)", ref.rows[0].p === 3 && ref.rows[0].g === 1);

  // Uygulama kodu bu PGlite'a TCP üzerinden bağlanır
  const server = new PGLiteSocketServer({ db: pg, port: 54329, host: "127.0.0.1" });
  await server.start();
  process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54329/postgres";
  process.env.DB_POOL_MAX = "1";

  const { ensureSeed } = await import("../src/lib/seed");
  await ensureSeed();
  const counts = await pg.query<{ b: number; tx: number; u: number }>(
    `select (select count(*) from businesses)::int b, (select count(*) from store_transactions)::int tx, (select count(*) from users)::int u`
  );
  ok("dev seed kısıtlara takılmadan yüklendi", counts.rows[0].b > 0 && counts.rows[0].tx > 0, JSON.stringify(counts.rows[0]));

  // ---- Finans akışı: satış → iade ----
  const { completeSale, reverseTransaction } = await import("../src/lib/finance");
  const q = await pg.query<{ id: string; code: string; business_id: string; campaign_id: string }>(
    `select id, code, business_id, campaign_id from qr_codes where status='ACTIVE' and campaign_id is not null limit 1`
  );
  const qr = q.rows[0];
  const sale = await completeSale({
    businessId: qr.business_id, code: qr.code, grossAmountCents: 50000, actorEmail: "verify@test", actorRole: "OWNER",
  });
  ok("completeSale başarılı", sale.ok, sale.issues.map((i) => i.code).join(","));
  if (sale.ok && sale.transactionId) {
    const pool = await pg.query<{ b: number }>(`select balance_cents::int b from damping_pool where key='GLOBAL'`);
    ok("havuz negatif değil", pool.rows[0].b >= 0, String(pool.rows[0].b));
    const rev = await reverseTransaction(sale.transactionId, "verify@test", "test iadesi");
    ok("reverseTransaction başarılı", rev.ok, rev.message);
    const rev2 = await reverseTransaction(sale.transactionId, "verify@test", "ikinci iade");
    ok("çift iade reddedildi", !rev2.ok, rev2.message);
  }

  // ---- DB bütünlük kuralları (uygulama kodundan bağımsız) ----
  const wid = (await pg.query<{ id: string }>(`select id from damping_wallets limit 1`)).rows[0]?.id;
  const uid = (await pg.query<{ id: string }>(`select id from users limit 1`)).rows[0]?.id;
  const bid = (await pg.query<{ id: string }>(`select id from businesses limit 1`)).rows[0]?.id;
  await expectReject(pg, "negatif cüzdan bakiyesi reddedilir", `update damping_wallets set available_cents = -1 where id='${wid}'`, "23514");
  await expectReject(pg, "negatif havuz reddedilir", `update damping_pool set balance_cents = -1`, "23514");
  await expectReject(pg, "wallet_ledger UPDATE reddedilir (append-only)", `update wallet_ledger set description='x'`, "23000");
  await expectReject(pg, "audit_logs DELETE reddedilir (append-only)", `delete from audit_logs`, "23000");
  await expectReject(pg, "geçersiz puan (rating=6) reddedilir", `update businesses set rating = 6 where id='${bid}'`, "23514");
  await expectReject(pg, "geçersiz kampanya durumu reddedilir", `update campaigns set status='FOO'`, "23514");
  await expectReject(pg, "finansal geçmişi olan işletme silinemez", `delete from businesses where id='${bid}'`, "23503");
  await expectReject(pg, "aynı kullanıcı ikinci kez davet edilemez (tek seviye, unique invitee)",
    `insert into referrals (inviter_id, invitee_id, code) select inviter_id, invitee_id, 'DUP' from referrals limit 1`, "23505");
  void uid;

  await server.stop();
  await pg.close();
  console.log(failed ? `\n❌ ${failed} kontrol başarısız` : "\n✅ Tüm kontroller geçti");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
