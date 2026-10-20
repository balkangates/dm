-- ================================================================== *
-- FAZ 11 sonrası ek istek — DampingVar AI Büyüme Asistanı
-- (20.10.2026) — öneri/görev takibi için EN KÜÇük şema.
--
--   * growth_recommendations: AI analiz önerileri (Evet/Hayır akışı,
--     görev listesi jsonb içinde, alternatif bağlantıları, ret nedeni).
--   * ad_campaigns.brief: mevcut reklam talep formuna AI taslak brief'i
--     (amaç + hedef kitle + metin + görsel ihtiyacı) — mevcut form
--     bozulmadan, isteğe bağlı alan olarak eklenir.
--   * Bildirimler için YENİ tablo YOK: mevcut public.notifications
--     tablosu (kullanıcı başına, realtime publication'da) kullanılır.
--   * Görev listesi için ayrıca tablo YOK: öneri satırının tasks jsonb
--     alanında taşınır (en küçük çözüm; yinelenen görevler öneribaşına
--     unique adım numarasıyla önlenir).
--
-- Not: growth_recommendations için realtime publication'a EKLENMEZ —
-- panel verisi sayfa yüklemesinden gelir; aksiyonlar sonrası sayfa
-- yenilenir (mevcut panel mimarisiyle tutarlı).
-- ================================================================== *

create table if not exists public.growth_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  created_by_user uuid,
  area text NOT NULL CHECK (area IN ('GROWTH','VISIBILITY','ACQUISITION','SALES')),
  title text NOT NULL,
  problem text NOT NULL,
  why text NOT NULL,
  benefit text NOT NULL,
  cost text NOT NULL,
  materials text NOT NULL DEFAULT '',
  steps jsonb NOT NULL DEFAULT '[]',
  plan jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PROPOSED'
    CHECK (status IN ('PROPOSED','ACCEPTED','REJECTED','COMPLETED','CANCELLED')),
  rejected_reason text,
  alternative_for uuid,
  tasks jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  CONSTRAINT growth_recommendations_pkey PRIMARY KEY (id),
  CONSTRAINT growth_recommendations_business_id_fkey FOREIGN KEY (business_id)
    REFERENCES public.businesses(id) ON DELETE CASCADE,
  CONSTRAINT growth_recommendations_alternative_for_fkey FOREIGN KEY (alternative_for)
    REFERENCES public.growth_recommendations(id) ON DELETE SET NULL
);

create index if not exists growth_recs_business_idx
  on public.growth_recommendations (business_id, status, created_at desc);

-- Aynı işletme için AYNI başlıklı öneri ikinci kez açık (PROPOSED/ACCEPTED)
-- oluşturulamaz — yinelenen öneri/görev engeli (istek: aynı öneri için
-- tekrarlanan görev/talep oluşturma).
create unique index if not exists growth_recs_open_unique
  on public.growth_recommendations (business_id, lower(title))
  where status in ('PROPOSED','ACCEPTED');

alter table public.growth_recommendations enable row level security;
drop policy if exists growth_recs_member_all on public.growth_recommendations;
create policy growth_recs_member_all on public.growth_recommendations for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
drop policy if exists growth_recs_admin_all on public.growth_recommendations;
create policy growth_recs_admin_all on public.growth_recommendations for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------ ad_campaigns.brief (AI reklam taslağı metni) --------------
alter table public.ad_campaigns add column if not exists brief text;
