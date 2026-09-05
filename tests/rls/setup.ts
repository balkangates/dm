// tests/rls/setup.ts
// ─────────────────────────────────────────────────────────────────────
// AMAÇ: Faz 0 (fatura/irsaliye GRANT) ve Faz 1 (canlı sohbet + DM)
// düzeltmelerini REGRESYONA KARŞI kilitleyen testler için ortak altyapı.
//
// GEREKLİ: Bu testler CANLI DEĞİL, ayrı bir Supabase TEST/STAGING
// projesine karşı çalışır. Production'a karşı ÇALIŞTIRMAYIN — testler
// gerçek satırlar (sipariş, konuşma, mesaj) oluşturur/okur.
//
// KURULUM (bir kere):
//   1) Supabase Dashboard'da ayrı bir test projesi oluşturun (veya
//      mevcut bir staging projeniz varsa onu kullanın).
//   2) O projede supabase/migrations/ altındaki TÜM migration'ları
//      uygulayın: `npx supabase db push --db-url <TEST_DB_URL>`
//   3) Aşağıdaki fixture'ları (2 mağaza, 2 bayi, 2 müşteri) test
//      projesinde elle veya bir seed script'iyle oluşturun.
//   4) .env.test.local dosyasını doldurun (bkz. .env.test.local.example).
//      Bu dosya .gitignore'da olmalı — gerçek şifre içerir.
// =====================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadDotenv } from 'dotenv';

// tests/rls/.env.test.local dosyasını yükle (repo kökünden değil, bu
// klasörden — production .env dosyalarıyla karışmasın).
loadDotenv({ path: 'tests/rls/.env.test.local' });

export interface RlsTestFixtures {
  storeA: { id: string; ownerId: string };
  storeB: { id: string; ownerId: string };
  customerA: { id: string; email: string; password: string }; // storeA'dan alışveriş yapan müşteri
  customerB: { id: string; email: string; password: string }; // storeB'den alışveriş yapan müşteri
  dealerA: { email: string; password: string }; // storeA sahibi
  dealerB: { email: string; password: string }; // storeB sahibi
  orderIdStoreA: string; // storeA + customerA'ya ait, faturası/irsaliyesi olan bir sipariş
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Eksik ortam değişkeni: ${name} — .env.test.local dosyasını kontrol edin`);
  return v;
}

/**
 * GÜVENLİK KİLİDİ — "Faz 3 sistemi bozabilir" endişesine karşı somut
 * önlem. Bu testler gerçek satır oluşturur/siler; production'a karşı
 * çalıştırılırsa canlı veriye yazar. Bu fonksiyon, TEST_SUPABASE_URL
 * production URL'iyle (NEXT_PUBLIC_SUPABASE_URL / process.env'de her
 * neyse) AYNIYSA veya URL'de "test"/"staging" gibi bir işaret YOKSA
 * çalışmayı DURDURUR. Testler her dosyada, ilk satırda bunu çağırır.
 */
export function assertNotProductionTarget(): void {
  const testUrl = process.env.TEST_SUPABASE_URL ?? '';
  const prodUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.PRODUCTION_SUPABASE_URL ?? '';

  if (!testUrl) {
    throw new Error(
      'TEST_SUPABASE_URL tanımlı değil. tests/rls/.env.test.local dosyasını ' +
        'oluşturup .env.test.local.example\'dan doldurun.'
    );
  }

  if (prodUrl && testUrl.trim() === prodUrl.trim()) {
    throw new Error(
      '🛑 DURDURULDU: TEST_SUPABASE_URL, production URL\'iyle (NEXT_PUBLIC_SUPABASE_URL) ' +
        'AYNI. Bu testler gerçek satır oluşturur/siler — production\'a karşı çalıştırmayın. ' +
        'Ayrı bir test/staging Supabase projesi kurup TEST_SUPABASE_URL\'i ona yönlendirin.'
    );
  }

  const looksLikeTestProject = /test|staging|dev|sandbox/i.test(testUrl);
  if (!looksLikeTestProject) {
    throw new Error(
      '🛑 DURDURULDU: TEST_SUPABASE_URL adında "test"/"staging"/"dev"/"sandbox" ' +
        `işareti bulunamadı (şu an: "${testUrl}"). Bu, yanlışlıkla production'a karşı ` +
        'çalıştırma riskine karşı bir güvenlik kilididir. Gerçekten bir test projesiyse, ' +
        'Supabase projenizin adına bu kelimelerden birini ekleyin veya bu kontrolü ' +
        'bilerek/anlayarak devre dışı bırakın (aşağıdaki satırı yorum satırına alın — ' +
        'ÖNERİLMEZ).'
    );
  }
}

export function loadFixtures(): RlsTestFixtures {
  return {
    storeA: { id: requireEnv('TEST_STORE_A_ID'), ownerId: requireEnv('TEST_DEALER_A_ID') },
    storeB: { id: requireEnv('TEST_STORE_B_ID'), ownerId: requireEnv('TEST_DEALER_B_ID') },
    customerA: {
      id: requireEnv('TEST_CUSTOMER_A_ID'),
      email: requireEnv('TEST_CUSTOMER_A_EMAIL'),
      password: requireEnv('TEST_CUSTOMER_A_PASSWORD'),
    },
    customerB: {
      id: requireEnv('TEST_CUSTOMER_B_ID'),
      email: requireEnv('TEST_CUSTOMER_B_EMAIL'),
      password: requireEnv('TEST_CUSTOMER_B_PASSWORD'),
    },
    dealerA: { email: requireEnv('TEST_DEALER_A_EMAIL'), password: requireEnv('TEST_DEALER_A_PASSWORD') },
    dealerB: { email: requireEnv('TEST_DEALER_B_EMAIL'), password: requireEnv('TEST_DEALER_B_PASSWORD') },
    orderIdStoreA: requireEnv('TEST_ORDER_ID_STORE_A'),
  };
}

/** Belirli bir kullanıcı olarak GİRİŞ YAPMIŞ bir Supabase client döndürür. */
export async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(requireEnv('TEST_SUPABASE_URL'), requireEnv('TEST_SUPABASE_ANON_KEY'));
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Giriş başarısız (${email}): ${error.message}`);
  return client;
}

/** GİRİŞSİZ (anon) bir Supabase client döndürür — anon rolü testleri için. */
export function anonClient(): SupabaseClient {
  return createClient(requireEnv('TEST_SUPABASE_URL'), requireEnv('TEST_SUPABASE_ANON_KEY'));
}
