import { createClient } from "@/lib/supabase/server";

export async function ensureSeed(): Promise<void> {
  // Demo veri yalnızca geliştirmede. Production'da (Supabase) boş DB'ye demo işletme BASILMAZ;
  // bilinçli olarak istenirse ALLOW_DEMO_SEED=true verilir. Zorunlu sistem verisi migration'dadır.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") return;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("businesses").select("id").limit(1);
  if (existing && existing.length > 0) return;

  // Basit seed - full seed logic Supabase migration içinde yapılmalı
  console.log("Seed skipped - use Supabase migration for full seed data");
}
