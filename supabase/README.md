# supabase/

Şema değişikliklerinin TEK kaynağı `supabase/migrations/` klasörüdür (Faz 2'den itibaren).

## Akış
```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npm run db:new -- <isim>     # yeni migration dosyası
npm run db:push              # uzak projeye uygula
npm run db:diff -- -f <isim> # Dashboard'dan elle yapılan değişikliği dosyaya al
```
Dashboard'dan elle şema değişikliği YAPMAYIN; "dosyasız değişiklik" birikir.

## Yeni tablo kuralı (CHECKLIST_NEW_TABLE)
Her yeni `public` tablosu için, aynı migration dosyasında ve `BEGIN…COMMIT` içinde:
1. `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`
2. En az bir SELECT policy (`DROP POLICY IF EXISTS` ile başlayarak, idempotent).
3. GRANT yalnızca gerekli role/işleme. `anon`'a bilinçli sebep olmadan GRANT yok. Yazma bir
   SECURITY DEFINER RPC üzerinden yapılıyorsa `authenticated`'a INSERT/UPDATE/DELETE GRANT verilmez.
4. Doğrulama notu: pozitif (yetkili görür) + negatif (başka işletme GÖRMEZ) test.

RLS açık + GRANT yok → tablo görünmez (işlevsel hata). RLS kapalı + GRANT var → HERKES okur (güvenlik açığı).
İkisini de kontrol edin.

## Anahtarlar
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` tarayıcıya gidebilir; erişim RLS ile sınırlıdır.
- `SUPABASE_SERVICE_ROLE_KEY` yalnızca sunucuda (`src/lib/supabase/admin.ts`, `server-only`). Vercel'de "Sensitive" olarak işaretleyin.
