/**
 * Faz 02 şema doğrulaması (PGlite, bellekte). İki senaryo:
 *  A) düz Postgres   B) Supabase benzeri (auth.users + anon/authenticated rolleri önceden var)
 * Ayrıca src/lib/supabase/types.ts'in migration'larla güncel olduğunu doğrular.
 * Çalıştırma: npm run db:schema
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

let failed = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failed++;
};
const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

async function build(supabaseLike: boolean) {
  const pg = new PGlite();
  if (supabaseLike) {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
                   create table auth.users (id uuid primary key default gen_random_uuid());`);
  }
  for (const f of files) await pg.exec(readFileSync(join(dir, f), "utf8"));
  return pg;
}
const q = async (pg: PGlite, sql: string) => (await pg.query<Record<string, unknown>>(sql)).rows;

async function common(pg: PGlite, label: string) {
  const n = (await q(pg, `select count(*)::int n from pg_tables where schemaname='public'`))[0].n as number;
  ok(`[${label}] 29 tablo`, n === 29, String(n));
  const nr = await q(pg, `select tablename from pg_tables where schemaname='public' and not rowsecurity`);
  ok(`[${label}] tüm tablolarda RLS açık`, nr.length === 0, nr.map((r) => r.tablename).join(","));
  const nopk = await q(pg, `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not exists (select 1 from pg_constraint k where k.conrelid=c.oid and k.contype='p')`);
  ok(`[${label}] PK'siz tablo yok`, nopk.length === 0);
  const ufk = await q(pg, `select c.conrelid::regclass::text t, a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1])`);
  ok(`[${label}] indekssiz FK yok`, ufk.length === 0, ufk.map((r) => `${r.t}.${r.col}`).join(","));
  const fn = await q(pg, `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))`);
  ok(`[${label}] public fonksiyonlarında sabit search_path`, fn.length === 0, fn.map((r) => r.proname).join(","));
  const cols = await q(pg, `select table_name from information_schema.columns where table_schema='public' and column_name='auth_user_id' order by 1`);
  ok(`[${label}] auth_user_id: business_staff + users`, cols.map((r) => r.table_name).join(",") === "business_staff,users");
  const ref = await q(pg, `select (select count(*) from packages)::int p, (select count(*) from damping_pool where key='GLOBAL')::int g`);
  ok(`[${label}] referans veri (3 paket, GLOBAL havuz)`, ref[0].p === 3 && ref[0].g === 1);
}

async function main() {
  const a = await build(false);
  await common(a, "düz PG");
  const fkA = await q(a, `select count(*)::int n from pg_constraint where conname in ('business_staff_auth_user_id_fk','users_auth_user_id_fk')`);
  ok("[düz PG] auth.users yok → auth FK atlandı, migration kırılmadı", fkA[0].n === 0);

  const b = await build(true);
  await common(b, "supabase-benzeri");
  const fkB = await q(b, `select count(*)::int n from pg_constraint where conname in ('business_staff_auth_user_id_fk','users_auth_user_id_fk')`);
  ok("[supabase-benzeri] auth.users FK'leri kuruldu", fkB[0].n === 2);
  const grants = await q(b, `select count(*)::int n from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')`);
  ok("[supabase-benzeri] anon/authenticated'ın public tablolarda yetkisi yok", grants[0].n === 0, String(grants[0].n));
  await b.exec(`insert into businesses (slug,name,category,city,district,address) values ('t','T','cafe','c','d','a') on conflict do nothing`).catch(() => {});
  const au = await q(b, `insert into auth.users default values returning id`);
  const biz = await q(b, `select id from businesses limit 1`);
  if (biz[0]) {
    await b.exec(`insert into business_staff (business_id,user_key,name,email,auth_user_id) values ('${biz[0].id}','k','n','x@y.z','${au[0].id}')`);
    let dup = false;
    try { await b.exec(`insert into business_staff (business_id,user_key,name,email,auth_user_id) values ('${biz[0].id}','k2','n2','q@y.z','${au[0].id}')`); } catch { dup = true; }
    ok("aynı işletmede aynı auth kullanıcısı iki kez personel olamaz", dup);
    await b.exec(`delete from auth.users where id='${au[0].id}'`);
    const left = await q(b, `select auth_user_id from business_staff where email='x@y.z'`);
    ok("auth kullanıcısı silinince personel kaydı korunur (SET NULL)", left.length === 1 && left[0].auth_user_id === null);
  } else ok("test işletmesi oluşturulamadı", false);

  // types.ts güncel mi?
  const { execSync } = await import("node:child_process");
  const path = "src/lib/supabase/types.ts";
  const before = readFileSync(path, "utf8");
  execSync("npx tsx scripts/gen-supabase-types.ts", { stdio: "pipe" });
  const after = readFileSync(path, "utf8");
  ok("types.ts migration'larla güncel (db:types farksız)", before === after);

  console.log(failed ? `\n${failed} TEST BAŞARISIZ` : "\nTÜM ŞEMA TESTLERİ GEÇTİ");
  process.exit(failed ? 1 : 0);
}
main();
