import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, CarFront, Trash2, Wrench } from "lucide-react";
import { db } from "@/db";
import { garageVehicles } from "@/db/schema";
import { addGarageAction, removeGarageAction } from "@/app/actions/customer";
import { EmptyState } from "@/components/catalog-ui";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function GaragePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const user = await requireUser(), params = await searchParams;
  const vehicles = await db.select().from(garageVehicles).where(eq(garageVehicles.userId, user.id)).orderBy(desc(garageVehicles.createdAt));
  return <main className="shell page-main"><div className="breadcrumb"><Link href="/">Ana sayfa</Link> / Garajım</div><div className="page-heading"><span className="eyebrow"><Wrench size={14} /> GARAJIM</span><h1>Aracın burada, doğru parçalar bir tık ötede.</h1><p>Aracını kaydet; sonraki ziyaretinde uygun parçaları hızlıca ara.</p></div>
    {params.error && <div className="notice notice-error">{params.error}</div>}{params.success && <div className="notice notice-success">{params.success}</div>}
    <div className="panel-grid"><div className="stack">{vehicles.length ? vehicles.map((v) => <div className="surface surface-pad" key={v.id}><div style={{ display: "flex", gap: 15, alignItems: "center" }}><div className="category-icon"><CarFront size={27} /></div><div style={{ flex: 1 }}><h3 style={{ fontWeight: 800 }}>{v.brand} {v.model}</h3><p className="muted small-text">{v.year} {v.engine && `· ${v.engine}`} {v.trim && `· ${v.trim}`}</p></div></div><div className="divider" /><div className="form-actions"><Link href={`/parcalar?vehicleBrand=${encodeURIComponent(v.brand)}&vehicleModel=${encodeURIComponent(v.model)}&year=${v.year}${v.engine ? `&engine=${encodeURIComponent(v.engine)}` : ""}`} className="btn btn-dark btn-small">Uyumlu Parçaları Bul <ArrowRight size={14} /></Link><form action={removeGarageAction}><input type="hidden" name="id" value={v.id} /><button type="submit" className="btn btn-outline btn-small"><Trash2 size={13} /> Kaldır</button></form></div></div>) : <EmptyState icon={<CarFront size={28} />} title="Garajın henüz boş" description="Aracını kaydederek uyumlu parçaları daha kolay bulabilirsin." />}</div>
      <div className="surface surface-pad"><h2 className="surface-title">Yeni araç ekle</h2><form action={addGarageAction}><div className="field-grid"><label className="form-field"><span>Marka *</span><input name="brand" required placeholder="Örn. Renault" /></label><label className="form-field"><span>Model *</span><input name="model" required placeholder="Örn. Clio" /></label><label className="form-field"><span>Yıl *</span><input name="year" type="number" min="1950" max={new Date().getFullYear() + 1} required placeholder="2020" /></label><label className="form-field"><span>Motor</span><input name="engine" placeholder="Örn. 1.5 dCi" /></label></div><label className="form-field"><span>Paket</span><input name="trim" placeholder="Örn. Touch" /></label><button className="btn btn-accent" type="submit">Aracımı Kaydet <ArrowRight size={15} /></button></form><div className="notice notice-info" style={{ marginBottom: 0 }}>Uyumluluk bilgileri DampingVar merkezi kataloğundan alınır; mağaza tarafından değiştirilemez.</div></div>
    </div>
  </main>;
}
