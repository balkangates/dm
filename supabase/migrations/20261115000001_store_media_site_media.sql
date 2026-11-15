-- =============================================================================
-- SİTE MEDYASI (15.11.2026) — store-media bucket + site_media tablosu
--
-- İstek: anasayfa, müşteri paneli ve işletme panelindeki görsel/video alanları
-- ADMIN panelinden yükle · değiştir · sil ile yönetilsin. Dosyalar Supabase
-- Storage'da `store-media` bucket'ının altında iki klasörde tutulur:
--     store-media/image/…   (görseller)
--     store-media/video/…   (videolar)
-- Storyboard (video_assets) kayıtlarına da gerçek video eklenebilir; böylece
-- "Storyboard · sahne X/Y" alanları izlenebilir video olur.
--
-- Tekrar çalıştırılabilir (idempotent). Mevcut bucket/politikalara dokunmaz.
-- =============================================================================

-- 1) PUBLIC bucket: store-media (okuma herkese açık; yazma yalnızca admin).
--    Limit 100 MB. NOT: Supabase projenizin genel dosya limiti (Free plan: 50 MB)
--    bucket limitinden düşükse, daha büyük dosyalar o limitte reddedilir
--    (Dashboard → Storage → Settings → Global file size limit).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-media', 'store-media', true, 104857600,
  array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) storage.objects politikaları: yalnızca admin, yalnızca image/ ve video/ klasörleri.
drop policy if exists store_media_admin_select on storage.objects;
create policy store_media_admin_select on storage.objects
for select to authenticated
using (bucket_id = 'store-media' and public.is_admin());

drop policy if exists store_media_admin_insert on storage.objects;
create policy store_media_admin_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'store-media'
  and public.is_admin()
  and (storage.foldername(name))[1] in ('image', 'video')
);

drop policy if exists store_media_admin_update on storage.objects;
create policy store_media_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'store-media' and public.is_admin())
with check (
  bucket_id = 'store-media'
  and public.is_admin()
  and (storage.foldername(name))[1] in ('image', 'video')
);

drop policy if exists store_media_admin_delete on storage.objects;
create policy store_media_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'store-media' and public.is_admin());

-- 3) site_media: slot başına tek kayıt (slot listesi uygulama kodunda: lib/siteMedia.ts).
create table if not exists public.site_media (
  slot_key     text primary key,
  kind         text not null check (kind in ('image', 'video')),
  storage_path text not null,
  url          text not null,
  alt          text,
  mime_type    text,
  size_bytes   bigint,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

alter table public.site_media enable row level security;

drop policy if exists site_media_select on public.site_media;
create policy site_media_select on public.site_media for select using (true);

drop policy if exists site_media_admin on public.site_media;
create policy site_media_admin on public.site_media for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.site_media to anon, authenticated;
grant insert, update, delete on public.site_media to authenticated;

-- 4) video_assets: storyboard için gerçek video dosyası (store-media/video/…) ve kapak.
alter table public.video_assets
  add column if not exists video_path  text,
  add column if not exists video_url   text,
  add column if not exists poster_path text;

-- ---------- doğrulama ----------
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'store-media') then
    raise exception 'store-media bucket oluşmadı';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'site_media' and policyname = 'site_media_admin') then
    raise exception 'site_media_admin politikası oluşmadı';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'video_assets' and column_name = 'video_url') then
    raise exception 'video_assets.video_url oluşmadı';
  end if;
end $$;
