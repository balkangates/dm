-- =====================================================================
-- fix_phase11_dealer_referral.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 11: Bayiye özel müşteri kazanım (referral) linki.
--
-- BULGU: Eski sistemde (public/login.html) referral akışı TERSTİ —
-- role='influencer' olan biri kendi profiles.referral_code'unu üretiyor
-- ve bu kodla YENİ BAYİ kaydı getiriyordu (influencer → bayi). Senin
-- istediğin ise tam tersi yön: BAYİ → MÜŞTERİ. Bu yüzden profiles.
-- referral_code'u (eski akışa ait, dokunmadım) değil, zaten var olan ama
-- hiç kullanılmayan influencer_links tablosunu (influencer_id, referral_
-- code, click_count, signup_count) GENEL AMAÇLI bir "referans linki
-- sahibi" tablosu olarak kullanıyorum — adı influencer_links olsa da
-- FK'sı sade profiles.id, role kısıtı yok, herhangi bir bayi sahiplenebilir.
--
-- AKIŞ:
--   1) Bayi "Müşteri Kazanımım" sayfasını açar → get_or_create_my_
--      referral_link() kendi kodunu (yoksa üretir) + mağaza id'sini döner.
--      Link: SITE_URL/store/<storeId>?ref=<code>
--   2) Herhangi biri bu linke tıklar → track_referral_click(code)
--      (anonim çağrılabilir) click_count'u artırır.
--   3) Ziyaretçi (yeni ya da mevcut, henüz referred_by'ı boş olan bir
--      müşteri) kayıt olur/oturum açıksa → apply_referral(code)
--      profiles.referred_by'ı YALNIZCA BOŞSA doldurur (ilk temas kuralı,
--      üzerine yazmaz) + signup_count'u artırır.
--   4) Bayi kendi getirdiği müşteri sayısını ve LİSTESİNİ (isim + kayıt
--      tarihi) get_my_referral_stats() ile görür.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN.
-- =====================================================================

-- ── 1) Kendi linkini getir/oluştur — yalnızca bayi (is_dealer) ya da admin.
CREATE OR REPLACE FUNCTION public.get_or_create_my_referral_link()
RETURNS TABLE (referral_code text, store_id uuid, click_count int, signup_count int) AS $$
DECLARE
  v_code text;
  v_store_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_dealer OR role = 'admin')
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.id INTO v_store_id FROM public.stores s WHERE s.owner_id = auth.uid();

  SELECT il.referral_code INTO v_code FROM public.influencer_links il WHERE il.influencer_id = auth.uid();

  IF v_code IS NULL THEN
    LOOP
      v_code := 'BY' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.influencer_links WHERE influencer_links.referral_code = v_code);
    END LOOP;
    INSERT INTO public.influencer_links (influencer_id, referral_code) VALUES (auth.uid(), v_code);
  END IF;

  RETURN QUERY
  SELECT il.referral_code, v_store_id, il.click_count, il.signup_count
  FROM public.influencer_links il
  WHERE il.influencer_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_or_create_my_referral_link() TO authenticated;

-- ── 2) Link tıklamasını say — herkes (anonim dahil) çağırabilir, kişisel
-- veri döndürmez.
CREATE OR REPLACE FUNCTION public.track_referral_click(p_code text)
RETURNS void AS $$
BEGIN
  UPDATE public.influencer_links
  SET click_count = click_count + 1
  WHERE referral_code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.track_referral_click(text) TO anon, authenticated;

-- ── 3) Ziyaretçiyi bayiye bağla — SADECE ilk temas (referred_by zaten
-- doluysa dokunmaz), kendi kendine referans engellenir.
CREATE OR REPLACE FUNCTION public.apply_referral(p_code text)
RETURNS boolean AS $$
DECLARE
  v_referrer uuid;
  v_already uuid;
BEGIN
  SELECT influencer_id INTO v_referrer FROM public.influencer_links WHERE referral_code = p_code;
  IF v_referrer IS NULL OR v_referrer = auth.uid() THEN
    RETURN false;
  END IF;

  SELECT referred_by INTO v_already FROM public.profiles WHERE id = auth.uid();
  IF v_already IS NOT NULL THEN
    RETURN false; -- zaten bir referans sahibi var, ilk temas kuralı
  END IF;

  UPDATE public.profiles SET referred_by = v_referrer WHERE id = auth.uid();
  UPDATE public.influencer_links SET signup_count = signup_count + 1 WHERE influencer_id = v_referrer;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.apply_referral(text) TO authenticated;

-- ── 4) Bayinin getirdiği müşteri listesi + özet.
CREATE OR REPLACE FUNCTION public.get_my_referral_stats()
RETURNS TABLE (
  referral_code text,
  store_id uuid,
  click_count int,
  signup_count int,
  referred_full_name text,
  referred_created_at timestamp with time zone
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.influencer_links WHERE influencer_id = auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    il.referral_code,
    (SELECT s.id FROM public.stores s WHERE s.owner_id = auth.uid()),
    il.click_count,
    il.signup_count,
    p.full_name,
    p.created_at
  FROM public.influencer_links il
  LEFT JOIN public.profiles p ON p.referred_by = il.influencer_id
  WHERE il.influencer_id = auth.uid()
  ORDER BY p.created_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_referral_stats() TO authenticated;
