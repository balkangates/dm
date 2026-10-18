-- =============================================================================
-- 20261018000002_faz5_rpcs.sql
-- FAZ 5 — Sunucu iş mantığı RPC'leri (PostgREST üzerinden çağrılır).
--
-- ÖNKOŞUL: 20261018000001_faz5_rls_policies.sql uygulanmış olmalı (is_admin,
--          is_business_member, is_business_staff fonksiyonları 0001 dosyasında
--          tanımlıdır).
-- İDEMPOTENT: tüm fonksiyonlar CREATE OR REPLACE ile güncellenir.
--
-- NEDEN RPC?
--  * campaign_usages / bonus_grants / referrals YAZMALARI istemciye kapalıdır
--    (RLS'te insert/update politikası yok) → durum geçişleri yalnızca burada,
--    sunucu doğrulamasıyla yapılır.
--  * Anonim okutma akışı (QR_SCANNED) ve sayaç artışları definer ile güvenli.
--  * Gizlilik: işletme müşteri adını, akış sayfası kişisel veriyi RPC içinde
--    soyutlanmış etiket olarak üretir (§19).
--
-- İş kuralları (eski lib/queries.ts + /api/qr ile birebir):
--  * QR okutma ≠ doğrulanmış kullanım: QR_SCANNED → SUBMITTED → VERIFIED/REJECTED
--  * Her DOĞRULANMIŞ alışveriş en fazla 1 bonus hakkı üretir (source_usage_id UNIQUE)
--  * Bonus mağazaya bağlıdır; cüzdan/para bakiyesi yoktur; devredilemez.
--  * Tıklama ≠ satın alma; komisyon yalnızca rapor kaynağından gelir.
-- =============================================================================

-- Tek tarih/JSON yardımcıları (inline kullanılır)
create or replace function public.dv_iso(t timestamptz)
returns text language sql immutable as $$
  select case when t is null then null
    else to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
$$;

-- =============================================================================
-- BÖLÜM 1 — OKUMA RPC'LERİ (anonim çağrılabilir: keşif sayaçları)
-- =============================================================================

-- İlçe/kategori dağılımları (PostgREST group-by yapamaz → RPC)
create or replace function public.dv_districts()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'district'), '[]'::jsonb)
  from (
    select jsonb_build_object('district', b.district, 'city', b.city, 'n', count(*)::int) as x
    from businesses b group by b.district, b.city
  ) s
$$;

create or replace function public.dv_categories()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'n', n) order by category), '[]'::jsonb)
  from (select b.category, count(*)::int as n from businesses b group by b.category) s
$$;

create or replace function public.dv_offer_categories()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'n', n) order by category), '[]'::jsonb)
  from (select o.category, count(*)::int as n from affiliate_offers o group by o.category) s
$$;

-- Fırsat istatistikleri: tıklama sayısı + komisyon durumu dağılımı (satır vermez)
create or replace function public.dv_offer_stats(p_offer_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'clicks', (select count(*)::int from affiliate_clicks c where c.offer_id = p_offer_id),
    'conversions', coalesce((
      select jsonb_agg(jsonb_build_object('status', v.status, 'n', v.n))
      from (select x.status, count(*)::int as n from affiliate_conversions x where x.offer_id = p_offer_id group by x.status) v
    ), '[]'::jsonb)
  )
$$;

-- Kampanya kullanım sayaçları (anonim detay sayfası için)
create or replace function public.dv_campaign_usage_counts(p_campaign_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'scanned', (select count(*)::int from campaign_usages u where u.campaign_id = p_campaign_id and u.status <> 'CANCELLED'),
    'verified', (select count(*)::int from campaign_usages u where u.campaign_id = p_campaign_id and u.status = 'VERIFIED')
  )
$$;

-- Davet edilen kişi etiketleri (gizlilik: yalnızca davet eden görür; ad soyad → etiket)
create or replace function public.dv_referral_invitees()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'referralId', r.id,
      'label', coalesce(nullif(trim(p.name), ''), '—')
    ) order by r.created_at desc)
    from referrals r left join profiles p on p.id = r.invitee_id
    where r.inviter_id = v_uid
  ), '[]'::jsonb);
end $$;

-- İşletmenin platform genelindeki davet sayısı (yalnızca toplam — kişi verisi yok)
create or replace function public.dv_referral_total_count()
returns int language sql security definer set search_path = public as $$
  select count(*)::int from referrals
$$;

-- Doğrulama ekranındaki müşteri etiketleri (§19: işletme gerçek ad göremez)
create or replace function public.dv_customer_labels(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_business_id is null or not public.is_business_member(p_business_id) then
    raise exception 'Bu işletme için müşteri listesi görüntülenemez.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('customerId', c.customer_id, 'label', c.label))
    from (
      select distinct u.customer_id,
        'Müşteri ' || case
          when initials is null or initials = '' then '•'
          else initials
        end || '·' || left(u.customer_id::text, 4) as label
      from (
        select u2.customer_id,
          left(replace(upper(coalesce(p.name, '')), ' ', ''), 2) as initials
        from campaign_usages u2
        left join profiles p on p.id = u2.customer_id
        where u2.business_id = p_business_id and u2.customer_id is not null
      ) u
    ) c
  ), '[]'::jsonb);
end $$;

-- Birleşik etkinlik akışı — kişisel veri içermez (§19); anonim ana sayfa akışı.
create or replace function public.dv_flow_stream(p_limit int default 40, p_user_id uuid default null)
returns jsonb language sql security definer set search_path = public as $$
  with clicks as (
    select jsonb_build_object(
      'id', 'click-' || c.id, 'journey', 'affiliate', 'kind', 'affiliate_click',
      'label', 'Affiliate bağlantısına tıklandı',
      'subject', coalesce(o.merchant || ' · ' || o.title, '—'),
      'status', case when c.confirmed_outbound then 'REDIRECTED' else 'CLICKED' end,
      'verified', false, 'at', dv_iso(c.outbound_at),
      'note', 'Tıklama satın alma anlamına gelmez.'
    ) as item, c.outbound_at as sort_at
    from affiliate_clicks c left join affiliate_offers o on o.id = c.offer_id
    order by c.outbound_at desc limit p_limit
  ),
  convs as (
    select jsonb_build_object(
      'id', 'conv-' || v.id, 'journey', 'affiliate', 'kind', 'commission_status',
      'label', 'Komisyon durumu güncellendi',
      'subject', coalesce(o.merchant || ' · ' || o.title, '—'),
      'status', v.status, 'verified', v.status in ('APPROVED','PAID'),
      'at', dv_iso(coalesce(v.decided_at, v.reported_at)),
      'note', case when v.source = 'DEMO_SAMPLE' then 'Örnek kayıt — bağlı bir ağdan gelmedi.'
        else 'Kaynak: ' || v.source end
    ) as item, coalesce(v.decided_at, v.reported_at) as sort_at
    from affiliate_conversions v left join affiliate_offers o on o.id = v.offer_id
    order by coalesce(v.decided_at, v.reported_at) desc limit p_limit
  ),
  usages as (
    select jsonb_build_object(
      'id', 'usage-' || u.id, 'journey', 'local', 'kind', 'qr_' || lower(u.status),
      'label', case when u.status = 'VERIFIED' then 'Kampanya kullanımı doğrulandı'
        when u.status = 'SUBMITTED' then 'Doğrulama bekleniyor'
        when u.status = 'REJECTED' then 'Kullanım reddedildi' else 'QR okutuldu' end,
      'subject', coalesce(b.name, '—'),
      'status', u.status, 'verified', u.status = 'VERIFIED', 'at', dv_iso(u.scanned_at),
      'note', case when u.status = 'QR_SCANNED' then 'Okutma tek başına satış kanıtı değildir.' end
    ) as item, u.scanned_at as sort_at
    from campaign_usages u left join businesses b on b.id = u.business_id
    order by u.scanned_at desc limit p_limit
  ),
  events as (
    select jsonb_build_object(
      'id', 'ev-' || e.id,
      'journey', case when e.kind like 'referral%' or e.kind like 'bonus%' then 'referral' else 'platform' end,
      'kind', e.kind,
      'label', case
        when e.kind = 'bonus_granted' then 'Mağazaya bağlı Damping Bonus oluştu'
        when e.kind = 'bonus_redeemed' then 'Damping Bonus kullanıldı'
        when e.kind = 'referral_qualified' then 'Davet koşulu sağlandı'
        when e.kind = 'referral_signup' then 'Davet edilen kullanıcı kayıt oldu'
        when e.kind = 'referral_click' then 'Davet bağlantısına tıklandı'
        else 'Kampanya görüntülendi' end,
      'subject', coalesce(b.name, 'DampingVar'),
      'status', case when e.kind = 'bonus_granted' then 'AVAILABLE'
        when e.kind = 'bonus_redeemed' then 'USED'
        when e.kind = 'referral_qualified' then 'QUALIFIED' else 'RECORDED' end,
      'verified', e.kind in ('referral_qualified', 'bonus_granted'),
      'at', dv_iso(e.created_at)
    ) as item, e.created_at as sort_at
    from analytics_events e left join businesses b on b.id = e.business_id
    where e.kind in ('referral_click','referral_signup','referral_qualified','bonus_granted','bonus_redeemed','campaign_view')
      and (p_user_id is null or e.user_id = p_user_id)
    order by e.created_at desc limit p_limit
  ),
  all_items as (
    select item, sort_at from clicks union all
    select item, sort_at from convs union all
    select item, sort_at from usages union all
    select item, sort_at from events
  )
  select coalesce(jsonb_agg(item order by sort_at desc), '[]'::jsonb)
  from (select item, sort_at from all_items where sort_at is not null order by sort_at desc limit p_limit) f
$$;

-- =============================================================================
-- BÖLÜM 2 — QR / KULLANIM YAZMA RPC'LERİ (istemci doğrudan yazamaz)
-- =============================================================================

/**
 * 1) QR OKUTMA (anonim veya oturumlu).
 *    QR_SCANNED kaydı üretir; tek başına satış kanıtı DEĞİLDİR.
 *    Idempotency: aynı gün + kampanya + kullanıcı için AÇIK kayıt varsa tekrar üretmez.
 */
create or replace function public.dv_qr_scan(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := coalesce(trim(p_code), '');
  v_qr record;
  v_campaign record;
  v_biz record;
  v_problems text[] := '{}';
  v_today text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_idem text;
  v_same_count int;
  v_open record;
  v_usage record;
  v_key text;
  v_role text := 'GUEST';
  v_email text := 'anonim';
begin
  if v_code = '' then
    raise exception 'QR veya kampanya kodu gerekli.';
  end if;

  select * into v_qr from qr_codes where code = v_code limit 1;
  -- Düzeltme: v_campaign'a ilk SELECT her yolda çalıştırılır — hiç atanmamış
  -- record'a alan erişimi "is not assigned yet" hatası verirdi (QR kaydı
  -- yokken ilk dal hiç çalışmıyordu).
  select * into v_campaign from campaigns
   where id = coalesce(v_qr.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
   limit 1;
  if v_campaign.id is null then
    select * into v_campaign from campaigns where code = v_code limit 1;
  end if;
  if v_campaign.id is null then
    raise exception 'Kod bulunamadı. QR''ın bu işletmeye ait olduğunu kontrol edin.';
  end if;

  select * into v_biz from businesses where id = v_campaign.business_id limit 1;
  if v_biz.id is null then
    raise exception 'İşletme bulunamadı.';
  end if;

  -- Kampanya geçerlilik kontrolü (sunucu tarafı — eski /api/qr ile aynı)
  if v_campaign.status <> 'PUBLISHED' then
    v_problems := v_problems || 'Kampanya şu anda yayında değil.';
  end if;
  if v_campaign.moderation_status <> 'APPROVED' then
    v_problems := v_problems || 'Kampanya moderasyon onayı bekliyor.';
  end if;
  if v_campaign.starts_at > now() then
    v_problems := v_problems || 'Kampanya henüz başlamadı.';
  end if;
  if v_campaign.ends_at is not null and v_campaign.ends_at < now() then
    v_problems := v_problems || 'Kampanyanın süresi doldu.';
  end if;
  if jsonb_array_length(coalesce(v_campaign.days, '[]'::jsonb)) > 0
     and not exists (
       select 1 from jsonb_array_elements(v_campaign.days) d
       where (d #>> '{}')::int = extract(dow from now())::int
     ) then
    v_problems := v_problems || 'Kampanya bugün geçerli değil.';
  end if;

  if v_uid is not null then
    select coalesce(lower(p.email), 'anonim'), coalesce(upper(p.role), 'GUEST')
      into v_email, v_role from profiles p where p.id = v_uid;
  end if;

  v_idem := 'SCAN:' || v_campaign.id || ':' || coalesce(v_uid::text, 'anon') || ':' || v_today;

  -- Aynı gün AÇIK kayıt varsa yenisi üretilmez (kapanmış kayıtlar engellemez).
  select * into v_open from campaign_usages
  where idempotency_key like v_idem || '%'
    and status in ('QR_SCANNED', 'SUBMITTED')
  limit 1;
  if v_open.id is not null then
    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'usage', jsonb_build_object(
        'id', v_open.id, 'status', v_open.status, 'channel', v_open.channel,
        'businessName', v_biz.name, 'campaignTitle', v_campaign.title,
        'currency', v_open.currency,
        'reportedBasketCents', v_open.reported_basket_cents,
        'reportedDiscountCents', v_open.reported_discount_cents,
        'scannedAt', dv_iso(v_open.scanned_at), 'verifiedAt', dv_iso(v_open.verified_at)),
      'campaign', dv_qr_campaign_json(v_campaign, v_biz),
      'problems', to_jsonb(v_problems)
    );
  end if;

  select count(*)::int into v_same_count from campaign_usages where idempotency_key like v_idem || '%';
  v_key := case when v_same_count > 0 then v_idem || '#' || v_same_count else v_idem end;

  insert into campaign_usages (
    business_id, campaign_id, qr_code_id, customer_id, status, channel,
    currency, idempotency_key, scanned_at
  ) values (
    v_biz.id, v_campaign.id, v_qr.id, v_uid, 'QR_SCANNED',
    case when v_qr.id is not null then 'IN_STORE' else 'LINK' end,
    coalesce(v_campaign.currency, v_biz.currency, 'TRY'), v_key, now()
  ) returning * into v_usage;

  insert into analytics_events (business_id, campaign_id, user_id, kind, meta)
  values (v_biz.id, v_campaign.id, v_uid, 'qr_scanned', jsonb_build_object('code', v_code));
  insert into audit_logs (actor, role, action, entity_type, entity_id, meta)
  values (v_email, v_role, 'QR_SCANNED', 'campaign_usages', v_usage.id::text, jsonb_build_object('code', v_code));

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'usage', jsonb_build_object(
      'id', v_usage.id, 'status', v_usage.status, 'channel', v_usage.channel,
      'businessName', v_biz.name, 'campaignTitle', v_campaign.title,
      'currency', v_usage.currency,
      'reportedBasketCents', v_usage.reported_basket_cents,
      'reportedDiscountCents', v_usage.reported_discount_cents,
      'scannedAt', dv_iso(v_usage.scanned_at), 'verifiedAt', dv_iso(v_usage.verified_at)),
    'campaign', dv_qr_campaign_json(v_campaign, v_biz),
    'problems', to_jsonb(v_problems),
    'notice', 'QR okutulması tek başına alışverişin gerçekleştiğini kanıtlamaz. İndirim, kampanya koşulları sağlandığında işletme tarafından kasada uygulanır.'
  );
end $$;

-- QR akışının kampanya çıktısı (eski serializeCampaign ile aynı alanlar)
-- 42P13 düzeltmesi: PostgreSQL, SQL (language sql) fonksiyonlarında 'record'
-- türünde argüman kabul etmez. Bu yardımcı yalnızca dv_qr_scan içinden çağrılır;
-- plpgsql 'record' parametresini desteklediği için dil plpgsql'ye çevrilmiştir.
create or replace function public.dv_qr_campaign_json(c record, b record)
returns jsonb language plpgsql stable as $$
begin
  return jsonb_build_object(
    'id', c.id, 'code', c.code, 'slug', c.slug, 'title', c.title,
    'description', c.description, 'terms', c.terms, 'type', c.type,
    'discountPercent', c.discount_percent, 'discountAmountCents', c.discount_amount_cents,
    'minBasketCents', c.min_basket_cents, 'maxDiscountCents', c.max_discount_cents,
    'currency', c.currency,
    'startsAt', dv_iso(c.starts_at), 'endsAt', dv_iso(c.ends_at),
    'timeStart', c.time_start, 'timeEnd', c.time_end,
    'days', coalesce(c.days, '[]'::jsonb),
    'eligibleItems', coalesce(c.eligible_items, '[]'::jsonb),
    'exclusions', coalesce(c.exclusions, '[]'::jsonb),
    'perCustomerLimit', c.per_customer_limit, 'usageLimit', c.usage_limit,
    'businessName', b.name, 'businessSlug', b.slug,
    'district', b.district, 'city', b.city, 'address', b.address
  );
end;
$$;

/**
 * 2) MÜŞTERİ KULLANIMI DOĞRULAMAYA GÖNDERİR (oturumlu müşteri).
 */
create or replace function public.dv_qr_submit(p_usage_id uuid, p_basket bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_usage record;
begin
  if v_uid is null then
    raise exception 'Bu işlem için giriş yapmalısınız.';
  end if;
  select * into v_usage from campaign_usages where id = p_usage_id limit 1;
  if v_usage.id is null then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if v_usage.customer_id is distinct from v_uid then
    raise exception 'Bu kayıt size ait değil.';
  end if;
  if v_usage.status not in ('QR_SCANNED', 'SUBMITTED') then
    raise exception 'Bu kayıt zaten işlenmiş.';
  end if;

  update campaign_usages
  set status = 'SUBMITTED',
      reported_basket_cents = coalesce(greatest(0, round(p_basket)), reported_basket_cents)
  where id = p_usage_id
  returning * into v_usage;

  insert into analytics_events (business_id, campaign_id, user_id, kind, meta)
  values (v_usage.business_id, v_usage.campaign_id, v_uid, 'usage_submitted', '{}'::jsonb);

  -- Davet ilişkisi: doğrulama bekleyen alışverişe bağlanır.
  update referrals
  set status = 'PURCHASE_PENDING_VERIFICATION', source_usage_id = p_usage_id
  where invitee_id = v_uid and status in ('INVITED', 'REGISTERED', 'QUALIFIED');

  return jsonb_build_object('ok', true, 'usage',
    jsonb_build_object('id', v_usage.id, 'status', v_usage.status,
      'reportedBasketCents', v_usage.reported_basket_cents));
end $$;

/**
 * 3) İŞLETME KULLANIMI DOĞRULAR / REDDEDER (OWNER/MANAGER veya yönetici).
 *    Doğrulama → bonus mantığı eski /api/qr action=verify ile birebir.
 */
create or replace function public.dv_qr_verify(
  p_usage_id uuid, p_action text default 'verify',
  p_basket bigint default null, p_discount bigint default null, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_usage record;
  v_ref record;
  v_policy record;
  v_grant record;
  v_skip text[] := '{}';
  v_bonus jsonb := null;
  v_basket bigint;
  v_value bigint;
  v_capped bigint;
  v_owned int;
  v_actor_email text := 'anonim';
  v_actor_role text := 'ADMIN';
  v_inviter_name text := '';
begin
  if v_uid is null then
    raise exception 'İşletme hesabıyla giriş yapmalısınız.';
  end if;

  select * into v_usage from campaign_usages where id = p_usage_id for update;
  if v_usage.id is null then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not public.is_business_staff(v_usage.business_id, array['owner','manager']) then
    raise exception 'Bu işlem için yetkiniz yok (yalnızca OWNER/MANAGER doğrulayabilir).';
  end if;

  select coalesce(upper(p.role), 'ADMIN'), coalesce(p.email, 'anonim')
    into v_actor_role, v_actor_email from profiles p where p.id = v_uid;

  if v_usage.status = 'VERIFIED' then
    raise exception 'Bu kullanım zaten doğrulanmış.';
  end if;
  if v_usage.status = 'CANCELLED' then
    raise exception 'İptal edilmiş kayıt doğrulanamaz.';
  end if;

  /* ------------------------------- RED ---------------------------------- */
  if p_action = 'reject' then
    update campaign_usages set status = 'REJECTED', note = left(coalesce(p_note, ''), 500)
    where id = p_usage_id returning * into v_usage;
    if v_usage.customer_id is not null then
      insert into notifications (user_id, kind, title, body, link)
      values (v_usage.customer_id, 'SYSTEM', 'Kampanya kullanımı doğrulanamadı',
        coalesce(p_note, 'İşletme, kampanya koşullarının sağlanmadığını bildirdi.'), '/hesabim?s=activity');
    end if;
    insert into analytics_events (business_id, campaign_id, user_id, kind, meta)
    values (v_usage.business_id, v_usage.campaign_id, v_usage.customer_id, 'usage_rejected', '{}'::jsonb);
    insert into audit_logs (actor, role, action, entity_type, entity_id, meta)
    values (v_actor_email, v_actor_role, 'USAGE_REJECTED', 'campaign_usages', p_usage_id::text, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'status', 'REJECTED');
  end if;

  /* ------------------------------ DOĞRULA -------------------------------- */
  update campaign_usages
  set status = 'VERIFIED', verified_at = now(),
      reported_basket_cents = coalesce(greatest(0, round(p_basket)), reported_basket_cents),
      reported_discount_cents = greatest(0, round(p_discount)),
      note = left(coalesce(p_note, ''), 500)
  where id = p_usage_id
  returning * into v_usage;

  insert into analytics_events (business_id, campaign_id, user_id, kind, meta)
  values (v_usage.business_id, v_usage.campaign_id, v_usage.customer_id, 'usage_verified', '{}'::jsonb);

  if v_usage.customer_id is not null then
    select * into v_ref from referrals
    where invitee_id = v_usage.customer_id
      and status in ('INVITED','REGISTERED','PURCHASE_PENDING_VERIFICATION','QUALIFIED')
    limit 1;

    if v_ref.id is null then
      v_skip := v_skip || 'Davet ilişkisi yok.';
    elsif v_ref.inviter_id = v_usage.customer_id then
      v_skip := v_skip || 'Kendi kendini davet.';
    else
      select * into v_policy from bonus_policies
      where key = 'DEFAULT' and active = true limit 1;
      if v_policy.id is null then
        v_skip := v_skip || 'Aktif bonus politikası yok.';
      else
        v_basket := coalesce(v_usage.reported_basket_cents, 0);
        if v_basket < v_policy.min_purchase_cents then
          v_skip := v_skip || 'Minimum alışveriş koşulu sağlanmadı.';
        end if;
        select count(*)::int into v_owned from bonus_grants where user_id = v_ref.inviter_id;
        if v_owned >= v_policy.max_per_inviter then
          v_skip := v_skip || 'Davet eden için bonus limiti doldu.';
        end if;

        if cardinality(v_skip) = 0 then
          if v_policy.reward_kind = 'PERCENT_OF_BASKET' then
            v_value := round(v_basket * v_policy.reward_percent);
            v_capped := case when v_policy.max_reward_cents > 0
              then least(v_policy.max_reward_cents, v_value) else v_value end;
          else
            v_value := v_policy.reward_cents;
            v_capped := case when v_policy.max_reward_cents > 0
              then least(v_policy.max_reward_cents, v_value) else v_value end;
          end if;

          if v_capped <= 0 then
            v_skip := v_skip || 'Hesaplanan bonus değeri sıfır.';
          else
            insert into bonus_grants (
              user_id, business_id, source_referral_id, source_usage_id, policy_id,
              value_cents, currency, min_purchase_cents, status, expires_at
            ) values (
              v_ref.inviter_id, v_usage.business_id, v_ref.id, v_usage.id, v_policy.id,
              v_capped, v_usage.currency, v_policy.min_purchase_cents, 'AVAILABLE',
              now() + (v_policy.valid_days || ' days')::interval
            ) on conflict (source_usage_id) do nothing
            returning * into v_grant;

            if v_grant.id is not null then
              update referrals set status = 'BONUS_AVAILABLE', source_usage_id = v_usage.id
              where id = v_ref.id;
              select coalesce(p.name, '') into v_inviter_name from profiles p where p.id = v_ref.inviter_id;
              insert into notifications (user_id, kind, title, body, link)
              values (v_ref.inviter_id, 'BONUS', 'Damping Bonus kazandın',
                'Davetin doğrulandı. ' || to_char((v_capped / 100.0)::numeric, 'FM999999D00') || ' ' || v_usage.currency ||
                ' indirim hakkı yalnızca bu mağazada geçerli.', '/hesabim?s=bonus');
              insert into analytics_events (business_id, campaign_id, user_id, kind, meta)
              values (v_usage.business_id, v_usage.campaign_id, v_ref.inviter_id, 'bonus_granted',
                jsonb_build_object('valueCents', v_capped, 'inviter', v_inviter_name));
              v_bonus := jsonb_build_object(
                'id', v_grant.id, 'valueCents', v_grant.value_cents, 'currency', v_grant.currency,
                'businessId', v_grant.business_id, 'expiresAt', dv_iso(v_grant.expires_at));
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;

  insert into audit_logs (actor, role, action, entity_type, entity_id, meta)
  values (v_actor_email, v_actor_role, 'USAGE_VERIFIED', 'campaign_usages', p_usage_id::text,
    jsonb_build_object('basket', p_basket, 'discount', p_discount,
      'bonusCreated', v_bonus is not null, 'skipReasons', to_jsonb(v_skip)));

  return jsonb_build_object('ok', true, 'status', 'VERIFIED', 'bonus', v_bonus, 'skipReasons', to_jsonb(v_skip));
end $$;

/**
 * 4) İPTAL (OWNER/MANAGER veya yönetici). Doğrulanmış kullanımın bonusu da iptal edilir.
 */
create or replace function public.dv_qr_cancel(p_usage_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_usage record;
  v_actor_email text := 'anonim';
  v_actor_role text := 'ADMIN';
begin
  if v_uid is null then
    raise exception 'İşletme hesabıyla giriş yapmalısınız.';
  end if;
  select * into v_usage from campaign_usages where id = p_usage_id for update;
  if v_usage.id is null then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if not public.is_business_staff(v_usage.business_id, array['owner','manager']) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  update campaign_usages
  set status = 'CANCELLED', note = left(coalesce(p_note, 'İşletme iptal etti.'), 500)
  where id = p_usage_id returning * into v_usage;

  -- Doğrulanmış kullanım iptal edildiyse bonus da iptal (geri alınabilir kayıt).
  update bonus_grants set status = 'CANCELLED' where source_usage_id = p_usage_id;

  insert into analytics_events (business_id, campaign_id, kind, meta)
  values (v_usage.business_id, v_usage.campaign_id, 'usage_cancelled', '{}'::jsonb);

  select coalesce(upper(p.role), 'ADMIN'), coalesce(p.email, 'anonim')
    into v_actor_role, v_actor_email from profiles p where p.id = v_uid;
  insert into audit_logs (actor, role, action, entity_type, entity_id, meta)
  values (v_actor_email, v_actor_role, 'USAGE_CANCELLED', 'campaign_usages', p_usage_id::text, '{}'::jsonb);

  return jsonb_build_object('ok', true, 'usage',
    jsonb_build_object('id', v_usage.id, 'status', v_usage.status));
end $$;

/**
 * 5) MAĞAZAYA BAĞLI BONUS KULLANIMI (hak sahibi müşteri).
 */
create or replace function public.dv_bonus_redeem(p_bonus_id uuid, p_usage_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bonus record;
  v_usage record;
  v_email text := 'anonim';
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısınız.';
  end if;
  select * into v_bonus from bonus_grants where id = p_bonus_id for update;
  if v_bonus.id is null then
    raise exception 'Bonus bulunamadı.';
  end if;
  if v_bonus.user_id <> v_uid then
    raise exception 'Bu bonus size ait değil. Bonus devredilemez.';
  end if;
  if v_bonus.status = 'USED' then
    raise exception 'Bu bonus zaten kullanılmış.';
  end if;
  if v_bonus.status <> 'AVAILABLE' then
    raise exception 'Bonus şu an kullanılamaz (durum: %).', v_bonus.status;
  end if;
  if v_bonus.expires_at is not null and v_bonus.expires_at < now() then
    update bonus_grants set status = 'EXPIRED' where id = p_bonus_id;
    raise exception 'Bonus süresi dolmuş.';
  end if;

  if p_usage_id is not null then
    select * into v_usage from campaign_usages where id = p_usage_id limit 1;
    if v_usage.id is null then
      raise exception 'Kullanım kaydı bulunamadı.';
    end if;
    if v_usage.business_id <> v_bonus.business_id then
      raise exception 'Bonus yalnızca kazanıldığı mağazada kullanılabilir.';
    end if;
  end if;

  update bonus_grants
  set status = 'USED', redeemed_at = now(), redeemed_usage_id = p_usage_id
  where id = p_bonus_id;

  insert into analytics_events (business_id, user_id, kind, meta)
  values (v_bonus.business_id, v_uid, 'bonus_redeemed', jsonb_build_object('bonusId', p_bonus_id));
  select coalesce(p.email, 'anonim') into v_email from profiles p where p.id = v_uid;
  insert into audit_logs (actor, role, action, entity_type, entity_id, meta)
  values (v_email, 'CUSTOMER', 'BONUS_REDEEMED', 'bonus_grants', p_bonus_id::text,
    jsonb_build_object('businessId', v_bonus.business_id));

  return jsonb_build_object('ok', true, 'status', 'USED',
    'valueCents', v_bonus.value_cents, 'businessId', v_bonus.business_id);
end $$;

/**
 * 6) KAMPANYA SAYAÇ ARTIŞI (anonim görüntülenme/tıklama).
 */
create or replace function public.dv_campaign_bump(p_campaign_id uuid, p_field text default 'views')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_col text;
begin
  v_col := case when p_field = 'clicks' then 'clicks' else 'views' end;
  execute format('update campaigns set %I = %I + 1 where id = $1', v_col, v_col) using p_campaign_id;
  return jsonb_build_object('ok', true);
end $$;

/**
 * 7) AFFILIATE ÇIKIŞ ONAYI (anonim; tıklama ≠ satın alma).
 */
create or replace function public.dv_affiliate_confirm(p_click_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  update affiliate_clicks set confirmed_outbound = true where click_id = p_click_id;
  if not found then
    raise exception 'Tıklama kaydı bulunamadı.';
  end if;
  insert into analytics_events (user_id, kind, meta)
  values (v_uid, 'affiliate_outbound', jsonb_build_object('clickId', p_click_id));
  return jsonb_build_object('ok', true, 'clickId', p_click_id);
end $$;

/**
 * 7b) FIRSAT TIKLAMA SAYACI (anonim; teklif satırı istemciye kapalıdır).
 */
create or replace function public.dv_offer_bump(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update affiliate_offers set clicks = clicks + 1 where id = p_offer_id;
  return jsonb_build_object('ok', true);
end $$;

-- =============================================================================
-- BÖLÜM 3 — YETKİLENDİRME (varsayılan EXECUTE = PUBLIC; anonim yazma kapalı)
-- =============================================================================

-- Anonim + oturumlu çağrılabilir:
grant execute on function public.dv_districts() to anon, authenticated;
grant execute on function public.dv_categories() to anon, authenticated;
grant execute on function public.dv_offer_categories() to anon, authenticated;
grant execute on function public.dv_offer_stats(uuid) to anon, authenticated;
grant execute on function public.dv_campaign_usage_counts(uuid) to anon, authenticated;
grant execute on function public.dv_flow_stream(int, uuid) to anon, authenticated;
grant execute on function public.dv_qr_scan(text) to anon, authenticated;
grant execute on function public.dv_campaign_bump(uuid, text) to anon, authenticated;
grant execute on function public.dv_affiliate_confirm(text) to anon, authenticated;
grant execute on function public.dv_offer_bump(uuid) to anon, authenticated;

-- Yalnızca oturumlu kullanıcı (fonksiyon içi auth.uid() kontrolü ek savunma):
revoke execute on function public.dv_qr_submit(uuid, bigint) from public, anon;
revoke execute on function public.dv_qr_verify(uuid, text, bigint, bigint, text) from public, anon;
revoke execute on function public.dv_qr_cancel(uuid, text) from public, anon;
revoke execute on function public.dv_bonus_redeem(uuid, uuid) from public, anon;
revoke execute on function public.dv_referral_invitees() from public, anon;
revoke execute on function public.dv_referral_total_count() from public, anon;
revoke execute on function public.dv_customer_labels(uuid) from public, anon;
grant execute on function public.dv_qr_submit(uuid, bigint) to authenticated;
grant execute on function public.dv_qr_verify(uuid, text, bigint, bigint, text) to authenticated;
grant execute on function public.dv_qr_cancel(uuid, text) to authenticated;
grant execute on function public.dv_bonus_redeem(uuid, uuid) to authenticated;
grant execute on function public.dv_referral_invitees() to authenticated;
grant execute on function public.dv_referral_total_count() to authenticated;
grant execute on function public.dv_customer_labels(uuid) to authenticated;

-- Yardımcılar (kalıcı):
grant execute on function public.dv_iso(timestamptz) to anon, authenticated, service_role;
grant execute on function public.dv_qr_campaign_json(record, record) to anon, authenticated, service_role;

-- BİTTİ. Test sırası: lib/data katmanı → API rotaları → sayfalar → tsc/lint/build.
