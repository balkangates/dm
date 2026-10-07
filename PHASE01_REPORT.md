# FAZ 01 — SUPABASE FOUNDATION — RAPOR

Başlangıç noktası: DampingVar-Phase-00-Audit.zip (çalışma ağacı ile birebir aynı doğrulandı).

## Yapılanlar
- `src/lib/supabase/types.ts` (YENİ, otomatik üretilir): 29 tablo / 41 FK, migration'lardan PGlite ile `npm run db:types`.
- `client.ts`, `server.ts`, `admin.ts` artık `Database` tipiyle tipli. `admin.ts` `server-only` korumalı (değişmedi).
- `env.server.ts`: `DATABASE_URL` okuyan `requireDatabaseUrl()` ve `databaseUrl` KALDIRILDI (caller yoktu). `env.ts` yorumu temizlendi.
- `.env.example` (DATABASE_URL/DIRECT_URL YOK) ve `.gitignore` eklendi (`.env*` hariç, `.env.example` dahil).
- `src/app/api/health/supabase/route.ts` (YENİ): yalnızca boolean döner (`env`, `session`, `admin`).
- `scripts/verify-supabase.ts` + `npm run supabase:verify`; `scripts/gen-supabase-types.ts` + `npm run db:types`.
- Legacy dosyalara `LEGACY MIGRATION ONLY / REMOVE IN PHASE 05` başlığı (§49): `src/db/index.ts`, `src/db/schema.ts`, `drizzle.config.ts`.
- `src/db/index.ts` SİLİNMEDİ (prompt Faz 1 kuralı); caller migration Faz 03-04.

## Testler
| Test | Sonuç |
|---|---|
| `npm run supabase:verify` (12 kontrol: env yokken net hata, browser anon key, admin service role, geçersiz/geçerli token, 'use client' dosyalarında admin import yok) | PASS |
| `next start` + sahte Supabase: oturumsuz → `session:false`; geçerli `sb-*` çerezi → `session:true` (server client + cookie okuma); geçersiz token → `session:false`; admin client → `admin:true` | PASS |
| Hiç env yokken build | PASS |
| Hiç env yokken çalışma: health → 503 `env:false`; çerezli istekte proxy düşmüyor | PASS |
| Service role key / env adı `.next/static` içinde | YOK |
| `tsc --noEmit` | PASS |
| `eslint` | 3 error + 7 warning (Faz 0 baseline ile aynı, yeni uyarı yok) |

## Legacy durumu (REMAINING LEGACY)
Beklenen: Faz 03-05'te kaldırılacak. `LEGACY COMPONENT | REASON | REMOVAL PHASE | STATUS`
- `src/db/index.ts`, `src/db/schema.ts` | 15 caller henüz taşınmadı | Faz 05 | AKTİF, işaretli
- `drizzle.config.ts` | drizzle-kit | Faz 05 | işaretli
- `pg`, `drizzle-orm`, `drizzle-kit`, `@types/pg` | eski runtime | Faz 05 | duruyor
- `scripts/verify-db.ts` (PGlite + DATABASE_URL) | eski runtime doğrulaması | Faz 03 | duruyor
- `DB_POOL_MAX`, `DATABASE_URL`, `DIRECT_URL` | yalnızca yukarıdaki legacy dosyalarda | Faz 05 | duruyor

## Doğrulanamayanlar
- Gerçek Supabase projesinde (gerçek Auth/JWT, Storage, Realtime) deneme yapılmadı: proje bilgisi yok. Testler sahte Supabase sunucusuyla yapıldı.
- Vercel production ortamı denenmedi (Faz 35).
