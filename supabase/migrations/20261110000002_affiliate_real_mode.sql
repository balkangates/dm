-- =============================================================================
-- AFFILIATE — GERÇEK MOD
--
--  * Admin, fırsatı + referral/entegrasyon bağlantısını kendisi tanımlar.
--  * Hem affiliate ağları (iadeal benzeri platformlar, Admitad, Awin …) hem de
--    doğrudan marka siteleri (kendi referral/partner linki) desteklenir.
--  * Çıkış bağlantısı sunucuda üretilir: tracking_url içindeki {click_id},
--    {user_id}, {offer_id}, {url} yer tutucuları doldurulur; yer tutucu yoksa
--    click_param ile click_id eklenir.
--  * Dönüşüm/komisyon: ağ postback'i (dv_affiliate_postback) veya admin girişi.
--    Postback token'ı ayrı, yalnızca-admin tabloda tutulur (herkese açık
--    affiliate_networks tablosuna ASLA yazılmaz).
--  * Gösterim sayacı gerçekten artar (dv_offer_impressions).
--  * Tıklama ASLA satın alma sayılmaz; bekleyen komisyon gelir sayılmaz.
--  Tüm komutlar tekrar çalıştırılabilir (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------- ağlar -----
alter table public.affiliate_networks
  add column if not exists kind text not null default 'PLATFORM',
  add column if not exists base_url text,
  add column if not exists click_param text not null default 'subid',
  add column if not exists default_cookie_days integer;

alter table public.affiliate_networks drop constraint if exists affiliate_networks_kind_check;
alter table public.affiliate_networks
  add constraint affiliate_networks_kind_check
  check (kind in ('PLATFORM', 'DIRECT_BRAND'));

alter table public.affiliate_networks drop constraint if exists affiliate_networks_click_param_check;
alter table public.affiliate_networks
  add constraint affiliate_networks_click_param_check
  check (click_param ~ '^[A-Za-z0-9_\-]{1,32}$');

-- ------------------------------------------------------------- fırsatlar -----
alter table public.affiliate_offers
  add column if not exists brand text,
  add column if not exists video_url text,
  add column if not exists tracking_url text,
  add column if not exists click_param text,
  add column if not exists integration_type text not null default 'NETWORK',
  add column if not exists commission_rate_percent double precision,
  add column if not exists commission_fixed_cents integer,
  add column if not exists cookie_days integer;

-- Yeni kayıtlar varsayılan olarak GERÇEK (örnek değil).
alter table public.affiliate_offers alter column is_sample set default false;

alter table public.affiliate_offers drop constraint if exists affiliate_offers_integration_type_check;
alter table public.affiliate_offers
  add constraint affiliate_offers_integration_type_check
  check (integration_type in ('NETWORK', 'DIRECT_BRAND', 'REFERRAL'));

alter table public.affiliate_offers drop constraint if exists affiliate_offers_tracking_url_check;
alter table public.affiliate_offers
  add constraint affiliate_offers_tracking_url_check
  check (tracking_url is null or tracking_url ~* '^https?://');

alter table public.affiliate_offers drop constraint if exists affiliate_offers_video_url_check;
alter table public.affiliate_offers
  add constraint affiliate_offers_video_url_check
  check (video_url is null or video_url ~* '^https?://');

alter table public.affiliate_offers drop constraint if exists affiliate_offers_commission_rate_check;
alter table public.affiliate_offers
  add constraint affiliate_offers_commission_rate_check
  check (commission_rate_percent is null or (commission_rate_percent >= 0 and commission_rate_percent <= 100));

alter table public.affiliate_offers drop constraint if exists affiliate_offers_click_param_check;
alter table public.affiliate_offers
  add constraint affiliate_offers_click_param_check
  check (click_param is null or click_param ~ '^[A-Za-z0-9_\-]{1,32}$');

update public.affiliate_offers set brand = merchant where brand is null;

create index if not exists affiliate_offers_brand_idx on public.affiliate_offers (brand);
create index if not exists affiliate_offers_status_idx on public.affiliate_offers (status, last_updated desc);
create index if not exists affiliate_clicks_click_id_idx on public.affiliate_clicks (click_id);

-- --------------------------------------------- ağ gizli bilgileri (admin) -----
create table if not exists public.affiliate_network_secrets (
  network_id uuid primary key references public.affiliate_networks(id) on delete cascade,
  postback_token text not null unique,
  rotated_at timestamptz not null default now()
);

alter table public.affiliate_network_secrets enable row level security;

drop policy if exists affiliate_network_secrets_admin on public.affiliate_network_secrets;
create policy affiliate_network_secrets_admin on public.affiliate_network_secrets for all
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.affiliate_network_secrets from anon;

-- ------------------------------------------------- gösterim sayacı (RPC) ------
-- Sunucu tarafından, listelenen fırsat kimlikleriyle çağrılır; en çok 60 kimlik.
create or replace function public.dv_offer_impressions(p_offer_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_offer_ids is null or array_length(p_offer_ids, 1) is null then
    return jsonb_build_object('ok', true, 'updated', 0);
  end if;
  update affiliate_offers
     set impressions = impressions + 1
   where id = any (p_offer_ids[1:60])
     and status = 'ACTIVE';
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.dv_offer_impressions(uuid[]) to anon, authenticated;

-- ------------------------------------------------ postback (ağ → platform) -----
-- Ağ sunucusu, tanımlı postback URL'sini çağırır:
--   /api/affiliate/postback?token=…&click_id=…&status=…&commission=…&ref=…
-- Token doğrulanır; click_id'den fırsat/ağ çözülür; idempotency_key =
-- ağ+referans olduğundan aynı rapor çoğaltılmaz. Yeni kayıt REPORTED başlar;
-- ağ "approved" derse bile gelir olarak yalnızca admin onayıyla (APPROVED) sayılır.
create or replace function public.dv_affiliate_postback(
  p_token text,
  p_click_id text,
  p_status text,
  p_commission_cents integer,
  p_currency text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_net uuid;
  v_offer uuid;
  v_key text;
  v_status text;
  v_existing uuid;
  v_id uuid;
  v_cur text;
begin
  select s.network_id into v_net
    from affiliate_network_secrets s
    join affiliate_networks n on n.id = s.network_id
   where s.postback_token = p_token
     and n.status = 'CONNECTED';
  if v_net is null then
    raise exception 'Geçersiz veya bağlı olmayan ağ token''ı.';
  end if;

  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'Ağ referansı (ref) zorunlu.';
  end if;

  v_key := 'pb:' || v_net::text || ':' || btrim(p_reference);
  select id into v_existing from affiliate_conversions where idempotency_key = v_key;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_existing);
  end if;

  if p_click_id is not null and btrim(p_click_id) <> '' then
    select c.offer_id into v_offer from affiliate_clicks c where c.click_id = btrim(p_click_id);
  end if;

  v_status := case upper(coalesce(p_status, ''))
    when 'REJECTED' then 'REJECTED'
    when 'REVERSED' then 'REVERSED'
    else 'REPORTED'
  end;

  v_cur := upper(coalesce(nullif(btrim(p_currency), ''), 'TRY'));
  if v_cur not in ('TRY', 'USD', 'GEL', 'EUR') then v_cur := 'TRY'; end if;

  insert into affiliate_conversions (
    offer_id, click_id, network_id, status, commission_cents, currency,
    source, network_reference, idempotency_key, reported_at, note
  ) values (
    v_offer, nullif(btrim(p_click_id), ''), v_net, v_status,
    case when p_commission_cents is null then null else greatest(p_commission_cents, 0) end,
    v_cur, 'NETWORK_REPORT', left(btrim(p_reference), 120), v_key, now(),
    case when v_offer is null then 'click_id eşleşmedi; admin incelemesi gerekir.' else null end
  ) returning id into v_id;

  update affiliate_networks set last_sync_at = now() where id = v_net;

  insert into analytics_events (kind, meta)
  values ('conversion_reported', jsonb_build_object('networkId', v_net, 'offerId', v_offer, 'source', 'postback'));

  return jsonb_build_object('ok', true, 'duplicate', false, 'id', v_id, 'matched', v_offer is not null);
end $$;

grant execute on function public.dv_affiliate_postback(text, text, text, integer, text, text) to anon, authenticated;

-- ------------------------------------------- medya bucket'ı (admin yükler) -----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('affiliate-media', 'affiliate-media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists affiliate_media_admin_insert on storage.objects;
create policy affiliate_media_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'affiliate-media' and public.is_admin());

drop policy if exists affiliate_media_admin_update on storage.objects;
create policy affiliate_media_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'affiliate-media' and public.is_admin())
with check (bucket_id = 'affiliate-media' and public.is_admin());

drop policy if exists affiliate_media_admin_delete on storage.objects;
create policy affiliate_media_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'affiliate-media' and public.is_admin());

-- analytics_events.kind CHECK yalnızca biçim denetler (^[a-z0-9_]{1,64}$); ek değişiklik gerekmez.
