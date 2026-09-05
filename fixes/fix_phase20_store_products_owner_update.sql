-- =====================================================================
-- fix_phase20_store_products_owner_update.sql
-- ─────────────────────────────────────────────────────────────────────
-- HATA: "Satış Fiyatı Hesaplayıcı" modalında fiyat güncellenince arayüz
-- başarılı gösteriyor (optimistic update) ama store_products tablosunda
-- satır değişmiyor.
--
-- KÖK NEDEN: lib/dealer-catalog.ts içindeki updateStoreProductPrice /
-- updateStock / deselectStoreProduct fonksiyonları .update()/.delete()
-- çağrısından sonra .select() YAPMIYORDU. Supabase/PostgREST'te RLS'nin
-- UPDATE politikasındaki USING koşulu satırı eşleştiremezse, sorgu HATA
-- VERMEZ — sessizce 0 satır günceller ve "başarılı" (error: null) döner.
-- Kod tarafı bunu (.select().single() ekleyerek) artık tespit edip hata
-- fırlatıyor — ama asıl DÜZELTME, RLS politikasının satırı doğru
-- eşleştirmesini sağlamak.
--
-- Bu script, store_products üzerinde bayinin KENDİ mağazasına ait
-- ürünleri güncelleyip silebilmesini garanti eden bir politika kurar
-- (stores.owner_id = auth.uid() üzerinden). Zaten doğru bir politika
-- varsa bu script onu norm bir haliyle DROP+CREATE ile yeniden kurar;
-- yanlışsa düzeltir.
--
-- ÇALIŞTIRMADAN ÖNCE: mevcut politikayı görmek isterseniz:
--   SELECT polname, cmd, permissive, qual, with_check
--   FROM pg_policies WHERE tablename = 'store_products';
-- =====================================================================

DROP POLICY IF EXISTS store_products_owner_update ON public.store_products;
CREATE POLICY store_products_owner_update ON public.store_products
  AS PERMISSIVE
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_products.store_id AND s.owner_id = auth.uid())
    OR public._is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_products.store_id AND s.owner_id = auth.uid())
    OR public._is_admin()
  );

DROP POLICY IF EXISTS store_products_owner_delete ON public.store_products;
CREATE POLICY store_products_owner_delete ON public.store_products
  AS PERMISSIVE
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_products.store_id AND s.owner_id = auth.uid())
    OR public._is_admin()
  );

GRANT UPDATE, DELETE ON public.store_products TO authenticated;

-- Doğrulama:
-- SELECT polname, cmd, permissive FROM pg_policies WHERE tablename = 'store_products';
-- Beklenen: store_products_owner_update (UPDATE), store_products_owner_delete (DELETE)
-- + zaten var olan SELECT/INSERT politikaları etkilenmez.
