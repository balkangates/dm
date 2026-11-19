-- =============================================================================
-- SİTE İÇİ REKLAM (19.11.2026)
--  * AI reklam metni "Onayla ve yayınla" ile ad_campaigns kaydına dönüşür (ACTIVE):
--    admin "Reklam paketleri ve yayınlar" listesinde görünür, ana sayfada listelenir.
--  * Site içi reklam ve kampanyalar abonelik paketine DAHİLDİR; ekstra ücret yok (bütçe 0 olabilir).
-- Tekrar çalıştırılabilir (idempotent).
-- =============================================================================
alter table public.ad_campaigns
  add column if not exists headline   text,
  add column if not exists ad_body    text,
  add column if not exists cta        text,
  add column if not exists content_id uuid,
  add column if not exists source     text not null default 'FORM';

create unique index if not exists ad_campaigns_content_uq on public.ad_campaigns (content_id) where content_id is not null;

-- Ana sayfa / herkese açık okuma: yalnızca yayındaki reklamlar.
drop policy if exists ad_campaigns_public_active on public.ad_campaigns;
create policy ad_campaigns_public_active on public.ad_campaigns for select
  using (status = 'ACTIVE' and (ends_at is null or ends_at > now()));
grant select on public.ad_campaigns to anon, authenticated;
