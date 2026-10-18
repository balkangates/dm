-- =============================================================================
-- 20261018000001_faz5_rls_policies.sql
-- FAZ 5 — Row Level Security politikaları, yardımcı yetki fonksiyonları,
-- profil oluşturma trigger'ı ve tablo GRANT'ları.
--
-- ÖNKOŞUL: v3 şeması (20261017000003 veya canlıya uygulanmış karşılığı) mevcut olmalı.
--          Büyük harfli personel rolü varsa 20261017000004 yaması önce uygulanır.
-- İDEMPOTENT: politikalar drop-if-exists + create ile yeniden kurulur; tekrar
--          çalıştırmak güvenlidir.
--
-- GÜVENLİK KATMANLARI (prompt kuralı):
--   1) Middleware            → oturum yenileme + ilk rota kontrolü
--   2) Server-side guard     → lib/auth/guard.ts (rol ayrıca doğrulanır)
--   3) RLS (bu dosya)        → veri satırı düzeyinde nihai sınır
--   4) Doğrulama             → sunucu (route + RPC) — istemci verisine güvenilmez
--
-- İŞ KURALLARI:
--   * Roller KÜÇÜK harf (profiles.role, business_staff.role); durumlar BÜYÜK harf.
--   * campaign_usages / bonus_grants / referrals YAZMALARINI yalnızca dv_* RPC'leri
--     yapar (doğrudan INSERT/UPDATE politikası yoktur) → yetkisiz durum geçişi yok.
--   * Müşteri cüzdanı/para bakiyesi tablosu YOKTUR.
--
-- FAZ 7 (2026-10-18) RLS sertleştirmeleri bu dosyaya işlidir:
--   * business_staff yazması yalnızca OWNER/YÖNETİCİ (seviye atlama engeli)
--   * notifications istemci ekleme yalnızca kendi kendine SYSTEM bildirimi
--   * audit_logs aktör kilidi trigger'ı (sahte aktör ataması engeli)
--   * varsayılan hizmet bedeli kuralları (business_id IS NULL) herkese açık
--     (fiyatlandırma sayfası) — işletme özel kuralları member/admin ile sınırlı
-- =============================================================================

-- =============================================================================
-- BÖLÜM 1 — Yardımcı yetki fonksiyonları (security definer, RLS özyinelemesi yok)
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  return exists (select 1 from public.profiles p where p.id = v_uid and lower(p.role) = 'admin');
end;
$$;

-- Kullanıcı bu işletmenin personeli mi? (rol biçimi büyük/küçük harfe duyarlı DEĞİLDİR;
-- yama öncesi 'OWNER' ve sonrası 'owner' aynı kabul edilir.)
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if p_business_id is null then
    return false;
  end if;
  if v_uid is null then
    return false;
  end if;
  if public.is_admin() then
    return true;
  end if;
  select lower(p.email) into v_email from public.profiles p where p.id = v_uid;
  return exists (
    select 1
    from public.business_staff s
    where s.business_id = p_business_id
      and s.active
      and (s.user_id = v_uid or (v_email is not null and lower(s.email) = v_email))
  );
end;
$$;

-- Personel rolu (OWNER/MANAGER/CASHIER izinlerini uygulayan yer). p_roles
-- her iki yazıma da izin verir; fonksiyon içinde lower ile karşılaştırılır.
create or replace function public.is_business_staff(p_business_id uuid, p_roles text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_want text[];
begin
  if p_business_id is null or v_uid is null then
    return false;
  end if;
  if public.is_admin() then
    return true;
  end if;
  select array_agg(lower(x)) into v_want from unnest(p_roles) x;
  select lower(p.email) into v_email from public.profiles p where p.id = v_uid;
  return exists (
    select 1
    from public.business_staff s
    where s.business_id = p_business_id
      and s.active
      and (s.user_id = v_uid or (v_email is not null and lower(s.email) = v_email))
      and lower(s.role) = any (v_want)
  );
end;
$$;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_business_member(uuid) to anon, authenticated, service_role;
grant execute on function public.is_business_staff(uuid, text[]) to anon, authenticated, service_role;

-- =============================================================================
-- BÖLÜM 2 — Yeni kullanıcı → profil + davet kaydı (Supabase Auth trigger'ı)
-- Rol asla istemciden alınmaz; her yeni hesap 'customer' olur.
-- Tekrar çalıştırma/tekrar kayıt: idempotent (on conflict do nothing).
-- =============================================================================
do $$
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users yok — trigger atlandı (yalnızca yerel test ortamı olabilir).';
    return;
  end if;

  execute $f$
  create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
  as $fn$
  declare
    v_name text;
    v_meta_ref text;
    v_base text;
    v_code text;
    v_inviter uuid;
    v_inviter_code text;
    v_lang text;
    v_currency text;
    v_country text;
    v_n int;
  begin
    v_name := left(coalesce(nullif(trim(translate(new.raw_user_meta_data->>'name', chr(13)||chr(10), '  ')), ''),
                             nullif(trim(split_part(coalesce(new.email, 'hesap'), '@', 1)), ''),
                             'DampingVar Kullanıcısı'), 120);

    -- Davet kodu: yalnızca harf/rakam; yeni kullanıcının KENDİ kodu üretilir.
    v_base := upper(regexp_replace(v_name, '[^[:alnum:]]', '', 'g'));
    v_base := left(nullif(v_base, ''), 6);
    if v_base is null or length(v_base) < 2 then
      v_base := 'DV';
    end if;
    v_code := null;
    for v_n in 1..12 loop
      declare
        v_try text := v_base || (floor(random() * 900 + 100))::text;
      begin
        if not exists (select 1 from public.profiles where referral_code = v_try) then
          v_code := v_try;
          exit;
        end if;
      end;
    end loop;
    if v_code is null then
      v_code := 'DV' || (floor(random() * 900000 + 100000))::text;
    end if;

    -- Davet eden: metadata'daki kod (büyük/küçük harf duyarsız) — kendine davet yok.
    v_meta_ref := upper(regexp_replace(coalesce(new.raw_user_meta_data->>'referral_code', ''), '[^[:alnum:]]', '', 'g'));
    if v_meta_ref is not null and length(v_meta_ref) >= 3 then
      select p.id, p.referral_code into v_inviter, v_inviter_code
      from public.profiles p
      where upper(p.referral_code) = v_meta_ref and p.id <> new.id
      limit 1;
    end if;

    v_lang := case when new.raw_user_meta_data->>'lang' in ('tr','en','ka') then new.raw_user_meta_data->>'lang' else 'tr' end;
    v_currency := case when new.raw_user_meta_data->>'currency' in ('TRY','USD','GEL','EUR') then new.raw_user_meta_data->>'currency' else 'TRY' end;
    v_country := case when length(coalesce(new.raw_user_meta_data->>'country','')) = 2 then upper(new.raw_user_meta_data->>'country') else 'TR' end;

    insert into public.profiles (id, name, email, referral_code, referred_by, role, lang, currency, country)
    values (new.id, v_name, new.email, v_code, v_inviter, 'customer', v_lang, v_currency, v_country)
    on conflict (id) do nothing;

    if v_inviter is not null then
      insert into public.referrals (inviter_id, invitee_id, code, status, registered_at)
      values (v_inviter, new.id, v_inviter_code, 'REGISTERED', now())
      on conflict (invitee_id) do nothing;
    end if;

    return new;
  end;
  $fn$ $f$;

  execute 'drop trigger if exists on_auth_user_created on auth.users';
  execute 'create trigger on_auth_user_created after insert on auth.users
            for each row execute function public.handle_new_user()';
  raise notice 'handle_new_user trigger hazır.';
end $$;

-- =============================================================================
-- BÖLÜM 3 — Profil koruma kalkanı: kendini admin yapma / davet kodu değişimi yok
-- =============================================================================
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Profil kimliği değiştirilemez.';
  end if;
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Rol değişikliği yalnızca platform yöneticisi tarafından yapılabilir.';
  end if;
  if new.referral_code is distinct from old.referral_code and not public.is_admin() then
    raise exception 'Davet kodu değiştirilemez.';
  end if;
  if new.referred_by is distinct from old.referred_by and not public.is_admin() then
    raise exception 'Davet ilişkisi değiştirilemez.';
  end if;
  if new.email is distinct from old.email and not public.is_admin() then
    raise exception 'E-posta adresi bu uygulamadan değiştirilemez.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- FAZ 7 — Denetim günlüğü aktör kilidi: oturumlu istemci eklediği satırda aktörü
-- SAHTE atayamaz; actor, JWT'deki gerçek e-postayla üzerine yazılır. (Sahte
-- "INVOICE_PAID" gibi olayları başkasının adına yazmak engellenir; service-role
-- / istemcisiz bağlamlarda auth.uid() null olduğunda verilen değer korunur.)
create or replace function public.audit_logs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.actor := coalesce(nullif(auth.jwt()->>'email', ''), new.actor);
  end if;
  return new;
end;
$$;

drop trigger if exists audit_logs_guard on public.audit_logs;
create trigger audit_logs_guard
  before insert on public.audit_logs
  for each row execute function public.audit_logs_guard();

-- =============================================================================
-- BÖLÜM 4 — RLS aç + GRANT (RLS asıl sınırdır; GRANT yalnızca kapıyı açar)
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','businesses','business_hours','business_staff','products','business_services',
    'business_media','reviews','campaigns','qr_codes','campaign_usages','referrals',
    'bonus_policies','bonus_grants','marketing_plans','marketing_plan_days','ai_contents',
    'video_assets','ad_campaigns','ad_events','analytics_events','packages','ai_settings',
    'service_fee_rules','invoices','invoice_items','fraud_reviews','audit_logs',
    'saved_campaigns','followed_businesses','notifications','affiliate_networks',
    'affiliate_offers','affiliate_clicks','affiliate_conversions'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;

  execute 'grant usage on schema public to anon, authenticated';
  execute 'grant select, insert, update, delete on all tables in schema public to anon, authenticated';
end $$;

-- bonus_grants: aynı alışverişten ikinci ödül üretilemez (canlıda bu indeks
-- yoksa ve mükerrer satır yoksa eklenir).
do $$
begin
  create unique index if not exists bonus_grants_one_per_purchase
    on public.bonus_grants (source_usage_id);
exception when others then
  raise notice 'bonus_grants_one_per_purchase eklenemedi (mükerrer kaynak_usage_id var mı?): %', sqlerrm;
end $$;

-- =============================================================================
-- BÖLÜM 5 — POLİTİKALAR
-- =============================================================================

-- ------------------------------- profiles -----------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert
  with check (id = auth.uid() and role = 'customer');

drop policy if exists profiles_update_own_admin on public.profiles;
create policy profiles_update_own_admin on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- (rol/değişiklik kalkanı: profiles_guard trigger'ı)

-- ------------------------------ businesses ----------------------------------
drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses for select
  using (true);

drop policy if exists businesses_insert_admin on public.businesses;
create policy businesses_insert_admin on public.businesses for insert
  with check (public.is_admin());

drop policy if exists businesses_update_member on public.businesses;
create policy businesses_update_member on public.businesses for update
  using (public.is_business_member(id))
  with check (public.is_business_member(id));

drop policy if exists businesses_delete_admin on public.businesses;
create policy businesses_delete_admin on public.businesses for delete
  using (public.is_admin());

-- ------------------ business_hours / products / services / media -------------
drop policy if exists business_hours_select on public.business_hours;
create policy business_hours_select on public.business_hours for select using (true);
drop policy if exists business_hours_write_member on public.business_hours;
create policy business_hours_write_member on public.business_hours for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists products_select on public.products;
create policy products_select on public.products for select using (true);
drop policy if exists products_write_member on public.products;
create policy products_write_member on public.products for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists business_services_select on public.business_services;
create policy business_services_select on public.business_services for select using (true);
drop policy if exists business_services_write_member on public.business_services;
create policy business_services_write_member on public.business_services for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists business_media_select on public.business_media;
create policy business_media_select on public.business_media for select using (true);
drop policy if exists business_media_write_member on public.business_media;
create policy business_media_write_member on public.business_media for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- ------------------------------- reviews ------------------------------------
-- Okuma herkese açık. Yazma uygulamada HENÜZ implemented değildir (tohum
-- verisi dışındaki yorum oluşturucu akış yok) → istemci yazma kapalı kalır.
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select using (true);
drop policy if exists reviews_moderate_member on public.reviews;
create policy reviews_moderate_member on public.reviews for update
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
drop policy if exists reviews_moderate_admin on public.reviews;
create policy reviews_moderate_admin on public.reviews for delete
  using (public.is_admin());

-- ------------------------------- campaigns ----------------------------------
-- Herkese açık: moderasyon onaylı ve taslak olmayan kampanyalar.
-- Taslak/reddedilen yalnızca kendi işletmesi (ve yönetici) tarafından görülür.
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select
  using (
    (moderation_status = 'APPROVED' and status <> 'DRAFT')
    or public.is_business_member(business_id)
  );

drop policy if exists campaigns_insert_member on public.campaigns;
create policy campaigns_insert_member on public.campaigns for insert
  with check (public.is_business_member(business_id));

drop policy if exists campaigns_update_member on public.campaigns;
create policy campaigns_update_member on public.campaigns for update
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists campaigns_delete_member on public.campaigns;
create policy campaigns_delete_member on public.campaigns for delete
  using (public.is_business_member(business_id));

-- -------------------------------- qr_codes ----------------------------------
-- QR kodları genel tokenlardır (tarama içindir); içerik yazımı işletme içindir.
drop policy if exists qr_codes_select on public.qr_codes;
create policy qr_codes_select on public.qr_codes for select using (true);
drop policy if exists qr_codes_write_member on public.qr_codes;
create policy qr_codes_write_member on public.qr_codes for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- ---------------------------- campaign_usages --------------------------------
-- Okuma: kendi kayıtları (müşteri) veya kendi işletmesi (personel)/yönetici.
-- YAZMA politikası YOK → bütün geçişler dv_qr_* RPC'leriyle (security definer)
-- yapılır; yetki RPC içinde ayrıca doğrulanır.
drop policy if exists campaign_usages_select on public.campaign_usages;
create policy campaign_usages_select on public.campaign_usages for select
  using (
    customer_id = auth.uid()
    or public.is_business_member(business_id)
  );

-- -------------------------------- referrals ----------------------------------
-- Okuma: davet eden (inviter) veya yönetici. Yazma: yalnızca trigger/RPC.
drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals for select
  using (inviter_id = auth.uid() or public.is_admin());

-- ------------------------------ bonus_policies --------------------------------
drop policy if exists bonus_policies_select_admin on public.bonus_policies;
create policy bonus_policies_select_admin on public.bonus_policies for select
  using (public.is_admin());
drop policy if exists bonus_policies_write_admin on public.bonus_policies;
create policy bonus_policies_write_admin on public.bonus_policies for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------- bonus_grants ---------------------------------
-- Okuma: hakkı olan müşteri + ilgilenen işletme personeli + yönetici.
-- YAZMA politikası YOK → yalnızca dv_qr_verify / dv_bonus_redeem RPC'leri.
drop policy if exists bonus_grants_select on public.bonus_grants;
create policy bonus_grants_select on public.bonus_grants for select
  using (
    user_id = auth.uid()
    or public.is_business_member(business_id)
  );

-- ---------------------------- AI / içerik / video ------------------------------
drop policy if exists marketing_plans_member on public.marketing_plans;
create policy marketing_plans_member on public.marketing_plans for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists marketing_plan_days_member on public.marketing_plan_days;
create policy marketing_plan_days_member on public.marketing_plan_days for all
  using (
    exists (
      select 1 from public.marketing_plans mp
      where mp.id = plan_id and public.is_business_member(mp.business_id)
    )
  )
  with check (
    exists (
      select 1 from public.marketing_plans mp
      where mp.id = plan_id and public.is_business_member(mp.business_id)
    )
  );

drop policy if exists ai_contents_member on public.ai_contents;
create policy ai_contents_member on public.ai_contents for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists video_assets_select on public.video_assets;
create policy video_assets_select on public.video_assets for select using (true);
drop policy if exists video_assets_admin on public.video_assets;
create policy video_assets_admin on public.video_assets for all
  using (public.is_admin())
  with check (public.is_admin());

-- -------------------------------- reklam --------------------------------------
drop policy if exists ad_campaigns_member on public.ad_campaigns;
create policy ad_campaigns_member on public.ad_campaigns for all
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- ad_events: etkin politika yok → istemci erişimi kapalı (yalnızca sunucu/definer).

-- ------------------------------ analytics_events -------------------------------
-- Yazma: anon → yalnızca user_id yok; oturumlu → yalnızca kendi satırı.
-- Okuma: kendi satırı / kendi işletmesi / yönetici. Değiştirme/silme YOK (append-only).
drop policy if exists analytics_events_insert on public.analytics_events;
create policy analytics_events_insert on public.analytics_events for insert
  with check (
    (auth.uid() is null and user_id is null)
    or user_id = auth.uid()
  );

drop policy if exists analytics_events_select on public.analytics_events;
create policy analytics_events_select on public.analytics_events for select
  using (
    user_id = auth.uid()
    or (business_id is not null and public.is_business_member(business_id))
    or public.is_admin()
  );

-- --------------------------- platform tabloları --------------------------------
drop policy if exists packages_select on public.packages;
create policy packages_select on public.packages for select using (true);
drop policy if exists packages_admin on public.packages;
create policy packages_admin on public.packages for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists ai_settings_admin on public.ai_settings;
create policy ai_settings_admin on public.ai_settings for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists service_fee_rules_select on public.service_fee_rules;
-- FAZ 7: platform varsayılan kuralları (business_id IS NULL) herkese açıktır —
-- fiyatlandırma sayfası bunları her ziyaretçiye gösterir (eski davranış).
-- İşletmeye özel kural satırları yalnızca o işletmenin personeli/yöneticisine görünür.
create policy service_fee_rules_select on public.service_fee_rules for select
  using (
    business_id is null
    or public.is_admin()
    or public.is_business_member(business_id)
  );
drop policy if exists service_fee_rules_admin on public.service_fee_rules;
create policy service_fee_rules_admin on public.service_fee_rules for all
  using (public.is_admin()) with check (public.is_admin());

-- faturalar: işletme kendi faturasını görür (guncelleme yönetici).
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select
  using (public.is_business_member(business_id));
drop policy if exists invoices_admin on public.invoices;
create policy invoices_admin on public.invoices for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items for select
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and public.is_business_member(i.business_id)
    )
  );
drop policy if exists invoice_items_admin on public.invoice_items;
create policy invoice_items_admin on public.invoice_items for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists fraud_reviews_admin on public.fraud_reviews;
create policy fraud_reviews_admin on public.fraud_reviews for all
  using (public.is_admin()) with check (public.is_admin());

-- audit_logs: ekleme oturumlu istemcide açık (append-only), okuma yönetici,
-- DEĞİŞTİRME/SİLME YOK — denetim kaydı geriye dönük değiştirilemez.
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs for select
  using (public.is_admin());
drop policy if exists audit_logs_insert_auth on public.audit_logs;
create policy audit_logs_insert_auth on public.audit_logs for insert
  with check (auth.uid() is not null);

-- --------------------------- müşteri etkileşimleri ------------------------------
drop policy if exists saved_campaigns_own on public.saved_campaigns;
create policy saved_campaigns_own on public.saved_campaigns for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists followed_businesses_own on public.followed_businesses;
create policy followed_businesses_own on public.followed_businesses for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- FAZ 7 sertleştirme: okuma/değiştirme yalnızca kendi satırı; İSTEMCİ ekleme
-- yalnızca kendi kendine "SYSTEM" bildirimi (ör. kampanya bildirim onayı) ile
-- sınırlıdır. BONUS/REFERRAL/CAMPAIGN/INFO bildirimleri yalnızca SECURITY
-- DEFINER RPC'lerle üretilir → istemci sahte ödül bildirimi yazamaz.
drop policy if exists notifications_own on public.notifications;
create policy notifications_select_own on public.notifications for select
  using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy notifications_insert_self_system on public.notifications for insert
  with check (user_id = auth.uid() and kind = 'SYSTEM');

-- --------------------------------- affiliate ------------------------------------
-- Ağ ve fırsat listesi herkese açık (durum bilgisiyle); yönetim yalnızca yönetici.
drop policy if exists affiliate_networks_select on public.affiliate_networks;
create policy affiliate_networks_select on public.affiliate_networks for select using (true);
drop policy if exists affiliate_networks_admin on public.affiliate_networks;
create policy affiliate_networks_admin on public.affiliate_networks for all
  using (public.is_admin()) with check (public.is_admin());

-- Aktif + süresi dolmuş fırsatlar herkese açık (detay sayfası), duraklatılmış yalnızca yönetici.
drop policy if exists affiliate_offers_select on public.affiliate_offers;
create policy affiliate_offers_select on public.affiliate_offers for select
  using (status <> 'PAUSED' or public.is_admin());
drop policy if exists affiliate_offers_admin on public.affiliate_offers;
create policy affiliate_offers_admin on public.affiliate_offers for all
  using (public.is_admin()) with check (public.is_admin());

-- Tıklama kaydı: anon/oturumlu ekleir; okuma yönetici; onay (confirm) RPC ile.
drop policy if exists affiliate_clicks_insert on public.affiliate_clicks;
create policy affiliate_clicks_insert on public.affiliate_clicks for insert
  with check ((auth.uid() is null and user_id is null) or user_id = auth.uid());
drop policy if exists affiliate_clicks_select_admin on public.affiliate_clicks;
create policy affiliate_clicks_select_admin on public.affiliate_clicks for select
  using (public.is_admin());

-- Dönüşümler (komisyon): yalnızca yönetici; tıklama/satın alma ≠ komisyon.
drop policy if exists affiliate_conversions_admin on public.affiliate_conversions;
create policy affiliate_conversions_admin on public.affiliate_conversions for all
  using (public.is_admin()) with check (public.is_admin());

-- -------------------------------- business_staff --------------------------------
-- Okuma: kendi işletmesinin personeli (panel personel listesi) + yönetici.
-- Yazma (FAZ 7 sertleştirme): yalnızca işletme SAHİBİ veya yönetici.
-- Eski politika her personeline yazma izni veriyordu; bu, CASHIER/MANAGER'ın
-- PostgREST ile kendi rolünü OWNER'a yükseltmesine (seviye atlama) yol
-- açabilirdi. Route seviyesindeki staffCan kontrolü tek başına yeterli değildir;
-- nihai sınır RLS'tir. Uygulama kodu business_staff'a istemci yazması YAPMAZ
-- (personel kayıtları SQL/RLS tarafından sahip-yönetimiyle sağlanır).
drop policy if exists business_staff_select on public.business_staff;
create policy business_staff_select on public.business_staff for select
  using (public.is_business_member(business_id));
drop policy if exists business_staff_write_member on public.business_staff;
drop policy if exists business_staff_write_owner on public.business_staff;
create policy business_staff_write_owner on public.business_staff for all
  using (public.is_business_staff(business_id, array['owner']))
  with check (public.is_business_staff(business_id, array['owner']));

-- BİTTİ — RPC'ler: 20261018000002_faz5_rpcs.sql

