/**
 * Yalnızca Node.js çalışma zamanında yüklenir (Next 15 edge paketini `pg` ile derlemesin diye ayrı dosya).
 * Eski demo verisini (Drizzle/pg katmanı) hazırlar. DATABASE_URL yoksa — yani uygulama yalnızca
 * Supabase ile çalışıyorsa — hiçbir şey yapmaz ve sunucunun açılmasını ENGELLEMEZ.
 */
export async function registerNode() {
  if (!process.env.DATABASE_URL) return;
  try {
    const { ensureSeeded } = await import("@/lib/queries");
    await ensureSeeded();
  } catch (err) {
    console.error("[DampingVar] açılış seed hatası:", err instanceof Error ? err.message : err);
  }
}
