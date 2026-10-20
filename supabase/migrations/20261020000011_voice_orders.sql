-- ================================================================== *
-- FAZ 12A — Ücretsiz Sesli Asistan (20.10.2026)
--
-- Sipariş ALTYAPISI sıfırdan eklenir (projede orders tablosu YOKTU):
--   * Sipariş yalnızca işletmeye İLETİLİR; ödeme kapıda MÜŞTERİ ile
--     İŞLETME arasında yapılır (DampingVar ödeme almaz/checkout sunmaz —
--     yasal metinle çelişmez; yalnızca talep iletir).
--   * source: VOICE (sesli asistan) / WEB — admin ve işletme panelinde
--     sesli sipariş rozeti olarak gösterilir.
--   * payment_method: CASH_DOOR (kapıda nakit) / CARD_DOOR (kapıda kart).
--   * Durumlar: NEW → CONFIRMED → PREPARING → READY → COMPLETED;
--     ayrıca REJECTED / CANCELLED.
-- ================================================================== *

create table if not exists public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  customer_id uuid,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_district text,
  address text,
  note text,
  items jsonb NOT NULL DEFAULT '[]',
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  payment_method text NOT NULL DEFAULT 'CASH_DOOR'
    CHECK (payment_method IN ('CASH_DOOR','CARD_DOOR')),
  source text NOT NULL DEFAULT 'VOICE' CHECK (source IN ('VOICE','WEB')),
  status text NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW','CONFIRMED','REJECTED','PREPARING','READY','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_business_id_fkey FOREIGN KEY (business_id)
    REFERENCES public.businesses(id) ON DELETE CASCADE,
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES public.profiles(id) ON DELETE SET NULL
);

create index if not exists orders_business_idx on public.orders (business_id, status, created_at desc);
create index if not exists orders_customer_idx on public.orders (customer_id, created_at desc);

-- updated_at bakımı (mevcut trigger şablonuyla aynı yaklaşım)
create or replace function public.orders_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
  for each row execute function public.orders_touch_updated_at();

-- ------------------------- RLS ---------------------------------------- *
alter table public.orders enable row level security;

-- Müşteri: yalnızca KENDİ siparişini okur ve yalnızca kendi adına ekler.
-- (Fiili yazım sunucudan service role ile yapılır; istemci insert'i RLS ile
-- customer_id = auth.uid() şartına bağlıdır.)
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders for select
  using (customer_id = auth.uid());

drop policy if exists orders_insert_self on public.orders;
create policy orders_insert_self on public.orders for insert
  with check (customer_id = auth.uid());

-- İşletme personeli: kendi siparişlerini görür ve durum günceller.
drop policy if exists orders_member_all on public.orders;
create policy orders_member_all on public.orders for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- Yönetici: denetim (tümü).
drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders for all
  using (public.is_admin())
  with check (public.is_admin());

-- Realtime: işletme paneli yeni siparişi canlı görür (FAZ 11 bildirim
-- deseniyle aynı publication; tekrar ekleme hata vermez).
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
end $$;
