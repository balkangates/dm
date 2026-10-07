/**
 * LEGACY MIGRATION ONLY
 * DO NOT USE FOR NEW CODE
 * REMOVE IN PHASE 05 (caller'lar Faz 03-04'te Supabase'e taşınır; silme Faz 05)
 * Yeni kod yalnızca src/lib/supabase/{client,server,admin}.ts kullanır.
 */
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Sabit yerel şifre kaldırıldı; bağlantı ortamdan okunur.
// Faz 2'den itibaren şema değişiklikleri supabase/migrations/ ile yönetilir;
// drizzle-kit yalnızca `drizzle-kit introspect/check` gibi yardımcı kullanımlar içindir.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
});
