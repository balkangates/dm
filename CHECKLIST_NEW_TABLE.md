# Yeni Tablo Checklist'i

Her yeni `public` şema tablosu oluşturulduğunda, tabloyu kullanan koda geçmeden önce **sırayla** aşağıdaki 4 adım tamamlanmalı. Bu checklist, `store_order_invoices`/`delivery_notes` tablolarının GRANT'siz kaldığı ve canlı sohbet tablolarının 7 farklı fix denemesi gerektirdiği hatalardan sonra eklendi — amacı aynı hata sınıfının bir daha yaşanmamasıdır.

> Kural: RLS ve GRANT'i **aynı transaction'da** (`BEGIN...COMMIT`), aynı dosyada yapın. İkisini ayrı ayrı, ayrı zamanlarda çalıştırmayın — arada "GRANT var ama RLS henüz kapalı" gibi geçici bir sızıntı penceresi oluşabilir.

---

## 1) RLS'i aç

```sql
ALTER TABLE public.<tablo_adi> ENABLE ROW LEVEL SECURITY;
```

- Bu satır olmadan tablo, GRANT verilirse **herkese açık** demektir.
- Tabloyu şimdilik hiçbir policy yazmadan RLS açık bırakmak sorun değil — varsayılan davranış "hiç satır dönmez"tir (bkz. Adım 2).

## 2) En az bir SELECT policy yaz

```sql
DROP POLICY IF EXISTS <tablo_adi>_<rol>_read ON public.<tablo_adi>;
CREATE POLICY <tablo_adi>_<rol>_read ON public.<tablo_adi> FOR SELECT
USING (
  -- Örnek: sadece ilgili mağaza sahibi veya siparişi veren müşteri okusun
  EXISTS (
    SELECT 1 FROM public.store_orders so
    JOIN public.stores st ON st.id = so.store_id
    WHERE so.id = <tablo_adi>.order_id
      AND (st.owner_id = auth.uid() OR so.customer_id = auth.uid())
  )
);
```

- `DROP POLICY IF EXISTS` ile başlayın — dosya tekrar çalıştırılabilir (idempotent) olsun.
- Policy adını `<tablo_adi>_<rol>_read` gibi açıklayıcı yazın; ileride "bu policy neyi kapsıyor" sorusuna dosya adından cevap verilebilsin.
- Sadece SELECT yetiyorsa sadece SELECT policy yazın; INSERT/UPDATE/DELETE gerekiyorsa (Adım 3'teki GRANT ile birlikte) ayrı policy'ler ekleyin.

## 3) GRANT ver — sadece gerekli role, sadece gerekli işleme

```sql
GRANT SELECT ON public.<tablo_adi> TO authenticated;
-- Sadece client'tan yazma gerekiyorsa (RPC/SECURITY DEFINER üzerinden
-- DEĞİL, doğrudan .insert()/.update() ile) ek olarak:
-- GRANT INSERT, UPDATE ON public.<tablo_adi> TO authenticated;
```

Kurallar:
- **`anon` rolüne varsayılan olarak GRANT vermeyin.** Sadece girişsiz kullanıcıların gerçekten görmesi gereken açık/genel veriler için (ör. herkese açık ürün kataloğu) bilinçli olarak ekleyin.
- Tabloya yazma **sadece bir `SECURITY DEFINER` RPC üzerinden** yapılacaksa (bkz. `create_order_documents()` örneği), `authenticated` rolüne INSERT/UPDATE/DELETE GRANT **vermeyin** — fonksiyon kendi yetkisiyle yazar, client'a doğrudan yazma yüzeyi açmaya gerek yok.
- RLS açık ama GRANT eksikse: PostgREST tabloyu **hiç göremez** (RLS'nin açık/kapalı olması fark etmez). RLS kapalı ama GRANT varsa: **herkes her satırı okur**. İkisi de ayrı hata sınıflarıdır, ikisini birden kontrol edin (bkz. `fixes/audit_grants_vs_rls.sql`).

## 4) Idempotent dosya olarak kaydet + bu checklist'e link ver

- Adım 1-3'ü **tek bir SQL dosyasında**, `supabase/migrations/<timestamp>_<tablo_adi>_rls.sql` altına kaydedin (migration sistemi henüz kurulmadıysa geçici olarak `fixes/fix_<tablo_adi>_rls.sql`).
- Dosyanın başına şu formatta bir başlık ekleyin:

  ```sql
  -- =====================================================================
  -- <dosya_adi>.sql
  -- Bu dosya CHECKLIST_NEW_TABLE.md'nin (supabase/CHECKLIST_NEW_TABLE.md)
  -- 4 adımını <tablo_adi> için uygular.
  -- =====================================================================
  ```

- Dosyanın tamamı `BEGIN;` ile başlayıp `COMMIT;` ile bitmeli (bkz. yukarıdaki kural).
- Doğrulama adımını dosyanın sonuna not olarak ekleyin: "uygulamadan X sayfasını açıp Y'nin göründüğünü doğrulayın" + "farklı bir kullanıcıyla Z'nin GÖRÜNMEDİĞİNİ doğrulayın" (pozitif + negatif test — sadece "çalışıyor" değil, "izole ediyor" da doğrulanmalı).

---

## Hızlı kontrol listesi (kopyala-yapıştır)

```
[ ] ALTER TABLE ... ENABLE ROW LEVEL SECURITY
[ ] En az bir SELECT policy (DROP POLICY IF EXISTS ile başlıyor)
[ ] GRANT — sadece gerekli role (authenticated), sadece gerekli işleme
    [ ] anon'a bilinçli bir sebep olmadan GRANT verilmedi
    [ ] Yazma bir SECURITY DEFINER RPC üzerindense authenticated'a
        INSERT/UPDATE/DELETE GRANT verilmedi
[ ] Tek dosyada, BEGIN...COMMIT içinde, idempotent (DROP IF EXISTS)
[ ] supabase/migrations/ (veya geçici olarak fixes/) altına kaydedildi
[ ] Doğrulama notu eklendi (pozitif + negatif test)
[ ] fixes/audit_grants_vs_rls.sql tekrar çalıştırılıp bu tablonun
    artık "OK" çıktığı teyit edildi
```

---

*İlgili dosyalar: `fixes/audit_grants_vs_rls.sql` (mevcut durumu tarar), `fixes/fix_invoice_delivery_note_rls_v2.sql` (bu checklist'in uygulanmış örneği).*
