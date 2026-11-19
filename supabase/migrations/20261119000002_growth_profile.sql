-- =============================================================================
-- BÜYÜME PROFİLİ (19.11.2026) — işletmenin ELLE girdiği veriler (AI kampanya/reklam motoru girdisi)
-- ciro, ortalama sepet, kâr marjı, yoğun/boş saatler, rakipler, bulunduğu yemek platformları.
-- Tekrar çalıştırılabilir (idempotent).
-- =============================================================================
create table if not exists public.business_growth_profiles (
  business_id          uuid primary key references public.businesses(id) on delete cascade,
  monthly_revenue_cents bigint check (monthly_revenue_cents is null or monthly_revenue_cents >= 0),
  avg_basket_cents     integer check (avg_basket_cents is null or avg_basket_cents >= 0),
  margin_pct           numeric(5,2) check (margin_pct is null or (margin_pct >= 0 and margin_pct <= 100)),
  busy_hours           text,
  quiet_hours          text,
  competitors          jsonb not null default '[]'::jsonb,
  platforms            text[] not null default '{}',
  platform_discount_note text,
  goal                 text,
  updated_at           timestamptz not null default now()
);
alter table public.business_growth_profiles enable row level security;

drop policy if exists growth_profile_member on public.business_growth_profiles;
create policy growth_profile_member on public.business_growth_profiles for all
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists growth_profile_admin on public.business_growth_profiles;
create policy growth_profile_admin on public.business_growth_profiles for select using (public.is_admin());

grant select, insert, update on public.business_growth_profiles to authenticated;
