# DAMPINGVAR PHASE REPORT — M3 Şema Migration

**PHASE:** M3  **STATUS:** COMPLETED_PENDING_APPROVAL

## ÖNEMLİ: Bu faz sonunda canlı uygulama HÂLÂ Supabase'e bağlı DEĞİL
Eski `src/db` + `pg` + Drizzle kodu çalışmaya devam ediyor (veri katmanı M6-M8'de taşınacak).
Bu faz **Supabase tarafındaki tabloları hazırlar**; Vercel'deki uygulamanın bunları kullanması M6'dan sonra olur.

## Üretilen dosyalar (şema kaynağı artık SQL)
| Dosya | İçerik |
|---|---|
| `supabase/migrations/20261010000100_init_schema.sql` | 29 tablo, 31 FK, 12 indeks. `drizzle-kit generate` ile **otomatik** üretildi (elle yazılmadı) |
| `supabase/migrations/20261010000200_integrity_and_rls.sql` | 18 CHECK, 3 append-only defter trigger'ı, 29 tabloda RLS, finans tablolarında istemci yazma yetkisi kaldırma |
| `supabase/tests/00_supabase_shim.sql` | **Yalnızca test:** düz PostgreSQL'i Supabase rolleriyle (anon/authenticated/service_role/authenticator) benzetir. Supabase'e UYGULANMAZ |

Migration 2 **eklemelidir**: veri silmez/değiştirmez.

## Davranış değişiklikleri (bilinçli, yalnızca reddi artıran)
1. **CHECK kısıtları** (durum sözlükleri). Kaynak: `schema.ts` yorumları. Kodda kullanılan tüm değerler bu kümelerin içinde (grep ile doğrulandı). `audit_logs.role` kısıtsız bırakıldı (kodda `SYSTEM` var).
2. **Defterler append-only:** `wallet_ledger`, `pool_ledger`, `audit_logs` → UPDATE/DELETE/TRUNCATE reddedilir. Kodda bu tablolara UPDATE/DELETE zaten yoktu. **Yan etki:** defter satırı olan bir işletme/kullanıcıyı silmek (CASCADE) artık engellenir. Bilinçli.
3. **RLS her tabloda açık, politika YOK** → `anon`/`authenticated` hiçbir satır görmez; `service_role` ve `postgres` aşar. **Politikalar M5'te.** Sonuç: M4 (auth) + M5 (RLS) olmadan, anon anahtarla hiçbir tablo okunamaz. Bu bilinçli bir güvenlik varsayılanıdır.
4. Finans/defter tablolarında `anon`/`authenticated` için INSERT/UPDATE/DELETE/TRUNCATE yetkisi kaldırıldı (RLS gevşek yazılsa bile yazamasınlar).

## Kapılar
| | |
|---|---|
| G1 tsc | PASS |
| G2 eslint | 3 error / 7 warning = baseline (yeni uyarı yok) |
| G4 test | **36/36** (migration şeması + PostgREST ile); 29/29 (Drizzle şeması ile) |
| Şema farkı | **0** — kolon/tip/null/varsayılan, PK/UNIQUE/31 FK, indeksler birebir aynı (Drizzle ↔ migration) |
| FINANCE PARITY | PASS — `completeSale`/`reverseTransaction`/paralel çift harcama snapshot'ları **migration şemasında da aynı** (CHECK+trigger+RLS mevcut akışı bozmadı) |
| G7 UI | PASS 28/28 — uygulama migration şemasıyla çalışırken baseline'la aynı |
| G3 build | PASS (önceki fazlarla aynı; kod değişmedi) |

### Gerçek REST yolu (supabase-js → PostgREST 16.4 → RLS → tablolar)
`createClient`/`createAdminClient` fabrikalarımız gerçek PostgREST'e karşı doğrulandı:
service_role tabloyu okur ve `case.ts` camelCase+Date dönüşümü çalışır · FK ilişkisi gömülü sorguya dönüşür (`campaigns → businesses`) · anon/authenticated **hata değil BOŞ sonuç** alır (sessiz boşluk riski T4 gerçekten böyle) · anon finans tablosuna yazamaz (`42501`) · service_role bile defteri değiştiremez · geçersiz durum reddedilir.
Öz-kontrol: JWT'yi yanlış sırla imzalayınca 7/7 test düşüyor (test boş geçmiyor).

## DOĞRULANAMAYANLAR
- **Gerçek Supabase projesine uygulanmadı.** Projenin bu ortamdan erişimi/kimlik bilgisi yok. SQL, düz PostgreSQL 16 + Supabase rol benzetimi + gerçek PostgREST üzerinde doğrulandı; Supabase'in kendi ekstra katmanları (Auth/GoTrue, Realtime, Storage, `supabase db push`) test edilmedi.
- Supabase Auth (GoTrue) yok; JWT'ler testte imzalandı.

## SİZİN YAPMANIZ GEREKENLER (Vercel / Supabase)
1. **Supabase projenizde zaten tablo var mı?** Migration 1 `CREATE TABLE` yapar; aynı adlı tablo varsa **hata verir** (ve mevcut canlı veriye dokunmamak için o durumda çalıştırmayın — mevcut şemanın dışa aktarımını (`supabase db dump --schema public`) bana gönderin, farkı çıkarayım).
2. Boş projeye uygulama: **SQL Editor**'de iki dosyayı sırayla yapıştırıp çalıştırın, **veya** `npx supabase login` → `npx supabase link --project-ref <REF>` → `npx supabase db push`.
3. **Vercel ortam değişkenleri:** `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` tanımlı. **`SUPABASE_SERVICE_ROLE_KEY` eklenmeli** (Production + Preview; "Sensitive" işaretleyin; asla `NEXT_PUBLIC_` önekiyle değil). `DATABASE_URL` M10'a kadar gerekli (eski kod), sonra silinecek.

## UNKNOWN (açık)
Canlı veri var mı · platform admin nasıl belirlenecek (claim mi tablo mu) · supplier/dealer rolü · MiMo tema dosyası · Supabase projesinde mevcut tablo var mı (yukarı bkz.).

## NEXT PHASE
M4 — Auth + güvenlik düzeltmeleri. ONAY bekleniyor.
