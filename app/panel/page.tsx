import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { getBusinessData, listBusinesses, listVideos } from "@/lib/queries";
import { getLocale } from "@/lib/locale";
import { BusinessDash } from "@/components/dashpages";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Button } from "@/components/ds";

export const dynamic = "force-dynamic";

export const metadata = { title: "İşletme Paneli" };

/** İşletme paneli (FAZ 6 — Supabase). */
export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/giris?next=/panel");

  const sp = await searchParams;
  const locale = await getLocale();

  /**
   * Yetki: işletme paneli yalnızca işletme hesabına aittir.
   * - BUSINESS  → business_staff üzerinden çözülen kendi işletme kaydı
   *              (istemciden gelen değere güvenilmez)
   * - ADMIN     → denetim amacıyla ?biz= ile seçilen işletme
   * - CUSTOMER  → erişim yok, kendi hesabına yönlendirilir
   */
  let businessId: string | null = null;
  if (user.role === "BUSINESS") {
    businessId = user.businessId;
  } else if (user.role === "ADMIN") {
    const all = await listBusinesses();
    businessId =
      (typeof sp.biz === "string" ? (all.find((b) => b.slug === sp.biz)?.id ?? null) : null) ?? all[0]?.id ?? null;
  }
  if (!businessId && user.role !== "BUSINESS") redirect(user.role === "ADMIN" ? "/admin" : "/hesabim");
  // BUSINESS + işletme bağlantısı yok: yönlendirme YAPILMAZ. /hesabim, middleware
  // katmanında ROLE_HOME["business"]=/panel'e geri gönderir (lib/roles.ts) ve döngü
  // oluşurdu. Panel içindeki !data bloğu (aşağıda) bu durumu terminal olarak gösterir.

  const range = [7, 14, 30].includes(Number(sp.gun)) ? Number(sp.gun) : 14;
  const [data, videos] = await Promise.all([
    businessId ? getBusinessData(businessId, range) : Promise.resolve(null),
    listVideos(),
  ]);
  if (!data) {
    // Çevrim engeli (FAZ 9 canlı testi): /giris'e yönlendirme girişli kullanıcıyı
    // yeniden /panel'e taşıyordu (ERR_TOO_MANY_REDIRECTS). Panel içinde dürüst
    // durum ekranı gösterilir; yönlendirme yapılmaz.
    const session: SessionLite = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      referralCode: user.referralCode,
    };
    return (
      <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
        <div className="mx-auto max-w-[720px] px-4 py-24 text-center">
          <h1 className="font-display text-[1.6rem] font-bold">İşletme kaydı bulunamadı</h1>
          <p className="mx-auto mt-3 max-w-[46ch] text-[0.95rem] leading-relaxed text-muted">
            Hesabın bir işletme kaydına bağlı değil veya işletme verisi okunamadı.
            Yönlendirme döngüsünü önlemek için bu durum panel içinde gösteriliyor.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Button href="/hesabim/isletme-ac" variant="primary">İşletme Aç</Button>
            <Button href="/hesabim" variant="secondary">Hesabım</Button>
            <Button href="/" variant="secondary">Ana sayfa</Button>
          </div>
        </div>
      </PublicShell>
    );
  }

  return (
    <BusinessDash
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
        referralCode: user.referralCode,
      }}
      data={data}
      locale={locale}
      videos={videos}
      range={range}
      initial={typeof sp.s === "string" ? sp.s : "overview"}
    />
  );
}
