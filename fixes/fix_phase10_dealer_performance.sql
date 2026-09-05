-- =====================================================================
-- fix_phase10_dealer_performance.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 10: Bayi performans + sıralama paneli ("Performansım").
--
-- BULGU: public.dealer_monthly_performance tablosu şemada duruyor
-- (sales_count, penalty_score, live_days, status='WARNING'/'SUSPENDED'/
-- 'REWARD_ELIGIBLE' vb.) ama bunu dolduran evaluate_dealer_monthly_
-- performance() fonksiyonu hiçbir migration dosyamızda yok — eski
-- dashboard.html'in kendi yorumunda "bkz. supabase_migration_v3_dealer_
-- core.sql" diyor, o dosya bu repoda hiç yok. Yani tablo muhtemelen
-- BOŞ/kullanılamaz durumda; ceza puanı / "gerekli canlı gün" gibi iş
-- kurallarının GERÇEK formülünü bilmiyoruz.
--
-- Sahte bir ceza motoru uydurmak yerine ("no fake data" — eski modülün
-- kendi tasarım ilkesiydi), GERÇEK veriden (store_orders + escrow_
-- transactions) canlı hesaplanan dürüst bir kazanç geçmişi + sıralama
-- kuruyoruz. Ceza/durum motoru istenirse gerçek iş kuralları
-- netleştikten sonra ayrı bir faz olarak eklenebilir.
--
-- GÜVENLİK: Gelir rakamları (gross_revenue/net_earnings) SADECE bayinin
-- KENDİ mağazasına ait olarak döner (SECURITY DEFINER + auth.uid() ile
-- kendi store_id'sine scope'lanmış RPC — RLS'e güvenmek yerine
-- fonksiyonun kendisi izole ediyor). Sıralama (leaderboard) ise
-- rakiplerin GELİRİNİ değil, sadece sıra + satış adedini döner —
-- fn_my_bid_rank'teki "aggregate ranking, not raw values" prensibiyle
-- aynı gizlilik yaklaşımı.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_my_dealer_performance()
RETURNS TABLE (
  period_year int,
  period_month int,
  sales_count bigint,
  gross_revenue numeric,
  net_earnings numeric,
  rank_by_sales bigint,
  total_dealers_that_month bigint
) AS $$
DECLARE
  v_store_id uuid;
BEGIN
  SELECT id INTO v_store_id FROM public.stores WHERE owner_id = auth.uid();
  IF v_store_id IS NULL THEN
    RETURN; -- mağazası olmayan bayi için boş sonuç, hataya gerek yok
  END IF;

  RETURN QUERY
  WITH monthly AS (
    SELECT
      so.store_id,
      EXTRACT(YEAR FROM so.created_at)::int AS y,
      EXTRACT(MONTH FROM so.created_at)::int AS m,
      count(*) FILTER (WHERE so.status NOT IN ('PAYMENT_PENDING', 'CANCELLED')) AS sales_count,
      COALESCE(sum(so.total_amount) FILTER (WHERE so.status NOT IN ('PAYMENT_PENDING', 'CANCELLED')), 0) AS gross_revenue,
      COALESCE(sum(et.net_amount) FILTER (WHERE et.status IN ('HELD', 'RELEASED')), 0) AS net_earnings
    FROM public.store_orders so
    LEFT JOIN public.escrow_transactions et ON et.order_id = so.id
    GROUP BY so.store_id, EXTRACT(YEAR FROM so.created_at), EXTRACT(MONTH FROM so.created_at)
  ),
  ranked AS (
    SELECT
      monthly.*,
      RANK() OVER (PARTITION BY y, m ORDER BY monthly.sales_count DESC) AS rnk,
      COUNT(*) OVER (PARTITION BY y, m) AS dealers_count
    FROM monthly
  )
  SELECT y, m, ranked.sales_count, ranked.gross_revenue, ranked.net_earnings, rnk, dealers_count
  FROM ranked
  WHERE store_id = v_store_id
  ORDER BY y DESC, m DESC
  LIMIT 12;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_dealer_performance() TO authenticated;

-- Bu ayın (veya istenen bir ayın) ilk N bayisi — SADECE isim + satış
-- adedi + sıra. Gelir rakamı YOK (rakip mahremiyeti).
CREATE OR REPLACE FUNCTION public.get_dealer_leaderboard(
  p_year int DEFAULT NULL,
  p_month int DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  store_id uuid,
  store_name text,
  logo_url text,
  sales_count bigint,
  rank_by_sales bigint
) AS $$
DECLARE
  v_year int := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);
  v_month int := COALESCE(p_month, EXTRACT(MONTH FROM now())::int);
BEGIN
  RETURN QUERY
  WITH monthly AS (
    SELECT
      so.store_id,
      count(*) FILTER (WHERE so.status NOT IN ('PAYMENT_PENDING', 'CANCELLED')) AS sales_count
    FROM public.store_orders so
    WHERE EXTRACT(YEAR FROM so.created_at)::int = v_year
      AND EXTRACT(MONTH FROM so.created_at)::int = v_month
    GROUP BY so.store_id
  )
  SELECT
    s.id, s.name, s.logo_url, monthly.sales_count,
    RANK() OVER (ORDER BY monthly.sales_count DESC) AS rnk
  FROM monthly
  JOIN public.stores s ON s.id = monthly.store_id
  ORDER BY monthly.sales_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_dealer_leaderboard(int, int, int) TO authenticated;
