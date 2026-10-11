/**
 * Drizzle `row.businessId` (camelCase) döndürüyordu; Supabase `business_id` (snake_case) döndürür.
 * Mevcut çağıran kod değişmesin diye üst düzey kolon anahtarları camelCase'e çevrilir.
 * jsonb ALANLARININ İÇİNE dokunulmaz. Zaman damgaları Drizzle gibi `Date` olarak verilir.
 */
const DATE_KEYS = new Set(["period_start", "period_end"]);

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
export const snake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());

export function rowToCamel<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const isDateCol = k.endsWith("_at") || DATE_KEYS.has(k);
    out[camel(k)] = isDateCol && typeof v === "string" ? new Date(v) : v;
  }
  return out as T;
}

export const rowsToCamel = <T>(rows: Record<string, unknown>[]): T[] => rows.map((r) => rowToCamel<T>(r));

/** Yazma yönü: { businessId: 1 } → { business_id: 1 }. Date → ISO string. */
export function patchToSnake(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [snake(k), v instanceof Date ? v.toISOString() : v])
  );
}
