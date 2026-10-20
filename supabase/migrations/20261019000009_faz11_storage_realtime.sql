-- ============================================================
-- FAZ 11 · SUPABASE STORAGE & REALTIME  (idempotent — tekrar güvenli)
--
-- Mimari karar: Vercel serverless istek gövde limiti (~4.5MB) dosya
--   yükleme akışını sunucu route'undan geçirilemez kılar. Bu yüzden
--   yükleme TARAYICIDAN DOĞRUDAN Supabase Storage'a yapılır
--   (anon/publishable anahtar + kullanıcı oturumu). Güvenliğin son
--   sınırı storage.objects RLS politikaları + bucket limitleridir.
--
-- Bucket tasarımı:
--   * campaign-media — PUBLIC bucket. Kampanya görselleri pazarlama
--     içeriğidir ve herkese açık sayfalarda gösterilir. Yazma: yalnızca
--     kendi işletme klasörüne ({business_id}/...) ve o işletmenin aktif
--     üyesi | admin.
--   * business-video — PRIVATE bucket. Yüklenen videolar özeldir; okuma
--     yalnızca işletme üyeleri | admin ve imzalı URL (signed URL) ile.
--
-- Realtime:
--   * notifications tablosu supabase_realtime publication'ına eklenir.
--     postgres_changes kanalı authenticated + RLS ile çalışır; kullanıcı
--     yalnızca KENDİ bildirim satırlarını alır (publish_restricted).
--     Sahte/üretilmiş canlı veri eklenmez.
--
-- Ayrıca: video_assets tablosuna işletme-üyesi INSERT politikası ve
--   storage_path kolonu (yüklenen video dosyasının referansı).
-- Çalıştırma: Supabase SQL Editor (postgres rolü).
-- ============================================================

-- ---------- 1) Bucket'lar ----------
-- Boyut ve tür sınırları sunucu tarafında da uygulanır (upload reddi).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('campaign-media', 'campaign-media', true,  5242880,   -- 5 MB
   array['image/jpeg', 'image/png', 'image/webp']),
  ('business-video', 'business-video', false, 104857600, -- 100 MB
   array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

-- ---------- 2) Yardımcı fonksiyon: object adından işletme id'si ----------
-- Adım 1 segmenti uuid değilse null döner (cast hatası yok, fail-closed).
create or replace function public.dv_storage_business_of(p_name text)
returns uuid
language sql
stable
as $$
  select case
    when split_part(p_name, '/', 1)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

-- ---------- 3) storage.objects politikaları ----------
-- campaign-media: yazma/güncelleme/silme — aktif işletme üyesi | admin.
drop policy if exists campaign_media_insert on storage.objects;
create policy campaign_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'campaign-media'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

drop policy if exists campaign_media_update on storage.objects;
create policy campaign_media_update on storage.objects
for update to authenticated
using (
  bucket_id = 'campaign-media'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
)
with check (
  bucket_id = 'campaign-media'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

drop policy if exists campaign_media_delete on storage.objects;
create policy campaign_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'campaign-media'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

-- business-video (private): yazma/okuma/güncelleme/silme — üye | admin.
-- Okuma politikası imzalı URL oluşturmayı da kapsar (private bucket).
drop policy if exists business_video_insert on storage.objects;
create policy business_video_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'business-video'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

drop policy if exists business_video_select on storage.objects;
create policy business_video_select on storage.objects
for select to authenticated
using (
  bucket_id = 'business-video'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

drop policy if exists business_video_update on storage.objects;
create policy business_video_update on storage.objects
for update to authenticated
using (
  bucket_id = 'business-video'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
)
with check (
  bucket_id = 'business-video'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

drop policy if exists business_video_delete on storage.objects;
create policy business_video_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'business-video'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

-- ---------- 4) video_assets: işletme-üyesi INSERT + storage_path ----------
-- Mevcut durum: yalnız select(true) + admin(all) vardı; işletme üyesi
-- yüklediği videoyu kaydedemiyordu (42501). Kendi işletmesine yazabilir.
drop policy if exists video_assets_member_insert on public.video_assets;
create policy video_assets_member_insert on public.video_assets
for insert to authenticated
with check (public.is_business_member(business_id));

alter table public.video_assets
  add column if not exists storage_path text;

-- ---------- 5) Realtime: notifications publication'a eklensin ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
-- Not: Supabase Realtime postgres_changes abonelerini ZATEN notifications RLS
-- politikasına tabi tutar (subscriber JWT'siyle); publication'a eklemek yeterlidir.
-- (Yayına `row_level_security` seçeneği PostgreSQL söz dizimi değildir — eklenmeyecek.)

-- ---------- DOĞRULAMA (read-only) ----------
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('campaign-media', 'business-video')
order by id;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'notifications';

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'video_assets' and column_name = 'storage_path';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('campaign_media_insert','campaign_media_update','campaign_media_delete',
                     'business_video_insert','business_video_select','business_video_update','business_video_delete')
order by policyname;
