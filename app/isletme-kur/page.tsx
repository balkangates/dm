import { getSessionUser } from "@/lib/authz";
import { getLocale } from "@/lib/locale";
import { PublicShell, type SessionLite } from "@/components/Shell";
import { Badge, Button, Card, Notice, SectionHead, Select } from "@/components/ds";
import { Icon } from "@/components/icons";
import { BreakEven } from "@/components/BreakEven";
import { ROADMAP } from "@/lib/roadmap";
import { areaSnapshot, listCategories, listDistricts } from "@/lib/data/supabase";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "İşletme Kuranlar İçin Yol Haritası",
  description: "İşletme kurmadan önce bölge rekabetini gör, başabaş hesapla, adım adım kuruluş ve ilk 30 gün planını izle.",
};

export default async function StartBusinessPage({ searchParams }: { searchParams: Promise<{ kategori?: string; ilce?: string }> }) {
  const sp = await searchParams;
  const category = String(sp.kategori ?? "").slice(0, 60);
  const district = String(sp.ilce ?? "").slice(0, 60);
  const [user, locale, cats, dists] = await Promise.all([getSessionUser(), getLocale(), listCategories().catch(() => []), listDistricts().catch(() => [])]);
  const snap = category ? await areaSnapshot(category, district).catch(() => null) : null;
  const session: SessionLite = user ? { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId, referralCode: user.referralCode } : null;

  return (
    <PublicShell user={session} lang={locale.lang} currency={locale.currency} country={locale.country}>
      <div className="mx-auto max-w-[1000px] px-4 py-14 sm:px-6">
        <SectionHead eyebrow="İşletme kuracaklar için" title="Yol haritası: fikirden ilk siparişe"
          desc="Dokuz adımda kuruluş, fiyat, kanal ve açılış kampanyası. Bölgendeki rekabeti gör, başabaş siparişini hesapla, DampingVar’da yayına al." />

        <section id="bolge" className="mt-8 scroll-mt-24">
          <h2 className="font-display text-[1.2rem] font-bold">Bölge rekabet özeti</h2>
          <Card className="mt-3">
            <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Select name="kategori" defaultValue={category} aria-label="Kategori">
                <option value="">Kategori seç</option>
                {cats.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}
              </Select>
              <Select name="ilce" defaultValue={district} aria-label="İlçe">
                <option value="">Tüm ilçeler</option>
                {dists.map((d) => <option key={`${d.city}-${d.district}`} value={d.district}>{d.district}, {d.city}</option>)}
              </Select>
              <Button type="submit">Analiz et</Button>
            </form>
            {snap ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div><p className="text-[0.72rem] uppercase tracking-[0.12em] text-muted">İşletme</p><p className="font-display text-[1.5rem] font-bold tabular">{snap.businesses}</p></div>
                <div><p className="text-[0.72rem] uppercase tracking-[0.12em] text-muted">Yayında kampanya</p><p className="font-display text-[1.5rem] font-bold tabular">{snap.activeCampaigns}</p></div>
                <div><p className="text-[0.72rem] uppercase tracking-[0.12em] text-muted">Ortalama indirim</p><p className="font-display text-[1.5rem] font-bold tabular">{snap.avgDiscount != null ? `%${snap.avgDiscount}` : "—"}</p></div>
                <div><p className="text-[0.72rem] uppercase tracking-[0.12em] text-muted">Rekabet yoğunluğu</p><p className="mt-1"><Badge tone={snap.level === "Yüksek" ? "danger" : snap.level === "Orta" ? "warning" : "positive"}>{snap.level}</Badge></p></div>
              </div>
            ) : <p className="mt-4 text-[0.82rem] text-muted">Kategori seçip analiz et; DampingVar’daki işletmeler ve kampanyalar üzerinden özet görürsün.</p>}
            <Notice tone="info" icon={<Icon.info size={16} />} className="mt-4">
              Bu özet yalnızca DampingVar’da kayıtlı işletmeleri kapsar; mahalledeki tüm rakipleri göstermez. Konum seçerken Google Haritalar’da rakiplerin yoğunluk grafiğini ve yemek platformlarındaki fiyatları da incele.
            </Notice>
          </Card>
        </section>

        <section id="basabas" className="mt-10 scroll-mt-24">
          <h2 className="font-display text-[1.2rem] font-bold">Başabaş hesaplayıcı</h2>
          <div className="mt-3"><BreakEven /></div>
        </section>

        <ol className="mt-12 space-y-4">
          {ROADMAP.map((s) => (
            <li key={s.id} id={s.id}>
              <Card>
                <h3 className="font-display text-[1.08rem] font-bold">{s.title}</h3>
                <p className="mt-1 text-[0.86rem] text-muted">{s.goal}</p>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.88rem]">{s.tasks.map((t) => <li key={t}>{t}</li>)}</ul>
                {s.tool ? <div className="mt-4"><Button href={s.tool.href} size="sm" variant="secondary">{s.tool.label}</Button></div> : null}
              </Card>
            </li>
          ))}
        </ol>

        <Notice tone="warning" icon={<Icon.alert size={16} />} className="mt-10">
          Bu sayfa genel bilgi amaçlıdır; hukuki, mali ve vergisel tavsiye değildir. Ruhsat ve izin şartları il/ilçeye ve faaliyet türüne göre değişir; mali müşavir ve ilgili kurumlarla doğrulayın.
        </Notice>
        <div className="mt-6"><Button href="/kayit?tip=isletme">İşletmeni DampingVar’da kur</Button></div>
      </div>
    </PublicShell>
  );
}
