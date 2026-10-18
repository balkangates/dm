import { jsonError } from "@/lib/auth-actions";
import { getSessionUser } from "@/lib/authz";
import { ActionError, adminAction } from "@/lib/data/supabase-actions";

export const dynamic = "force-dynamic";

/**
 * Yönetici işlemleri (FAZ 6 — Supabase). Yetki SUNUCUDA doğrulanır:
 * profiles.role = 'admin' (kaynak), burada UPPERCASE eşlenir. Son güvenlik
 * sınırı RLS'tir: admin olmayan satırlara dokunamaz. Her kritik işlem
 * audit log'a yazılır.
 *
 * NOT: Bu uçta müşteri parası, cüzdan bakiyesi veya işletmeler arası
 * mahsup/transfer işlemi YOKTUR. Yalnızca hizmet bedeli, paket, kampanya
 * moderasyonu, bonus politikası ve fraud incelemesi yönetilir.
 */
export async function POST(req: Request) {
  const admin = await getSessionUser();
  if (!admin) return jsonError(401, "Oturum gerekli.");
  if (admin.role !== "ADMIN") return jsonError(403, "Bu işlem yalnızca platform yöneticileri içindir.");
  const body = await req.json().catch(() => ({}));
  try {
    return await adminAction(admin, body as Record<string, unknown>);
  } catch (e) {
    if (e instanceof ActionError) return jsonError(e.status, e.message);
    throw e;
  }
}

export async function GET() {
  const admin = await getSessionUser();
  if (!admin || admin.role !== "ADMIN") return jsonError(403, "Yönetici erişimi gerekli.");
  return Response.json({ ok: true, role: admin.role });
}
