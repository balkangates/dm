import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    // RLS testleri gerçek bir test/staging Supabase projesine karşı
    // çalışır (mock DEĞİL — RLS policy'lerinin GERÇEK Postgres
    // davranışını test etmesi gerekiyor, bu mock'lanamaz).
    // Sırayla çalıştırılır (paralel değil) — çünkü testler arasında
    // paylaşılan test kullanıcıları/verisi kullanılıyor.
    fileParallelism: false,
  },
});
