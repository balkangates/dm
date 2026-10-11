import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";

/**
 * Hedef veritabanını sıfırdan oluşturur (drop + create) ve mevcut Drizzle şemasını uygular.
 * YALNIZCA test/baseline veritabanları içindir — adı "damping_" ile başlamayan DB'yi reddeder.
 */
export type SchemaMode = "drizzle" | "migrations";

/** Şemayı supabase/migrations/*.sql dosyalarından kurar (Supabase benzetim shim'i ile). */
async function applyMigrations(url: string) {
  const root = path.resolve(process.cwd(), "supabase");
  const files = [
    path.join(root, "tests", "00_supabase_shim.sql"),
    ...readdirSync(path.join(root, "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => path.join(root, "migrations", f)),
  ];
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    for (const f of files) await c.query(readFileSync(f, "utf8"));
  } finally {
    await c.end();
  }
}

export async function prepareDb(
  url: string,
  mode: SchemaMode = (process.env.DV_SCHEMA as SchemaMode | undefined) ?? "drizzle"
): Promise<void> {
  const u = new URL(url);
  const dbName = u.pathname.replace(/^\//, "");
  if (!/^damping_[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`Güvenlik: "${dbName}" test veritabanı adı değil (damping_* olmalı).`);
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.query(`create database ${dbName}`);
  } finally {
    await admin.end();
  }
  if (mode === "migrations") {
    await applyMigrations(url);
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), "dv-drizzle-"));
  const cfg = path.join(dir, "drizzle.config.json");
  writeFileSync(
    cfg,
    JSON.stringify({
      dialect: "postgresql",
      schema: path.resolve(process.cwd(), "src/db/schema.ts"),
      dbCredentials: { url },
    })
  );
  execFileSync("npx", ["drizzle-kit", "push", "--force", "--config", cfg], {
    stdio: "pipe",
    cwd: process.cwd(),
    shell: process.platform === "win32",
  });
}
