"use client";

import { useState } from "react";
import { ArrowRight, CarFront, Hash, Search, SlidersHorizontal } from "lucide-react";

export function SearchPanel() {
  const [mode, setMode] = useState<"vehicle" | "oem">("vehicle");
  const years = Array.from({ length: 35 }, (_, i) => new Date().getFullYear() + 1 - i);
  return <section className="search-panel" aria-label="Parça arama">
    <div className="search-panel-top"><div><span className="search-label">PARÇA BULUCU</span><h2>Aracına uygun parçayı bul.</h2></div><div className="search-tabs"><button type="button" className={mode === "vehicle" ? "active" : ""} onClick={() => setMode("vehicle")}><CarFront size={17} /> Araç ile ara</button><button type="button" className={mode === "oem" ? "active" : ""} onClick={() => setMode("oem")}><Hash size={16} /> OEM / parça ara</button></div></div>
    {mode === "vehicle" ? <form action="/parcalar" method="GET" className="vehicle-search-form">
      <label><span>Araç Markası</span><input name="vehicleBrand" placeholder="Örn. Volkswagen" required /></label>
      <label><span>Model</span><input name="vehicleModel" placeholder="Örn. Golf" required /></label>
      <label><span>Yıl</span><select name="year" defaultValue="" required><option value="" disabled>Yıl seçiniz</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      <label><span>Motor / Paket</span><input name="engine" placeholder="Örn. 1.6 TDI" /></label>
      <button className="btn btn-accent search-submit" type="submit">Parçaları Bul <ArrowRight size={19} /></button>
    </form> : <form action="/parcalar" method="GET" className="oem-search-form"><div className="oem-search-input"><Search size={20} /><input name="q" autoFocus placeholder="OEM numarası veya parça adı yazın..." required /></div><button className="btn btn-accent" type="submit">Parçaları Bul <ArrowRight size={18} /></button></form>}
    <div className="search-panel-bottom"><span><SlidersHorizontal size={14} /> Markaya, ürün tipine ve fiyata göre filtrele</span><span>OEM numaranı bilmiyor musun? <a href="/teklif-al">Mağazalardan teklif al →</a></span></div>
  </section>;
}
