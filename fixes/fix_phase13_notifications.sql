-- =====================================================================
-- fix_phase13_notifications.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 13 (yol haritasındaki adıyla "Faz 12" — numaralandırma Faz 12'nin
-- Paylaş&Kazan cashback motoruna gitmesiyle kaydı, karışmasın diye dosya
-- adını fix_phase13 yaptım).
--
-- BULGU: public.notifications tablosu şemada var (user_id, title,
-- message, type, is_read) ama hiçbir trigger onu doldurmuyor, hiçbir
-- yerde okunmuyor — tamamen boş/ölü.
--
-- Bu dosya:
--   1) RLS: kullanıcı sadece kendi bildirimlerini görür/okundu işaretler.
--   2) store_orders üzerinde trigger: yeni sipariş → mağaza sahibine;
--      durum değişimi (ödeme onayı/kargo/iptal) → müşteriye (+ iptalde
--      mağaza sahibine).
--   3) reverse_auctions üzerinde trigger: yeni ihale → TÜM tedarikçilere;
--      ihale sonuçlandığında (awarded) → kazanan + kaybeden tedarikçilere.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN.
-- =====================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Sipariş bildirimleri ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_store_order_events()
RETURNS trigger AS $$
DECLARE
  v_store_owner uuid;
  v_store_name text;
  v_status_label text;
  v_type text;
BEGIN
  SELECT owner_id, name INTO v_store_owner, v_store_name FROM public.stores WHERE id = NEW.store_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      v_store_owner,
      'Yeni Sipariş',
      format('%s TL tutarında yeni bir siparişin var.', NEW.total_amount),
      'order'
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_status_label := CASE NEW.status
      WHEN 'CONFIRMED' THEN 'Ödemen onaylandı'
      WHEN 'PREPARING' THEN 'Siparişin hazırlanıyor'
      WHEN 'READY' THEN 'Siparişin hazır'
      WHEN 'SHIPPED' THEN 'Siparişin kargoya verildi'
      WHEN 'DELIVERED' THEN 'Siparişin teslim edildi'
      WHEN 'COMPLETED' THEN 'Siparişin tamamlandı'
      WHEN 'CANCELLED' THEN 'Siparişin iptal edildi'
      ELSE 'Sipariş durumun güncellendi'
    END;
    v_type := CASE NEW.status
      WHEN 'CONFIRMED' THEN 'payment'
      WHEN 'SHIPPED' THEN 'shipping'
      WHEN 'DELIVERED' THEN 'shipping'
      WHEN 'CANCELLED' THEN 'warning'
      ELSE 'order'
    END;

    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (NEW.customer_id, v_status_label, format('%s siparişindeki güncelleme.', v_store_name), v_type);

    IF NEW.status = 'CANCELLED' THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (v_store_owner, 'Sipariş İptal Edildi', format('%s TL tutarındaki sipariş iptal edildi.', NEW.total_amount), 'warning');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_store_order_insert ON public.store_orders;
CREATE TRIGGER trg_notify_store_order_insert
  AFTER INSERT ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_store_order_events();

DROP TRIGGER IF EXISTS trg_notify_store_order_update ON public.store_orders;
CREATE TRIGGER trg_notify_store_order_update
  AFTER UPDATE ON public.store_orders
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.notify_store_order_events();

-- ── İhale bildirimleri ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_auction_events()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    SELECT p.id, 'Yeni İhale', format('%s için yeni bir ihale açıldı.', NEW.product_name), 'auction'
    FROM public.profiles p
    WHERE p.is_supplier;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'awarded' AND OLD.status IS DISTINCT FROM 'awarded' THEN
    IF NEW.winning_supplier_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (NEW.winning_supplier_id, 'İhaleyi Kazandın! 🎉', format('%s ihalesini kazandın.', NEW.product_name), 'auction');
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type)
    SELECT sb.supplier_id, 'İhale Sonuçlandı', format('%s ihalesi için teklifin kazanamadı.', NEW.product_name), 'auction'
    FROM public.supplier_bids sb
    WHERE sb.auction_id = NEW.id AND sb.supplier_id IS DISTINCT FROM NEW.winning_supplier_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_auction_insert ON public.reverse_auctions;
CREATE TRIGGER trg_notify_auction_insert
  AFTER INSERT ON public.reverse_auctions
  FOR EACH ROW EXECUTE FUNCTION public.notify_auction_events();

DROP TRIGGER IF EXISTS trg_notify_auction_update ON public.reverse_auctions;
CREATE TRIGGER trg_notify_auction_update
  AFTER UPDATE ON public.reverse_auctions
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.notify_auction_events();

-- ── Okundu işaretleme yardımcıları (client'tan doğrudan UPDATE de
-- çalışır, ama toplu "hepsini okundu yap" için tek sorgu daha temiz).
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void AS $$
BEGIN
  UPDATE public.notifications SET is_read = true WHERE user_id = auth.uid() AND is_read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
