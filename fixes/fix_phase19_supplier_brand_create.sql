-- =====================================================================
-- fix_phase19_supplier_brand_create.sql
-- ─────────────────────────────────────────────────────────────────────
-- BULGU: brands tablosunda sadece admin INSERT/UPDATE/DELETE yapabiliyor
-- (fix_phase16_brands.sql → brands_admin_write). Tedarikçi panelinde
-- "Yeni Ürün Öner" ekranında marka seçimi ve "Markalarım" altında marka
-- ekleme formu eklenecek olsa bile, insert RLS tarafından reddedilirdi.
--
-- ÇÖZÜM: Adminin UPDATE/DELETE yetkisini korurken, supplier veya admin
-- rolündeki kullanıcıların yeni marka INSERT edebilmesine izin veriyoruz.
-- brands.name UNIQUE olduğu için aynı markayı iki kez eklemek zaten
-- constraint hatası verir (uygulama tarafında "bu marka zaten var,
-- listeden seçin" şeklinde ele alınmalı).
--
-- ÇALIŞTIRMA: fix_phase16_brands.sql'den sonra, Supabase SQL Editor'e
-- yapıştır, RUN.
-- =====================================================================

DROP POLICY IF EXISTS brands_admin_write ON public.brands;

-- UPDATE/DELETE sadece admin'de kalıyor.
CREATE POLICY brands_admin_update ON public.brands
  FOR UPDATE USING (public._is_admin()) WITH CHECK (public._is_admin());

CREATE POLICY brands_admin_delete ON public.brands
  FOR DELETE USING (public._is_admin());

-- INSERT: admin HER ZAMAN, tedarikçi ise sadece kendi rolü supplier
-- olduğunda yeni marka önerebilir/ekleyebilir.
DROP POLICY IF EXISTS brands_supplier_insert ON public.brands;
CREATE POLICY brands_supplier_insert ON public.brands
  FOR INSERT
  WITH CHECK (
    public._is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role = 'supplier' OR p.is_supplier)
    )
  );

GRANT INSERT ON public.brands TO authenticated;
