-- =====================================================================
-- fix_phase14_escrow_referral_integration.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 12'NİN ESCROW ENTEGRASYONU — "bayi karşılar" ilkesini muhasebe
-- notundan GERÇEK PARAYA taşır.
--
-- ÖNCEKİ DURUM (fix_phase12_referral_cashback.sql): store_referral_
-- earnings, store_orders üzerinde AYRI/PARALEL bir trigger
-- (trg_store_referral_commission) ile dolduruluyordu. Bu, mevcut finans
-- motoruna (handle_store_order_finance) dokunmuyordu — yani bayinin
-- escrow'daki net_amount'ı bu komisyon kadar OTOMATİK azalmıyordu, ayrı
-- görünür bir defterdi.
--
-- ARTIK fix_phase2_payments_and_tax.sql'deki handle_store_order_finance()
-- fonksiyonunun TAM GÜNCEL HALİNİ gördüğüm için (aşağıda birebir
-- kopyalanıp üzerine referral bloğu eklendi), referral komisyonunu AYNI
-- fonksiyonun İÇİNE, escrow_transactions satırının oluştuğu TEK
-- doğruluk noktasına taşıyorum:
--   - dealer_fee kolonu artık her zaman 0 değil, o siparişten doğan
--     referral komisyonu kadar doluyor.
--   - net_amount (bayiye kalan) bu tutar kadar GERÇEKTEN azalıyor.
--   - Referral komisyonu KDV HARİÇ net satış tutarı üzerinden hesaplanıyor
--     (platformun kendi komisyonuyla aynı taban — bayi KDV'nin üzerinden
--     de komisyon ödemesin diye).
--
-- Eski paralel trigger (trg_store_referral_commission) artık GEREKSİZ ve
-- ÇAKIŞMA RİSKİ taşıyor (aynı işi iki kez, farklı tabanlarla yapardı) —
-- bu dosya onu DROP ediyor.
--
-- ÇALIŞTIRMA: fix_phase2_payments_and_tax.sql VE
-- fix_phase12_referral_cashback.sql'DEN SONRA, Supabase SQL Editor'e
-- yapıştır, RUN.
-- =====================================================================

-- Eski paralel trigger'ı kaldır — yerini handle_store_order_finance
-- içindeki entegre mantık alıyor.
DROP TRIGGER IF EXISTS trg_store_referral_commission ON public.store_orders;
DROP FUNCTION IF EXISTS public.handle_store_referral_commission();

CREATE OR REPLACE FUNCTION public.handle_store_order_finance()
RETURNS trigger AS $$
DECLARE
  v_gross numeric;
  v_net_sales numeric := 0;
  v_commission_amount numeric := 0;
  v_item RECORD;
  v_rate numeric;
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_month integer := EXTRACT(MONTH FROM now())::integer;
  v_seller_id uuid;
  -- ── Faz 12 entegrasyonu: referral komisyonu ──────────────────────────
  v_referral_partner uuid;
  v_referral_rate numeric;
  v_referral_amount numeric := 0;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'CONFIRMED' THEN
    v_gross := NEW.total_amount;

    FOR v_item IN
      SELECT soi.id, soi.total_price, soi.net_price, sp.category_id, sp.id AS store_product_id
      FROM public.store_order_items soi
      LEFT JOIN public.store_products sp ON sp.id = soi.store_product_id
      WHERE soi.order_id = NEW.id
    LOOP
      SELECT COALESCE(c.commission_pct, 10) INTO v_rate
      FROM public.categories c WHERE c.id = v_item.category_id;
      v_rate := COALESCE(v_rate, 10);

      DECLARE v_base numeric := COALESCE(v_item.net_price, v_item.total_price);
      BEGIN
        v_net_sales := v_net_sales + v_base;

        INSERT INTO public.dealer_commissions (
          store_order_item_id, store_id, sale_store_id, catalog_product_id,
          category_id, commission_type, sale_amount, rate_pct, amount,
          period_year, period_month
        )
        SELECT v_item.id, NEW.store_id, NEW.store_id, sp.catalog_product_id,
          v_item.category_id, 'sale', v_base, v_rate,
          round(v_base * v_rate / 100, 2), v_year, v_month
        FROM public.store_products sp WHERE sp.id = v_item.store_product_id
        ON CONFLICT DO NOTHING;

        v_commission_amount := v_commission_amount + round(v_base * v_rate / 100, 2);
      END;
    END LOOP;

    -- ── Faz 12: bu siparişin müşterisi bir referral partneri üzerinden
    -- bu mağazaya bağlıysa, komisyonu KDV HARİÇ net satış üzerinden
    -- hesapla (platformun kendi komisyon tabanıyla tutarlı).
    SELECT csr.partner_id, srp.commission_rate INTO v_referral_partner, v_referral_rate
    FROM public.customer_store_referrals csr
    JOIN public.store_referral_partners srp
      ON srp.partner_id = csr.partner_id AND srp.store_id = csr.store_id
    WHERE csr.customer_id = NEW.customer_id AND csr.store_id = NEW.store_id;

    IF v_referral_partner IS NOT NULL THEN
      v_referral_amount := round(v_net_sales * v_referral_rate / 100, 2);
    END IF;

    INSERT INTO public.escrow_transactions (
      order_id, total_amount, system_fee, dealer_fee, shipping_fee, net_amount, status
    ) VALUES (
      NEW.id, v_gross, v_commission_amount, v_referral_amount, COALESCE(NEW.shipping_fee, 0),
      v_gross - v_commission_amount - v_referral_amount - COALESCE(NEW.shipping_fee, 0), 'HELD'
    )
    ON CONFLICT (order_id) DO NOTHING;

    IF v_referral_partner IS NOT NULL THEN
      INSERT INTO public.store_referral_earnings
        (order_id, partner_id, store_id, customer_id, order_amount, commission_rate, commission_amount, status)
      VALUES (NEW.id, v_referral_partner, NEW.store_id, NEW.customer_id, v_net_sales, v_referral_rate, v_referral_amount, 'HELD')
      ON CONFLICT (order_id) DO NOTHING;
    END IF;

    SELECT owner_id INTO v_seller_id FROM public.stores WHERE id = NEW.store_id;
    INSERT INTO public.store_order_commissions (
      order_id, seller_id, buyer_id, gross_amount, platform_fee_pct, platform_fee, seller_payout, status
    ) VALUES (
      NEW.id, v_seller_id, NEW.customer_id, v_gross,
      CASE WHEN v_net_sales > 0 THEN round(v_commission_amount / v_net_sales * 100, 2) ELSE 10 END,
      v_commission_amount, v_gross - v_commission_amount - v_referral_amount, 'pending'
    )
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  IF NEW.status = 'PREPARING' THEN
    INSERT INTO public.store_order_invoices (order_id, invoice_number, subtotal, tax_rate, tax_amount, total_amount)
    SELECT NEW.id, public.fn_next_invoice_no(),
      COALESCE((SELECT sum(net_price) FROM public.store_order_items WHERE order_id = NEW.id), round(NEW.total_amount / 1.20, 2)),
      20,
      COALESCE((SELECT sum(tax_amount) FROM public.store_order_items WHERE order_id = NEW.id), NEW.total_amount - round(NEW.total_amount / 1.20, 2)),
      NEW.total_amount
    WHERE NOT EXISTS (SELECT 1 FROM public.store_order_invoices WHERE order_id = NEW.id);
  END IF;

  IF NEW.status = 'SHIPPED' THEN
    INSERT INTO public.delivery_notes (order_id, document_no)
    SELECT NEW.id, public.fn_next_delivery_note_no()
    WHERE NOT EXISTS (SELECT 1 FROM public.delivery_notes WHERE order_id = NEW.id);
  END IF;

  IF NEW.status = 'COMPLETED' THEN
    UPDATE public.escrow_transactions
    SET status = 'RELEASED', released_at = now(), updated_at = now()
    WHERE order_id = NEW.id AND status = 'HELD';

    UPDATE public.store_order_commissions
    SET status = 'released', released_at = now(), updated_at = now()
    WHERE order_id = NEW.id AND status = 'pending';

    -- Faz 12: bayinin ödemesi serbest kalınca, referral partnerinin
    -- hakedişi de AYNI ANDA ödemeye hazır hale gelir.
    UPDATE public.store_referral_earnings
    SET status = 'RELEASED', released_at = now()
    WHERE order_id = NEW.id AND status = 'HELD';
  END IF;

  IF NEW.status = 'CANCELLED' THEN
    UPDATE public.escrow_transactions
    SET status = 'REFUNDED', updated_at = now()
    WHERE order_id = NEW.id AND status = 'HELD';

    UPDATE public.store_order_commissions
    SET status = 'cancelled', updated_at = now()
    WHERE order_id = NEW.id AND status = 'pending';

    UPDATE public.store_referral_earnings
    SET status = 'REFUNDED'
    WHERE order_id = NEW.id AND status = 'HELD';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- (trigger tanımı zaten kurulu — fonksiyon gövdesi CREATE OR REPLACE ile
--  güncellendiği için trigger'ı yeniden oluşturmaya gerek yok.)

-- ── Şeffaflık: admin özet view'ına, mağaza bazlı ödenen/ödenecek
-- referral komisyonu sütununu ekle (fix_phase5'teki view'ın üzerine
-- CREATE OR REPLACE — admin "net neden düştü" sorusuna tek yerden
-- cevap bulsun).
CREATE OR REPLACE VIEW public.v_admin_finance_summary AS
SELECT
  st.id AS store_id,
  st.name AS store_name,
  count(DISTINCT so.id) AS order_count,
  coalesce(sum(so.total_amount), 0) AS gross_sales,
  coalesce(sum(soc.platform_fee), 0) AS platform_commission,
  coalesce(sum(soc.seller_payout), 0) AS dealer_payout,
  coalesce(sum(CASE WHEN et.status = 'HELD' THEN et.net_amount ELSE 0 END), 0) AS escrow_held,
  coalesce(sum(CASE WHEN et.status = 'RELEASED' THEN et.net_amount ELSE 0 END), 0) AS escrow_released,
  coalesce((
    SELECT sum(sre.commission_amount) FROM public.store_referral_earnings sre
    WHERE sre.store_id = st.id AND sre.status IN ('RELEASED', 'PAID')
  ), 0) AS referral_commission
FROM public.stores st
LEFT JOIN public.store_orders so ON so.store_id = st.id
LEFT JOIN public.store_order_commissions soc ON soc.order_id = so.id
LEFT JOIN public.escrow_transactions et ON et.order_id = so.id
GROUP BY st.id, st.name;

GRANT SELECT ON public.v_admin_finance_summary TO authenticated;
