-- ============================================================
-- FAZ 9 · DEMO İŞLETME SEED  (idempotent — tekrar çalıştırmak güvenli)
-- Amaç: parenatrade@gmail.com (role: business) hesabının
--       businesses + business_staff bağlantısını kurmak.
--       Bağlantı yokken /panel "İşletme kaydı bulunamadı" ekranı
--       gösterir; bağlantı sonrası gerçek işletme paneli açılır.
-- Not : DEMO veridir — Supabase Table Editor'den değiştirilebilir.
-- Çalıştırma: Supabase SQL Editor (postgres rolü, RLS dışında).
-- ============================================================

do $$
declare
  v_user  uuid := '209a30b6-de1f-4772-b2c0-a1a402bf491d';  -- parenatrade profil id
  v_biz   uuid;
  v_email text := 'parenatrade@gmail.com';
begin
  -- 1) İşletme kaydı (yoksa oluştur)
  select id into v_biz from public.businesses where slug = 'umut-ticaret';
  if v_biz is null then
    insert into public.businesses
      (slug, name, category, district, city, address, description, logo_text)
    values
      ('umut-ticaret', 'Umut Ticaret', 'Market', 'Bandırma', 'Balıkesir',
       'Çarşı Mah. Demokrasi Cad. No:1, Bandırma / Balıkesir',
       'Demo işletme kaydı — FAZ 9 doğrulama için oluşturuldu.',
       'UT')
    returning id into v_biz;
  end if;

  -- 2) Sahiplik bağlantısı (business_staff · owner) — user_id + e-posta ile
  if not exists (
    select 1 from public.business_staff
    where business_id = v_biz and user_id = v_user
  ) then
    insert into public.business_staff
      (business_id, user_id, name, email, role, active)
    values
      (v_biz, v_user, 'Umut Durmaz', v_email, 'owner', true);
  end if;

  -- 3) Demo açılış saatleri (Pzt–Paz 09:00–22:00) — yoksa ekle
  if not exists (
    select 1 from public.business_hours where business_id = v_biz
  ) then
    insert into public.business_hours (business_id, day_of_week, opens_at, closes_at)
    select v_biz, d, '09:00', '22:00' from generate_series(0, 6) as d;
  end if;
end $$;

-- ---------- DOĞRULAMA (read-only) ----------
select b.slug,
       b.name,
       b.category,
       b.district || ' / ' || b.city as konum,
       s.email,
       s.role as staff_role,
       s."user_id" is not null as baglanti_var
from public.businesses b
join public.business_staff s on s.business_id = b.id
where b.slug = 'umut-ticaret';
