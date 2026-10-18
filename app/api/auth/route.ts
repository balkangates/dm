import { getSessionUser } from "@/lib/authz";
import { signOutAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

/**
 * Oturum ucu (FAZ 6). Kimlik doğrulama YALNIZCA Supabase Auth üzerinden yapılır;
 * eski özel çerez oturumu ve users tablosu kaldırılmıştır.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ ok: true, user: null });
  return Response.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      referralCode: user.referralCode,
      district: user.district,
      country: user.country,
      lang: user.lang,
      currency: user.currency,
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "login");

  if (action === "logout") {
    await signOutAction();
    return Response.json({ ok: true });
  }

  // Giriş/kayıt bu uçta DEĞİLDİR: kimlik doğrulama Supabase Auth (server action) ile yapılır.
  if (action === "login" || action === "register") {
    return Response.json({ ok: false, error: "Bu uç devre dışı. Supabase Auth ile giriş yapın." }, { status: 410 });
  }

  return Response.json({ ok: false, error: "Bilinmeyen işlem." }, { status: 400 });
}
