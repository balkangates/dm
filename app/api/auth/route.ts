import { eq } from "drizzle-orm";
import { db } from "@/db";
import { referrals, users } from "@/db/schema";
import { clearSessionCookie, currentUser, hashPassword, referralCodeFor, setSessionTokenUser, verifyPassword } from "@/lib/auth-actions";
import { logAudit } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
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
    await clearSessionCookie();
    return Response.json({ ok: true });
  }

  if (action === "login") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) return Response.json({ ok: false, error: "E-posta ve şifre gerekli." }, { status: 400 });
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return Response.json({ ok: false, error: "E-posta veya şifre hatalı." }, { status: 401 });
    }
    await setSessionTokenUser(user.id);
    await logAudit(user.email, user.role, "USER_LOGIN", "users", user.id, {});
    return Response.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId },
    });
  }

  if (action === "register") {
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const refCode = String(body.referralCode ?? "").trim().toUpperCase();
    if (name.length < 3) return Response.json({ ok: false, error: "Ad soyad en az 3 karakter olmalı." }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ ok: false, error: "Geçerli bir e-posta girin." }, { status: 400 });
    if (password.length < 8) return Response.json({ ok: false, error: "Şifre en az 8 karakter olmalı." }, { status: 400 });

    const dup = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (dup[0]) return Response.json({ ok: false, error: "Bu e-posta ile bir hesap zaten var." }, { status: 409 });

    let inviterId: string | null = null;
    if (refCode) {
      const inv = await db.select().from(users).where(eq(users.referralCode, refCode)).limit(1);
      inviterId = inv[0]?.id ?? null;
    }

    let code = referralCodeFor(name);
    for (let i = 0; i < 5; i++) {
      const clash = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
      if (!clash[0]) break;
      code = referralCodeFor(name) + i;
    }

    const [user] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash: hashPassword(password),
        role: "CUSTOMER",
        referralCode: code,
        district: body.district ? String(body.district) : null,
        country: body.country ? String(body.country) : "TR",
        lang: body.lang ? String(body.lang) : "tr",
        currency: body.currency ? String(body.currency) : "TRY",
        referredBy: inviterId,
      })
      .returning();

    if (inviterId && inviterId !== user.id) {
      await db.insert(referrals).values({
        inviterId,
        inviteeId: user.id,
        code: refCode,
        status: "REGISTERED",
        registeredAt: new Date(),
      });
    }

    await setSessionTokenUser(user.id);
    await logAudit(user.email, user.role, "USER_REGISTERED", "users", user.id, { invitedBy: inviterId ?? null });
    return Response.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }

  return Response.json({ ok: false, error: "Bilinmeyen işlem." }, { status: 400 });
}
