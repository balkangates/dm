-- =====================================================================
-- fix_phase12_referral_cashback.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 12: "Paylaş & Kazan" — iadeal.com modelinde sürekli cashback motoru.
--
-- Faz 11'den (fix_phase11_dealer_referral.sql) FARKI:
--   - Faz 11: sadece BAYİ kendi mağazası için link alır, sadece tıklama/
--     kayıt SAYAR, para akışı yok.
--   - Faz 12 (bu dosya): HERHANGİ BİR MÜŞTERİ, HERHANGİ BİR mağaza için
--     kendi linkini alır. O linkle o mağazaya gelen kişinin — ilk değil,
--     SÜRESİZ HER — siparişinden %5 bonus kazanır. Bonus TAMAMEN o
--     mağazanın bayisi tarafından karşılanır (platformun kesintisi
--     değişmez). Biriken onaylı bonus, banka hesabına (IBAN) nakit
--     olarak ödenir. İki sistem birbirinden BAĞIMSIZ çalışır, çakışmaz.
--
-- ─────────────────────────────────────────────────────────────────────
-- GÜNCELLEME: Aşağıdaki "TASARIM NOTU" artık GEÇERSİZ — escrow
-- entegrasyonu fix_phase14_escrow_referral_integration.sql'de tamamlandı.
-- O dosya, bu dosyadaki trg_store_referral_commission trigger'ını DROP
-- edip aynı işi handle_store_order_finance() içine taşıyor (bayinin
-- net_amount'ından gerçekten düşülüyor). fix_phase12'yi (bu dosyayı)
-- fix_phase14'ten ÖNCE çalıştırmaya devam et — sadece tabloları/temel
-- RPC'leri kurmak için hâlâ gerekli, sadece trigger'ı fix_phase14
-- devralıyor.
-- ─────────────────────────────────────────────────────────────────────
--
-- TASARIM NOTU (kasıtlı sınır): Bu motor mevcut ödeme/escrow trigger'ına
-- (handle_store_order_finance, fix_phase2'de) HİÇ DOKUNMUYOR — o
-- fonksiyonun tam mevcut halini bilmeden CREATE OR REPLACE ile üzerine
-- yazmak riskli olurdu. Bunun yerine store_orders üzerinde BAĞIMSIZ,
-- PARALEL bir trigger ile kendi defterini (store_referral_earnings)
-- tutuyor. Yani: bayinin escrow/net_amount rakamı bu commission kadar
-- OTOMATİK azalmıyor — "bayi karşılar" ilkesi şimdilik muhasebe
-- düzeyinde (bu tutar ayrıca bayiden tahsil edilmeli/mahsuplaşılmalı).
-- Bunu admin/finance sayfasına ENTEGRE ETMEK (dealer'ın ödenecek net
-- tutarından bu komisyonu otomatik düşmek) canlı finans motorunun tam
-- güncel halini görmeden risklidir — ayrı, dikkatli bir faz olarak
-- yapılmalı. Şimdilik bu tutarlar ayrı, görünür, admin'in manuel
-- mahsuplaşabileceği bir defterde duruyor.
--
-- ÇALIŞTIRMA: fix_phase11'den SONRA (opsiyonel, bağımsız da çalışır),
-- Supabase SQL Editor'e yapıştır, RUN.
-- =====================================================================

-- ── 1) Kim, hangi mağaza için link almış ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_referral_partners (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  store_id uuid NOT NULL,
  referral_code text NOT NULL,
  commission_rate numeric NOT NULL DEFAULT 5,
  click_count integer NOT NULL DEFAULT 0,
  signup_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT store_referral_partners_pkey PRIMARY KEY (id),
  CONSTRAINT store_referral_partners_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.profiles(id),
  CONSTRAINT store_referral_partners_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id),
  CONSTRAINT store_referral_partners_referral_code_key UNIQUE (referral_code),
  CONSTRAINT store_referral_partners_partner_store_key UNIQUE (partner_id, store_id)
);

-- ── 2) Hangi müşteri hangi mağazaya, kimin linkiyle geldi (mağaza başına
-- İLK TEMAS — bir müşteri aynı mağazaya iki farklı partnerin linkiyle
-- "gelemez", ilk gelen kazanır).
CREATE TABLE IF NOT EXISTS public.customer_store_referrals (
  customer_id uuid NOT NULL,
  store_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customer_store_referrals_pkey PRIMARY KEY (customer_id, store_id),
  CONSTRAINT customer_store_referrals_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id),
  CONSTRAINT customer_store_referrals_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id),
  CONSTRAINT customer_store_referrals_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.profiles(id)
);

-- ── 3) Sipariş bazlı hakediş defteri.
CREATE TABLE IF NOT EXISTS public.store_referral_earnings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  store_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  order_amount numeric NOT NULL,
  commission_rate numeric NOT NULL,
  commission_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'HELD' CHECK (status = ANY (ARRAY['HELD'::text, 'RELEASED'::text, 'PAID'::text, 'REFUNDED'::text])),
  payment_method text CHECK (payment_method = ANY (ARRAY['USDT'::text, 'bank'::text, 'wallet'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  released_at timestamp with time zone,
  paid_at timestamp with time zone,
  CONSTRAINT store_referral_earnings_pkey PRIMARY KEY (id),
  CONSTRAINT store_referral_earnings_order_id_key UNIQUE (order_id),
  CONSTRAINT store_referral_earnings_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id),
  CONSTRAINT store_referral_earnings_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.profiles(id),
  CONSTRAINT store_referral_earnings_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id),
  CONSTRAINT store_referral_earnings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id)
);

-- ── 4) Link al/oluştur — HERHANGİ authenticated kullanıcı, herhangi bir
-- aktif mağaza için (kendi mağazası dahil olabilir, engellemiyoruz).
CREATE OR REPLACE FUNCTION public.get_or_create_store_referral_link(p_store_id uuid)
RETURNS TABLE (referral_code text, store_id uuid, commission_rate numeric, click_count int, signup_count int) AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND status = 'active') THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND';
  END IF;

  SELECT srp.referral_code INTO v_code
  FROM public.store_referral_partners srp
  WHERE srp.partner_id = auth.uid() AND srp.store_id = p_store_id;

  IF v_code IS NULL THEN
    LOOP
      v_code := 'PK' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.store_referral_partners WHERE store_referral_partners.referral_code = v_code);
    END LOOP;
    INSERT INTO public.store_referral_partners (partner_id, store_id, referral_code)
    VALUES (auth.uid(), p_store_id, v_code);
  END IF;

  RETURN QUERY
  SELECT srp.referral_code, srp.store_id, srp.commission_rate, srp.click_count, srp.signup_count
  FROM public.store_referral_partners srp
  WHERE srp.partner_id = auth.uid() AND srp.store_id = p_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_or_create_store_referral_link(uuid) TO authenticated;

-- ── 5) Tıklama sayacı — anonim çağrılabilir.
CREATE OR REPLACE FUNCTION public.track_store_referral_click(p_code text)
RETURNS void AS $$
BEGIN
  UPDATE public.store_referral_partners SET click_count = click_count + 1 WHERE referral_code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.track_store_referral_click(text) TO anon, authenticated;

-- ── 6) Ziyaretçiyi (o mağaza için) partnere bağla — mağaza başına İLK
-- TEMAS, kendi kendine referans yasak.
CREATE OR REPLACE FUNCTION public.apply_store_referral(p_code text)
RETURNS boolean AS $$
DECLARE
  v_partner uuid;
  v_store uuid;
BEGIN
  SELECT partner_id, store_id INTO v_partner, v_store
  FROM public.store_referral_partners WHERE referral_code = p_code;

  IF v_partner IS NULL OR v_partner = auth.uid() THEN
    RETURN false;
  END IF;

  INSERT INTO public.customer_store_referrals (customer_id, store_id, partner_id)
  VALUES (auth.uid(), v_store, v_partner)
  ON CONFLICT (customer_id, store_id) DO NOTHING;

  IF FOUND THEN
    UPDATE public.store_referral_partners SET signup_count = signup_count + 1
    WHERE partner_id = v_partner AND store_id = v_store;
    RETURN true;
  END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.apply_store_referral(text) TO authenticated;

-- ── 7) SÜREKLİ komisyon tetikleyicisi — store_orders'ın durum
-- değişikliklerinde BAĞIMSIZ çalışır, mevcut finans motoruna dokunmaz.
CREATE OR REPLACE FUNCTION public.handle_store_referral_commission()
RETURNS trigger AS $$
DECLARE
  v_partner uuid;
  v_rate numeric;
  v_amount numeric;
BEGIN
  IF NEW.status = 'CONFIRMED' THEN
    SELECT csr.partner_id, srp.commission_rate INTO v_partner, v_rate
    FROM public.customer_store_referrals csr
    JOIN public.store_referral_partners srp ON srp.partner_id = csr.partner_id AND srp.store_id = csr.store_id
    WHERE csr.customer_id = NEW.customer_id AND csr.store_id = NEW.store_id;

    IF v_partner IS NOT NULL THEN
      v_amount := round(NEW.total_amount * v_rate / 100, 2);
      INSERT INTO public.store_referral_earnings
        (order_id, partner_id, store_id, customer_id, order_amount, commission_rate, commission_amount, status)
      VALUES (NEW.id, v_partner, NEW.store_id, NEW.customer_id, NEW.total_amount, v_rate, v_amount, 'HELD')
      ON CONFLICT (order_id) DO NOTHING;
    END IF;
  END IF;

  IF NEW.status = 'COMPLETED' THEN
    UPDATE public.store_referral_earnings
    SET status = 'RELEASED', released_at = now()
    WHERE order_id = NEW.id AND status = 'HELD';
  END IF;

  IF NEW.status = 'CANCELLED' THEN
    UPDATE public.store_referral_earnings
    SET status = 'REFUNDED'
    WHERE order_id = NEW.id AND status = 'HELD';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_store_referral_commission ON public.store_orders;
CREATE TRIGGER trg_store_referral_commission
  AFTER UPDATE ON public.store_orders
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.handle_store_referral_commission();

-- ── 8) Partnerin (müşterinin) kendi paneli — hangi mağazaları
-- tanıttığı + bonus özeti + hakediş geçmişi.
CREATE OR REPLACE FUNCTION public.get_my_referral_partnerships()
RETURNS TABLE (
  store_id uuid,
  store_name text,
  logo_url text,
  referral_code text,
  commission_rate numeric,
  click_count int,
  signup_count int,
  held_amount numeric,
  released_amount numeric,
  paid_amount numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    srp.store_id, s.name, s.logo_url, srp.referral_code, srp.commission_rate,
    srp.click_count, srp.signup_count,
    COALESCE((SELECT sum(e.commission_amount) FROM public.store_referral_earnings e WHERE e.partner_id = auth.uid() AND e.store_id = srp.store_id AND e.status = 'HELD'), 0),
    COALESCE((SELECT sum(e.commission_amount) FROM public.store_referral_earnings e WHERE e.partner_id = auth.uid() AND e.store_id = srp.store_id AND e.status = 'RELEASED'), 0),
    COALESCE((SELECT sum(e.commission_amount) FROM public.store_referral_earnings e WHERE e.partner_id = auth.uid() AND e.store_id = srp.store_id AND e.status = 'PAID'), 0)
  FROM public.store_referral_partners srp
  JOIN public.stores s ON s.id = srp.store_id
  WHERE srp.partner_id = auth.uid()
  ORDER BY srp.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_referral_partnerships() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_referral_earnings_history(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, store_name text, order_amount numeric, commission_amount numeric,
  status text, created_at timestamp with time zone
) AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, s.name, e.order_amount, e.commission_amount, e.status, e.created_at
  FROM public.store_referral_earnings e
  JOIN public.stores s ON s.id = e.store_id
  WHERE e.partner_id = auth.uid()
  ORDER BY e.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_referral_earnings_history(int) TO authenticated;

-- ── 9) ADMIN: ödenecek (RELEASED) bakiyeler + toplu ödeme işaretleme.
CREATE OR REPLACE FUNCTION public.get_pending_referral_payouts()
RETURNS TABLE (
  partner_id uuid, partner_name text, iban text, bank_name text, total_released numeric, earning_count int
) AS $$
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.iban, p.bank_name, sum(e.commission_amount), count(*)::int
  FROM public.store_referral_earnings e
  JOIN public.profiles p ON p.id = e.partner_id
  WHERE e.status = 'RELEASED'
  GROUP BY p.id, p.full_name, p.iban, p.bank_name
  ORDER BY sum(e.commission_amount) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_pending_referral_payouts() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_pay_referral_partner(p_partner_id uuid, p_method text)
RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF p_method NOT IN ('USDT', 'bank', 'wallet') THEN
    RAISE EXCEPTION 'INVALID_METHOD';
  END IF;

  UPDATE public.store_referral_earnings
  SET status = 'PAID', payment_method = p_method, paid_at = now()
  WHERE partner_id = p_partner_id AND status = 'RELEASED';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_pay_referral_partner(uuid, text) TO authenticated;
