# Faz 3 — Kurulum Notu

## 1) Bağımlılıklar

```bash
npm install --save-dev vitest @supabase/supabase-js dotenv
```

(`@supabase/supabase-js` zaten `dependencies`'te var, testler için ayrıca `devDependencies`'e eklemeye gerek yok — mevcut sürüm yeterli. `dotenv`, `tests/rls/.env.test.local`'i yüklemek için.)

## 2) `package.json`'a script ekleyin

```json
{
  "scripts": {
    "test:rls": "vitest run --config vitest.config.ts"
  }
}
```

`vitest.config.ts`'nin `.env.test.local`'i otomatik okuması için basit bir setup dosyası gerekiyorsa (vitest varsayılan olarak `.env` okumaz), en kolay yol `tests/rls/setup.ts`'in başına şunu eklemek:

```ts
import { config } from 'dotenv';
config({ path: 'tests/rls/.env.test.local' });
```

## 3) Yerelde çalıştırma

```bash
cp tests/rls/.env.test.local.example tests/rls/.env.test.local
# değerleri doldurun
npm run test:rls
```

## 4) GitHub Actions için

**Secrets** (Settings → Secrets and variables → Actions → Secrets): `.env.test.local.example`'daki her değişkeni buraya da ekleyin (`TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_STORE_A_ID`, ... `TEST_ORDER_ID_STORE_A`).

**Variable** (aynı sayfa, "Variables" sekmesi): `RLS_TESTS_ENABLED = true` — bu olmadan `ci.yml`'deki `rls-tests` job'ı **atlanır** (graceful skip), test projesi henüz kurulmadıysa CI kırılmaz.

## 5) Sıra önemli

Bu testlerin anlamlı olabilmesi için **önce**:
1. Faz 0 dosyaları (`fix_invoice_delivery_note_rls_v2.sql`) test projesine uygulanmış olmalı.
2. Faz 1.2 (`fix_live_chat_consolidated_final.sql`) test projesine uygulanmış olmalı.
3. Faz 2'deki `db pull` ile test projesinin migration baseline'ı da alınmış olmalı (ya da en azından production ile aynı şemaya sahip olmalı).

Yoksa testler "beklenmedik" şekilde başarısız olur — RLS henüz test projesinde doğru değilse, testler gerçek bir regresyon değil, kurulum eksikliğini yakalar. İlk çalıştırmada başarısız olan bir test görürseniz, önce "test projesi production ile senkron mu" diye kontrol edin.
