import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessStaff, users } from "@/db/schema";
import {
  clearSessionCookie,
  createSessionToken,
  currentUser,
  hashPassword,
  readSessionToken,
  referralCodeFor,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
  type SessionUser,
} from "@/lib/session";

export {
  clearSessionCookie,
  createSessionToken,
  currentUser,
  hashPassword,
  readSessionToken,
  referralCodeFor,
  setSessionCookie,
  verifyPassword,
  type SessionUser,
};

export async function setSessionTokenUser(userId: string) {
  await setSessionCookie(userId);
}

export type BusinessActor = {
  user: SessionUser;
  businessId: string;
  staffRole: "OWNER" | "MANAGER" | "CASHIER";
};

/**
 * İşletme yetkisi SUNUCUDA doğrulanır:
 * oturum sahibi kullanıcı → users.role = BUSINESS → users.businessId
 * ve business_staff kaydı üzerinden rol okunur. İstemciden rol kabul edilmez.
 */
export async function businessActor(): Promise<BusinessActor | null> {
  const user = await currentUser();
  if (!user) return null;
  if (user.role === "ADMIN") {
    const anyStaff = await db.select().from(businessStaff).limit(1);
    return { user, businessId: user.businessId ?? anyStaff[0]?.businessId ?? "", staffRole: "OWNER" };
  }
  if (user.role !== "BUSINESS" || !user.businessId) return null;
  const staff = await db
    .select()
    .from(businessStaff)
    .where(eq(businessStaff.businessId, user.businessId));
  const mine = staff.find((s) => s.email.toLowerCase() === user.email.toLowerCase()) ?? staff[0];
  const role = (mine?.role ?? "CASHIER") as BusinessActor["staffRole"];
  return { user, businessId: user.businessId, staffRole: role };
}

export const STAFF_CAN = {
  CASHIER: ["usage.scan", "usage.submit", "usage.read", "campaign.read"],
  MANAGER: [
    "usage.scan",
    "usage.submit",
    "usage.read",
    "usage.verify",
    "campaign.read",
    "campaign.write",
    "content.approve",
    "ai.generate",
    "report.read",
    "bonus.read",
  ],
  OWNER: [
    "usage.scan",
    "usage.submit",
    "usage.read",
    "usage.verify",
    "campaign.read",
    "campaign.write",
    "content.approve",
    "ai.generate",
    "report.read",
    "bonus.read",
    "profile.write",
    "invoice.read",
    "ads.write",
    "staff.manage",
  ],
} as const;

export function staffCan(role: string, action: string): boolean {
  const list = (STAFF_CAN as Record<string, readonly string[]>)[role] ?? [];
  return list.includes(action);
}

export function jsonError(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}
