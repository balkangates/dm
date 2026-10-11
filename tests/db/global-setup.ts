import type { TestProject } from "vitest/node";
import { Client } from "pg";
import { prepareDb } from "../support/prepare-db";

declare module "vitest" {
  export interface ProvidedContext {
    dbReady: boolean;
  }
}

const URL_ =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/damping_test";

/** Postgres erişilebilirse temiz bir test DB'si kurar; yoksa DB testleri atlanır (birim testler çalışır). */
export default async function setup(project: TestProject) {
  const probe = new URL(URL_);
  probe.pathname = "/postgres";
  const c = new Client({ connectionString: probe.toString(), connectionTimeoutMillis: 3000 });
  try {
    await c.connect();
    await c.end();
  } catch {
    console.warn("[tests] Postgres erişilemedi → DB testleri atlanacak.");
    project.provide("dbReady", false);
    return;
  }
  await prepareDb(URL_);
  project.provide("dbReady", true);
}
