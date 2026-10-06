# FAZ 2 — DATABASE MIGRATION — RAPOR

## Sonuç
Mevcut Drizzle şeması `supabase/migrations/` altında sürümlü migration'lara taşındı. 29 tablonun tamamı korundu; hiçbir tablo/kolon silinmedi veya yeniden adlandırılmadı. Uygulama kodunun kolon/tablo erişimi değişmedi.

| Dosya | İçerik |
|---|---|
| `20261006120000_init_schema.sql` | `drizzle-kit generate` ile üretilen BASELINE: 29 tablo, 31 FK, PK/unique/default/timestamp/nullable birebir |
| `20261006120100_integrity_constraints.sql` | Audit §3 bulguları: CHECK'ler, eksik FK'ler, unique'ler, index'ler, append-only trigger'lar |
| `20261006120200_reference_data.sql` | Zorunlu sistem verisi: 3 paket, AI ayarları, `GLOBAL` havuz satırı (idempotent) |
| `20261006120300_rls_deny_by_default.sql` | Tüm tablolarda RLS açık, anon/authenticated yetkileri kapalı (policy'ler Faz 4) |

## Kararlar (bilerek)
1. **Enum yerine CHECK.** Durum alanları pg ENUM yapılmadı; aynı garantiyi CHECK verir, Faz 8-11/17'de yeni durum eklemek tek `ALTER` ile olur ve Drizzle'daki `text` tipleri/uygulama kodu bozulmaz.
2. **Deny-by-default RLS şimdiden.** Faz 1'de anon key istemciye gidiyor; Supabase public tabloları varsayılan olarak Data API'ye açar. Policy yazılana kadar (Faz 4) hiçbir tablo anon/authenticated ile erişilebilir olmasın diye bu migration Faz 2'ye alındı. Uygulama sunucusu `postgres`/service_role ile bağlandığı için etkilenmez.
3. **Finansal geçmiş silinemez.** `store_transactions`, `settlements`, `damping_wallets`, `wallet_ledger` FK'leri `CASCADE` → `RESTRICT`. Kodda bu tablolara cascade silme yapan hiçbir yer yoktu (arandı), davranış değişmez; yalnızca yanlışlıkla silme engellenir. **Bu, "cascade davranışları korunsun" kuralından bilinçli bir sapmadır.**
4. **Seed ayrıldı.** Production'da boş DB'ye demo işletme basılmaz (`ALLOW_DEMO_SEED=true` ile açılabilir); zorunlu sistem verisi artık migration'da. Seed'in paket/ayar/havuz eklemeleri `onConflictDoNothing` oldu.
5. `schema.ts` tip kaynağı olarak kaldı; yeni CHECK/unique'ler yalnızca migration'da. Kolon/tablo değişikliği olursa iki yer birlikte güncellenmeli.

## DB seviyesinde yeni garantiler
- Negatif cüzdan bakiyesi ve negatif ortak havuz imkansız (Audit F-1/F-3 için DB desteği; havuz-destekli ödül mantığı Faz 9'da).
- Bir işlem en fazla bir kez iade edilebilir (`reversal_of` unique).
- Normal işlemler negatif tutar taşıyamaz; yalnızca iade satırları ters işaretli olabilir.
- `wallet_ledger`, `pool_ledger`, `audit_logs` append-only (UPDATE/DELETE reddedilir).
- Tek seviye referral: bir kullanıcı yalnızca bir kez davet edilmiş olabilir; aynı işlem için aynı referral'a ikinci ödül yazılamaz.
- İşletme başına tek aktif sözleşme, (işletme, gün) ve (işletme, e-posta) tekilliği, plan/paket kodları `packages` tablosuna FK.
- Eksik FK'ler: `users.referred_by`, `referrals.*`, `referral_rewards.inviter_id`, `wallet_ledger.user_id`, `qr_codes.transaction_id`, `store_transactions.reversal_of`, `fraud_reviews.user_id`.

## Doğrulama (`npm run db:verify`, yeni araç)
Bellekte gerçek Postgres (PGlite) üzerinde:
- 4 migration sırayla uygulandı ✅ · 29 tablo ✅ · RLS tüm tablolarda açık ✅ · referans veri ✅
- Dev seed kısıtlara takılmadan yüklendi (6 işletme, 156 işlem) ✅
- `completeSale` → `reverseTransaction` akışı çalışıyor, havuz negatif değil, çift iade reddediliyor ✅
- 8 DB kuralı negatif testi (negatif bakiye, negatif havuz, append-only ×2, geçersiz rating/durum, finansal geçmişli işletme silme, çift davet) ✅
- `tsc` ✅ · `next build` ✅ · `eslint`: 3 error + 7 warning, **Faz 0 baseline ile aynı** (Faz 2 yeni uyarı eklemedi)

## Doğrulanamayanlar
- Gerçek Supabase projesinde `db push` ve anon key ile Data API'nin kapalı olduğu denenmedi (proje bilgisi yok). PGlite'ta `anon`/`authenticated` rolleri olmadığı için REVOKE bloğu yalnızca koşullu dallanması doğrulandı; ilk `db push` sonrası `https://<ref>.supabase.co/rest/v1/businesses` isteğinin boş/403 dönmesi elle kontrol edilmeli.
- Canlı veri taşıma yapılmadı: "gerçek veri var mı" sorusuna tercih verilmediği için **temiz kurulum** varsayıldı.

## Değişen dosyalar
Yeni: `supabase/migrations/*` (4), `scripts/verify-db.ts`, bu rapor. Değişen: `src/lib/seed.ts` (production kapısı + onConflict), `src/db/index.ts` (`DB_POOL_MAX`), `package.json` (`db:verify`, devDependency: pglite, pglite-socket, tsx).
