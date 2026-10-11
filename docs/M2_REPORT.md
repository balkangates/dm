# DAMPINGVAR PHASE REPORT — M2 Supabase Foundation

**PHASE:** M2  **STATUS:** COMPLETED_PENDING_APPROVAL

## Davranış etkisi
Yeni dosyaların **hiçbirini mevcut kod içe aktarmıyor**. `src/` altında yalnızca `src/lib/supabase/` eklendi;
başka satır değişmedi. Legacy `src/db` + `pg` + Drizzle olduğu gibi çalışıyor.

## NEW FILES
| PATH | WHY | OLD FILE REUSED? | CALLERS |
|---|---|---|---|
| `src/lib/supabase/client.ts` | Tarayıcı istemcisi (anon) | yok (Supabase yoktu) | 0 (M4+) |
| `src/lib/supabase/server.ts` | SSR istemcisi, `await cookies()` (Next 16) | yok | 0 (M4+) |
| `src/lib/supabase/admin.ts` | service-role, `server-only` | yok | 0 (M7+) |
| `src/lib/supabase/must.ts` | `{data,error}` → fırlat (T3: sessiz hata) | yok | 0 (M6+) |
| `src/lib/supabase/case.ts` | camelCase↔snake_case + `Date` (T1, T2) — çağıran kod değişmesin diye | yok | 0 (M6+) |
| `supabase/config.toml` | `supabase init` çıktısı (`project_id = dampingvar`) | yok | — |
| `.env.example` | Hedef env + legacy işareti | yok | — |
| `tests/unit/supabase-lib.test.ts`, `tests/support/server-only-stub.ts` | Test | — | — |

`types.ts` **bilinçli olarak yok**: tablolar M3'te Supabase'e taşınınca `supabase gen types` ile üretilecek.

## Bağımlılıklar (tam sürüm sabit, hepsi ≥14 gün eski)
`@supabase/supabase-js 2.117.2` (25 Eyl), `@supabase/ssr 0.12.7` (8 Eyl), `server-only 0.0.1`, devDep `supabase` CLI `2.118.0` (25 Eyl).

## Kapılar
| | |
|---|---|
| G1 tsc | PASS |
| G2 eslint | 3 error / 7 warning = **M1 baseline ile aynı** (yeni uyarı yok) |
| G3 build | PASS — **Supabase env olmadan** ve placeholder env ile (lazy env doğrulandı) |
| G4 test | PASS 23/23 (M1'in 13'ü + 10 yeni); karakterizasyon snapshot'ları değişmedi |
| G5 runtime | `server.ts` gerçek Next 16 isteğinde çalıştı (geçici prob rotası, sonra silindi): `{"ok":true,"hasSession":false}` HTTP 200, bozuk `sb-` çerezi hata üretmedi |
| G7 UI | PASS 28/28 (M1 baseline'ı ile) |
| Sızıntı taraması | Sahte service-role değeri ile build → istemci paketinde **0** eşleşme. Test: service key yalnızca `admin.ts` içinde okunuyor, client bileşenleri onu içe aktarmıyor |

## DOĞRULANAMAYANLAR (dürüst liste)
- **"Yerel Supabase ayakta" çıkış kriteri: KARŞILANAMADI.** Bu ortamda Docker yok, `supabase start` çalıştırılamaz. `config.toml` oluşturuldu ama yığın hiç başlatılmadı.
- İstemcilerin gerçek bir Supabase'e karşı sorgu/auth davranışı doğrulanmadı (yalnızca oluşturma, env kontrolü, çerez okuma). Bu M3-M4'te yerel/staging Supabase ile test edilecek.
- Hata ayıklama notu: prob rotası ilk denemede `_m2probe` adıyla 404 verdi (Next'te `_` ile başlayan klasör yönlendirilmez); ayrıca eski bir sunucu portu tuttuğu için ikinci deneme de yanıltıcıydı. Üçüncü, temiz denemede doğrulandı.

## UNKNOWN (hâlâ açık)
Canlı veri var mı · platform admin nasıl belirlenecek · supplier/dealer rolü · MiMo için ayrı tema dosyası.

## NEXT PHASE
M3 — Şema Migration (29 tablo → `supabase/migrations`). **Önkoşul:** `supabase db reset` için Docker'lı bir makine ya da Supabase projesi gerekir; bu ortamda yalnızca SQL'i yazıp düz PostgreSQL 16'ya karşı doğrulayabilirim. ONAY bekleniyor.
