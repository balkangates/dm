# DAMPINGVAR PHASE REPORT — M1 Güvenlik Ağı

**PHASE:** M1 — Güvenlik Ağı  **STATUS:** COMPLETED_PENDING_APPROVAL

## Özet
`src/` altında **tek satır değişmedi** (`git diff 9a42671 HEAD -- src` boş). Eklenenler: lockfile, git geçmişi,
test altyapısı, görsel baseline altyapısı, AGENTS.md.

## Ölçülen baseline (orijinal kod)
| Kontrol | Sonuç |
|---|---|
| G1 `tsc --noEmit` | PASS (0 hata) |
| G2 `eslint .` | **FAIL: 3 error, 7 warning** (`src/app/page.tsx` 128, 141, 387 — `react/no-unescaped-entities`) |
| G3 `next build` (sahte `DATABASE_URL` ile, canlı DB yok) | **PASS** → Phase "S1" varsayımı doğrulandı |
| G3 `next build` (`DATABASE_URL` yok) | FAIL (`src/db/index.ts` import anında fırlatıyor) |
| Çalışma zamanı | 15/15 rota HTTP 200, `/api/health` 200 (yerel PostgreSQL 16 + `drizzle-kit push` ile 29 tablo) |

Lint hataları V3 M1 kuralı gereği **düzeltilmedi** (yalnızca raporlandı). Düzeltme: `'` → `&apos;` (görünüm birebir aynı).

## Eklenen dosyalar
| Dosya | Amaç |
|---|---|
| `.gitignore`, git geçmişi (2 commit: orijinal + M1) | Geri dönüş noktası |
| `package-lock.json` | ZIP'te yoktu |
| `vitest.config.ts`, `tests/db/global-setup.ts`, `tests/support/prepare-db.ts` | Test DB'sini her çalıştırmada sıfırdan kurar (yalnızca `damping_*` adlı DB silinebilir) |
| `tests/unit/finance-pure.test.ts` | `priceTransaction` (378 kombinasyon), `discountFor`, `commissionBaseFor`, `validateCampaignUsage` karakterizasyonu |
| `tests/db/finance-flow.test.ts` | `completeSale`/`reverseTransaction` gerçek PostgreSQL'de: 7 senaryo (satış, damping ile satış, QR tekrar, yanlış işletme, yetersiz bakiye, iade + çift iade, **paralel çift harcama**) |
| `playwright.config.ts`, `tests/e2e/visual.spec.ts`, `tests/support/determinism.cjs`, `prepare-db-cli.ts` | 14 sayfa × 2 viewport (1440×900, 390×844) görsel baseline |
| `AGENTS.md` | Kırmızı çizgiler + kapılar |
| devDependencies: `vitest`, `@playwright/test` (1.56.0 sabit) | Yalnızca test |
| scripts: `test`, `test:e2e`, `test:e2e:baseline`, `verify` | |

## Sonuçlar
| | |
|---|---|
| TEST (G4) | **PASS** — 13/13, snapshot'lar 4 farklı rastgele seed'de + sıfırdan DB'de aynı kaldı |
| Finans eşzamanlılık (S7) | PASS — aynı QR'a 2 paralel istek: 1 başarılı, 1 `QR_USED` (mevcut `FOR UPDATE` kilidi çalışıyor) |
| UI baseline (G7) | **PASS** — 28 görüntü, **3 ardışık sıfırdan DB/sunucuda** aynı |
| BUILD | PASS (placeholder env) |
| LINT | baseline'da: 3 error / 7 warning (yeni uyarı eklenmedi) |
| SMOKE | 15 rota 200, hidrasyon dışında tarayıcı hatası yok |

### Görsel baseline — maskelenen alanlar
- `panel-kasa`: fiş üzerindeki canlı saat satırı ("TARİH").
- `panel-hakedis`: "Damping Hane mahsup raporu" listesi. `panel-damping-hane`: cüzdan defteri listesi ve mahsup listesi. `admin`: `#mahsup` ve Referral bölümü.
- Neden: kaynak kodda eşit değerlerde `ORDER BY` belirsiz, sıra her seed'de değişiyor (bkz. KD-5). Yalnızca **sıra** maskelenir.
- Rastgele UUID metinleri sabit değerle değiştirilir; dış ağ istekleri engellenir; `/images/*` yer tutucu PNG ile karşılanır.
- **PNG'ler paketlenmedi** (94 MB, işletim sistemi/yazı tipi ortamına bağlı). Kendi makinende: `npm run build` → `npm run test:e2e:baseline`.

## BİLİNEN MEVCUT HATALAR (migration'dan önce de vardı)
| ID | Bulgu | Etki |
|---|---|---|
| KD-1 | `/panel/kasa`: **React hidrasyon hatası #418**. `KasaClient.tsx:420` `new Date().toLocaleString("tr-TR")` sunucuda ve istemcide farklı saniye üretir | Her açılışta tarayıcı konsolunda hata; fiş saati ilk anda yanlış olabilir |
| KD-2 | **ZIP'te `public/` klasörü yok.** `hero-vitrin.jpg`, `magaza-ic.jpg`, `restoran.jpg` (kod + seed) 404 | Canlıda görseller kırık görünür; **gerçek UI'ı tam göremedim, `public/` gönderilmeli** |
| KD-3 | 3 lint hatası (`page.tsx`) | `npm run lint` FAIL |
| KD-4 | Phase 0 güvenlik açıkları (kimliksiz `/api/admin`, `/api/kasa` GET PII, `?rol=` yetki sahteciliği) | M4'te kapanacak |
| KD-5 | Eşit değerlerde belirsiz sıralama (`damping-hane` defter/mahsup, `admin` mahsup/referral, `hakedis` mahsup) | Sıra çalıştırmadan çalıştırmaya değişebilir; migration sonrası "regresyon" gibi görünebilir |

## UNKNOWN
Canlı veri var mı · platform admin nasıl belirlenecek · supplier/dealer rolü · "MiMo 2.6 Pro" için ayrı tema dosyası (kodda yok).

## RİSKLER
- Seed `Math.random` ve `Date.now` kullanıyor → mutlak bakiyeler çalıştırmaya göre değişir; testler bu yüzden delta ve normalize satırlarla yazıldı.
- Görsel baseline'da sunucu saati `faketime` ile sabitlenir (Linux). Windows'ta `DV_FAKETIME` verilmeden çalışırsa tarih içeren satırlar gün değişince farklılaşabilir.

## NEXT PHASE
M2 — Supabase Foundation. **Başlamak için ONAY bekleniyor.**
