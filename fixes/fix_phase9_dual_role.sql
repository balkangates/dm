-- =====================================================================
-- fix_phase9_dual_role.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 9: Bir kişi/firma hem BAYİ hem TEDARİKÇİ olabilmeli.
--
-- BULGU (bug): fix_phase7b_public_apply.sql'deki check_application_duplicate,
-- zaten dealer olan biri supplier için başvurunca KENDİ profiliyle
-- eşleşiyor (aynı telefon/TCKN/vergi no — tabii ki, kendi bilgileri) ve
-- "EXISTING_ACCOUNT" diyerek meşru ikinci başvuruyu REDDEDİYORDU.
--
-- Ayrıca profiles.role tek değerli olduğu için admin_approve_role_application
-- ikinci rolü onaylayınca role'ü üzerine yazıp BİRİNCİ role erişimini
-- KAYBETTİRİYORDU (dealer→supplier onaylanınca dealer paneline giremez
-- oluyordu).
--
-- ÇÖZÜM:
--   1) profiles.is_dealer / is_supplier bayrakları eklendi — role hâlâ
--      "birincil panel" (varsayılan yönlendirme) ama erişim artık bu
--      bayraklarla kontrol ediliyor, ikisi de true olabilir.
--   2) check_application_duplicate artık p_exclude_user_id alıyor —
--      giriş yapmış kullanıcı ikinci role başvururken KENDİ profili hariç
--      tutuluyor.
--   3) submit_role_application artık auth.uid()'i otomatik exclude
--      olarak geçiyor + zaten sahip olunan role tekrar başvuruyu
--      engelliyor + national_id de kabul ediyor (guest formuyla tutarlı
--      olsun diye).
--   4) admin_approve_role_application artık role'ü KÖRÜ KÖRÜNE
--      üzerine yazmıyor; is_dealer/is_supplier'ı OR'luyor.
--
-- ÇALIŞTIRMA: fix_phase7_role_applications.sql VE
-- fix_phase7b_public_apply.sql'DEN SONRA, Supabase SQL Editor'e
-- yapıştır, RUN.
-- =====================================================================

-- ── 1) Çift rol bayrakları ────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_dealer boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_supplier boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET is_dealer = true WHERE role = 'dealer' AND is_dealer = false;
UPDATE public.profiles SET is_supplier = true WHERE role = 'supplier' AND is_supplier = false;

-- ── 2) check_application_duplicate — p_exclude_user_id eklendi ────────
-- (Eski 3 parametreli sürümü DROP etmemiz gerekiyor çünkü yeni parametre
-- ARAYA değil SONA ekleniyor olsa da, dönüş davranışı değiştiği için
-- güvenli tarafta kalmak adına eskisini kaldırıp yeniden tanımlıyoruz.)
DROP FUNCTION IF EXISTS public.check_application_duplicate(text, text, text);

CREATE OR REPLACE FUNCTION public.check_application_duplicate(
  p_phone text,
  p_national_id text,
  p_tax_number text,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_hit record;
BEGIN
  -- 1) Zaten onaylanmış bir bayi/tedarikçi hesabı var mı? (kendi profilin
  -- hariç — ikinci role başvururken kendi bilgilerinle çakışman normal.)
  SELECT company_name INTO v_hit
  FROM public.profiles
  WHERE (role IN ('dealer', 'supplier') OR is_dealer OR is_supplier)
    AND (p_exclude_user_id IS NULL OR id <> p_exclude_user_id)
    AND (
      (phone IS NOT NULL AND phone = p_phone) OR
      (national_id IS NOT NULL AND national_id = p_national_id) OR
      (p_tax_number IS NOT NULL AND tax_number IS NOT NULL AND tax_number = p_tax_number)
    )
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'reason', 'EXISTING_ACCOUNT');
  END IF;

  -- 2) Bekleyen ya da onaylanmış BAŞKASINA ait bir başvuru zaten var mı?
  SELECT id INTO v_hit
  FROM public.role_applications
  WHERE status IN ('pending', 'approved')
    AND (p_exclude_user_id IS NULL OR user_id <> p_exclude_user_id)
    AND (
      (phone IS NOT NULL AND phone = p_phone) OR
      (national_id IS NOT NULL AND national_id = p_national_id) OR
      (p_tax_number IS NOT NULL AND tax_number IS NOT NULL AND tax_number = p_tax_number)
    )
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'reason', 'EXISTING_APPLICATION');
  END IF;

  RETURN jsonb_build_object('duplicate', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_application_duplicate(text, text, text, uuid) TO anon, authenticated;

-- ── 3) submit_role_application — kendi profilini exclude ederek çağırıyor,
-- national_id kabul ediyor, zaten sahip olunan role tekrar başvuruyu
-- engelliyor.
DROP FUNCTION IF EXISTS public.submit_role_application(text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_role_application(
  p_requested_role text,
  p_company_name text,
  p_tax_number text,
  p_tax_office text,
  p_phone text,
  p_address text,
  p_note text,
  p_national_id text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
  v_dup jsonb;
BEGIN
  IF p_requested_role NOT IN ('dealer', 'supplier') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.role_applications
    WHERE user_id = auth.uid() AND requested_role = p_requested_role AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'ALREADY_PENDING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND ((p_requested_role = 'dealer' AND is_dealer) OR (p_requested_role = 'supplier' AND is_supplier))
  ) THEN
    RAISE EXCEPTION 'ALREADY_HAS_ROLE';
  END IF;

  -- KENDİ profilini hariç tutarak kontrol et — ikinci role başvuru bu
  -- sayede engellenmez, sadece BAŞKASINA ait bilgiler engellenir.
  v_dup := public.check_application_duplicate(p_phone, p_national_id, p_tax_number, auth.uid());
  IF (v_dup->>'duplicate')::boolean THEN
    RAISE EXCEPTION 'DUPLICATE_APPLICATION: %', v_dup->>'reason';
  END IF;

  UPDATE public.profiles
  SET company_name = COALESCE(p_company_name, company_name),
      tax_number = COALESCE(p_tax_number, tax_number),
      tax_office = COALESCE(p_tax_office, tax_office),
      phone = COALESCE(p_phone, phone),
      address = COALESCE(p_address, address),
      national_id = COALESCE(p_national_id, national_id),
      verification_requested = true,
      verification_requested_at = now()
  WHERE id = auth.uid();

  INSERT INTO public.role_applications
    (user_id, requested_role, company_name, tax_number, tax_office, phone, address, note, national_id)
  VALUES
    (auth.uid(), p_requested_role, p_company_name, p_tax_number, p_tax_office, p_phone, p_address, p_note, p_national_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4) admin_approve_role_application — role'ü körü körüne üzerine
-- yazmıyor, is_dealer/is_supplier'ı OR'luyor.
CREATE OR REPLACE FUNCTION public.admin_approve_role_application(p_application_id uuid)
RETURNS void AS $$
DECLARE
  v_app public.role_applications;
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_app FROM public.role_applications WHERE id = p_application_id;
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND';
  END IF;
  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_RESOLVED: %', v_app.status;
  END IF;

  UPDATE public.profiles
  SET
    role = CASE WHEN role IS NULL OR role = 'customer' THEN v_app.requested_role ELSE role END,
    is_dealer = is_dealer OR (v_app.requested_role = 'dealer'),
    is_supplier = is_supplier OR (v_app.requested_role = 'supplier')
  WHERE id = v_app.user_id;

  UPDATE public.role_applications
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_application_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
