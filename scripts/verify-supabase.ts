/**
 * Faz 01 doğrulaması — Supabase foundation katmanı (gerçek proje gerektirmez).
 * Sahte bir Supabase (PostgREST + Auth) sunucusuna karşı browser / admin / env davranışını test eder.
 * Çalıştırma: npm run supabase:verify
 * Server client + proxy + oturum çerezi uçtan uca testi: FAZ1 raporundaki "next start" adımı.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

let failed = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failed++;
};

type Seen = { url: string; apikey?: string; auth?: string };
const seen: Seen[] = [];

async function main() {
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url ?? "", apikey: req.headers["apikey"] as string, auth: req.headers["authorization"] as string });
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/auth/v1/user")) {
      if (req.headers["authorization"] === "Bearer valid-token") res.end(JSON.stringify({ id: "u1", aud: "authenticated", email: "a@b.c" }));
      else { res.statusCode = 401; res.end(JSON.stringify({ message: "invalid JWT" })); }
      return;
    }
    res.setHeader("content-range", "*/0");
    res.end("[]");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // ---- ENV koruması ----
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { createClient: createBrowser } = await import("../src/lib/supabase/client");
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { hasPublicSupabaseEnv } = await import("../src/lib/env");
  ok("env yokken hasPublicSupabaseEnv=false", hasPublicSupabaseEnv() === false);
  let threw = false; try { createBrowser(); } catch { threw = true; }
  ok("env yokken browser client net hata verir", threw);
  threw = false; try { createAdminClient(); } catch { threw = true; }
  ok("env yokken admin client net hata verir", threw);
  ok("DATABASE_URL/DIRECT_URL bu katman için gerekmiyor", !process.env.DATABASE_URL && !process.env.DIRECT_URL);

  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  threw = false; try { createAdminClient(); } catch (e) { threw = /SERVICE_ROLE/.test(String(e)); }
  ok("service role key yokken admin client reddedilir", threw);

  // ---- Browser client (anon key, RLS'e tabi) ----
  const browser = createBrowser();
  await browser.from("packages").select("code");
  const b = seen.at(-1)!;
  ok("browser client: /rest/v1 isteği", b.url.startsWith("/rest/v1/packages"));
  ok("browser client: anon key kullanıyor", b.apikey === "anon-key" && b.auth === "Bearer anon-key");

  // ---- Authenticated session ----
  const noSession = await browser.auth.getUser("bad-token");
  ok("geçersiz token Auth tarafından reddedilir", !!noSession.error && !noSession.data.user);
  const good = await browser.auth.getUser("valid-token");
  ok("geçerli token doğrulanır (getUser sunucuda doğrular)", good.data.user?.id === "u1");

  // ---- Admin client (service role) ----
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  const admin = createAdminClient();
  const r = await admin.from("packages").select("code", { head: true, count: "exact" });
  const a = seen.at(-1)!;
  ok("admin client: service role key kullanıyor", a.apikey === "service-role-key" && a.auth === "Bearer service-role-key");
  ok("admin client: istek başarılı", !r.error);

  // ---- Service role key tarayıcıya sızmıyor mu? (kaynak denetimi) ----
  const { execSync } = await import("node:child_process");
  const leaks = execSync(
    `grep -RlE "SUPABASE_SERVICE_ROLE_KEY|supabase/admin|env\\.server" src --include=*.tsx --include=*.ts || true`
  ).toString().split("\n").filter(Boolean);
  const clientFiles = leaks.filter((f) => {
    const src = execSync(`head -3 ${f}`).toString();
    return /^["']use client["']/.test(src.trim());
  });
  ok("'use client' dosyalarında service role / admin import'u yok", clientFiles.length === 0, clientFiles.join(","));

  server.close();
  console.log(failed ? `\n${failed} TEST BAŞARISIZ` : "\nTÜM TESTLER GEÇTİ");
  process.exit(failed ? 1 : 0);
}
main();
