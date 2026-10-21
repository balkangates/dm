-- =============================================================================
-- FAZ 12D (21.10.2026) — MEDYA YÜKLEME: KAPAK/BANNER · "İŞLETMEDEN KARELER"
--                          GALERİSİ · STORYBOARD SAHNE GÖRSELLERİ
--   + ADMIN: işletme medyası ve video kütüphanesi yönetimi
--
-- Kullanıcı gereksinimi: (1) işletme sayfası banner/kapak yükleme; (2) "İşletmeden
-- kareler" galeri görselleri yükleme; (3) "Storyboard · sahne X/Y" görselleri
-- yükleme; (4) video kütüphanesine video yükleme — HEPSİ işletme panelinden VE
-- admin panelinden yapılabilmeli.
--
-- Şema=min: businesses.cover_image, business_media tablosu ve video_assets.scenes
-- (jsonb) ZATEN vardı (0003/0001). Yalnızca PUBLIC bucket + storage politikaları
-- + iki eksik RLS politikası eklenir. Mevcut iş akışları (0009: campaign-media,
-- business-video) aynen korunur.
-- =============================================================================

-- 1) PUBLIC bucket: business-media — kapak, galeri ve storyboard sahne görselleri.
--    (campaign-media ile aynı limitler.) Dosya yolları {business_id}/... başlamak
--    zorundadır — public.dv_storage_business_of ilk segmentten id'yi çözer
--    (0009'daki fonksiyon; bu bucket için de geçerlidir).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-media', 'business-media', true, 5242880,   -- 5 MB
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 2) storage.objects politikaları — yazma/güncelleme/silme: aktif işletme üyesi | admin.
--    Okuma: PUBLIC bucket → policy gerekmez.
drop policy if exists business_media_img_insert on storage.objects;
create policy business_media_img_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'business-media'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

drop policy if exists business_media_img_update on storage.objects;
create policy business_media_img_update on storage.objects
for update to authenticated
using (
  bucket_id = 'business-media'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
)
with check (
  bucket_id = 'business-media'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

drop policy if exists business_media_img_delete on storage.objects;
create policy business_media_img_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'business-media'
  and (public.is_admin() or public.is_business_member(public.dv_storage_business_of(name)))
);

-- 3) business_media: ADMIN yazma politikası.
--    0001'de yalnız işletme-üyesi politikası vardı (business_media_write_member);
--    admin satır ekleyip silemesindi (video_assets_admin deseniyle aynı).
drop policy if exists business_media_admin on public.business_media;
create policy business_media_admin on public.business_media for all
  using (public.is_admin())
  with check (public.is_admin());

-- 4) video_assets: işletme-üyesi UPDATE (storyboard sahne görseli set etmek için).
--    0009 yalnız INSERT eklemişti; video_assets_admin (0001) zaten var.
drop policy if exists video_assets_member_update on public.video_assets;
create policy video_assets_member_update on public.video_assets
for update to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

-- ---------- doğrulama ----------
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'business-media') then
    raise exception 'business-media bucket oluşmadı';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'business_media' and policyname = 'business_media_admin') then
    raise exception 'business_media_admin politikası oluşmadı';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'video_assets' and policyname = 'video_assets_member_update') then
    raise exception 'video_assets_member_update politikası oluşmadı';
  end if;
end $$;
