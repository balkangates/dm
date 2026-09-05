// lib/dealer-catalog.ts — modules/dealer-catalog.js'in veri katmanının
// Next.js/React tarafına taşınmış hâli.
import { supabase } from './supabase';
import { getYoutubeEmbedUrl } from './youtube';

export interface Sector {
  id: string;
  label: string;
}

export interface Category {
  id: string;
  name: string;
  sector_id: string | null;
  commission_pct: number;
}

export interface Subcategory {
  id: string;
  name: string;
  category_id: string | null;
}

export interface CatalogProduct {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  unit: string;
  unit_size: number;
  suggested_price: number | null;
  is_approved: boolean;
  brand_id: string | null;
  brands: { id: string; name: string; logo_url: string | null } | null;
  supplier_id: string | null;
  profiles: { company_name: string | null; full_name: string | null } | null;
  product_variants: { stock_qty: number }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StoreProductRow = any;

export async function loadSectors(): Promise<Sector[]> {
  const { data } = await supabase.from('sectors').select('id,label').eq('is_active', true).order('sort_order');
  return data || [];
}

export async function loadCategories(): Promise<Category[]> {
  const { data } = await supabase.from('categories').select('id,name,sector_id,commission_pct').eq('is_active', true).order('name');
  return data || [];
}

export async function loadSubcategories(): Promise<Subcategory[]> {
  const { data } = await supabase.from('subcategories').select('id,name,category_id').eq('is_active', true).order('sort_order');
  return data || [];
}

// Faz 3 revize: akordiyon + filtre çubuğu (marka/tedarikçi/stok) için
// marka, tedarikçi adı ve stok bilgisi de tek sorguda geliyor.
export async function loadApprovedCatalog(): Promise<CatalogProduct[]> {
  const { data, error } = await supabase
    .from('catalog_products')
    // NOT: catalog_products -> profiles arasında birden fazla ilişki var
    // (supplier_id, reviewed_by, + catalog_product_dealer_access üzerinden
    // many-to-many). Hangi FK'yı kastettiğimizi açıkça belirtmezsek
    // PostgREST PGRST201 ("more than one relationship was found") hatası
    // verir ve sorgu tamamen başarısız olur (data=null döner).
    .select('*, brands(id,name,logo_url), profiles!catalog_products_supplier_id_fkey(company_name,full_name), product_variants(stock_qty)')
    .eq('is_approved', true)
    .order('name');
  if (error) {
    // Önceden burada hata sessizce yutuluyordu — RLS/GRANT eksikliği gibi
    // sorunlar ekranda "onaylı ürün yok" gibi yanıltıcı görünüyordu.
    console.error('[dealer-catalog] onaylı katalog yüklenemedi:', error);
  }
  return data || [];
}

export async function loadMyStoreProducts(storeId: string): Promise<StoreProductRow[]> {
  const { data } = await supabase
    .from('store_products')
    .select('*, product_videos(id, video_url, created_at)')
    .eq('store_id', storeId);
  return data || [];
}

export async function loadCategoryStatus(storeId: string) {
  const { data } = await supabase.from('store_category_status').select('*').eq('store_id', storeId);
  return data || [];
}

export async function selectCatalogProduct(storeId: string, catalogProduct: CatalogProduct, price: number) {
  const { error } = await supabase.from('store_products').insert({
    store_id: storeId,
    catalog_product_id: catalogProduct.id,
    category_id: catalogProduct.category_id,
    subcategory_id: catalogProduct.subcategory_id,
    name: catalogProduct.name,
    description: catalogProduct.description,
    image_url: catalogProduct.image_url,
    unit: catalogProduct.unit,
    unit_size: catalogProduct.unit_size,
    price,
    is_active: false, // video yüklenene kadar pasif kalır — DB de zaten zorunlu kılıyor
  });
  if (error) throw error;
}

export async function updateStoreProductPrice(storeProductId: string, price: number) {
  // NOT: .select() olmadan yapılan .update(), RLS UPDATE politikasının
  // USING koşulu satırı eşleştirmediğinde 0 satır günceller AMA hata
  // döndürmez (PostgREST bunu "başarılı, 0 satır etkilendi" sayar).
  // Bu yüzden .select().single() zorunlu: satır dönmezse gerçekten
  // güncellenip güncellenmediğini anlayabiliyoruz.
  const { data, error } = await supabase
    .from('store_products')
    .update({ price })
    .eq('id', storeProductId)
    .select('id')
    .single();
  if (error) throw error;
  if (!data) {
    throw new Error(
      'Fiyat veritabanında güncellenmedi (0 satır etkilendi). Bu genelde store_products tablosundaki ' +
      'UPDATE RLS politikasının mağaza sahipliğini (stores.owner_id = auth.uid()) doğrulayamamasından kaynaklanır.',
    );
  }
}

export async function deselectStoreProduct(storeProductId: string) {
  const { data, error } = await supabase.from('store_products').delete().eq('id', storeProductId).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Ürün kaldırılamadı (0 satır etkilendi) — mağaza sahipliği RLS tarafından doğrulanamadı.');
}

export async function updateStock(storeProductId: string, qty: number) {
  const { data, error } = await supabase.from('store_products').update({ stock_qty: qty }).eq('id', storeProductId).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Stok güncellenmedi (0 satır etkilendi) — mağaza sahipliği RLS tarafından doğrulanamadı.');
}

export async function addYoutubeLink(storeProductId: string, rawUrl: string) {
  const url = rawUrl.trim();
  if (!getYoutubeEmbedUrl(url)) {
    throw new Error('Geçerli bir YouTube video linki girin. Örnek: https://www.youtube.com/watch?v=XXXXXXXXXXX');
  }
  const { error: insErr } = await supabase.from('product_videos').insert({
    store_product_id: storeProductId,
    video_url: url,
    source: 'youtube',
  });
  if (insErr) throw insErr;
  // Video linki var artık — ürünü aktive et (DB tetikleyicisi has_video=true görüp izin verir).
  await supabase.from('store_products').update({ is_active: true }).eq('id', storeProductId);
}

export async function removeVideo(videoId: string) {
  const { error } = await supabase.from('product_videos').delete().eq('id', videoId);
  if (error) throw error;
}
