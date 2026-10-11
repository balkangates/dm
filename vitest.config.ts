import { defineConfig } from "vitest/config";
import path from "node:path";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/damping_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` Vitest'te (react-server koşulu yok) import anında fırlatır; testte etkisizleştirilir.
      "server-only": path.resolve(__dirname, "tests/support/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    // src/db/index.ts import anında DATABASE_URL ister; testler her zaman test DB'sine bağlanır.
    env: { DATABASE_URL: TEST_DB_URL },
    globalSetup: ["tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
