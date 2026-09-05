-- =====================================================================
-- fix_order_documents_before_shipping.sql
-- ─────────────────────────────────────────────────────────────────────
-- SORUN: "ORDER_STATUS_REQUIRES_DELIVERY_NOTE: SHIPPED durumuna
-- geçmeden önce satış irsaliyesi (delivery_notes) oluşturulmalıdır"
-- hatası — bu kontrol veritabanında (muhtemelen elle eklenmiş, repo'da
-- karşılığı olmayan bir kural) var, AMA irsaliyeyi oluşturan tek yer
-- (handle_store_order_finance trigger'ı) irsaliyeyi ANCAK status zaten
-- SHIPPED'e GEÇTİKTEN SONRA otomatik kesiyordu. Yani kontrol "önce
-- irsaliye olsun" diyor, otomasyon ise "irsaliye SHIPPED'ten SONRA
-- kesilir" diyordu — tavuk-yumurta çelişkisi, kargoya vermek hiçbir
-- zaman mümkün değildi.
--
-- YENİ, İSTENEN AKIŞ (bilinçli, bayi kontrollü):
--   1) Bayi "İrsaliye + Fatura Oluştur" der → create_order_documents()
--      RPC'si HER İKİSİNİ de (irsaliye + fatura) ŞİMDİ, açıkça oluşturur.
--   2) Ancak bu belgeler varsa, bayi kargo firmasını seçip takip
--      numarasını girerek "Onayla" diyebilir → mark_order_shipped()
--      artık bu belgelerin GERÇEKTEN var olduğunu kontrol eder (aynı
--      hata koduyla, ama artık TATMİN EDİLEBİLİR bir kural olarak).
--
-- Otomatik (trigger tabanlı) irsaliye/fatura kesme KALDIRILDI — artık
-- ikisi de SADECE bu RPC üzerinden, bayinin bilinçli tıklamasıyla
-- oluşuyor.
--
-- ÇALIŞTIRMA: fix_phase2_payments_and_tax.sql VE fix_phase4_logistics.sql
-- ÇALIŞTIRILMIŞ OLMALI. Sonra bunu Supabase SQL Editor'e yapıştır, RUN.
-- =====================================================================

-- ── 1) Trigger'daki OTOMATİK belge oluşturmayı kaldır ───────────────
-- (PREPARING'de otomatik fatura, SHIPPED'de otomatik irsaliye artık YOK
-- — ikisi de create_order_documents() ile bilinçli olarak yapılacak.
-- Trigger'ın escrow/komisyon/COMPLETED/CANCELLED mantığı AYNEN kalıyor.)
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

    INSERT INTO public.escrow_transactions (
      order_id, total_amount, system_fee, dealer_fee, shipping_fee, net_amount, status
    ) VALUES (
      NEW.id, v_gross, v_commission_amount, 0, COALESCE(NEW.shipping_fee, 0),
      v_gross - v_commission_amount - COALESCE(NEW.shipping_fee, 0), 'HELD'
    )
    ON CONFLICT (order_id) DO NOTHING;

    SELECT owner_id INTO v_seller_id FROM public.stores WHERE id = NEW.store_id;
    INSERT INTO public.store_order_commissions (
      order_id, seller_id, buyer_id, gross_amount, platform_fee_pct, platform_fee, seller_payout, status
    ) VALUES (
      NEW.id, v_seller_id, NEW.customer_id, v_gross,
      CASE WHEN v_net_sales > 0 THEN round(v_commission_amount / v_net_sales * 100, 2) ELSE 10 END,
      v_commission_amount, v_gross - v_commission_amount, 'pending'
    )
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  -- NOT: PREPARING → otomatik fatura ve SHIPPED → otomatik irsaliye
  -- blokları BİLİNÇLİ OLARAK KALDIRILDI (bkz. create_order_documents()).

  IF NEW.status = 'COMPLETED' THEN
    UPDATE public.escrow_transactions
    SET status = 'RELEASED', released_at = now(), updated_at = now()
    WHERE order_id = NEW.id AND status = 'HELD';

    UPDATE public.store_order_commissions
    SET status = 'released', released_at = now(), updated_at = now()
    WHERE order_id = NEW.id AND status = 'pending';
  END IF;

  IF NEW.status = 'CANCELLED' THEN
    UPDATE public.escrow_transactions
    SET status = 'REFUNDED', updated_at = now()
    WHERE order_id = NEW.id AND status = 'HELD';

    UPDATE public.store_order_commissions
    SET status = 'cancelled', updated_at = now()
    WHERE order_id = NEW.id AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2) YENİ: bayi bilinçli olarak irsaliye + faturayı BİRLİKTE keser ─
-- ÖNEMLİ: bu fonksiyonun dönüş tipi (OUT sütunları) önceki sürüme göre
-- değişti (invoice_error/delivery_note_error eklendi) — PostgreSQL
-- CREATE OR REPLACE ile dönüş tipi değişimine izin vermiyor ("cannot
-- change return type of existing function"), bu yüzden önce eski
-- sürümü DROP ediyoruz (varsa; ilk kurulumda yoksa hata vermeden geçer).
DROP FUNCTION IF EXISTS public.create_order_documents(uuid);
DROP FUNCTION IF EXISTS public.create_order_documents(uuid, text, text);

-- ÖNEMLİ: fn_next_invoice_no() / fn_next_delivery_note_no() fonksiyonları
-- bu repo'nun HİÇBİR SQL dosyasında tanımlı değil — sadece canlı
-- veritabanında var (muhtemelen elle/fix_order_finance_engine.sql ile
-- eklenmiş, repo'ya hiç kaydedilmemiş). Testte tam olarak bunun izini
-- gördük: irsaliye (IRS-2026-000001) başarıyla oluştu ama fatura hiç
-- oluşmadı — bu, fn_next_invoice_no()'nun ilgili yıl için sayaç satırı
-- yoksa NULL döndürüp invoice_number NOT NULL kısıtına çarptığını ve o
-- adımın (eski, savepoint'siz sürümde TÜM fonksiyonu geri saracak
-- şekilde) sessizce başarısız olduğunu gösteriyor.
--
-- ÇÖZÜM: iki belge numarası da ARTIK bu legacy fonksiyonlara bağımlı
-- DEĞİL — bayi kendi numarasını girebiliyor (p_invoice_number /
-- p_delivery_note_no); BOŞ bırakırsa kendi kendine yeten, sayaç
-- satırı yoksa OTOMATİK oluşturan inline mantıkla üretiliyor. Ayrıca
-- fatura ve irsaliye kendi SAVEPOINT'lerinde (nested BEGIN/EXCEPTION)
-- oluşturuluyor — biri hata verirse diğeri ETKİLENMEZ (örn. bayi elle
-- girdiği bir numara zaten kullanılıyorsa UNIQUE ihlali sadece o
-- belgeyi etkiler), ve hangi belgenin neden oluşturulamadığı
-- (invoice_error/delivery_note_error) frontend'e dönüyor.
CREATE OR REPLACE FUNCTION public.create_order_documents(
  p_order_id uuid,
  p_invoice_number text DEFAULT NULL,
  p_delivery_note_no text DEFAULT NULL
)
RETURNS TABLE (invoice_number text, delivery_note_no text, invoice_error text, delivery_note_error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_invoice_no text;
  v_doc_no text;
  v_invoice_err text;
  v_doc_err text;
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_seq integer;
BEGIN
  SELECT so.*, st.owner_id INTO v_order
  FROM public.store_orders so JOIN public.stores st ON st.id = so.store_id
  WHERE so.id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status NOT IN ('PREPARING', 'READY') THEN
    RAISE EXCEPTION 'ORDER_STATUS_NOT_READY_FOR_DOCUMENTS: belgeler ancak sipariş "Hazırlanıyor" veya "Hazır" durumundayken oluşturulabilir.' USING ERRCODE = 'P0001';
  END IF;

  -- ── FATURA (kendi savepoint'i) ──
  BEGIN
    SELECT soi.invoice_number INTO v_invoice_no FROM public.store_order_invoices soi WHERE soi.order_id = p_order_id;
    IF v_invoice_no IS NULL THEN
      -- Bayi elle bir numara girdiyse ONU kullan; boşsa otomatik üret.
      IF p_invoice_number IS NOT NULL AND btrim(p_invoice_number) <> '' THEN
        v_invoice_no := btrim(p_invoice_number);
      ELSE
        INSERT INTO public.store_order_invoice_counters (year, last_number)
        VALUES (v_year, 1)
        ON CONFLICT (year) DO UPDATE SET last_number = store_order_invoice_counters.last_number + 1
        RETURNING last_number INTO v_seq;
        v_invoice_no := 'FTR-' || v_year || '-' || lpad(v_seq::text, 6, '0');
      END IF;

      INSERT INTO public.store_order_invoices (order_id, invoice_number, subtotal, tax_rate, tax_amount, total_amount)
      VALUES (
        p_order_id, v_invoice_no,
        COALESCE((SELECT sum(net_price) FROM public.store_order_items WHERE order_id = p_order_id), round(v_order.total_amount / 1.20, 2)),
        20,
        COALESCE((SELECT sum(tax_amount) FROM public.store_order_items WHERE order_id = p_order_id), v_order.total_amount - round(v_order.total_amount / 1.20, 2)),
        v_order.total_amount
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_invoice_err := SQLERRM;
    v_invoice_no := NULL;
  END;

  -- ── İRSALİYE (kendi savepoint'i — zaten varsa dokunmuyor, IRS-2026-000001
  --    gibi daha önce oluşmuş kayıtlar aynen korunuyor) ──
  BEGIN
    SELECT dn.document_no INTO v_doc_no FROM public.delivery_notes dn WHERE dn.order_id = p_order_id;
    IF v_doc_no IS NULL THEN
      IF p_delivery_note_no IS NOT NULL AND btrim(p_delivery_note_no) <> '' THEN
        v_doc_no := btrim(p_delivery_note_no);
      ELSE
        INSERT INTO public.delivery_note_counters (year, last_number)
        VALUES (v_year, 1)
        ON CONFLICT (year) DO UPDATE SET last_number = delivery_note_counters.last_number + 1
        RETURNING last_number INTO v_seq;
        v_doc_no := 'IRS-' || v_year || '-' || lpad(v_seq::text, 6, '0');
      END IF;

      INSERT INTO public.delivery_notes (order_id, document_no, issued_by)
      VALUES (p_order_id, v_doc_no, auth.uid());
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_doc_err := SQLERRM;
    v_doc_no := NULL;
  END;

  RETURN QUERY SELECT v_invoice_no, v_doc_no, v_invoice_err, v_doc_err;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_documents(uuid, text, text) TO authenticated;

-- ── 3) mark_order_shipped: belgeler GERÇEKTEN yoksa artık NET bir
--    hatayla durur (frontend bu hatayı görürse "önce belge oluştur"
--    akışına yönlendiriyor — bkz. app/dealer/orders/page.tsx) ────────
CREATE OR REPLACE FUNCTION public.mark_order_shipped(
  p_order_id uuid, p_carrier text, p_tracking_number text, p_tracking_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.store_order_invoices WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'ORDER_STATUS_REQUIRES_INVOICE: SHIPPED durumuna geçmeden önce satış faturası oluşturulmalıdır.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.delivery_notes WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'ORDER_STATUS_REQUIRES_DELIVERY_NOTE: SHIPPED durumuna geçmeden önce satış irsaliyesi oluşturulmalıdır.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.store_order_shipments (order_id, carrier, tracking_number, tracking_url, status)
  VALUES (p_order_id, p_carrier, p_tracking_number, p_tracking_url, 'picked_up')
  ON CONFLICT (order_id) DO UPDATE
    SET carrier = EXCLUDED.carrier,
        tracking_number = EXCLUDED.tracking_number,
        tracking_url = EXCLUDED.tracking_url,
        status = 'picked_up',
        updated_at = now();

  UPDATE public.store_orders SET status = 'SHIPPED', updated_at = now()
  WHERE id = p_order_id AND status = 'READY';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_shipped(uuid, text, text, text) TO authenticated;

-- ── Doğrulama ────────────────────────────────────────────────────────
-- SELECT * FROM public.create_order_documents('<order-id>');
-- invoice_error / delivery_note_error sütunları dolu geliyorsa, o
-- belgenin NEDEN oluşamadığını gösterir (örn. bir CHECK/trigger hatası).
-- Ardından: SELECT public.mark_order_shipped('<order-id>', 'yurtici', 'TEST123');
-- =====================================================================
