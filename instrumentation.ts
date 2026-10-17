/**
 * Sunucu açılışında bir kez çalışır. Node.js'e özgü kod `instrumentation.node.ts` içindedir
 * (Next 15'te edge paketine `pg` sızmaması için dinamik ve çalışma zamanı kontrollü import).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation.node");
    await registerNode();
  }
}
