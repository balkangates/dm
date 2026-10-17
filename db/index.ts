import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * ESKİ (geçici) veri katmanı — FAZ 5'te Supabase'e taşınınca kaldırılacak.
 * Bağlantı İLK KULLANIMDA kurulur: DATABASE_URL tanımsız olsa bile (ör. yalnızca Supabase
 * değişkenleri olan Vercel ortamı) bu modülü içe aktaran sayfalar yüklenebilir; hata yalnızca
 * veritabanına gerçekten erişilmek istendiğinde fırlatılır.
 */
type Db = ReturnType<typeof drizzle>;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDrizzle?: Db;
};

function init(): { pool: Pool; db: Db } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = globalForDb.__arenaNextJsPostgresqlPool ?? new Pool({ connectionString: databaseUrl });
  const db = globalForDb.__arenaNextJsDrizzle ?? drizzle(pool);
  globalForDb.__arenaNextJsPostgresqlPool = pool;
  globalForDb.__arenaNextJsDrizzle = db;
  return { pool, db };
}

function lazy<T extends object>(pick: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = pick() as Record<string | symbol, unknown>;
      const value = target[prop];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

export const pool: Pool = lazy(() => init().pool);
export const db: Db = lazy(() => init().db);
