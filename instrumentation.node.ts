/**
 * Yalnızca Node.js çalışma zamanında yüklenir (Next 15 edge paketini `pg` ile derlemesin diye ayrı dosya).
 * Demo verisini ilk istekten önce hazırlar; hata durumunda uygulama yine de başlar.
 */
import { ensureSeeded } from "@/lib/queries";

export async function registerNode() {
  try {
    await ensureSeeded();
  } catch (err) {
    console.error("[DampingVar] açılış seed hatası:", err instanceof Error ? err.message : err);
  }
}
