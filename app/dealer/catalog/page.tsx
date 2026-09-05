'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ensureStore } from '@/lib/dealer';
import PriceCalculator from '@/components/PriceCalculator';
import BulkAddModal from '@/components/BulkAddModal';
import {
  loadSectors, loadCategories, loadSubcategories, loadApprovedCatalog, loadMyStoreProducts, loadCategoryStatus,
  selectCatalogProduct, deselectStoreProduct, updateStock, updateStoreProductPrice, addYoutubeLink, removeVideo,
  type Sector, type Category, type Subcategory, type CatalogProduct, type StoreProductRow,
} from '@/lib/dealer-catalog';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };
const INPUT = 'bg-black/30 border border-[#2A3650] rounded-lg px-2.5 py-1.5 text-[11px] text-white';

function productStock(cp: CatalogProduct) {
  return (cp.product_variants || []).reduce((s, v) => s + Number(v.stock_qty || 0), 0);
}

// ── Genel amaçlı katlanır bölüm başlığı ──────────────────────────────────
function AccordionHeader({
  title, badge, count, collapsed, onToggle, extra,
}: {
  title: string;
  badge?: React.ReactNode;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between gap-2 py-1.5 text-left">
      <span className="flex items-center gap-2 min-w-0">
        <i className={`fas fa-chevron-${collapsed ? 'right' : 'down'} text-[9px] text-[#5E7090] shrink-0`} />
        <span className="text-white font-bold text-xs truncate">{title}</span>
        <span className="text-[#5E7090] text-[10px] font-mono shrink-0">({count})</span>
        {badge}
      </span>
      {extra}
    </button>
  );
}

export default function DealerCatalogPage() {
  const { profile } = useAuth();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [myProducts, setMyProducts] = useState<StoreProductRow[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [categoryStatus, setCategoryStatus] = useState<any[]>([]);
  const [linkFormOpenId, setLinkFormOpenId] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calcTarget, setCalcTarget] = useState<CatalogProduct | null>(null);
  const [editTarget, setEditTarget] = useState<StoreProductRow | null>(null);

  // ── Faz 3 revize: akordiyon + filtre çubuğu + toplu seçim ────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSubcategory, setFilterSubcategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterInStockOnly, setFilterInStockOnly] = useState(false);
  const [filterMinPrice, setFilterMinPrice] = useState('');
  const [filterMaxPrice, setFilterMaxPrice] = useState('');

  const loadAll = useCallback(async (sId: string) => {
    const [secs, cats, subcats, cat, mine, status] = await Promise.all([
      loadSectors(), loadCategories(), loadSubcategories(), loadApprovedCatalog(), loadMyStoreProducts(sId), loadCategoryStatus(sId),
    ]);
    setSectors(secs);
    setCategories(cats);
    setSubcategories(subcats);
    setCatalog(cat);
    setMyProducts(mine);
    setCategoryStatus(status);
  }, []);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const s = await ensureStore(profile.id);
      if (s) {
        setStoreId(s.id);
        await loadAll(s.id);
      }
      setLoading(false);
    })();
  }, [profile, loadAll]);

  const myProductFor = (catalogProductId: string) => myProducts.find((p) => p.catalog_product_id === catalogProductId);
  const statusFor = (categoryId: string) => categoryStatus.find((s) => s.category_id === categoryId);
  const commissionFor = (categoryId: string | null) => categories.find((c) => c.id === categoryId)?.commission_pct ?? 10;

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ── Filtre uygulanmış katalog ──────────────────────────────────────────
  const allBrands = useMemo(
    () => Array.from(new Map(catalog.filter((c) => c.brands).map((c) => [c.brands!.id, c.brands!])).values()),
    [catalog],
  );
  const allSuppliers = useMemo(
    () =>
      Array.from(
        new Map(
          catalog
            .filter((c) => c.supplier_id)
            .map((c) => [c.supplier_id!, c.profiles?.company_name || c.profiles?.full_name || 'İsimsiz Tedarikçi']),
        ).entries(),
      ),
    [catalog],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = filterMinPrice ? Number(filterMinPrice) : null;
    const max = filterMaxPrice ? Number(filterMaxPrice) : null;
    return catalog.filter((cp) => {
      if (q && !cp.name.toLowerCase().includes(q)) return false;
      if (filterCategory && cp.category_id !== filterCategory) return false;
      if (!filterCategory && filterSector) {
        const cat = categories.find((c) => c.id === cp.category_id);
        if (cat?.sector_id !== filterSector) return false;
      }
      if (filterSubcategory && cp.subcategory_id !== filterSubcategory) return false;
      if (filterBrand && cp.brand_id !== filterBrand) return false;
      if (filterSupplier && cp.supplier_id !== filterSupplier) return false;
      if (filterInStockOnly && productStock(cp) <= 0) return false;
      const price = cp.suggested_price ?? 0;
      if (min !== null && price < min) return false;
      if (max !== null && price > max) return false;
      return true;
    });
  }, [catalog, search, filterSector, filterCategory, filterSubcategory, filterBrand, filterSupplier, filterInStockOnly, filterMinPrice, filterMaxPrice, categories]);

  const categoryOptionsForSector = filterSector ? categories.filter((c) => c.sector_id === filterSector) : categories;
  const subcategoryOptionsForCategory = filterCategory ? subcategories.filter((s) => s.category_id === filterCategory) : [];

  const selectedProducts = catalog.filter((c) => selected.has(c.id));

  const confirmSelect = async (price: number) => {
    if (!storeId || !calcTarget) return;
    setBusyId(calcTarget.id);
    try {
      await selectCatalogProduct(storeId, calcTarget, price);
      await loadAll(storeId);
      setCalcTarget(null);
    } catch (e) {
      alert('Ürün seçilemedi: ' + (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmBulkAdd = async (prices: Record<string, number>) => {
    if (!storeId) return;
    const ids = Object.keys(prices);
    for (const id of ids) {
      const cp = catalog.find((c) => c.id === id);
      if (!cp) continue;
      try {
        await selectCatalogProduct(storeId, cp, prices[id]);
      } catch (e) {
        alert(`"${cp.name}" eklenemedi: ${(e as Error).message}`);
      }
    }
    setSelected(new Set());
    setShowBulkModal(false);
    await loadAll(storeId);
  };

  const confirmPriceEdit = async (price: number) => {
    if (!editTarget) return;
    setBusyId(editTarget.id);
    try {
      await updateStoreProductPrice(editTarget.id, price);
      setMyProducts((prev) => prev.map((p) => (p.id === editTarget.id ? { ...p, price } : p)));
      setEditTarget(null);
    } catch (e) {
      alert('Fiyat güncellenemedi: ' + (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDeselect = async (storeProductId: string) => {
    if (!storeId) return;
    setBusyId(storeProductId);
    try {
      await deselectStoreProduct(storeProductId);
      await loadAll(storeId);
    } catch (e) {
      alert('Kaldırılamadı: ' + (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleStockChange = async (storeProductId: string, qty: number) => {
    try {
      await updateStock(storeProductId, Math.max(0, Math.floor(qty)));
      setMyProducts((prev) => prev.map((p) => (p.id === storeProductId ? { ...p, stock_qty: qty } : p)));
    } catch (e) {
      alert('Stok güncellenemedi: ' + (e as Error).message);
    }
  };

  const handleSaveLink = async (storeProductId: string) => {
    if (!storeId) return;
    try {
      await addYoutubeLink(storeProductId, linkInput);
      setLinkFormOpenId(null);
      setLinkInput('');
      await loadAll(storeId);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleRemoveVideo = async (videoId: string) => {
    if (!storeId) return;
    if (!confirm('Bu YouTube linkini kaldırmak istediğinize emin misiniz? Başka video eklemezseniz ürün canlıda gösterilemez.')) return;
    try {
      await removeVideo(videoId);
      await loadAll(storeId);
    } catch (e) {
      alert('Kaldırılamadı: ' + (e as Error).message);
    }
  };

  if (loading) return <p className="text-[#5E7090] font-mono text-sm">Yükleniyor…</p>;
  if (!storeId) return <p className="text-[#5E7090] font-mono text-sm">Önce Canlı Satış sayfasından mağazanızı oluşturun.</p>;

  // ── Ağaç: sektör → kategori → alt kategori → marka → ürün ────────────
  const sectorsToRender = sectors.filter((sec) => filtered.some((cp) => categories.find((c) => c.id === cp.category_id)?.sector_id === sec.id));
  // sector_id'si olmayan/eşleşmeyen kategoriler için "Diğer" kovası
  const noSectorHasProducts = filtered.some((cp) => {
    const cat = categories.find((c) => c.id === cp.category_id);
    return !cat?.sector_id || !sectors.some((s) => s.id === cat.sector_id);
  });

  const renderProductRow = (cp: CatalogProduct) => {
    const mine = myProductFor(cp.id);
    const stock = productStock(cp);
    return (
      <div key={cp.id} className="flex items-center gap-3 py-2 pl-6 border-t border-[#1E2A42] flex-wrap">
        {!mine && (
          <input type="checkbox" checked={selected.has(cp.id)} onChange={() => toggleSelect(cp.id)} className="shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-white text-xs font-bold truncate">
            {cp.name}
            {cp.profiles && (
              <span className="ml-1.5 text-[9px] font-mono text-[#5E7090]">
                · {cp.profiles.company_name || cp.profiles.full_name}
              </span>
            )}
          </p>
          <p className="text-[10px] font-mono text-[#5E7090]">
            Tedarikçi: ₺{cp.suggested_price ?? '—'} · Stok: <span style={{ color: stock > 0 ? '#10B981' : '#EF4444' }}>{stock}</span>
          </p>
        </div>

        {mine ? (
          <>
            <button onClick={() => setEditTarget(mine)} className="text-[#D4AF37] font-bold text-xs font-mono">
              ₺{Number(mine.price).toFixed(2)} <i className="fas fa-pen ml-1" style={{ fontSize: 9 }} />
            </button>
            <input
              type="number" min={0}
              defaultValue={Number(mine.stock_qty || 0)}
              onBlur={(e) => handleStockChange(mine.id, Number(e.target.value))}
              className="w-16 rounded px-2 py-1 text-white text-[11px]"
              style={{ background: '#0B1220', border: `1px solid ${Number(mine.stock_qty || 0) > 0 ? '#2A3650' : '#EF4444'}` }}
            />
            {mine.has_video ? (
              <div className="flex items-center gap-1.5">
                <a href={mine.product_videos?.[mine.product_videos.length - 1]?.video_url ?? '#'} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-1 rounded" style={{ background: '#10B98120', color: '#10B981' }}>
                  <i className="fab fa-youtube" />
                </a>
                {mine.product_videos?.[mine.product_videos.length - 1] && (
                  <button onClick={() => handleRemoveVideo(mine.product_videos[mine.product_videos.length - 1].id)} className="text-[#5E7090] hover:text-red-400">
                    <i className="fas fa-trash text-[10px]" />
                  </button>
                )}
              </div>
            ) : linkFormOpenId === mine.id ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus type="url" value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLink(mine.id); if (e.key === 'Escape') setLinkFormOpenId(null); }}
                  placeholder="YouTube linki" className="w-32 rounded px-2 py-1 text-[10px] text-white"
                  style={{ background: '#0B1220', border: '1px solid #2A3650' }}
                />
                <button onClick={() => handleSaveLink(mine.id)} className="w-5 h-5 rounded" style={{ background: '#10B981' }}><i className="fas fa-check text-white text-[9px]" /></button>
              </div>
            ) : (
              <button onClick={() => { setLinkFormOpenId(mine.id); setLinkInput(''); }} className="text-[10px] px-2 py-1 rounded" style={{ border: '1px solid #2A3650', color: '#5E7090' }}>
                <i className="fab fa-youtube mr-1" />Video Ekle
              </button>
            )}
            <button onClick={() => handleDeselect(mine.id)} disabled={busyId === mine.id} className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: '#EF444420', color: '#EF4444' }}>
              <i className="fas fa-xmark" />
            </button>
          </>
        ) : (
          <button onClick={() => setCalcTarget(cp)} disabled={busyId === cp.id} className="px-2.5 py-1 rounded text-[10px] font-bold" style={{ background: '#D4AF37', color: '#000' }}>
            <i className="fas fa-plus mr-1" />Ekle
          </button>
        )}
      </div>
    );
  };

  const renderBrandGroup = (products: CatalogProduct[], parentKey: string) => {
    const groups = new Map<string, { label: string; items: CatalogProduct[] }>();
    products.forEach((p) => {
      const key = p.brand_id ?? '_none';
      if (!groups.has(key)) groups.set(key, { label: p.brands?.name ?? 'Markasız', items: [] });
      groups.get(key)!.items.push(p);
    });
    return Array.from(groups.entries()).map(([brandId, g]) => {
      const key = `${parentKey}:brand:${brandId}`;
      const isCollapsed = collapsed.has(key);
      return (
        <div key={key} className="pl-4">
          <AccordionHeader title={g.label} count={g.items.length} collapsed={isCollapsed} onToggle={() => toggleCollapse(key)} />
          {!isCollapsed && g.items.map(renderProductRow)}
        </div>
      );
    });
  };

  const renderSubcategoryGroup = (products: CatalogProduct[], categoryId: string) => {
    const groups = new Map<string, { label: string; items: CatalogProduct[] }>();
    products.forEach((p) => {
      const key = p.subcategory_id ?? '_none';
      if (!groups.has(key)) {
        const sub = subcategories.find((s) => s.id === p.subcategory_id);
        groups.set(key, { label: sub?.name ?? 'Genel', items: [] });
      }
      groups.get(key)!.items.push(p);
    });
    return Array.from(groups.entries()).map(([subId, g]) => {
      const key = `cat:${categoryId}:sub:${subId}`;
      const isCollapsed = collapsed.has(key);
      return (
        <div key={key} className="pl-3">
          <AccordionHeader title={g.label} count={g.items.length} collapsed={isCollapsed} onToggle={() => toggleCollapse(key)} />
          {!isCollapsed && renderBrandGroup(g.items, key)}
        </div>
      );
    });
  };

  const renderCategory = (cat: Category) => {
    const products = filtered.filter((p) => p.category_id === cat.id);
    if (products.length === 0) return null;
    const key = `cat:${cat.id}`;
    const isCollapsed = collapsed.has(key);
    const status = statusFor(cat.id);
    return (
      <div key={key} className="pl-3">
        <AccordionHeader
          title={cat.name}
          count={products.length}
          collapsed={isCollapsed}
          onToggle={() => toggleCollapse(key)}
          badge={
            status && (
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                style={{ background: status.is_active ? '#10B98120' : '#EF444420', color: status.is_active ? '#10B981' : '#EF4444' }}
              >
                %{Math.round(status.selection_pct ?? 0)}/%20
              </span>
            )
          }
        />
        {!isCollapsed && renderSubcategoryGroup(products, cat.id)}
      </div>
    );
  };

  const renderSector = (sector: Sector) => {
    const catsInSector = categories.filter((c) => c.sector_id === sector.id);
    const productCount = filtered.filter((p) => catsInSector.some((c) => c.id === p.category_id)).length;
    if (productCount === 0) return null;
    const key = `sector:${sector.id}`;
    const isCollapsed = collapsed.has(key);
    return (
      <div key={key} className="rounded-xl p-3" style={CARD}>
        <AccordionHeader title={sector.label} count={productCount} collapsed={isCollapsed} onToggle={() => toggleCollapse(key)} />
        {!isCollapsed && catsInSector.map(renderCategory)}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-20">
      <p className="text-white font-black text-lg">Ürün Seçimi (Onaylı Katalog)</p>
      <div className="rounded-xl p-3 text-[11px] text-[#A3B3D1]" style={CARD}>
        Ürünleri kendiniz oluşturamazsınız — yalnızca onaylı tedarikçi kataloğundan seçebilirsiniz. Her kategoride
        ürünlerin en az <b style={{ color: '#D4AF37' }}>%20&apos;sini</b> seçmeniz gerekir. Seçtiğiniz her ürün için
        kendi YouTube kanalınızda paylaştığınız bir tanıtım videosunun <b style={{ color: '#D4AF37' }}>linkini</b> ve{' '}
        <b style={{ color: '#D4AF37' }}>Stok</b> adedini 0&apos;ın üzerine girmelisiniz — yoksa ürün canlıda/mağaza
        sayfanızda gösterilemez ve satılamaz.
      </div>

      {/* Faz 3 revize: filtre çubuğu */}
      <div className="rounded-xl p-3 flex flex-wrap gap-2" style={CARD}>
        <input placeholder="Ürün ara…" value={search} onChange={(e) => setSearch(e.target.value)} className={INPUT + ' flex-1 min-w-[140px]'} />
        <select value={filterSector} onChange={(e) => { setFilterSector(e.target.value); setFilterCategory(''); setFilterSubcategory(''); }} className={INPUT}>
          <option value="">Tüm Sektörler</option>
          {sectors.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setFilterSubcategory(''); }} className={INPUT}>
          <option value="">Tüm Kategoriler</option>
          {categoryOptionsForSector.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {subcategoryOptionsForCategory.length > 0 && (
          <select value={filterSubcategory} onChange={(e) => setFilterSubcategory(e.target.value)} className={INPUT}>
            <option value="">Tüm Alt Kategoriler</option>
            {subcategoryOptionsForCategory.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className={INPUT}>
          <option value="">Tüm Markalar</option>
          {allBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} className={INPUT}>
          <option value="">Tüm Tedarikçiler</option>
          {allSuppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input placeholder="Min ₺" type="number" value={filterMinPrice} onChange={(e) => setFilterMinPrice(e.target.value)} className={INPUT + ' w-20'} />
        <input placeholder="Max ₺" type="number" value={filterMaxPrice} onChange={(e) => setFilterMaxPrice(e.target.value)} className={INPUT + ' w-20'} />
        <label className="flex items-center gap-1.5 text-[11px] text-[#A3B3D1] px-1">
          <input type="checkbox" checked={filterInStockOnly} onChange={(e) => setFilterInStockOnly(e.target.checked)} />
          Sadece stokta var
        </label>
      </div>

      <div className="space-y-3">
        {sectorsToRender.map(renderSector)}
        {noSectorHasProducts && (
          <div className="rounded-xl p-3" style={CARD}>
            <AccordionHeader
              title="Diğer"
              count={filtered.filter((cp) => {
                const cat = categories.find((c) => c.id === cp.category_id);
                return !cat?.sector_id || !sectors.some((s) => s.id === cat.sector_id);
              }).length}
              collapsed={collapsed.has('sector:_none')}
              onToggle={() => toggleCollapse('sector:_none')}
            />
            {!collapsed.has('sector:_none') &&
              categories
                .filter((c) => !c.sector_id || !sectors.some((s) => s.id === c.sector_id))
                .map(renderCategory)}
          </div>
        )}
        {filtered.length === 0 && (
          <div className="rounded-xl p-6 text-center text-[#5E7090] text-xs" style={CARD}>
            Bu filtrelere uyan onaylı ürün yok.
          </div>
        )}
      </div>

      {/* Faz 3 revize: toplu seçim sabit alt çubuk */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-3 rounded-full shadow-2xl" style={{ background: '#131C2C', border: '1px solid #D4AF37' }}>
          <span className="text-white text-xs font-bold">{selected.size} ürün seçili</span>
          <button onClick={() => setSelected(new Set())} className="text-[#5E7090] text-xs font-mono">Temizle</button>
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-4 py-1.5 rounded-full text-xs font-extrabold"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000' }}
          >
            Seçilenleri Mağazama Ekle
          </button>
        </div>
      )}

      {calcTarget && (
        <PriceCalculator
          productName={calcTarget.name}
          supplierCost={calcTarget.suggested_price ?? 0}
          platformCommissionPct={commissionFor(calcTarget.category_id)}
          onConfirm={confirmSelect}
          onCancel={() => setCalcTarget(null)}
        />
      )}

      {editTarget && (
        <PriceCalculator
          productName={editTarget.name}
          supplierCost={catalog.find((c) => c.id === editTarget.catalog_product_id)?.suggested_price ?? 0}
          platformCommissionPct={commissionFor(editTarget.category_id)}
          initialPrice={Number(editTarget.price)}
          onConfirm={confirmPriceEdit}
          onCancel={() => setEditTarget(null)}
        />
      )}

      {showBulkModal && (
        <BulkAddModal
          products={selectedProducts}
          commissionFor={commissionFor}
          onConfirm={confirmBulkAdd}
          onCancel={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
}
