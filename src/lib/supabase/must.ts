type Res<T> = { data: T | null; error: { message: string } | null };

/**
 * Supabase JS hata FIRLATMAZ, `{ data, error }` döner. Sessiz hata yutmayı önlemek için
 * tüm çağrılar bu sarmalayıcıdan geçer.
 */
export function must<T>(res: Res<T>, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${ctx}: veri bulunamadı`);
  return res.data;
}

/** Boş sonucun geçerli olduğu okumalar için (RLS boş döner, hata vermez — testlerde ayrıca doğrulanır). */
export function mustList<T>(res: Res<T[]>, ctx: string): T[] {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  return res.data ?? [];
}
