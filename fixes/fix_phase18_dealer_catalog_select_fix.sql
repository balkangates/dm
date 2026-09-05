-- =====================================================================
-- fix_phase18_dealer_catalog_select_fix.sql
-- ─────────────────────────────────────────────────────────────────────
-- HATA: Bayi panelinde "Ürün Seçimi" ekranı, hiçbir filtre seçili
-- olmasa bile ("Tüm Sektörler / Tüm Kategoriler / Tüm Markalar / Tüm
-- Tedarikçiler") boş geliyor: "Bu filtrelere uyan onaylı ürün yok."
--
-- KÖK NEDEN: fix_phase17_catalog_visibility.sql, catalog_products
-- üzerine sadece bir RESTRICTIVE SELECT politikası eklemişti ve
-- yorumda "önceden var olan permissive SELECT politikalarını
-- değiştirmeye gerek yok" diyordu — ANCAK repo genelinde catalog_products
-- için hiçbir PERMISSIVE SELECT politikası tanımlı değildi (yalnızca bu
-- RESTRICTIVE politika var).
--
-- Postgres RLS kuralı: bir tabloda hiç PERMISSIVE politika yoksa, izin
-- verilen satır kümesi baştan BOŞ kabul edilir. RESTRICTIVE politikalar
-- bu kümeyi sadece DARALTABİLİR, kendi başlarına satır AÇAMAZ. Yani
-- catalog_products_visibility_restrict tek başına hep 0 satır döndürür
-- — is_approved=true, visibility_scope='all' olsa bile.
--
-- lib/dealer-catalog.ts → loadApprovedCatalog() ayrıca `error`'ı hiç
-- kontrol etmiyor, bu yüzden hata sessizce yutulup ekranda "onaylı
-- ürün yok" olarak görünüyordu (bkz. aşağıdaki not — TS tarafında da
-- ayrıca düzeltildi).
--
-- ÇÖZÜM: catalog_products için eksik olan temel PERMISSIVE SELECT
-- politikasını ekliyoruz + authenticated role'e GRANT SELECT veriyoruz
-- (grant olmadan da RLS satırı göstermez).
--
-- ÇALIŞTIRMA: fix_phase17_catalog_visibility.sql'den sonra, Supabase
-- SQL Editor'e yapıştır, RUN.
-- =====================================================================

-- Temel görünürlük: onaylı ürünler herkese (authenticated), kendi
-- ürünleri tedarikçiye, her şey admin'e açık. RESTRICTIVE politika
-- (catalog_products_visibility_restrict) bunun ÜZERİNE AND'lenerek
-- visibility_scope='self'/'selected' ürünleri zaten filtreleyecek.
DROP POLICY IF EXISTS catalog_products_select_base ON public.catalog_products;
CREATE POLICY catalog_products_select_base ON public.catalog_products
  AS PERMISSIVE
  FOR SELECT
  USING (
    is_approved = true
    OR supplier_id = auth.uid()
    OR public._is_admin()
  );

GRANT SELECT ON public.catalog_products TO authenticated;

-- Doğrulama (RUN'dan sonra elle kontrol için):
-- SELECT polname, permissive, cmd FROM pg_policies WHERE tablename = 'catalog_products';
-- Beklenen: catalog_products_select_base (PERMISSIVE) + catalog_products_visibility_restrict (RESTRICTIVE)
-- ikisi birlikte, is_approved=true VE visibility_scope='all' olan ürünleri bayiye gösterir.
