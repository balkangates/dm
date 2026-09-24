import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stores, users } from "@/db/schema";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "dv_session";
const WEEK = 60 * 60 * 24 * 7;

function key() {
  const secret = process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!secret) throw new Error("SESSION_SECRET veya DATABASE_URL gerekli.");
  return secret;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash || hash.length !== 128) return false;
    const expected = Buffer.from(hash, "hex");
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createSession(userId: string) {
  const payload = Buffer.from(JSON.stringify({ id: userId, exp: Date.now() + WEEK * 1000 })).toString("base64url");
  const signature = createHmac("sha256", key()).update(payload).digest("base64url");
  (await cookies()).set(COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: WEEK,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", key()).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { id: string; exp: number };
    if (parsed.exp < Date.now() || !/^[0-9a-f-]{36}$/.test(parsed.id)) return null;
    const [user] = await db.select().from(users).where(eq(users.id, parsed.id)).limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=" + encodeURIComponent("/hesabim"));
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/hesabim?error=yetki");
  return user;
}

export async function getMyStore(userId: string) {
  const [store] = await db.select().from(stores).where(eq(stores.ownerId, userId)).limit(1);
  return store ?? null;
}

export async function requireStore() {
  const user = await requireUser();
  const store = await getMyStore(user.id);
  if (!store) redirect("/magaza-basvurusu");
  return { user, store };
}
