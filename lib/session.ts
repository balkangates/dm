import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export const SESSION_COOKIE = "dv_session";
const SESSION_DAYS = 30;

function secret(): string {
  return (
    process.env.DV_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dampingvar-development-secret-change-me"
  );
}

/* ------------------------------- parola -------------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/* ------------------------------- oturum -------------------------------- */

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const expires = Date.now() + SESSION_DAYS * 86400000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string): { userId: string; expires: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresRaw, signature] = parts;
  const expires = Number(expiresRaw);
  if (!userId || !Number.isFinite(expires) || expires < Date.now()) return null;
  const expected = sign(`${userId}.${expiresRaw}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId, expires };
}

export async function setSessionCookie(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export type SessionUser = typeof users.$inferSelect;

/** Oturum doğrulaması her zaman sunucuda yapılır; rol istemciden gelmez. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const parsed = readSessionToken(token);
  if (!parsed) return null;
  const rows = await db.select().from(users).where(eq(users.id, parsed.userId)).limit(1);
  return rows[0] ?? null;
}

export async function requireRole(roles: string[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Oturum gerekli.");
  if (!roles.includes(user.role)) throw new HttpError(403, "Bu işlem için yetkiniz yok.");
  return user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function referralCodeFor(name: string): string {
  const base = (name || "DV")
    .toLocaleUpperCase("tr-TR")
    .replace(/[^A-ZÇĞİÖŞÜ]/g, "")
    .slice(0, 6);
  return `${base || "DV"}${Math.floor(100 + Math.random() * 900)}`;
}
