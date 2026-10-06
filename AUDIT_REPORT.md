# DampingVar — FAZ 0 AUDIT RAPORU

Kapsam: tüm repository (48 dosya, ~9.1K satır). Bu fazda **hiçbir kod davranışı değiştirilmedi**; yalnızca `npm install` yapıldı ve bu rapor eklendi.

## 0. Baseline ölçümleri

| Kontrol | Sonuç |
|---|---|
| `tsc --noEmit` | ✅ Temiz |
| `eslint .` | ❌ 3 error (`react/no-unescaped-entities`: `src/app/page.tsx` 128, 141, 387), 7 warning (`<img>`, custom font) |
| `next build` | ❌ `DATABASE_URL is required` — `src/db/index.ts` import anında throw ediyor; "Collecting page data" aşamasında patlıyor (Vercel build'i de aynı şekilde kırılır) |
| Test altyapısı | ❌ Yok (test dosyası, runner, script yok) |
| `.env*`, `supabase/`, migration klasörü | ❌ Yok |

Teknoloji: Next.js 16.2.6 (App Router, Turbopack), React 19.2, TypeScript strict, Drizzle ORM 0.45 + `pg`, Tailwind 4. Supabase, auth kütüphanesi, test kütüphanesi, LLM SDK'sı yok.

---

## 1. Çalışanlar (korunacak)

- **Veri modeli** (`src/db/schema.ts`): 25 tablo, parasal değerler integer kuruş, FK/cascade ve temel index'ler düşünülmüş.
- **Fiyatlandırma** (`finance.ts` `priceTransaction`, `discountFor`, `commissionBaseFor`): sunucuda hesaplanıyor, saf fonksiyon → kolay test edilir.
- **`completeSale`**: tek DB transaction, QR satırı `FOR UPDATE`, wallet `FOR UPDATE` (harcama varsa), audit kaydı, NEGATIVE_BALANCE guard'ı.
- **`reverseTransaction`**: ayrı negatif satır (`reversalOf`), ledger/pool/referral ters kayıtları, `FOR UPDATE`.
- **Rol matrisi** (`auth.ts` `can`): rol `business_staff` tablosundan okunuyor, istemci rolü kullanılmıyor (e-posta hariç, bkz. K-1).
- **Fraud sinyali**: self-referral / aşırı referral işaretleniyor, `fraud_reviews` kaydı açılıyor.
- **AI motoru** (`ai.ts`, `snapshot.ts`): şablon tabanlı, dış bağımlılığı yok; AI üretimleri DRAFT → APPROVED → PUBLISHED onay akışından geçiyor.
- **UI**: panel (11 modül), admin, keşif, işletme vitrini çalışır durumda ve korunacak.
- Paket fiyatları DB'de (koda gömülü değil), admin'den yönetiliyor.

---

## 2. Kritik hatalar ve güvenlik açıkları

### Kimlik / yetki (Faz 3, 4, 24)

| # | Bulgu | Yer | Etki |
|---|---|---|---|
| K-1 | **Gerçek authentication yok.** Panel kimliği `?biz=...&rol=...` URL parametresinden kuruluyor. `rol` doğrulanmıyor; `panelContext` sadece rol adına uyan personel satırını seçiyor. Herkes herhangi bir işletmeyi OWNER olarak açar. | `lib/panel.ts` | Tam yetki aşımı |
| K-2 | **`actorEmail` istemciden geliyor ve güven kaynağı.** `resolveActor` yalnızca e-postanın personel tablosunda olup olmadığına bakıyor; parola/oturum/imza yok. Panel HTML'i zaten e-postayı sayfaya gömüyor (`KasaClient`, `AiStudio`, `CampaignForm`, `ProfileForm`). | `lib/auth.ts`, tüm `api/*` | Biri sahibin e-postasını bilince (sayfada görünür) satış, iade, kampanya, ayar işlemi yapar |
| K-3 | **`/admin` sayfası ve `/api/admin` tamamen açık.** Auth kontrolü yok. `package_price` ve `fraud_resolve` herkes tarafından çağrılabilir; audit'e sabit `admin@dampingvar.com` yazılıyor (sahte aktör). `GET /api/admin` kullanıcı sayısı sızdırıyor. | `app/admin/page.tsx`, `api/admin/route.ts` | Paket fiyatı değiştirme, fraud kararı verme, tüm müşteri/wallet/audit verisini okuma |
| K-4 | **`ai` route: işletme-aktör bağı eksik.** `onayla/yayinla/reddet/sil` `contentId` ile işlem yapıyor ama içeriğin `actor`'ın işletmesine ait olduğu kontrol edilmiyor (IDOR). `sil` ayrıca `content.approve` yetkisi istemiyor — `ai.generate` olan herkes silebilir. | `api/ai/route.ts` 158-176 | Başka işletmenin içeriği onaylanır/silinir |
| K-5 | **`/api/kasa` iade (`iade`)**: `transactionId` işletmeye ait mi kontrol edilmiyor. Bir işletmenin MANAGER'ı başka işletmenin işlemini iade edebilir. | `api/kasa/route.ts` 77-84 | Cross-tenant finansal manipülasyon |
| K-6 | **`/api/kasa` `onizleme`** auth'suz; `GET /api/kasa?businessId=` auth'suz → herhangi birinin `businessId`'si ile işlemleri, **ilk 50 müşteriyi (ad/e-posta/telefon)** ve QR'ları okuması mümkün. | `api/kasa/route.ts` | PII sızıntısı, tenant izolasyonu yok |
| K-7 | **`/api/campaigns` `GET` ve `PUT` auth'suz.** `PUT` kodu çözerken `business`, `customer` (ad, e-posta, telefon), `wallet` bilgisini döndürüyor. QR kodu tahmin edilirse/biliniyorsa müşteri PII'si ve bakiyesi okunur. | `api/campaigns/route.ts` | PII sızıntısı |
| K-8 | **Damping Hane sayfası tüm kullanıcıların cüzdan/e-posta listesini herhangi bir işletme panelinde gösteriyor** (`getWallets()` filtresiz). | `panel/damping-hane/page.tsx`, `queries.ts getWallets` | Cross-tenant PII |
| K-9 | **Veritabanı erişim katmanı RLS'siz**; tek `pg` pool + tek yetkili kullanıcı. Tenant izolasyonu yalnızca uygulama kodundaki (eksik) kontrollere bağlı. | `db/index.ts` | Faz 4 gerekli |

### Finans (Faz 7, 8, 9, 11)

| # | Bulgu | Yer |
|---|---|---|
| F-1 | **Havuz-destekli ödül yok.** Ödül (`dampingEarnedCents`) satıştan türetiliyor, havuz bakiyesine bakılmıyor. Havuzdan düşme (`CONSUME`) yalnızca `poolContribution > 0` iken yapılıyor, bakiye kontrolü yok; havuz **negatif olabilir**. Kural ("havuzda olmayan parayı ödül olarak oluşturamaz") ihlal ediliyor. `finance.ts` 362-397 |
| F-2 | **Wallet güncellemesi kilitsiz.** Kilit (`FOR UPDATE`) yalnızca `dampingUseCents > 0` iken alınıyor. Harcama yoksa wallet satırı okunup `available + earned` ile **yazılıyor** (`finance.ts` 318-358) → eşzamanlı iki satışta **lost update**. Referral ödülü için inviter wallet'ı da kilitsiz okunup yazılıyor (434-456). |
| F-3 | **Wallet bakiyesi ledger'dan türetilmiyor**; `damping_wallets.available_cents` elle artırılıp azaltılıyor ve ledger ile tutarlılığı DB düzeyinde garanti edilmiyor. `CHECK (available_cents >= 0)` yok. |
| F-4 | **Bekleme (PENDING/RESERVED/EXPIRED) akışı kod olarak yok**; kazanç hemen `AVAILABLE`. Şemada `pendingCents/reservedCents` var ama hiç kullanılmıyor. |
| F-5 | **Kampanya kullanım limiti yarışı.** `usageLimit` ve `perCustomerLimit` sayımı kilitsiz `count(*)`; eşzamanlı satışlarda limit aşılır. `perCustomerLimit` hiç uygulanmıyor. `finance.ts` 236-241 |
| F-6 | **Müşteri kimliği yalnızca QR'dan çıkarılıyor.** QR'ın `customerId`'si çoğu zaman `null` (kampanya QR'ı) → satışta müşteri yok, kazanç/harcama/referral hiç çalışmıyor. Müşteri-QR eşlemesi tasarımsal olarak eksik (bkz. Q-1). |
| F-7 | **İade (reversal) NEGATIVE_BALANCE fırlatıyor** (`finance.ts` 569). Müşteri kazandığı damping'i harcamışsa iade tamamen **başarısız** olur — Faz 11 kuralının tam tersi. Ayrıca iade sonrası `available` hesaplanırken kilit yok. |
| F-8 | **İade çift sayım riski.** Orijinal işlem `REVERSED` yapılıyor *ve* negatif tutarlı yeni satır `REVERSED` olarak ekleniyor. `getAdminOverview` / `getBusinessStats` yalnızca `status` filtresine bakıyor; `getBusinessStats` `CANCELLED` dışındaki her şeyi (negatif satırlar + `REVERSED` orijinal) topluyor → ciro: orijinal (+) + iade (−) = 0 doğru görünse de, `transactionCount`, saatlik/günlük histogramlar ve tekrar müşteri oranı iade satırlarını da **işlem** olarak sayıyor. |
| F-9 | **Referral ters kaydı eksik.** İade `referralRewards` satırını `CANCELLED` yapıyor ama inviter wallet'ına yazılmış `REFERRAL` ledger/bakiye **geri alınmıyor**. |
| F-10 | **Referral:** `QUALIFIED` olmadan ödül yok ama `referrals` kaydını QUALIFIED yapan akış (kayıt/ilk alışveriş) kodda yok; yalnızca seed'de. Ödül her satışta tekrar veriliyor (ilk alışveriş sınırı yok). `referralRewards` durumları şemada `PAID` içeriyor, spec `QUALIFIED/RESERVED/...` istiyor. Referral ödülü havuzdan karşılanmıyor (F-1). Zincir (B→C ⇒ A) şu an kazara engelli ama kural testle garanti edilmiyor. |
| F-11 | **Makbuz numarası `Math.random()`**; benzersizlik çakışmasında satış hata verir, retry yok. |
| F-12 | **Kampanya kodu `Math.random()`** ile üretiliyor; `unique` çakışırsa 500. |
| F-13 | **Saat dilimi:** `validateCampaignUsage` sunucu yerel saatini (`getHours`, `getDay`) kullanıyor. Vercel UTC çalışır → "Europe/Istanbul" kampanya saatleri 3 saat kayar. |
| F-14 | **Idempotency yok.** Kasada çift tıklama / ağ tekrarı çift satış üretir. |
| F-15 | **`completeSale`'de `actorEmail`** yalnızca audit'e metin olarak yazılıyor; `cashier_id` (`transactions.cashierId`) hiç doldurulmuyor. |
| F-16 | **`/api/kasa onizleme`'de kullanım sayacı** (`campaign.redemptions`) kullanılıyor, `completeSale`'de ise işlem sayımı kullanılıyor — iki farklı kaynak, tutarsız doğrulama. |
| F-17 | **Admin `fraud_resolve`** işlemi `BLOCKED` olduğunda yalnızca işlem durumunu `FRAUD_REVIEW` yapıyor; wallet/pool/referral etkisi yok (finansal yan etkiler geri alınmıyor). |

### QR (Faz 6)

| # | Bulgu |
|---|---|
| Q-1 | **Kampanya başına tek QR** (`QR-<kampanyaKodu>`); ilk satışta `REDEEMED` oluyor ve **kampanya tüm müşteriler için kilitleniyor**. Offer / müşteri / oturum / redemption ayrımı yok. `campaigns/route.ts` 61-67, `finance.ts` 204-209 |
| Q-2 | **Müşteri QR'ı hiç oluşmuyor.** `QrOffer.tsx` istemcide `setCreated(true)` yapıp bir `qr_generated` *event* gönderiyor; veritabanında QR satırı yaratılmıyor. Ekranda gösterilen QR görseli **sahte** (matematiksel desen, taranabilir QR değil) ve gösterilen kod kampanya kodunun kendisi. |
| Q-3 | QR süresi (`expires_at`), tek kullanımlık offer, oturum/cihaz bağı, fraud kontrolü yok. |
| Q-4 | `qr_codes.campaign_id`, `customer_id` için `ON DELETE` davranışı tanımsız (varsayılan NO ACTION). `transaction_id` FK yok. |

### Analytics / event (Faz 12, 13)

| # | Bulgu |
|---|---|
| A-1 | **Sahte metrikler**: `queries.ts` 167-170 → `pageViews + 2840`, `campaignViews + 940`, `qrGenerated + 210`, `qrRedeemed + 94`. Bu değerler panel, performans, AI snapshot ve haftalık rapora akıyor. |
| A-2 | **Performans hunisi sabit oranlarla çiziliyor** (`panel/performans/page.tsx` 52-55: `1, 0.72, 0.42, 0.24`) — çubuk genişlikleri veriden gelmiyor. |
| A-3 | **`/api/events` herkese açık ve güvensiz**: `transaction_completed`, `qr_redeemed`, `damping_earned`, `damping_spent`, `referral_purchase` gibi **otorite** event'lerini herhangi bir istemci üretebilir; `businessId/userId/meta` doğrulanmıyor. Rate-limit, bot koruması, boyut sınırı yok. |
| A-4 | `getBusinessStats` son **600** işlemle sınırlı ve tüm hesap bellekte (JS) yapılıyor → ölçeklenmez, 600+ işlemden sonra metrikler yanlış. `newCustomers` aslında "benzersiz müşteri sayısı" (yeni değil). `repeatRate` formülü tutarsız. |
| A-5 | `campaigns.views/clicks` ve `adCampaigns.impressions/clicks` seed'de `Math.random()` ile dolduruluyor; gerçek event'ten türetilmiyor. `ad_events` hiç yazılmıyor. |
| A-6 | `getAdminOverview` tüm `transactions` tablosunu belleğe çekiyor (`allTx`) ve `recentTransactions` hatalı (`[txRows]` tek satır/boş dizi). |
| A-7 | Admin paneli tüm istatistikleri `txRows` (son 25 işlem) üzerinden hesaplıyor (`admin/page.tsx` ~60) → "toplam" etiketleri yanıltıcı. |

### AI (Faz 14-17, 21)

| # | Bulgu |
|---|---|
| AI-1 | `ai_usage` tablosu yok; token/maliyet/gecikme ölçümü yok. `GET /api/ai` sabit "local-template-engine" döndürüyor. |
| AI-2 | Snapshot reviews, müşteri, engagement, QR dönüşümünü içermiyor; stats'ın sahte kısmını (A-1) içeriyor → AI öneri gerekçeleri sahte veriye dayanıyor. |
| AI-3 | `plan` aksiyonu mevcut planı **siler** ve yenisini yazar; **transaction yok** (yarıda hata → plan/gün kaybı). Plan statik şablon (Faz 21 adaptif değil). |
| AI-4 | Yorum cevabı akışı, sentiment, şikayet, like/share/engagement tabloları yok; `reviews` tablosu minimal (moderasyon, durum, işletme cevabı yok). |
| AI-5 | `PUT /api/ai` auth'suz, `slug` ile işletme istatistiklerini döndürüyor. |
| AI-6 | Üretim kotası (`packages.aiQuotaMonthly`) hiç uygulanmıyor. |
| AI-7 | AI aksiyonlarının çoğu audit'e yazılmıyor (`sosyal`, `story`, `reklam`, `video`, `analiz`, `rapor`). |

### Sıralama / reklam (Faz 19)

- `getBusinesses()` `featured` ve `rating` ile sıralıyor; "En İyiler" için kalite skoru yok. `featured` ve `planCode` ile reklam/organik ayrımı henüz modellenmemiş (reklam alanı ayrı bir yerleşim değil). `DiscoveryBoard` sıralaması ve `ad_campaigns` kullanımı Faz 19'da netleştirilecek.

### Operasyonel / üretim riskleri

| # | Bulgu |
|---|---|
| O-1 | **Seed veritabanı sorgu yolunda çalışıyor** (`ensureSeeded` → `getBusinesses/getBusinessBySlug/getBusinessById`, `page.tsx`, `admin/page.tsx`). Production'da boş DB'ye demo veri basar; ilk istekte yarış koşulu; `ensureSeed` kendi içinde transaction'sız. |
| O-2 | **Versioned migration yok.** Şema yalnızca `schema.ts`; `drizzle.config.json` içinde yerel Postgres şifresi gömülü (`postgres:postgres@127.0.0.1`). |
| O-3 | `db/index.ts` modül yüklenirken `DATABASE_URL` yoksa throw → build kırılıyor (yukarıda doğrulandı). Pool için SSL, `max`, serverless (Vercel) bağlantı yönetimi yok; Supabase için pooler (6543) ve `prepare:false` ayarı gerekir. |
| O-4 | Security header/CSP yok, rate-limit yok, input doğrulama kütüphanesi (zod vb.) yok; her route `req.json()` ile elle ayrıştırıyor. Geçersiz JSON'da 500. |
| O-5 | `dangerouslySetInnerHTML` yalnızca `JSON.stringify(jsonLd)` için; `</script>` kaçışı yok → işletme adı/açıklamasına `</script>` yazılırsa **stored XSS** (`isletme/[slug]/page.tsx` 98). |
| O-6 | `business` PATCH tüm string alanları 1200 karaktere kırpıyor, ama URL/telefon/Instagram formatı doğrulanmıyor; `website`/`coverImage` değerleri `href`/`src` olarak render edilebilir (`javascript:` şeması denetlenmiyor). |
| O-7 | Hata yakalama/loglama yok; `try/catch` yalnızca `health`. `/api/health` DB hatasında ayrıntı vermiyor (iyi) ama herkese açık. |
| O-8 | Tüm sayfalar `force-dynamic`; cache/ISR kullanılmıyor (public keşif sayfası için maliyetli). |
| O-9 | `<img>` kullanımı ve harici görsel host'ları için `next.config.ts` boş. |
| O-10 | `package.json` adı hâlâ `nextjs-postgresql-template`; global pool anahtarı `__arenaNextJsPostgresqlPool`. |
| O-11 | `lucide-react ^1.49.0` — beklenmedik majör sürüm; sürüm sabitleme tutarsız (diğerleri pinned, bu `^`). Doğrulanmalı. |

---

## 3. Veri tutarsızlıkları / şema eksikleri

1. **CHECK kısıtı yok**: `rating` 1-5, `*_cents >= 0` (wallet, pool), `commission_rate/referral_rate/...` 0-1, `discount_percent` 0-100, `day_of_week` 0-6, `plan_code`, `status`/`role`/`type` değerleri (hepsi serbest `text`; spec enum istiyor).
2. **FK eksikleri**: `users.referred_by`, `referrals.inviter_id/invitee_id`, `referral_rewards.inviter_id`, `wallet_ledger.user_id`, `fraud_reviews.user_id`, `qr_codes.transaction_id`, `transactions.reversal_of` FK değil. `qr_codes`, `campaigns`, `transactions` FK'lerinde cascade kararı verilmemiş (finansal kayıtlar `cascade` ile silinebilir: `transactions.business_id ON DELETE CASCADE` → işletme silinince finansal geçmiş yok olur).
3. **Unique/idempotency**: `referrals (invitee_id)` unique değil (bir kullanıcı birden çok kişi tarafından davet edilebilir), `business_staff (business_id, email)` unique değil, `business_hours (business_id, day_of_week)` unique değil, `business_contracts` için işletme başına tek aktif sözleşme garantisi yok, `damping_pool.key` unique ama pool ledger bütünlüğü yok, `referral_rewards (referral_id, transaction_id)` unique değil.
4. **Ledger bütünlüğü**: `wallet_ledger` ve `pool_ledger` append-only değil (UPDATE/DELETE engeli yok); toplamları cache kolonlarla eşleşmiyor olabilir. Pool için ledger yönü (`CONTRIBUTE/CONSUME/REVERSE`) spec'teki `reservation/release/spending/cancellation` hareketlerini kapsamıyor.
5. **`business_staff.user_key`** ve `email` auth kullanıcısına bağlı değil.
6. **`campaigns.status`** `DRAFT|PUBLISHED|ENDED` ama oluşturma her zaman `PUBLISHED`; yayın onayı/audit yok.
7. **`audit_logs.actor`** serbest metin; gerçek kullanıcı kimliği, IP, istek kimliği yok; append-only değil.
8. **Zaman/para**: `commissionRate` işlemde saklanıyor (iyi); `fixedFeeCents` komisyon başına işlem bazında ekleniyor (her satışa sabit ücret — sözleşme anlamı doğrulanmalı); `perCustomerFeeCents` hiç kullanılmıyor.
9. `settlements` tablosu var ama `hakedis` sayfasının veriyi nasıl hesapladığı (kayıt mı, canlı hesap mı) Faz 5'te doğrulanacak; `settlements` yazan kod bulunmuyor (yalnızca şema).

---

## 4. Migration ihtiyaçları (Faz 1-2)

1. Supabase projesi + `supabase/migrations/` (SQL, sıralı, geri alınabilir).
2. Mevcut Drizzle şemasından başlangıç SQL'i (`0001_init.sql`), ardından ayrı migration'lar: enum/CHECK, FK düzeltmeleri, indexler, `auth.users` bağlantısı (`profiles`/`business_staff.auth_user_id`), RLS politikaları.
3. Kullanıcı tablosu: `users` (müşteri) → `auth.users` ile eşleme stratejisi (ayrı `customers` profili vs. mevcut `users`).
4. Seed'in migration'dan ayrılması (`supabase/seed.sql` veya `scripts/seed.ts`, yalnızca dev).
5. Bağlantı: runtime için Supabase pooler (transaction mode), migration için doğrudan bağlantı; `drizzle.config` env'den okunmalı, sabit şifre kaldırılmalı.
6. Veri taşıma: üretimde veri yoksa temiz kurulum; varsa `pg_dump`/`COPY` planı. (Mevcut ortamda yalnızca seed verisi olduğu varsayılıyor — **doğrulanmalı**.)

## 5. API ihtiyaçları

- Tüm yazma uçlarında oturumdan kimlik çözümü (`getSession()` → `staff` → `can()`), `actorEmail`/`rol` parametrelerinin kaldırılması.
- Giriş/kayıt/çıkış, şifre sıfırlama, davet, rol yönetimi (OWNER/MANAGER/CASHIER/ADMIN).
- Müşteri tarafı: QR offer oluşturma (`POST /api/qr/offers`), cüzdan, referral kodu kullanımı.
- Kasa: `resolve-offer`, `complete-sale` (idempotency-key), `refund`.
- Admin: yalnızca ADMIN rolü; paket fiyatı, fraud, restriction.
- Yorum/cevap onayı, performans, adaptif plan, job/queue yönetimi (hazırlık).
- Girdi doğrulaması (zod) ve tutarlı hata/yanıt sözleşmesi.

## 6. Test ihtiyaçları (Faz 25)

Runner (Vitest) ve test DB'si (Supabase local / pg) gerekli. Öncelik: `priceTransaction` birim testleri; `completeSale` eşzamanlılık (aynı wallet'a paralel 20 satış), QR çift kullanım, kampanya limit yarışı; refund + harcanmış damping senaryosu; referral tek seviye + self-referral; RLS (iki işletme çapraz erişim); auth (rol yükseltme, URL parametre); event güvenliği; analytics'te sabit değer regresyonu; admin erişim.

## 7. Production riskleri — özet öncelik

| Öncelik | Konu |
|---|---|
| 🔴 P0 | K-1…K-8: kimlik/yetki yok, admin açık, PII sızıntısı |
| 🔴 P0 | O-3: build Vercel'de kırılıyor; O-1: prod'da seed çalışıyor |
| 🔴 P0 | F-1, F-2, F-7: havuz negatif olabilir, lost update, iade kırılması |
| 🟠 P1 | Q-1, Q-2: QR tek kullanımlık-kampanya kilidi + sahte QR |
| 🟠 P1 | A-1, A-2, A-3: sahte metrik, güvensiz event'ler |
| 🟠 P1 | F-5, F-13, F-14: limit yarışı, saat dilimi, idempotency |
| 🟡 P2 | AI usage/approval/performans/adaptif plan/otomasyon altyapısı (sıfırdan eklenecek) |
| 🟡 P2 | Lint hataları (3 error), `<img>`, güvenlik header'ları, XSS (O-5) |

---

## 8. Önerilen sıra ve faz bağımlılıkları

Prompt'taki faz sırası korunuyor. Dikkat edilecek bağımlılıklar:

- **Faz 1-2 (Supabase + migration)** → build'in çalışması için `DATABASE_URL` yönetimi ve lazy DB bağlantısı burada çözülmeli (O-3).
- **Faz 3-4 (Auth + RLS)** tamamlanmadan Faz 5-7 anlamlı ölçüde güvenli olmaz; ancak finans kodunun iç mantığı (Faz 7-11) auth'tan bağımsız düzeltilebilir.
- **Faz 6 (QR)** şema değişikliği gerektirir (`qr_offers`, `redemptions`); Faz 7 (`completeSale`) bu yeni modele göre yazılmalı.
- **Faz 8 + 9 + 11** aynı ledger modelini paylaşır; Faz 8'de wallet/pool ledger tasarımı kesinleştirilirse 9 ve 11 ona oturur.
- **Faz 12-13** (analytics/event) küçük ve bağımsızdır; Faz 5 ile birlikte yapılabilir ama prompt sırasına bağlı kalınacak.

## 9. Açık sorular (Faz 1'den önce netleşmeli)

1. Supabase projesi hazır mı? (URL/anon key/service role key/DB şifresi) — yoksa yerel `supabase start` (Docker) ile mi ilerleyelim, yoksa yalnızca migration dosyaları + yerel Postgres ile mi doğrulayalım?
2. Mevcut canlı/üretim veri var mı, yoksa seed verisi yeterli mi?
3. Drizzle ORM tutulsun mu (öneri: evet, `pg` üzerinden Supabase Postgres'e bağlanır; RLS gereken yerlerde `supabase-js` + SSR) yoksa tamamen `supabase-js`'e mi geçilsin?
4. Müşteri hesapları da Supabase Auth'ta mı olacak (öneri: evet, rol `CUSTOMER`) — prompt rolleri yalnızca OWNER/MANAGER/CASHIER/ADMIN listeliyor.
