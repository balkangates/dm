# DampingVar — Ajan Talimatları (AGENTS.md)

Bu depo, mevcut DampingVar sistemini **Supabase-native** mimariye kontrollü geçirme projesidir
(sıfırdan yazma DEĞİL). Kaynak doğruluk: bu çalışma dizini.

## Kırmızı çizgiler
1. `git reset --hard`, `git clean -fd`, force-push **yasak**. Paralel proje kopyası yok.
2. Sıfırdan yazma yok: önce mevcut dosyayı anla → refactor et. Dışa açık fonksiyon **imzaları korunur**
   (`getBusinessBundle`, `completeSale`, `reverseTransaction`, `logAudit`, `resolveActor`, `can`, `deny`, `panelContext`…).
3. Migration fazlarında **yeni ürün özelliği yok** (AI Control Layer vb. dondurulmuş backlog).
4. **UI dondurulmuştur:** `src/app/globals.css` (@theme tokenları), `src/components/ui.tsx`, `PanelShell.tsx`,
   `layout.tsx` ve tüm sayfaların markup/className'i. Yalnızca teknik zorunluluk / güvenlik / Next uyumu / kullanıcı isteği.
5. Kodda olmayan tablo/kolon/RPC/env/rol **uydurulmaz** → `UNKNOWN` yaz, kullanıcıya sor.
6. Silmeden önce `IMPORTS = CALLERS = RUNTIME REFERENCES = 0` ve regresyon PASS.
7. Gizli anahtarlar (service role, DATABASE_URL) istemciye/`NEXT_PUBLIC_*`'a girmez, koda gömülmez.
8. Her faz sonunda `COMPLETED_PENDING_APPROVAL` yaz ve **DUR**; `ONAY` gelmeden sonraki faza geçme.

## Doğrulama kapıları (her faz)
| Kapı | Komut | Eşik |
|---|---|---|
| G1 tip | `npm run typecheck` | 0 hata |
| G2 lint | `npm run lint` | 0 error; warning sayısı baseline'ı aşmaz |
| G3 build | `npm run build` | PASS (canlı DB olmadan, placeholder env ile) |
| G4 test | `npm test` | yeşil (karakterizasyon snapshot'ları değişmemeli) |
| G7 UI | `npm run test:e2e` | fark yok (maskeli alanlar hariç) |

## Test altyapısı
- `npm test` → Vitest. Saf finans fonksiyonları (`tests/unit`) + gerçek PostgreSQL üzerinde
  `completeSale`/`reverseTransaction` senaryoları (`tests/db`). DB testleri `damping_test` veritabanını
  **her çalıştırmada sıfırdan** kurar (yalnızca `damping_*` adlı DB'ler silinebilir). Postgres yoksa DB testleri atlanır.
  `TEST_DATABASE_URL` ile değiştirilebilir.
- `npm run test:e2e:baseline` → Playwright görsel baseline'ı üretir (ilk kurulumda bir kez, kendi makinende).
  `npm run test:e2e` → karşılaştırır. Önkoşul: `npm run build`. Sunucu `damping_visual` DB'sini kurar ve
  `tests/support/determinism.cjs` ile sabit tohumlu çalışır. Sunucu saatini sabitlemek için (Linux) `DV_FAKETIME="2026-10-10 12:00:00"`.
- **Snapshot (`__snapshots__`) değişimi = davranış değişimi.** Bilerek yapılmadıkça güncelleme.

## Bilinen mevcut hatalar (migration'dan ÖNCE vardı; ayrı onayla düzeltilir)
Bkz. `docs/M1_REPORT.md` → KD-1 … KD-5.

## Test modları (M3)
- `npm test` → şema Drizzle'dan kurulur (varsayılan).
- `DV_SCHEMA=migrations npm test` → şema `supabase/migrations/*.sql`'den kurulur (Supabase benzetim shim'i ile). **Her migration değişikliğinde bu mod yeşil olmalı.**
- `POSTGREST_BIN=/yol/postgrest npm test` → ek olarak supabase-js → PostgREST → RLS gerçek REST testi çalışır.
- `tests/db/schema-parity.test.ts` Drizzle şeması ile migration şemasının farkını (=0) doğrular; M10'da Drizzle kalkınca kaldırılır.
