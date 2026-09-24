"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { requestOemAction } from "@/app/actions/store";
import type { ImportRow } from "@/lib/csv-import";
import { productTypeLabels } from "@/lib/core";

type Preview = { rows: ImportRow[]; token: string; summary: { total: number; valid: number; new: number; update: number; matched: number; oemNotFound: number; invalidType: number; invalidPrice: number; invalidStock: number; duplicateSku: number; missing: number } };
const errorLabels: Record<string, string> = { OEM_NOT_FOUND: "OEM_NOT_FOUND", INVALID_PRODUCT_TYPE: "INVALID_PRODUCT_TYPE", INVALID_PRICE: "INVALID_PRICE", INVALID_STOCK: "INVALID_STOCK", DUPLICATE_SKU: "DUPLICATE_SKU", MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD", SKU_IDENTITY_CONFLICT: "SKU_IDENTITY_CONFLICT", DUPLICATE_OFFER_IDENTITY: "DUPLICATE_OFFER_IDENTITY", INVALID_IMAGE_URL: "INVALID_IMAGE_URL" };
export function CsvUploader() {
  const router = useRouter();
  const [csv, setCsv] = useState(""), [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  async function load(file: File | null) {
    setPreview(null); setError(""); setSuccess("");
    if (!file) return;
    if (file.size > 2_000_000) { setError("Dosya en fazla 2 MB olabilir."); return; }
    setFileName(file.name); setCsv(await file.text());
  }
  async function runPreview() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/store/import/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Önizleme yapılamadı.");
      setPreview(data as Preview);
    } catch (e) { setError(e instanceof Error ? e.message : "CSV okunamadı."); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/store/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, token: preview.token, fileName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "İçe aktarma yapılamadı.");
      setSuccess(`${data.imported} teklif kaydedildi. ${data.rejected} hatalı satır atlandı.`);
      setPreview(null); setCsv(""); setFileName(""); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "İçe aktarma başarısız."); }
    finally { setBusy(false); }
  }
  return <div className="stack"><div className="surface surface-pad"><div className="page-heading-row"><div><h2 className="surface-title" style={{ margin: 0 }}>CSV ile toplu ürün yükle</h2><p className="muted small-text">Ürün adı CSV'de yer almaz. Her OEM merkezi kataloğa eşleştirilir.</p></div><a href="/api/store/import/template" className="btn btn-outline btn-small"><Download size={15} /> Şablonu İndir</a></div>
    <div className="csv-drop" style={{ marginTop: 17 }}><Upload size={30} color="#739456" /><h3 style={{ fontWeight: 800, fontSize: 14, marginTop: 9 }}>Standart DampingVar CSV dosyanı seç</h3><p className="muted small-text">UTF-8 .csv · En fazla 1000 satır / 2 MB</p><input type="file" accept=".csv,text/csv" onChange={(e) => void load(e.target.files?.[0] || null)} /></div>
    {fileName && <p className="small-text" style={{ marginTop: 12 }}><FileSpreadsheet size={14} style={{ display: "inline" }} /> {fileName}</p>}
    <button className="btn btn-dark" disabled={!csv || busy} onClick={() => void runPreview()} style={{ marginTop: 13, opacity: !csv || busy ? .5 : 1 }} type="button">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Dosyayı Önizle</button>
    {error && <div className="notice notice-error"><AlertCircle size={16} /> {error}</div>}{success && <div className="notice notice-success"><CheckCircle2 size={16} /> {success}</div>}
  </div>
  <div className="help-card"><h3>CSV kolonları</h3><p style={{ wordBreak: "break-word", fontFamily: "monospace" }}>oem_no, brand, product_type, store_sku, barcode, price, stock, image_url</p><ul><li>product_type: original, aftermarket veya equivalent</li><li>OEM bulunmazsa yeni merkezi ürün otomatik oluşturulmaz.</li><li>Hatalı satırlar yazılmaz; geçerli satırlar onaydan sonra tek işlemde kaydedilir.</li></ul></div>
  {preview && <div className="surface surface-pad"><h2 className="surface-title">İçe aktarma önizlemesi</h2><div className="csv-summary"><div><strong>{preview.summary.total}</strong><span>Toplam satır</span></div><div><strong>{preview.summary.valid}</strong><span>Geçerli</span></div><div><strong>{preview.summary.new}</strong><span>Yeni teklif</span></div><div><strong>{preview.summary.update}</strong><span>Güncellenecek</span></div><div><strong>{preview.summary.oemNotFound}</strong><span>OEM bulunamadı</span></div><div><strong>{preview.summary.invalidType}</strong><span>Geçersiz tip</span></div><div><strong>{preview.summary.invalidPrice + preview.summary.invalidStock}</strong><span>Fiyat / stok hatası</span></div><div><strong>{preview.summary.duplicateSku + preview.summary.missing}</strong><span>SKU / eksik alan</span></div></div>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Satır</th><th>OEM / Merkezi ürün</th><th>Marka / Tip</th><th>SKU</th><th>Fiyat / Stok</th><th>Durum</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.line}><td>{row.line}</td><td><strong>{row.oemNo}</strong><div className="muted">{row.productName || "Katalogda bulunamadı"}</div></td><td>{row.brand}<div className="muted">{productTypeLabels[row.productType as keyof typeof productTypeLabels] || row.productType}</div></td><td>{row.storeSku}</td><td>{row.price} ₺<div className="muted">{row.stock} adet</div></td><td>{row.errors.length ? <><span style={{ color: "#b6513d", fontSize: 10, fontWeight: 800 }}>{row.errors.map((x) => errorLabels[x] || x).join(", ")}</span>{row.errors.includes("OEM_NOT_FOUND") && row.oemNo && <form action={requestOemAction} style={{ marginTop: 7 }}><input type="hidden" name="oemNo" value={row.oemNo} /><button type="submit" className="btn btn-outline btn-small">OEM Ürün Talebi Oluştur</button></form>}</> : <span className="status-badge status-approved">{row.action === "update" ? "Güncelleme" : "Yeni teklif"}</span>}</td></tr>)}</tbody></table></div>
    {preview.summary.valid > 0 && <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}><button type="button" className="btn btn-accent" disabled={busy} onClick={() => void commit()}>{busy ? "Kaydediliyor..." : `${preview.summary.valid} Geçerli Satırı Onayla`} <ArrowRight size={16} /></button><p className="muted small-text">Bu adıma kadar veritabanına hiçbir teklif yazılmadı.</p></div>}
  </div>}</div>;
}
