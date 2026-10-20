/**
 * FAZ 6 — Yetki tabloları ve yardımcıları (Drizzle/özel oturum kaldırıldı).
 *
 * Rol eşleme ve işletme aktörü lib/authz.ts'tedir; oturum yalnızca Supabase Auth.
 */

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
    "orders.manage",
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
    "orders.manage",
  ],
} as const;

export function staffCan(role: string, action: string): boolean {
  const list = (STAFF_CAN as Record<string, readonly string[]>)[role] ?? [];
  return list.includes(action);
}

export function jsonError(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}
