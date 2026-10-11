import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3101);
export const VISUAL_DB_URL =
  process.env.VISUAL_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/damping_visual";

/**
 * Sunucu: önce damping_visual DB'si sıfırdan kurulur, sonra `next start` deterministik modda başlar
 * (sabit tohumlu Math.random). Hazır olma kontrolü "/" olduğundan ilk istek seed'i çalıştırır.
 * DV_FAKETIME (örn. "2026-10-10 12:00:00") verilirse sunucu saati sabitlenir (libfaketime gerekir).
 * Önkoşul: `npm run build` yapılmış olmalı.
 */
const faketime = process.env.DV_FAKETIME ? `faketime '${process.env.DV_FAKETIME}' ` : "";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" } },
  use: { baseURL: `http://127.0.0.1:${PORT}`, colorScheme: "light" },
  webServer: {
    command: `npx vite-node tests/support/prepare-db-cli.ts "${VISUAL_DB_URL}" && ${faketime}npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: VISUAL_DB_URL,
      NODE_OPTIONS: "--require ./tests/support/determinism.cjs",
    },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
  ],
});
