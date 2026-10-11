/**
 * GERÇEK SUPABASE YOLU: supabase-js (bizim client/admin fabrikalarımız) → PostgREST → RLS → tablolar.
 * PostgREST, Supabase'in REST katmanıdır; burada gerçek PostgREST ikilisi migration'dan kurulan şemaya bağlanır.
 * Yalnızca POSTGREST_BIN ayarlıysa çalışır (CI/yerelde isteğe bağlı):
 *   POSTGREST_BIN=/yol/postgrest npm test
 * Not: Supabase Auth (GoTrue) burada YOK; JWT'ler testte imzalanır (RLS'in baktığı şey JWT'dir).
 */
import { createHmac, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { Client } from "pg";
import { prepareDb } from "../support/prepare-db";
import { rowsToCamel } from "@/lib/supabase/case";
import { must, mustList } from "@/lib/supabase/must";

const BIN = process.env.POSTGREST_BIN;
const dbReady = inject("dbReady");
const SECRET = "dampingvar-test-jwt-secret-at-least-32-chars!!";
// Negatif öz-kontrol: DV_TEST_BAD_SIGN=1 ile yanlış sırla imzalanır → tüm testler DÜŞMELİ (testin boş geçmediğini kanıtlar).
const SIGN_SECRET = process.env.DV_TEST_BAD_SIGN ? "yanlis-sir-yanlis-sir-yanlis-sir-12345" : SECRET;
const base = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/damping_test";
const REST_PORT = 3300;
const PROXY_PORT = 3301;

function jwt(payload: Record<string, unknown>) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${data}.${createHmac("sha256", SIGN_SECRET).update(data).digest("base64url")}`;
}

describe.skipIf(!BIN || !dbReady)("supabase-js → PostgREST → RLS (gerçek REST katmanı)", () => {
  let pgrst: ChildProcess;
  let proxy: http.Server;
  let pg: Client;
  const dbUrl = (() => {
    const u = new URL(base);
    u.pathname = "/damping_rest";
    return u.toString();
  })();

  beforeAll(async () => {
    await prepareDb(dbUrl, "migrations");
    pg = new Client({ connectionString: dbUrl });
    await pg.connect();
    const b = await pg.query(
      `insert into businesses(slug,name,category,district,address) values ('rest-test','REST Test','Kafe','Kadıköy','Adres') returning id`
    );
    await pg.query(`insert into campaigns(business_id,code,title) values ($1,'REST-1','REST Kampanya')`, [b.rows[0].id]);

    const au = new URL(dbUrl);
    au.username = "authenticator";
    au.password = "postgres";
    pgrst = spawn(BIN!, [], {
      env: {
        ...process.env,
        PGRST_DB_URI: au.toString(),
        PGRST_DB_SCHEMAS: "public",
        PGRST_DB_ANON_ROLE: "anon",
        PGRST_JWT_SECRET: SECRET,
        PGRST_SERVER_PORT: String(REST_PORT),
        PGRST_SERVER_HOST: "127.0.0.1",
      },
      stdio: "ignore",
    });
    // Supabase'de Kong /rest/v1 önekini kaldırır; aynısını yapan minimal vekil.
    proxy = http
      .createServer((req, res) => {
        const target = (req.url ?? "/").replace(/^\/rest\/v1/, "") || "/";
        const up = http.request(
          { host: "127.0.0.1", port: REST_PORT, path: target, method: req.method, headers: req.headers },
          (r) => {
            res.writeHead(r.statusCode ?? 500, r.headers);
            r.pipe(res);
          }
        );
        req.pipe(up);
      })
      .listen(PROXY_PORT, "127.0.0.1");
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${REST_PORT}/businesses?limit=1`, { headers: { apikey: "x" } });
        if (r.status !== 0) break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `http://127.0.0.1:${PROXY_PORT}`);
  }, 120_000);

  afterAll(async () => {
    pgrst?.kill();
    proxy?.close();
    await pg?.end();
    vi.unstubAllEnvs();
  });

  const anonClient = async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt({ role: "anon" }));
    return (await import("@/lib/supabase/client")).createClient();
  };
  const adminClient = async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", jwt({ role: "service_role" }));
    return (await import("@/lib/supabase/admin")).createAdminClient();
  };

  it("service_role: tabloyu okur; snake_case → camelCase + Date dönüşümü (case.ts)", async () => {
    const sb = await adminClient();
    const rows = rowsToCamel<{ slug: string; createdAt: Date; planCode: string }>(
      mustList(await sb.from("businesses").select("*"), "businesses")
    );
    expect(rows.map((r) => r.slug)).toContain("rest-test");
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(rows[0].planCode).toBeDefined();
  });

  it("FK ilişkisi PostgREST'te gömülü sorguya dönüşür (Drizzle join karşılığı)", async () => {
    const sb = await adminClient();
    const row = must(
      await sb.from("campaigns").select("code, businesses(slug,name)").eq("code", "REST-1").single(),
      "campaign+business"
    ) as unknown as { code: string; businesses: { slug: string } };
    expect(row.businesses.slug).toBe("rest-test");
  });

  it("anon: RLS politikası yok → HATA YOK, BOŞ SONUÇ (T4: sessiz boşluk)", async () => {
    const sb = await anonClient();
    const res = await sb.from("businesses").select("*");
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("authenticated (imzalı JWT): politika yok → yine boş", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt({ role: "authenticated", sub: randomUUID() }));
    const sb = (await import("@/lib/supabase/client")).createClient();
    const res = await sb.from("businesses").select("*");
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("anon: finans tablosuna yazamaz (42501 permission denied)", async () => {
    const sb = await anonClient();
    const res = await sb.from("damping_wallets").insert({ user_id: randomUUID() });
    expect(res.error?.code).toBe("42501");
  });

  it("service_role bile defterleri değiştiremez (append-only trigger REST üzerinden de geçerli)", async () => {
    const sb = await adminClient();
    const ins = await sb.from("audit_logs").insert({ actor: "t", role: "SYSTEM", action: "REST", entity_type: "t" });
    expect(ins.error).toBeNull();
    const upd = await sb.from("audit_logs").update({ action: "X" }).eq("action", "REST");
    expect(upd.error?.message).toMatch(/append-only/);
    const del = await sb.from("audit_logs").delete().eq("action", "REST");
    expect(del.error?.message).toMatch(/append-only/);
  });

  it("geçersiz durum değeri REST üzerinden reddedilir (CHECK)", async () => {
    const sb = await adminClient();
    const res = await sb.from("fraud_reviews").insert({ reason: "r", status: "NOPE" });
    expect(res.error?.message).toMatch(/fraud_reviews_status_check/);
  });
});
