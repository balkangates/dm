"use server";

import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, storeBalances, stores, users } from "@/db/schema";
import { clearSession, createSession, getCurrentUser, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { field, slugify } from "@/lib/core";

function destination(input: string) { return input.startsWith("/") && !input.startsWith("//") ? input : "/hesabim"; }
function authError(message: string, mode: string) { redirect(`/giris?mode=${mode}&error=${encodeURIComponent(message)}`); }

export async function registerAction(form: FormData) {
  const name = field(form, "name").slice(0, 150);
  const email = field(form, "email").toLowerCase().slice(0, 255);
  const password = field(form, "password");
  const next = destination(field(form, "next"));
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) authError("Ad, geçerli e-posta ve en az 8 karakterli şifre gereklidir.", "register");
  const passwordHash = await hashPassword(password);
  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(58321)`);
      const [count] = await tx.select({ total: sql<number>`count(*)::integer` }).from(users);
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      const role = adminEmail ? (email === adminEmail ? "admin" : "customer") : (count.total === 0 ? "admin" : "customer");
      const [created] = await tx.insert(users).values({ name, email, passwordHash, role }).returning({ id: users.id });
      await tx.insert(auditLogs).values({ actorId: created.id, action: "account.created", entityType: "user", entityId: created.id, after: { role } });
      return created.id;
    });
  } catch { authError("Bu e-posta zaten kayıtlı olabilir. Giriş yapmayı deneyin.", "register"); }
  await createSession(id!);
  revalidatePath("/", "layout");
  redirect(next);
}

export async function loginAction(form: FormData) {
  const email = field(form, "email").toLowerCase();
  const password = field(form, "password");
  const next = destination(field(form, "next"));
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) authError("E-posta veya şifre hatalı.", "login");
  await createSession(user.id);
  revalidatePath("/", "layout");
  redirect(next);
}

export async function logoutAction() {
  await clearSession();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function applyStoreAction(form: FormData) {
  const user = await requireUser();
  const name = field(form, "name").slice(0, 180);
  const city = field(form, "city").slice(0, 100);
  const description = field(form, "description").slice(0, 1000);
  const iban = field(form, "iban").replace(/\s/g, "").toUpperCase();
  if (name.length < 3 || !city) redirect("/magaza-basvurusu?error=Mağaza+adı+ve+şehir+gereklidir");
  if (iban && !/^TR\d{24}$/.test(iban)) redirect("/magaza-basvurusu?error=Geçerli+bir+TR+IBAN+giriniz");
  const current = await db.select({ id: stores.id }).from(stores).where(eq(stores.ownerId, user.id)).limit(1);
  if (current.length) redirect("/magaza-paneli");
  const slug = `${slugify(name) || "magaza"}-${randomBytes(3).toString("hex")}`;
  await db.transaction(async (tx) => {
    const [store] = await tx.insert(stores).values({ ownerId: user.id, name, slug, city, description, iban: iban || null }).returning({ id: stores.id });
    await tx.insert(storeBalances).values({ storeId: store.id });
    if (user.role !== "admin") await tx.update(users).set({ role: "store" }).where(eq(users.id, user.id));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "store.applied", entityType: "store", entityId: store.id, after: { name, city } });
  });
  revalidatePath("/magaza-paneli");
  redirect("/magaza-paneli?success=Başvurunuz+incelemeye+alındı");
}

export async function changePasswordAction(form: FormData) {
  const user = await requireUser();
  const oldPassword = field(form, "oldPassword");
  const newPassword = field(form, "newPassword");
  if (!(await verifyPassword(oldPassword, user.passwordHash)) || newPassword.length < 8) redirect("/hesabim?error=Şifre+değiştirilemedi");
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
  await clearSession();
  redirect("/giris?success=Şifreniz+değişti.+Yeniden+giriş+yapın");
}

export async function accountRole() {
  const user = await getCurrentUser();
  return user?.role || null;
}
