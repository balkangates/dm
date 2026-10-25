/**
 * FAZ 2 — AI AYLIK KOTA KONTROLÜ (YALNIZCA SUNUCU)
 *
 * Onaylı kurallar:
 *   - Öncelik mevcut tablolar: sayım `analytics_events` üzerinden yapılır.
 *     YENİ TABLO / YENİ KOLON YOKTUR.
 *   - Kota yalnız istemcide kontrol edilmez: /api/ai rotası üretimden ÖNCE
 *     `aiQuotaCheck` ile 429 döndürebilir.
 *   - Sayım işletme (business_id), paket (meta.package), işlem türü
 *     (meta.action) ve dönem (meta.period = "YYYY-MM") bazlı kaydedilir.
 *   - `packages.ai_quota_monthly = 0` → AI KAPALI (üretim tamamen engellenir).
 *
 * audit_logs NEDEN öncelikli kaynak DEĞİL:
 *   - `audit_logs` RLS okuması yalnız `is_admin()` (faz5_rls_policies.sql:589);
 *     işletme sahibi/personeli satırlarını OKUYAMAZ → kota sayımı oradan
 *     işletme bazında yapılamaz. Ek olarak business_id kolonu yoktur
 *     (yalnız actor/audit_logs_guard). Bu yüzden ana kaynak analytics_events,
 *     yan kaynak (yönetici denetimi/raporu) olarak audit_logs kalır.
 *
 * GÜVENLİK NOTU: `analytics_events` INSERT RLS'si `user_id = auth.uid()`
 * şart koşar → olay her zaman aktörün user_id'siyle yazılır.
 */
import { createClient } from "@/lib/supabase/server";

export const AI_USAGE_KIND = "ai_usage";

/** Kota kapsamındaki AI işlemleri (onay: TÜM AI işlemleri sayılır). */
export const AI_QUOTA_ACTIONS = [
  "campaign", // kampanya taslağı
  "social", // sosyal medya gönderisi
  "story", // hikâye
  "ads", // reklam metni
  "video", // video senaryosu
  "plan", // 28 günlük pazarlama planı
  "growth", // büyüme önerileri analizi
  "growth_answer", // büyüme asistanı cevabı
  "analyse", // performans analizi
  "report", // haftalık rapor
  // FAZ 4 — mevcut formları dolduran taslaklar da AI işlemi sayılır (onay: tüm AI işlemleri).
  "ad_brief", // reklam formu brief taslağı
  "product_idea", // ürün formu öneri taslağı
  // FAZ 5 — içerik brief'i üretimi de AI işlemidir (onaylı kapsam).
  "brief", // içerik brief'i
] as const;

export type AiQuotaAction = (typeof AI_QUOTA_ACTIONS)[number];

/** Sayım dışı işlemler: growth_task_update / growth_notifications (durum güncellemesi). */
export function isAiQuotaAction(action: string): action is AiQuotaAction {
  return (AI_QUOTA_ACTIONS as readonly string[]).includes(action);
}

type Actor = { userId: string; businessId: string };

export type QuotaInfo = {
  ok: boolean;
  plan: string; // businesses.plan_code
  packageName: string;
  quota: number; // packages.ai_quota_monthly (0 = AI kapalı)
  used: number; // bu dönemde harcanan
  remaining: number; // kalan (0 = doldu)
  period: string; // "YYYY-MM" (UTC takvim ayı)
  message?: string; // ok=false iken kullanıcıya gösterilecek neden
};

/** Dönem: UTC takvim ayı (sunucu/Vercel UTC ile tutarlı). */
function periodInfo() {
  const now = new Date();
  const period = now.toISOString().slice(0, 7);
  return { period, since: `${period}-01T00:00:00.000Z` };
}

function nextResetLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)); // bir sonraki ayın 1'i (UTC)
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(next);
  } catch {
    return next.toISOString().slice(0, 10);
  }
}

/** Dönem + işletme + paket + kullanımdan kota kararını üretir (okuma). */
export async function aiQuotaCheck(actor: Actor): Promise<QuotaInfo> {
  const { period, since } = periodInfo();
  try {
    const client = await createClient();

    // 1) İşletmenin paketi
    const { data: biz } = await client.from("businesses").select("plan_code").eq("id", actor.businessId).limit(1).maybeSingle();
    const plan = String(biz?.plan_code ?? "FREE") || "FREE";

    // 2) Paketin aylık AI kotası (packages satırı yoksa FREE'ye düşülür — sonsuz kota ASLA varsayılmaz)
    const { data: pkgRow } = await client
      .from("packages")
      .select("code, name, ai_quota_monthly")
      .eq("code", plan)
      .limit(1)
      .maybeSingle();
    const pkg =
      pkgRow ??
      (await client.from("packages").select("code, name, ai_quota_monthly").eq("code", "FREE").limit(1).maybeSingle()).data;
    const quota = Number(pkg?.ai_quota_monthly ?? 0);
    const packageName = String(pkg?.name ?? plan);

    // 3) Bu dönemin kullanımı (analytics_events; işletme + tür + dönem bazlı satırlar)
    const { count, error } = await client
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", actor.businessId)
      .eq("kind", AI_USAGE_KIND)
      .eq("meta->>period", period);
    if (error) throw new Error(error.message);
    const used = Number(count ?? 0);

    const base: Omit<QuotaInfo, "ok"> = {
      plan,
      packageName,
      quota,
      used,
      remaining: Math.max(0, quota - used),
      period,
    };

    if (quota <= 0)
      return {
        ...base,
        ok: false,
        message: `${packageName} paketinde AI kullanımı kapalı. AI araçlarını kullanmak için paketinizi yükseltin.`,
      };
    if (used >= quota)
      return {
        ...base,
        ok: false,
        message: `Aylık AI kullanım kotası doldu (${used}/${quota} · ${packageName} paketi · ${period} dönemi). Kota ${nextResetLabel(period)} tarihinde yenilenir.`,
      };
    return { ...base, ok: true };
  } catch (e) {
    // Beklenmeyen okuma hatası: AI akışı KİLİTLENMEZ, hata günlüğe yazılır
    // (kota bir fatura/biznis kontrolüdür; geçici DB hatası üretimi durdurmaz).
    console.error("[DampingVar] AI kota kontrolü çalıştırılamadı (varsayılan: FREE kotası):", (e as Error)?.message ?? e);
    const fallback: QuotaInfo = {
      ok: true,
      plan: "FREE",
      packageName: "FREE",
      quota: 20,
      used: 0,
      remaining: 20,
      period: periodInfo().period,
    };
    return fallback;
  }
}

/**
 * Üretim başarılıktan SONRA sayımı yazar (analytics_events append-only).
 * Dönen değer güncel kota bilgisidir (yanıtla istemciye iletilebilir).
 */
export async function aiQuotaRecord(
  actor: Actor,
  action: AiQuotaAction,
  /** Üretimi yapan sağlayıcı (onay: kota meta'sında provider da izlensin). */
  provider: string = "local-template-engine",
): Promise<QuotaInfo | null> {
  const { period } = periodInfo();
  try {
    const client = await createClient();
    const { data: biz } = await client.from("businesses").select("plan_code").eq("id", actor.businessId).limit(1).maybeSingle();
    const plan = String(biz?.plan_code ?? "FREE") || "FREE";
    const { data: pkg } = await client.from("packages").select("code, name, ai_quota_monthly").eq("code", plan).limit(1).maybeSingle();

    const { error } = await client.from("analytics_events").insert({
      kind: AI_USAGE_KIND,
      business_id: actor.businessId,
      user_id: actor.userId, // RLS: user_id = auth.uid() şartı
      meta: {
        action, // işlem türü
        plan, // paket kodu
        package: String(pkg?.name ?? plan), // paket adı
        period, // dönem
        provider, // üretim motoru: google-gemini | local-template-engine
      },
    });
    if (error) {
      // Kota sayımının bozulması KABUL EDİLEMEZ → açık hata kaydı.
      console.error("[DampingVar] AI kullanım sayımı yazılamadı:", error.message);
      return null;
    }

    const { count } = await client
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", actor.businessId)
      .eq("kind", AI_USAGE_KIND)
      .eq("meta->>period", period);

    const quota = Number(pkg?.ai_quota_monthly ?? 0);
    const used = Number(count ?? 0);
    return {
      ok: used < quota && quota > 0,
      plan,
      packageName: String(pkg?.name ?? plan),
      quota,
      used,
      remaining: Math.max(0, quota - used),
      period,
    };
  } catch (e) {
    console.error("[DampingVar] AI kullanım sayımı kaydedilemedi:", (e as Error)?.message ?? e);
    return null;
  }
}
