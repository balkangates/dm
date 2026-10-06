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
