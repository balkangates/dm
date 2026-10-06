import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazy veritabanı bağlantısı.
 *
 * Eski sürüm modül yüklenirken DATABASE_URL yoksa throw ediyordu; bu yüzden
 * `next build` ("Collecting page data") DATABASE_URL olmayan ortamlarda kırılıyordu.
 * Artık bağlantı ilk gerçek sorguda kurulur. Import yan etkisizdir.
 *
 * Supabase notları:
 *  - Runtime: Supavisor "transaction pooler" (port 6543) bağlantı dizesini DATABASE_URL'e koyun.
 *  - Migration/drizzle-kit: doğrudan veya session bağlantısı (DIRECT_URL) kullanılır.
 *  - Bu istemci service-role gibi RLS'i bypass eden bir Postgres rolüyle bağlanır;
 *    yalnızca SUNUCUDA, yetkisi doğrulanmış işlemlerde kullanılmalıdır.
 */
type Db = NodePgDatabase<Record<string, never>>;

const globalForDb = globalThis as typeof globalThis & {
  __dampingvarPool?: Pool;
  __dampingvarDb?: Db;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const isLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(connectionString);
  return new Pool({
    connectionString,
    // Serverless (Vercel) için küçük havuz; pooler çoklamayı üstlenir.
    max: Number(process.env.DB_POOL_MAX) || (process.env.NODE_ENV === "production" ? 5 : 10),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
}

export function getPool(): Pool {
  if (!globalForDb.__dampingvarPool) globalForDb.__dampingvarPool = createPool();
  return globalForDb.__dampingvarPool;
}

function getDb(): Db {
  if (!globalForDb.__dampingvarDb) globalForDb.__dampingvarDb = drizzle(getPool());
  return globalForDb.__dampingvarDb;
}

// Mevcut `db.select()/transaction()/execute()` çağrıları değişmeden çalışsın diye Proxy.
export const db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export const pool = new Proxy({} as Pool, {
  get(_t, prop) {
    const real = getPool() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});
