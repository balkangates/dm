import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { patchToSnake, rowToCamel, rowsToCamel } from "@/lib/supabase/case";
import { must, mustList } from "@/lib/supabase/must";

afterEach(() => vi.unstubAllEnvs());

describe("case.ts (camelCase ↔ snake_case + Date)", () => {
  it("üst düzey anahtarları camelCase yapar, _at kolonlarını Date'e çevirir", () => {
    const r = rowToCamel<Record<string, unknown>>({
      business_id: "b1",
      created_at: "2026-10-10T12:00:00.000Z",
      period_start: "2026-10-01T00:00:00.000Z",
      redeemed_at: null,
      damping_used_cents: 5,
    });
    expect(r.businessId).toBe("b1");
    expect(r.createdAt).toBeInstanceOf(Date);
    expect((r.createdAt as Date).toISOString()).toBe("2026-10-10T12:00:00.000Z");
    expect(r.periodStart).toBeInstanceOf(Date);
    expect(r.redeemedAt).toBeNull();
    expect(r.dampingUsedCents).toBe(5);
  });

  it("jsonb içeriğinin anahtarlarına ve tarih benzeri string'lerine DOKUNMAZ", () => {
    const meta = { some_key: 1, nested: { other_key: "2026-10-10T12:00:00.000Z" }, created_at: "x" };
    const r = rowToCamel<{ meta: typeof meta }>({ meta });
    expect(r.meta).toEqual(meta);
  });

  it("rowsToCamel ve patchToSnake", () => {
    expect(rowsToCamel([{ a_b: 1 }, { a_b: 2 }])).toEqual([{ aB: 1 }, { aB: 2 }]);
    const d = new Date("2026-10-10T12:00:00.000Z");
    expect(patchToSnake({ businessId: 1, endsAt: d, plain: "x" })).toEqual({
      business_id: 1,
      ends_at: "2026-10-10T12:00:00.000Z",
      plain: "x",
    });
  });
});

describe("must.ts (sessiz hata yutmayı önler)", () => {
  it("error varsa fırlatır, veri yoksa fırlatır", () => {
    expect(() => must({ data: null, error: { message: "boom" } }, "ctx")).toThrow("ctx: boom");
    expect(() => must({ data: null, error: null }, "ctx")).toThrow("veri bulunamadı");
    expect(must({ data: 5, error: null }, "ctx")).toBe(5);
  });
  it("mustList boş listeyi kabul eder, hatayı fırlatır", () => {
    expect(mustList({ data: null, error: null }, "ctx")).toEqual([]);
    expect(() => mustList({ data: null, error: { message: "x" } }, "ctx")).toThrow("ctx: x");
  });
});

describe("istemci fabrikaları (lazy env)", () => {
  it("modüller env olmadan İÇE AKTARILABİLİR (build'i kırmaz); hata çağrı anında", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const browser = await import("@/lib/supabase/client");
    const server = await import("@/lib/supabase/server");
    const admin = await import("@/lib/supabase/admin");
    expect(() => browser.createClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    await expect(server.createClient()).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => admin.createAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("env verilince tarayıcı ve admin istemcileri oluşur", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
    const { createClient } = await import("@/lib/supabase/client");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    expect(typeof createClient().auth.getSession).toBe("function");
    expect(typeof createAdminClient().from).toBe("function");
  });
});

describe("gizli anahtar sızıntı koruması", () => {
  function walk(dir: string, out: string[] = []) {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx)$/.test(f) && out.push(p);
    }
    return out;
  }
  const files = walk(path.resolve(__dirname, "../../src"));

  it("service role anahtarı yalnızca admin.ts içinde okunur", () => {
    const users = files.filter((f) => readFileSync(f, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"));
    expect(users.map((f) => path.basename(f))).toEqual(["admin.ts"]);
  });

  it("hiçbir dosya NEXT_PUBLIC_ önekli service/secret anahtarı kullanmaz", () => {
    const bad = files.filter((f) => /NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET|DATABASE)/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });

  it("admin.ts 'server-only' ile korunur ve client bileşenleri onu içe aktarmaz", () => {
    expect(readFileSync(path.resolve(__dirname, "../../src/lib/supabase/admin.ts"), "utf8")).toContain('import "server-only"');
    const offenders = files.filter((f) => {
      const t = readFileSync(f, "utf8");
      return /^["']use client["']/m.test(t) && /supabase\/admin/.test(t);
    });
    expect(offenders).toEqual([]);
  });
});
