# FAZ 02 — DATABASE / SCHEMA MIGRATION — RAPOR

Başlangıç: DampingVar-Phase-01-Supabase-Foundation.zip. Dashboard değişikliği YOK; tüm değişiklik `supabase/migrations/` içinde.

## 1. Prompt tablo listesi ↔ gerçek tablolar
| Prompt | Gerçek tablo(lar) |
|---|---|
| businesses | businesses, business_hours, business_media, business_services, products |
| business_staff | business_staff |
| business_contracts | business_contracts, packages |
| campaigns | campaigns |
| qr_codes | qr_codes |
| wallet | damping_wallets, users |
| ledger | wallet_ledger, store_transactions |
| pool | damping_pool, pool_ledger |
| referrals | referrals |
| rewards | referral_rewards |
| settlements | settlements |
| analytics | analytics_events |
| AI | ai_contents, ai_settings |
| marketing | marketing_plans, marketing_plan_days |
| ads | ad_campaigns, ad_events |
| reviews | reviews (yalnızca 6 kolon; Faz 17'de genişletilecek) |
| (ek) | audit_logs, fraud_reviews |
Prompt listesindeki hiçbir kalem eksik değil: 29 tablonun hepsi var.

## 2. Denetim bulguları
- Drizzle `schema.ts` ↔ migration'lar: 29 tablo, 275 kolon, **drift 0**, migration'da olup Drizzle'da olmayan tablo yok (tek seferlik denetim; Drizzle Faz 05'te silinecek).
- 16 indekssiz FK → düzeltildi.
- `prevent_mutation()` sabit `search_path` yoktu → düzeltildi.
- Supabase Auth ↔ uygulama kullanıcısı bağı yoktu → eklendi.
- PK'siz tablo yok, 29/29 tabloda RLS açık, policy yok (Faz 8).

## 3. Yeni migration: `20261007120000_schema_hardening_auth_link.sql`
1. 16 FK indeksi (`CREATE INDEX IF NOT EXISTS`).
2. `ALTER FUNCTION prevent_mutation() SET search_path = ''`.
3. `business_staff.auth_user_id` ve `users.auth_user_id` (nullable, unique; `auth.users` varsa FK `ON DELETE SET NULL`, yoksa FK atlanır).
Veri kaybı riski yok; mevcut satırlar bozulmaz. Geri alma adımı migration başlığında.

## 4. Testler
| Test | Sonuç |
|---|---|
| `npm run db:schema` (20 kontrol, düz PG + Supabase-benzeri: auth.users, anon/authenticated rolleri) | PASS |
| `npm run db:verify` (eski akış regresyonu: 5 migration, seed, satış, iade, bütünlük kuralları) | PASS |
| `types.ts` migration'larla güncel (`db:types` farksız) | PASS |
| `tsc --noEmit` | PASS |
| `npm run supabase:verify` | PASS |
| `next build` | PASS |
| `eslint` | 3 error + 7 warning (baseline ile aynı) |

## 5. Bilerek YAPILMAYANLAR
- RLS policy / GRANT (Faz 8), finansal RPC'ler (Faz 11), reviews genişletmesi (Faz 17), performans/AI/mentor tabloları (Faz 19-30): ilgili fazlarda, o fazın ihtiyacıyla birlikte eklenecek.
- Gerçek Supabase'e `db push` yapılmadı (proje bilgisi yok). Migration'lar PGlite üzerinde doğrulandı; ilk gerçek uygulama sırasında `supabase db push` ile denenmeli.

## 6. Legacy durumu
Faz 01 ile aynı (src/db/*, drizzle.config.ts, pg/drizzle bağımlılıkları, verify-db.ts). Caller migration Faz 03-04, silme Faz 05.
