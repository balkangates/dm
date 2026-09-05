-- =====================================================================
-- fix_phase17_catalog_visibility.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 4 (Yeni Ticari Model dokümanı numaralandırmasıyla) — tedarikçi
-- ürün görünürlük/dağıtım kontrolü.
--
-- BULGU: Onaylanan HER catalog_products satırı otomatik olarak TÜM
-- bayilere açıktı — tedarikçinin "sadece ben kullanayım" ya da "sadece
-- şu bayiler" deme hakkı yoktu.
--
-- ÇÖZÜM: visibility_scope ('self'/'all'/'selected') + seçili bayiler
-- için catalog_product_dealer_access tablosu. İKİ KATMANLI güvenlik:
--   1) RLS (RESTRICTIVE policy) — bayi, göremeyeceği ürünü SORGUYLA BİLE
--      göremez (liste ekranında hiç çıkmaz).
--   2) store_products üzerinde BEFORE INSERT trigger — bayi ürünü
--      GÖREMESE bile, API'ye doğrudan istek atıp mağazasına eklemeye
--      çalışırsa (frontend'i atlayarak) yine engellenir. "Frontend'de
--      gizlemek yeterli değildir" ilkesi burada bire bir uygulanıyor.
--
-- ÇALIŞTIRMA: fix_phase16_brands.sql'den sonra, Supabase SQL Editor'e
-- yapıştır, RUN.
-- =====================================================================

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS visibility_scope text NOT NULL DEFAULT 'all'
    CHECK (visibility_scope = ANY (ARRAY['self'::text, 'all'::text, 'selected'::text]));

CREATE TABLE IF NOT EXISTS public.catalog_product_dealer_access (
  catalog_product_id uuid NOT NULL,
  dealer_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT catalog_product_dealer_access_pkey PRIMARY KEY (catalog_product_id, dealer_id),
  CONSTRAINT cpda_catalog_product_id_fkey FOREIGN KEY (catalog_product_id) REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  CONSTRAINT cpda_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.profiles(id)
);

ALTER TABLE public.catalog_product_dealer_access ENABLE ROW LEVEL SECURITY;

-- Tedarikçi (ürünün sahibi) kendi ürünü için erişim listesini yönetir.
DROP POLICY IF EXISTS cpda_supplier_manage ON public.catalog_product_dealer_access;
CREATE POLICY cpda_supplier_manage ON public.catalog_product_dealer_access
  FOR ALL USING (
    public._is_admin() OR
    EXISTS (SELECT 1 FROM public.catalog_products cp WHERE cp.id = catalog_product_id AND cp.supplier_id = auth.uid())
  ) WITH CHECK (
    public._is_admin() OR
    EXISTS (SELECT 1 FROM public.catalog_products cp WHERE cp.id = catalog_product_id AND cp.supplier_id = auth.uid())
  );

-- Bayi, kendisine tanınan erişimleri görebilir (bilgi amaçlı).
DROP POLICY IF EXISTS cpda_dealer_read_own ON public.catalog_product_dealer_access;
CREATE POLICY cpda_dealer_read_own ON public.catalog_product_dealer_access
  FOR SELECT USING (dealer_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.catalog_product_dealer_access TO authenticated;

-- ── 1) KATMAN: SELECT'i kısıtlayan RESTRICTIVE policy. RESTRICTIVE
-- olduğu için, catalog_products üzerinde önceden var olan (bilmediğimiz)
-- permissive SELECT politikalarını DEĞİŞTİRMEYE gerek yok — bu politika
-- onların ÜZERİNE AND'lenir, sonucu daraltır.
DROP POLICY IF EXISTS catalog_products_visibility_restrict ON public.catalog_products;
CREATE POLICY catalog_products_visibility_restrict ON public.catalog_products
  AS RESTRICTIVE
  FOR SELECT
  USING (
    public._is_admin()
    OR supplier_id = auth.uid()
    OR visibility_scope = 'all'
    OR (
      visibility_scope = 'selected' AND EXISTS (
        SELECT 1 FROM public.catalog_product_dealer_access a
        WHERE a.catalog_product_id = catalog_products.id AND a.dealer_id = auth.uid()
      )
    )
    -- visibility_scope='self' ve supplier_id <> auth.uid() ise: yukarıdaki
    -- hiçbir koşul sağlanmaz, satır görünmez. Kasıtlı.
  );

-- ── 2) KATMAN: store_products'a EKLEME anında backend yetki kontrolü.
CREATE OR REPLACE FUNCTION public.fn_check_dealer_catalog_access()
RETURNS trigger AS $$
DECLARE
  v_dealer_owner uuid;
  v_scope text;
  v_supplier uuid;
  v_approved boolean;
BEGIN
  SELECT owner_id INTO v_dealer_owner FROM public.stores WHERE id = NEW.store_id;
  SELECT visibility_scope, supplier_id, is_approved INTO v_scope, v_supplier, v_approved
  FROM public.catalog_products WHERE id = NEW.catalog_product_id;

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_NOT_FOUND';
  END IF;
  IF NOT v_approved THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_NOT_APPROVED';
  END IF;
  IF v_supplier = v_dealer_owner THEN
    RETURN NEW; -- tedarikçi kendi ürününü kendi mağazasına her zaman ekleyebilir
  END IF;
  IF v_scope = 'all' THEN
    RETURN NEW;
  END IF;
  IF v_scope = 'selected' AND EXISTS (
    SELECT 1 FROM public.catalog_product_dealer_access a
    WHERE a.catalog_product_id = NEW.catalog_product_id AND a.dealer_id = v_dealer_owner
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_THIS_PRODUCT';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_dealer_catalog_access ON public.store_products;
CREATE TRIGGER trg_check_dealer_catalog_access
  BEFORE INSERT ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_dealer_catalog_access();

-- ── Yardımcı RPC: tedarikçinin "Seçili Bayiler" listesinde seçebileceği
-- bayi (mağaza) seçenekleri — is_dealer=true + aktif mağazası olanlar.
CREATE OR REPLACE FUNCTION public.get_dealer_options()
RETURNS TABLE (dealer_id uuid, store_name text) AS $$
  SELECT p.id, s.name
  FROM public.profiles p
  JOIN public.stores s ON s.owner_id = p.id
  WHERE p.is_dealer AND s.status = 'active'
  ORDER BY s.name;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_dealer_options() TO authenticated;
