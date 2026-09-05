-- =====================================================================
-- fix_phase7_role_applications.sql
-- ─────────────────────────────────────────────────────────────────────
-- FAZ 7: Tedarikçi / Bayi self-servis başvuru + admin onay akışı.
--
-- BULGU: profiles.role CHECK'i 'dealer' / 'supplier' değerlerini zaten
-- kabul ediyor, ve profiles tablosunda şirket/vergi/IBAN alanları
-- (company_name, tax_number, tax_office, mersis_no, iban, bank_name...)
-- ZATEN VAR — açıkça bu akış için tasarlanmış. Ama ne eski dashboard.html
-- sisteminde ne de yeni Next.js kod tabanında bu rolleri talep edip admin
-- onayından geçiren HİÇBİR akış yok. Şu anda 'customer' dışındaki roller
-- yalnızca veritabanına elle (Supabase Studio'dan) satır güncelleyerek
-- atanabiliyor. Bu, tedarikçi/bayi ağını büyütmenin önündeki en büyük
-- teknik engel.
--
-- Bu migration ekliyor:
--   1) role_applications tablosu — kullanıcı "Bayi/Tedarikçi Ol" başvurusu
--      yapınca buraya bir satır düşer (status='pending').
--   2) submit_role_application(...) — customer kendi başvurusunu oluşturur
--      (aynı zamanda profiles'taki şirket/vergi alanlarını da günceller,
--      böylece onaylanınca tekrar veri girmesi gerekmez).
--   3) admin_approve_role_application(id) — profiles.role'ü günceller,
--      başvuruyu 'approved' yapar.
--   4) admin_reject_role_application(id, reason) — başvuruyu 'rejected'
--      yapar, sebebi kaydeder.
--   5) RLS: kullanıcı yalnızca kendi başvurusunu görür/oluşturur, admin
--      hepsini görür ve onaylar/reddeder.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'e yapıştır, RUN.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.role_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_role text NOT NULL CHECK (requested_role = ANY (ARRAY['dealer'::text, 'supplier'::text])),
  company_name text,
  tax_number text,
  tax_office text,
  phone text,
  address text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT role_applications_pkey PRIMARY KEY (id),
  CONSTRAINT role_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT role_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id)
);

-- Bir kullanıcının aynı rol için birden fazla BEKLEYEN başvurusu olmasın
CREATE UNIQUE INDEX IF NOT EXISTS role_applications_one_pending_per_role
  ON public.role_applications (user_id, requested_role)
  WHERE status = 'pending';

-- fix_phase5_admin_approvals.sql'de tanımlı; burada da idempotent olarak
-- garanti altına alınıyor (bu dosya phase5'ten bağımsız çalıştırılırsa diye).
CREATE OR REPLACE FUNCTION public._is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin');
$$ LANGUAGE sql STABLE;

ALTER TABLE public.role_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_applications_read_own ON public.role_applications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY role_applications_read_admin ON public.role_applications
  FOR SELECT USING (public._is_admin());

CREATE POLICY role_applications_insert_own ON public.role_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE (onay/red) yalnızca admin_approve/admin_reject RPC'leri
-- üzerinden, SECURITY DEFINER ile yapılır — doğrudan UPDATE politikası
-- kasıtlı olarak yok (kullanıcı kendi başvurusunun status'unu elle
-- 'approved' yapamasın diye).

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

  -- Şirket/vergi bilgilerini profildeki karşılıklarına da yaz — onaylanınca
  -- tekrar girmesi gerekmesin.
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

  UPDATE public.profiles SET role = v_app.requested_role WHERE id = v_app.user_id;

  UPDATE public.role_applications
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_application_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_reject_role_application(p_application_id uuid, p_reason text)
RETURNS void AS $$
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.role_applications
  SET status = 'rejected', admin_note = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_application_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND_OR_RESOLVED';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
