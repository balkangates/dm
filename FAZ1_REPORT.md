# FAZ 1 — SUPABASE TEMELİ — RAPOR

Referans: `dm-main` örnek projesi (yalnızca bağlantı/dosya yapısı desenleri alındı; o projenin bayi/tedarikçi/canlı yayın iş modeli alınmadı).

## Örnekten alınan desenler → bu projedeki karşılığı
| Örnek (dm-main) | Burada |
|---|---|
| `lib/supabase/client.ts` (`createBrowserClient`) | `src/lib/supabase/client.ts` |
| `lib/supabase/server.ts` (cookies getAll/setAll) | `src/lib/supabase/server.ts` |
| `lib/supabase/admin.ts` (service role, yorumla korunuyor) | `src/lib/supabase/admin.ts` + **`server-only`** ile yapısal koruma |
| `middleware.ts` (oturum yenileme + rol kapısı) | `src/proxy.ts` + `src/lib/supabase/proxy.ts` (Next 16'da middleware → proxy). Yalnızca oturum yenileme; rol kapısı Faz 3 |
| `supabase/` + `db:*` script'leri, `CHECKLIST_NEW_TABLE.md` | `supabase/config.toml`, `supabase/migrations/`, `supabase/README.md` (checklist dahil), `package.json` db:* script'leri |
| `tests/rls` + production koruma kilidi | Faz 4/25'e bırakıldı |

## Değişen / eklenen dosyalar
Yeni: `src/lib/env.ts`, `src/lib/env.server.ts`, `src/lib/supabase/{client,server,admin,proxy}.ts`, `src/proxy.ts`, `supabase/{config.toml,README.md,migrations/.gitkeep}`, `.env.example`, `.gitignore`, `drizzle.config.ts`, `AUDIT_REPORT.md`, bu rapor.
Değişen: `src/db/index.ts` (lazy bağlantı, Proxy ile aynı `db`/`pool` API'si), `next.config.ts` (Supabase Storage görsel host'u), `package.json` (bağımlılıklar, db:* script'leri, ad).
Silinen: `drizzle.config.json` (sabit yerel şifre içeriyordu).
Dokunulmayan: tüm UI, route'lar, iş mantığı (finance/queries/ai).

## Audit bulguları — durum
- O-3 build `DATABASE_URL`'siz kırılıyor → **çözüldü** (build geçiyor).
- O-2 sabit şifre `drizzle.config.json` → **çözüldü**.
- O-10 `package.json` adı → **çözüldü**.
- Service role key: yalnızca sunucu, `server-only`; build çıktısında `.next/static` içinde izine rastlanmadı.

## Doğrulama
- `tsc --noEmit` ✅
- `next build` ✅ (öncesi ❌; `DATABASE_URL` ve Supabase değişkenleri olmadan)
- `eslint`: 3 error + 7 warning — **Faz 0'daki baseline ile aynı**, bu faz yeni uyarı eklemedi. Hatalar `src/app/page.tsx` 128/141/387 (`'` kaçışı); Faz 1 kapsamı dışı olduğu için dokunmadım.
- Proxy çalışma testi: Supabase değişkeni yokken ve sahte `sb-` çerezli istekte istek düşmüyor.
- Test altyapısı henüz yok (Faz 25).

## Kapsam dışı kalan / gerçek proje gerektiren
- Gerçek Supabase projesine bağlanıp login/Storage/Realtime denemesi yapılmadı (proje bilgisi yok). `.env.local` doldurulunca çalışır.
- Storage bucket'ları ve Realtime publication'ları Faz 2'de migration olarak eklenecek.

## Faz 2 için kararlar (onay isteniyor)
1. Supabase CLI ile `supabase/migrations/0001_init.sql` — mevcut Drizzle şemasından üretilecek (örnekteki `db pull` yaklaşımı, canlı veri olmadığı için burada gerekmiyor).
2. Üretimde gerçek veri varsa bunu bana söyle; ona göre veri taşıma adımı eklerim.
