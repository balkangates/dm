-- =====================================================================
-- fix_phase7b_public_apply.sql
-- ─────────────────────────────────────────────────────────────────────
-- Faz 7'nin devamı: /apply formunun ÖNCE giriş yapmayı zorunlu kılması
-- kaldırılıyor. Artık ziyaretçi (giriş yapmamış kişi) de formu
-- doldurabiliyor — form aynı anda hesap oluşturuyor + başvuruyu
-- kaydediyor. Bunun karşılığında TC Kimlik No + Telefon + Vergi No
-- üzerinden ÇİFT KAYIT kontrolü ekleniyor (aksi halde aynı kişi
-- farklı e-postalarla sınırsız hesap/başvuru açabilirdi).
--
-- BULGU: profiles tablosunda TC Kimlik No alanı hiç yoktu (tax_number
-- var ama o vergi numarası, ayrı bir kavram — şahıs işletmelerinde
-- ikisi aynı olabilir ama tüzel kişilerde farklı). Ekliyoruz.
--
-- ÇALIŞTIRMA: fix_phase7_role_applications.sql'den SONRA, Supabase SQL
-- Editor'e yapıştır, RUN. (Faz7 hiç çalıştırılmadıysa önce onu çalıştır.)
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS national_id text;

ALTER TABLE public.role_applications
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS email text;

-- user_id artık NULL olabilir mi? HAYIR — hâlâ NOT NULL kalıyor çünkü
-- başvuru akışı artık "önce hesap oluştur (signUp), sonra başvuruyu o
-- yeni hesabın id'siyle kaydet" şeklinde çalışıyor (bkz.
-- submit_public_role_application). Yani her başvurunun her zaman bir
-- user_id'si oluyor, sadece "başvuru anında zaten login olma" şartı
-- kalkıyor.

-- Aynı TC kimlik / telefon / vergi no ile aynı anda birden fazla
-- BEKLEYEN başvuru açılmasını DB seviyesinde de engelle (yarış durumu
-- / çift sekmeden çift gönderim gibi durumlara karşı ikinci savunma
-- hattı — asıl kontrol RPC'lerde).
CREATE UNIQUE INDEX IF NOT EXISTS role_applications_one_pending_per_national_id
  ON public.role_applications (national_id)
  WHERE status = 'pending' AND national_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS role_applications_one_pending_per_phone
  ON public.role_applications (phone)
  WHERE status = 'pending' AND phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS role_applications_one_pending_per_tax_number
  ON public.role_applications (tax_number)
  WHERE status = 'pending' AND tax_number IS NOT NULL;

-- ── Çift kayıt ön-kontrolü (hesap oluşturulmadan ÖNCE çağrılır) ─────────
-- Ziyaretçi (anon) tarafından çağrılabilir — henüz hiçbir hesabı yok.
CREATE OR REPLACE FUNCTION public.check_application_duplicate(
  p_phone text,
  p_national_id text,
  p_tax_number text
)
RETURNS jsonb AS $$
DECLARE
  v_hit record;
BEGIN
  -- 1) Zaten onaylanmış bir bayi/tedarikçi hesabı var mı? (profiles)
  SELECT company_name INTO v_hit
  FROM public.profiles
  WHERE role IN ('dealer', 'supplier')
    AND (
      (phone IS NOT NULL AND phone = p_phone) OR
      (national_id IS NOT NULL AND national_id = p_national_id) OR
      (p_tax_number IS NOT NULL AND tax_number IS NOT NULL AND tax_number = p_tax_number)
    )
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'reason', 'EXISTING_ACCOUNT');
  END IF;

  -- 2) Bekleyen ya da onaylanmış bir başvuru zaten var mı?
  SELECT id INTO v_hit
  FROM public.role_applications
  WHERE status IN ('pending', 'approved')
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

GRANT EXECUTE ON FUNCTION public.check_application_duplicate(text, text, text) TO anon, authenticated;

-- ── Ziyaretçi başvurusu (hesap YENİ oluşturulduktan hemen sonra çağrılır) ──
-- Client akışı: 1) check_application_duplicate  2) supabase.auth.signUp()
-- 3) bu RPC. E-posta onayı açıksa signUp() sonrası aktif session
-- olmayabilir (auth.uid() NULL) — bu yüzden bu fonksiyon auth.uid()'e
-- DEĞİL, p_user_id parametresine güveniyor. Kötüye kullanımı önlemek
-- için: hedef profilin gerçekten YENİ (son 30 dakikada oluşmuş) ve hâlâ
-- 'customer' rolünde olduğunu şart koşuyor — yani biri rastgele bir
-- uuid verip başkasının eski hesabını ele geçiremez.
CREATE OR REPLACE FUNCTION public.submit_public_role_application(
  p_user_id uuid,
  p_requested_role text,
  p_full_name text,
  p_email text,
  p_national_id text,
  p_company_name text,
  p_tax_number text,
  p_tax_office text,
  p_phone text,
  p_address text,
  p_note text
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
  v_dup jsonb;
BEGIN
  IF p_requested_role NOT IN ('dealer', 'supplier') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'customer' AND created_at > now() - interval '30 minutes'
  ) THEN
    RAISE EXCEPTION 'INVALID_OR_STALE_ACCOUNT';
  END IF;

  v_dup := public.check_application_duplicate(p_phone, p_national_id, p_tax_number);
  IF (v_dup->>'duplicate')::boolean THEN
    RAISE EXCEPTION 'DUPLICATE_APPLICATION: %', v_dup->>'reason';
  END IF;

  UPDATE public.profiles
  SET full_name = COALESCE(p_full_name, full_name),
      national_id = p_national_id,
      company_name = p_company_name,
      tax_number = p_tax_number,
      tax_office = COALESCE(p_tax_office, tax_office),
      phone = p_phone,
      address = COALESCE(p_address, address),
      verification_requested = true,
      verification_requested_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.role_applications
    (user_id, requested_role, full_name, email, national_id, company_name, tax_number, tax_office, phone, address, note)
  VALUES
    (p_user_id, p_requested_role, p_full_name, p_email, p_national_id, p_company_name, p_tax_number, p_tax_office, p_phone, p_address, p_note)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.submit_public_role_application(uuid, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

-- ── Zaten giriş yapmış müşteri için mevcut submit_role_application'ı da
-- aynı çift-kayıt kontrolünden geçir (önceden yalnızca "aynı rol için
-- bekleyen başvurum var mı" kontrolü vardı, kimlik/telefon/vergi no
-- kontrolü yoktu).
CREATE OR REPLACE FUNCTION public.submit_role_application(
  p_requested_role text,
  p_company_name text,
  p_tax_number text,
  p_tax_office text,
  p_phone text,
  p_address text,
  p_note text
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

  v_dup := public.check_application_duplicate(p_phone, NULL, p_tax_number);
  IF (v_dup->>'duplicate')::boolean THEN
    RAISE EXCEPTION 'DUPLICATE_APPLICATION: %', v_dup->>'reason';
  END IF;

  UPDATE public.profiles
  SET company_name = COALESCE(p_company_name, company_name),
      tax_number = COALESCE(p_tax_number, tax_number),
      tax_office = COALESCE(p_tax_office, tax_office),
      phone = COALESCE(p_phone, phone),
      address = COALESCE(p_address, address),
      verification_requested = true,
      verification_requested_at = now()
  WHERE id = auth.uid();

  INSERT INTO public.role_applications
    (user_id, requested_role, company_name, tax_number, tax_office, phone, address, note)
  VALUES
    (auth.uid(), p_requested_role, p_company_name, p_tax_number, p_tax_office, p_phone, p_address, p_note)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
