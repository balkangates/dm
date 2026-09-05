-- =====================================================================
-- fix_phase21_supplier_scoped_price_update.sql
-- ─────────────────────────────────────────────────────────────────────
-- KURAL (kullanıcı tanımı):
--   • catalog_products.visibility_scope = 'self'  → ürünü sadece
--     kendisi (tedarikçi=bayi) görebiliyor. Bu durumda SADECE KENDİ
--     store_products satırının (kendi mağazasındaki satış fiyatının)
--     düzenlenmesi yeterli — bu zaten fix_phase20'deki "stores.owner_id
--     = auth.uid()" kontrolüyle karşılanıyor, ek bir şey gerekmiyor.
--
--   • catalog_products.visibility_scope IN ('selected','all') → ürün
--     kendi seçtiği bayilere veya herkese açık. Bu durumda ürünü
--     oluşturan kişi kendi ürününü satan HERHANGİ BİR bayinin
--     mağazasındaki satış (store_products.price) fiyatını admin gibi
--     güncelleyebilmeli — AMA SADECE bu kişi AYNI ZAMANDA BİR BAYİ İSE
--     (is_dealer = true, "tedarikçi-bayi" / dual-role hesap).
--
--     SADECE tedarikçi olan hesaplar (is_dealer = false) için bu
--     yetki VERİLMEZ — onlar için fiyat değişikliği admin onayına
--     tabi kalmaya devam eder (lib/supplier.ts → resubmitPrice,
--     status='pending' yaparak admin onayına düşürüyor zaten).
--
-- Not: Tedarikçinin kendi ürününün ALIŞ fiyatını (catalog_products.
-- suggested_price) düzenlemesi zaten mevcut temel supplier_id=auth.uid()
-- politikasıyla çalışıyor (lib/supplier.ts → resubmitPrice) — bu script
-- ona dokunmuyor, sadece SATIŞ fiyatı (store_products.price) tarafını,
-- SADECE dual-role (tedarikçi+bayi) hesaplar için, visibility_scope=
-- 'all'/'selected' olan ürünlerde tüm bayilere genişletiyor.
--
-- ÇALIŞTIRMA: fix_phase9_dual_role.sql, fix_phase17_catalog_visibility.sql
-- VE fix_phase20_store_products_owner_update.sql'DEN SONRA, Supabase SQL
-- Editor'e yapıştır, RUN.
-- =====================================================================

DROP POLICY IF EXISTS store_products_owner_update ON public.store_products;
CREATE POLICY store_products_owner_update ON public.store_products
  AS PERMISSIVE
  FOR UPDATE
  USING (
    -- 1) Kendi mağazan — her zaman (tek rol bayi de olsan, dual-role da olsan).
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_products.store_id AND s.owner_id = auth.uid())
    OR public._is_admin()
    -- 2) Bu ürünü sen tedarik ettiysen VE aynı zamanda bir bayiysen
    --    (is_dealer=true, yani tedarikçi-bayi) VE visibility_scope
    --    'selected' veya 'all' ise — hangi bayinin mağazasında
    --    satılıyor olursa olsun satış fiyatını admin gibi düzenleyebilirsin.
    --    SADECE tedarikçi olan (is_dealer=false) hesaplar bu şıkka
    --    hiç girmez — onlar admin onayına tabi kalır.
    OR EXISTS (
      SELECT 1 FROM public.catalog_products cp
      JOIN public.profiles p ON p.id = cp.supplier_id
      WHERE cp.id = store_products.catalog_product_id
        AND cp.supplier_id = auth.uid()
        AND cp.visibility_scope IN ('selected', 'all')
        AND p.is_dealer = true
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_products.store_id AND s.owner_id = auth.uid())
    OR public._is_admin()
    OR EXISTS (
      SELECT 1 FROM public.catalog_products cp
      JOIN public.profiles p ON p.id = cp.supplier_id
      WHERE cp.id = store_products.catalog_product_id
        AND cp.supplier_id = auth.uid()
        AND cp.visibility_scope IN ('selected', 'all')
        AND p.is_dealer = true
    )
  );

-- Doğrulama:
-- SELECT polname, cmd FROM pg_policies WHERE tablename = 'store_products';
-- SELECT is_dealer, is_supplier FROM profiles WHERE id = auth.uid(); -- ikisi de true olmalı bu yetki için
