-- =====================================================================
-- fix_phase16_brands.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 1.5 (Yeni Ticari Model dokümanının kendi numaralandırmasıyla
-- "Faz 1 revize") — MARKA (Brand) varlığını kurar.
--
-- BULGU: Şemada ürün markası kavramı HİÇ yoktu. Tek "brand" alanı
-- `vehicles.brand` idi (lojistik aracının markası — Ford, Mercedes vb.,
-- ürünle alakasız). Ürün adı ("Bargello 567") marka bilgisini serbest
-- metin olarak İÇİNDE taşıyor ama yapısal değil.
--
-- BU DOSYA NE YAPMIYOR (bilerek): Mevcut ürünleri otomatik marka'ya
-- bağlamıyor — kaynak veride yapısal marka bilgisi hiç olmadığı için
-- (ürün adından "ilk kelime marka'dır" gibi bir tahminle otomatik
-- eşleştirme YANLIŞ veri üretme riski taşır). Marka ataması admin
-- panelinden elle yapılmalı — bu dosya sadece altyapıyı kuruyor.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.brands (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  -- Faz 7'de (marka web sitesi referral) kullanılacak — şimdiden alan
  -- açıyoruz ki o faza geçince tekrar migration yazmaya gerek kalmasın.
  website_url text,
  referral_commission_pct numeric NOT NULL DEFAULT 0 CHECK (referral_commission_pct >= 0 AND referral_commission_pct <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT brands_pkey PRIMARY KEY (id),
  CONSTRAINT brands_name_key UNIQUE (name)
);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brands_select_all ON public.brands;
CREATE POLICY brands_select_all ON public.brands FOR SELECT USING (true);

DROP POLICY IF EXISTS brands_admin_write ON public.brands;
CREATE POLICY brands_admin_write ON public.brands
  FOR ALL USING (public._is_admin()) WITH CHECK (public._is_admin());

GRANT SELECT ON public.brands TO anon, authenticated;

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);

CREATE INDEX IF NOT EXISTS catalog_products_brand_id_idx ON public.catalog_products (brand_id);
