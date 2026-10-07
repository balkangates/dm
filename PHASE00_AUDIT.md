# DAMPINGVAR — FAZ 00 — TAM PROJE AUDIT / OLD ARCHITECTURE MAP

Durum: kod DEĞİŞTİRİLMEDİ (Faz 0 kuralı). Yalnızca bu rapor eklendi.

## 1. Proje özeti
- Next.js 16.2.6, React 19.2.6, TypeScript 5.9.3, Tailwind 4.1.17
- 21 route (16 sayfa + 7 API), server action yok, `src/proxy.ts` (oturum yenileme)
- Doğrulama: `tsc --noEmit` PASS · `next build` PASS (DATABASE_URL'siz) · `eslint` 3 error + 7 warning (baseline)

## 2. Önceki çalışmadan gelen durum (bu prompt'un faz numaralarına göre)
| Prompt fazı | Mevcut durum | Not |
|---|---|---|
| Faz 1 Supabase Foundation | KISMEN VAR | `client.ts`, `server.ts`, `admin.ts` (server-only), `proxy.ts` mevcut. `types.ts` yok. Hiçbir iş kodu bu client'ları KULLANMIYOR. Gerçek proje ile test edilmedi. |
| Faz 2 Schema Migration | VAR | 4 migration (29 tablo, CHECK/FK/index, referans veri, deny-by-default RLS). Policy yok, RPC yok. Bu fazda yeniden doğrulanacak. |
| Faz 3-5 Drizzle/pg kaldırma | YAPILMADI | Tüm runtime hâlâ Drizzle + pg. |

## 3. OLD ARCHITECTURE MAP
Eski runtime: `Next.js → drizzle-orm → pg Pool → DATABASE_URL → PostgreSQL`

### 3.1 Legacy dosyalar
| Dosya | Rol |
|---|---|
| `src/db/index.ts` | `new Pool`, `drizzle()`, `DATABASE_URL`/`DIRECT_URL`/`DB_POOL_MAX`; `db` ve `pool` Proxy export |
| `src/db/schema.ts` (488 sat.) | 29 tablo Drizzle tanımı + tip kaynağı |
| `drizzle.config.ts` | `DIRECT_URL`/`DATABASE_URL` |
| `src/lib/env.server.ts` | `requireDatabaseUrl()`, `getServerEnv().databaseUrl` |
| `src/lib/env.ts` | yalnızca yorum satırında DATABASE_URL |
| `scripts/verify-db.ts` | PGlite + `DATABASE_URL` ile eski runtime doğrulaması (Faz 3'te Supabase tabanlı doğrulamaya taşınmalı) |
| `package.json` | `pg`, `drizzle-orm`, `drizzle-kit`, `@types/pg` (+ PGlite devDep) |

### 3.2 `@/db` import eden dosyalar (15) ve kullanım yoğunluğu
| Dosya | db.* çağrısı | Not |
|---|---|---|
| `src/lib/finance.ts` | 30 | **2 × `db.transaction`** (`completeSale` L173, `reverseTransaction` L502); `FOR UPDATE` raw SQL; `balance + x` atomik güncellemeler → RPC şart |
| `src/lib/seed.ts` | 32 | demo seed; raw SQL L342, L717 |
| `src/lib/queries.ts` | 25 | 20 export; raw SQL L157; `getPool()` (damping_pool okuma, `pg` Pool DEĞİL, ad çakışması) |
| `src/app/admin/page.tsx` | 11 | admin görünümü, doğrudan DB |
| `src/app/api/campaigns/route.ts` | 9 | insert/select |
| `src/app/api/ai/route.ts` | 5 | insert/delete içerik + plan |
| `src/app/api/kasa/route.ts` | 5 | satış/iade endpoint'i |
| `src/app/page.tsx` | 4 | ana sayfa |
| `src/app/panel/ayarlar/page.tsx` | 2 | |
| `src/app/api/admin/route.ts` | 3 | update |
| `src/app/api/business/route.ts` | 1 | update |
| `src/app/api/health/route.ts` | 1 | `select 1` (Supabase ping'e dönecek) |
| `src/app/panel/kasa/page.tsx` | 1 | |
| `src/app/isletme/[slug]/page.tsx` | schema import | |
| `src/lib/auth.ts` | 1 | `business_staff` e-posta eşleşmesi |

### 3.3 Caller haritası — `src/lib/queries.ts`
| Fonksiyon | Caller |
|---|---|
| getBusinesses | panel/{ai,kasa,kampanyalar,plan,page,damping-hane,performans,musteriler,ayarlar,vitrin,hakedis} |
| getBusinessBySlug | isletme/[slug], api/ai, lib/panel |
| getBusinessBundle | isletme/[slug], panel/{kasa,kampanyalar,page,performans,ayarlar,vitrin}, lib/panel, lib/snapshot |
| getBusinessStats | api/ai, panel/{page,performans,hakedis}, lib/snapshot |
| getLatestTransactions | panel/{kasa,page,hakedis} |
| getBusinessCustomers | panel/musteriler |
| getWallets | admin, panel/damping-hane |
| getWalletLedger | panel/damping-hane |
| getPool | panel/damping-hane |
| getPoolLedgerByBusiness | admin, panel/damping-hane, panel/hakedis |
| getAdPerformance | panel/performans |
| getPlanForBusiness | panel/plan |
| getAiContents | panel/ai |
| recordEvent | api/events |
| **Caller'ı olmayan (ölü kod, silinecek):** getBusinessById, getAdminOverview, getReferralsFor, getBusinessesByIds, getBusinessStaff | — |

### 3.4 Caller haritası — `src/lib/finance.ts`
| Fonksiyon | Caller |
|---|---|
| priceTransaction, validateCampaignUsage | api/kasa |
| completeSale | api/kasa, scripts/verify-db |
| reverseTransaction | api/kasa, scripts/verify-db |
| logAudit | api/ai, api/admin, api/business, api/campaigns |
| discountFor, commissionBaseFor, latestTransactions | caller yok / yalnızca içeride |

### 3.5 Transaction envanteri (Faz 9/11 kararı)
| Yer | Karar |
|---|---|
| `completeSale` (QR kilidi, kampanya limiti, cüzdan kilidi, komisyon, havuz, referral, ledger) | **Security-sensitive RPC** (`complete_sale`), `service_role` ile yalnızca sunucudan |
| `reverseTransaction` | **Security-sensitive RPC** (`reverse_transaction`) |
| kampanya `redemptions + 1` | RPC içine |
| diğer CRUD (campaigns, business update, ai_contents) | Supabase query |

### 3.6 Auth / yetki modeli (Faz 7-9'da kaldırılacak)
- `src/lib/panel.ts`: `?biz=` ve `?rol=` URL parametresinden işletme ve rol; sahte e-posta (`sahip@<slug>.com`) üretir. **Yetkilendirme kaynağı URL.**
- `src/lib/auth.ts`: `resolveActor(businessId, email)` — e-posta istemci body'sinden (`actorEmail`) geliyor, oturum doğrulaması YOK.
- `actorEmail` kullanan istemci bileşenleri: KasaClient, CampaignForm, ProfileForm, AiStudio (+ PanelShell `biz/rol` linkleri).
- `/api/events` istemciden `transaction_completed`, `damping_earned`, `damping_spent` kabul ediyor (Faz 16'da kapatılacak).
- Supabase Auth: yalnızca `proxy.ts` oturum yeniler; login/logout sayfası YOK, `business_staff` ↔ `auth.users` bağı YOK.

### 3.7 Env kullanımı
`DATABASE_URL` (db/index, env.server, drizzle.config, verify-db), `DIRECT_URL` (db/index, drizzle.config), `DB_POOL_MAX`, `ALLOW_DEMO_SEED`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.

### 3.8 Global legacy arama sonucu (Faz 0 başlangıcı)
Beklenen NONE, **bulunan: 33 dosya** (aşağıdaki sayılar kaynak + config, rapor md'leri hariç):
`from "pg"` 1 · `drizzle-orm` 17 · `drizzle-kit` 3 · `new Pool` 1 · `drizzle(` 1 · `db.transaction` 1 (2 çağrı) · `db.select` 11 · `db.insert` 5 · `db.update` 3 · `db.delete` 1 · `DATABASE_URL` 5 kod dosyası · `DIRECT_URL` 2.

### 3.9 Diğer bulgular (ilgili fazlarda ele alınacak)
- AI: `src/lib/ai.ts` (563 sat.) şablon/kural tabanlı; sağlayıcı soyutlaması, tool registry, policy engine yok (Faz 18-31).
- RLS: tüm tablolarda açık, policy yok → anon/authenticated hiçbir şey okuyamaz. Supabase client'a geçişte policy ya da server-side admin client kararı gerekecek (Faz 8).
- Realtime / Storage: kullanılmıyor (next.config'te yalnızca görsel host'u).
- Review/sentiment, performance engine, organic ranking, mentor, 28 günlük pazarlama: `marketing_plans` var; diğerleri yok.
- Hardcoded `+2840/+940/+210/+94` metrikleri: kodda bulunamadı.
- `tsconfig.tsbuildinfo` repoda (cache; ZIP'ten çıkarıldı).

## 4. Önerilen faz sırası (onayınıza sunulur)
Faz 01 → mevcut foundation'ı tamamla (`types.ts`, bağlantı testi, `.env.example`) · Faz 02 → şema doğrulaması · **Faz 03 → 15 dosyanın Supabase'e taşınması + RPC (en büyük faz; `finance.ts` ayrı alt-checkpoint önerilir)** · Faz 04 caller · Faz 05 silme.
