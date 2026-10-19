-- ============================================================
-- FAZ 10 · FİYAT SEED  (DEMO — idempotent, tekrar çalıştırmak güvenli)
-- Karar: Paket ve hizmet bedeli fiyatları DEMO değerlerle seed edilir;
--        gerçek işletmeler kendi gerçek fiyatlarını panelden /
--        Supabase Table Editor'den güncelleyecektir.
-- Etkiler:
--   1) packages tablosu boştu → /fiyatlar sayfası boş, işletme
--      paneli "Planlar ve hizmetler" boş, admin "Paket değiştir"
--      ("business_plan") "Geçersiz paket kodu" hatası veriyordu.
--   2) service_fee_rules yalnızca 1 global kural vardı → herkese
--      açık /fiyatlar tablosu neredeyse boşdu; işletme panelinin
--      "Sözleşmendeki hizmet bedeli kuralları" bölümü hiç veri
--      görmüyordu (sorgu business_id ile filtreliyor).
-- Not : ON CONFLICT DO NOTHING — admin panelinden güncellenmiş
--       fiyatlar ezilmez. Kural satırları "yoksa ekle" ile konur.
-- Çalıştırma: Supabase SQL Editor (postgres rolü, RLS dışında).
-- ============================================================

-- ---------- 1) PAKETLER (yoksa ekle) ----------
insert into public.packages (code, name, price_monthly_cents, features, ai_quota_monthly, active)
values
  ('FREE', 'Ücretsiz Profil', 0,
   '["İşletme profili ve kampanya sayfası","Sınırsız kampanya yayınlama","Temel gösterim ve tıklama raporları","E-posta desteği"]'::jsonb,
   20, true),
  ('PRO', 'Profesyonel', 149900,
   '["Ücretsizdeki her şey","Gelişmiş raporlar ve dönüşüm takibi","Öncelikli sıralama","Haftalık performans özeti","Telefon desteği"]'::jsonb,
   100, true),
  ('BOOST', 'Büyüme', 299900,
   '["Profesyoneldeki her şey","Öne çıkan işletme listeleri","Sponsorlu kampanya hakkı","Bölgesel hedefleme","Danışmanlık desteği"]'::jsonb,
   300, true),
  ('AI28', 'AI Pazarlama 28', 399900,
   '["28 günlük AI büyüme programı","Otomatik içerik ve reklam metinleri","Rakip ve trend analizi","Aylık strateji raporu"]'::jsonb,
   500, true)
on conflict (code) do nothing;

-- ---------- 2) GLOBAL HİZMET BEDELİ KURALLARI (business_id null) ----------
-- Herkese açık /fiyatlar tablosu bu global kuralları gösterir.
-- Yoksa ekle: (business_id, service_type, package_code) eşleşmesine bakılır.
insert into public.service_fee_rules
  (business_id, package_code, service_type, kind, amount_cents, rate,
   calculation_base, currency, valid_from, valid_to, active)
select v.biz, v.pkg, v.svc, v.kind, v.amt, v.rate, v.base, 'TRY', now(), null, true
from (values
  (null::uuid, 'PRO'::text,  'SUBSCRIPTION',         'FIXED',   149900, 0.0,   'MONTHLY'),
  (null::uuid, 'BOOST'::text,'SUBSCRIPTION',         'FIXED',   299900, 0.0,   'MONTHLY'),
  (null::uuid, 'AI28'::text, 'SUBSCRIPTION',         'FIXED',   399900, 0.0,   'MONTHLY'),
  (null::uuid, null::text,   'CAMPAIGN_MANAGEMENT',  'FIXED',    79900, 0.0,   'MONTHLY'),
  (null::uuid, null::text,   'FEATURED_PLACEMENT',   'FIXED',   149900, 0.0,   'MONTHLY'),
  (null::uuid, null::text,   'REGIONAL_ADS',         'PERCENT',      0, 0.15,  'PER_CAMPAIGN'),
  (null::uuid, null::text,   'QR_MANAGEMENT',        'FIXED',    49900, 0.0,   'MONTHLY'),
  (null::uuid, null::text,   'AI_CONTENT',           'FIXED',    99900, 0.0,   'MONTHLY'),
  (null::uuid, null::text,   'GROWTH_28',            'FIXED',   249900, 0.0,   'MONTHLY'),
  (null::uuid, null::text,   'VISIBILITY',           'FIXED',    49900, 0.0,   'MONTHLY'),
  (null::uuid, null::text,   'REFERRAL_SERVICE',     'PERCENT',      0, 0.10,  'PER_VERIFIED_USAGE')
) as v(biz, pkg, svc, kind, amt, rate, base)
-- Aynı anahtarda kural zaten varsa tekrar ekleme (idempotent):
where not exists (
  select 1 from public.service_fee_rules f
  where f.business_id is not distinct from v.biz
    and f.service_type = v.svc
    and f.package_code is not distinct from v.pkg
);

-- FREE paketinin 0 tutarlı abonelik kuralı zaten canlıda var (16.10) —
-- yoksa onu da ekle (tam idempotency):
insert into public.service_fee_rules
  (business_id, package_code, service_type, kind, amount_cents, rate,
   calculation_base, currency, valid_from, valid_to, active)
select null, 'FREE', 'SUBSCRIPTION', 'FIXED', 0, 0, 'MONTHLY', 'TRY', now(), null, true
where not exists (
  select 1 from public.service_fee_rules
  where business_id is null and service_type = 'SUBSCRIPTION' and package_code = 'FREE'
);

-- ---------- 3) İŞLETMEYE ÖZEL ABONELİK KURALLARI ----------
-- İşletme paneli "Sözleşmendeki hizmet bedeli kuralları" sorgusu
-- business_id ile filtreler → her işletme için paketine eşleşen
-- SUBSCRIPTION kuralı (yoksa) oluşturulur. Tutar paket fiyatından gelir.
insert into public.service_fee_rules
  (business_id, package_code, service_type, kind, amount_cents, rate,
   calculation_base, currency, valid_from, valid_to, active)
select b.id, b.plan_code, 'SUBSCRIPTION', 'FIXED',
       coalesce(p.price_monthly_cents, 0), 0, 'MONTHLY', 'TRY', now(), null, true
from public.businesses b
left join public.packages p on p.code = b.plan_code
where b.suspended_at is null
  and not exists (
    select 1 from public.service_fee_rules f
    where f.business_id = b.id and f.service_type = 'SUBSCRIPTION'
  );

-- ---------- DOĞRULAMA (read-only) ----------
select code, name, price_monthly_cents, ai_quota_monthly, active
from public.packages order by code;

select coalesce(b.slug, '— (global)') as isletme,
       f.service_type, f.package_code, f.kind,
       case when f.kind = 'FIXED' then f.amount_cents || ' kurus'
            else '%' || round((f.rate * 100)::numeric, 1) end as tutar,
       f.calculation_base, f.active
from public.service_fee_rules f
left join public.businesses b on b.id = f.business_id
order by b.slug nulls last, f.service_type;
