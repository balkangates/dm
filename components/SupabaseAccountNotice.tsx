import { PublicShell } from "@/components/Shell";
import { getLocale } from "@/lib/locale";
import { signOutAction } from "@/lib/auth/actions";
import type { AuthContext } from "@/lib/auth/guard";

/**
 * Supabase modunda doğrulanmış kullanıcıya gösterilen geçici ekran.
 * Panel/hesap verileri hâlâ eski veri katmanındadır; Supabase tablolarına bağlanana kadar
 * burada YALNIZCA oturum ve rol bilgisi gösterilir (gerçek veri uydurulmaz).
 */
export async function SupabaseAccountNotice({ ctx, title }: { ctx: AuthContext; title: string }) {
  const locale = await getLocale();
  return (
    <PublicShell user={null} lang={locale.lang} currency={locale.currency} country={locale.country} footer={false}>
      <div className="mx-auto max-w-[640px] px-4 py-16 sm:px-6">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">{title}</p>
        <h1 className="mt-3 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.03em]">Oturumun doğrulandı</h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-muted">
          <span className="font-semibold text-ink">{ctx.email}</span> hesabıyla giriş yaptın (rol: <span className="font-semibold text-ink">{ctx.role}</span>).
          Bu ekranın verileri Supabase tablolarına bağlanma aşamasında; şimdilik yalnızca oturum ve yetki doğrulaması çalışıyor.
        </p>
        <form action={signOutAction} className="mt-6">
          <button type="submit" className="rounded-[3px] border border-line bg-surface px-4 py-2 text-[0.88rem] font-semibold hover:border-accent">
            Çıkış yap
          </button>
        </form>
      </div>
    </PublicShell>
  );
}
