-- =====================================================================
-- fix_phase8_store_discovery.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 8: Whatnot tarzı mağaza seçim/listeleme sayfası (StoreDiscovery)
-- için tek sorguluk view.
--
-- BULGU: stores tablosunda sektör/kategori kolonu yok — bağlantı
-- store_category_status (is_active=true) → categories.sector_id →
-- sectors üzerinden dolaylı. Takipçi/beğeni sayısı da hiçbir yerde
-- önceden toplanmıyordu (store_follows/store_likes ham tablolar).
-- Bu view olmadan mağaza listeleme sayfası her kart için ayrı ayrı
-- (N+1) sorgu yapmak zorunda kalırdı.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN.
-- =====================================================================

CREATE OR REPLACE VIEW public.v_store_cards AS
SELECT
  s.id,
  s.name,
  s.description,
  s.address,
  s.district,
  s.city,
  s.lat,
  s.lng,
  s.logo_url,
  s.is_live,
  s.live_viewer_count,
  COALESCE(f.follower_count, 0) AS follower_count,
  COALESCE(l.like_count, 0) AS like_count,
  COALESCE(sec.sector_ids, '{}') AS sector_ids
FROM public.stores s
LEFT JOIN (
  SELECT store_id, count(*) AS follower_count
  FROM public.store_follows GROUP BY store_id
) f ON f.store_id = s.id
LEFT JOIN (
  SELECT store_id, count(*) AS like_count
  FROM public.store_likes GROUP BY store_id
) l ON l.store_id = s.id
LEFT JOIN (
  SELECT scs.store_id, array_agg(DISTINCT sec.id) AS sector_ids
  FROM public.store_category_status scs
  JOIN public.categories c ON c.id = scs.category_id
  JOIN public.sectors sec ON sec.id = c.sector_id
  WHERE scs.is_active = true
  GROUP BY scs.store_id
) sec ON sec.store_id = s.id
WHERE s.status = 'active';

GRANT SELECT ON public.v_store_cards TO authenticated, anon;
