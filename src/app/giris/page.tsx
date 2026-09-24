import Link from "next/link";
import { count } from "drizzle-orm";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { loginAction, registerAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function AuthPage({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string; success?: string; next?: string }> }) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect("/hesabim");
  const isRegister = params.mode === "register";
  const [total] = await db.select({ count: count() }).from(users);
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/hesabim";
  return <main className="shell"><div className="auth-wrap"><div className="auth-art"><div><span className="eyebrow eyebrow-light"><ShieldCheck size={14} /> DAMPINGVAR'A HOŞ GELDİN</span><h2>Doğru parçaya giden yol burada başlar.</h2><p>Aracını kaydet, teklifleri karşılaştır, tüm siparişlerini tek yerden takip et.</p></div></div>
    <div className="auth-form"><div className="auth-switch"><Link href={`/giris?mode=login&next=${encodeURIComponent(next)}`} className={!isRegister ? "active" : ""}>Giriş Yap</Link><Link href={`/giris?mode=register&next=${encodeURIComponent(next)}`} className={isRegister ? "active" : ""}>Hesap Oluştur</Link></div>
      <h1>{isRegister ? "Aramıza katıl." : "Yeniden hoş geldin."}</h1><p>{isRegister ? "Bir hesap oluştur, doğru parçayı bulmaya başla." : "Hesabına giriş yap ve kaldığın yerden devam et."}</p>
      {params.error && <div className="notice notice-error">{params.error}</div>}{params.success && <div className="notice notice-success">{params.success}</div>}
      {isRegister ? <form action={registerAction}><input type="hidden" name="next" value={next} /><label className="form-field"><span>Ad Soyad</span><input name="name" placeholder="Adınız ve soyadınız" required minLength={2} /></label><label className="form-field"><span>E-posta</span><input type="email" name="email" placeholder="ornek@eposta.com" required /></label><label className="form-field"><span>Şifre</span><input type="password" name="password" placeholder="En az 8 karakter" required minLength={8} /></label>{total.count === 0 && !process.env.ADMIN_EMAIL && <div className="notice notice-info"><LockKeyhole size={15} /> İlk oluşturulan hesap platform yöneticisi olacaktır.</div>}<button type="submit" className="btn btn-accent">Hesap Oluştur <ArrowRight size={17} /></button></form> : <form action={loginAction}><input type="hidden" name="next" value={next} /><label className="form-field"><span>E-posta</span><input type="email" name="email" placeholder="ornek@eposta.com" required /></label><label className="form-field"><span>Şifre</span><input type="password" name="password" placeholder="Şifreniz" required /></label><button type="submit" className="btn btn-accent">Giriş Yap <ArrowRight size={17} /></button></form>}
      <div className="auth-meta">Devam ederek DampingVar alışveriş sürecini kabul etmiş olursun. <Link href="/nasil-calisir">Nasıl çalışır?</Link></div>
    </div></div></main>;
}
