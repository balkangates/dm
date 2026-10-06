-- =====================================================================
-- 0003 reference_data — uygulamanın çalışması için ZORUNLU sistem verisi.
-- Demo/seed verisi DEĞİLDİR (demo veri yalnızca geliştirmede, src/lib/seed.ts).
-- Idempotent: tekrar çalıştırılırsa mevcut (admin tarafından değiştirilmiş) değerlere dokunmaz.
-- =====================================================================
BEGIN;

INSERT INTO packages (code, name, price_monthly_cents, ai_quota_monthly, features) VALUES
  ('FREE',  'Free',  0,      0,   '["İşletme sayfası","Temel profil","2 kampanya","Temel görünürlük"]'::jsonb),
  ('PRO',   'Pro',   249000, 120, '["AI pazarlama","28 günlük plan","Sınırsız kampanya","İçerik üretimi","Performans analizi","QR kampanyaları"]'::jsonb),
  ('BOOST', 'Boost', 699000, 400, '["Bölgesel görünürlük","Öne çıkarma","Reklam kampanyaları","AI optimizasyonu","Gelişmiş analiz"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_settings (key, value, description) VALUES
  ('ai_provider', 'local-template-engine', 'AI içerik sağlayıcısı (V1: yerel şablon motoru)'),
  ('ai_model', 'dampingvar-marketing-v1', 'Kullanılan model'),
  ('ai_monthly_budget_cents', '250000', 'Aylık AI maliyet bütçesi (kuruş)'),
  ('ai_content_limit_per_business', '60', 'İşletme başına aylık içerik üretim limiti')
ON CONFLICT (key) DO NOTHING;
-- NOT: API anahtarı DB'de tutulmaz; yalnızca sunucu ortam değişkeninde olur.

-- Ortak havuz tek satırdır; finans motoru 'GLOBAL' anahtarını bekler.
INSERT INTO damping_pool (key, balance_cents) VALUES ('GLOBAL', 0) ON CONFLICT (key) DO NOTHING;

COMMIT;
