/**
 * FAZ 3 — GOOGLE GEMINI SAĞLAYICISI (YALNIZCA SUNUCU TARAFI)
 *
 * Onaylı kurallar:
 *   - YENİ API ANAHTARI OLUŞTURULMAZ: mevcut ortam değişkeni okunur
 *     (öncelik sırası: GEMINI_API_KEY → GOOGLE_API_KEY → GOOGLE_GENERATIVE_AI_API_KEY).
 *     Değer asla yanıt gövdesine, log'a veya URL'ye yazılmaz (başlıkla gönderilir).
 *   - Düşük maliyetli model: `gemini-3.1-flash-lite` ($0.25/$1.50 — bu hesapta
 *     kullanılabilir en ucuz flash-lite; 2.5 serisi hesapta kapalı).
 *     `GEMINI_MODEL` ortam değişkeniyle değiştirilebilir.
 *   - YALNIZCA METİN üretimi (Faz 3 ilk test kapsamı).
 *   - Hata/anahtar yoksa çağıran kod FALLBACK yapar: mevcut yerel şablon motoru
 *     (`lib/ai.ts`) aynen çalışır → model hataları manuel sistemi ETKİLEMEZ.
 *   - Kota/yetki bu modülün DEĞİL, /api/ai rotasının sorumluluğundadır (Faz 2).
 */

const KEY_CANDIDATES = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"] as const;
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiConfig = {
  /** Anahtarı yalnızca sunucu görür; hiçbir yanıtta dönmez. */
  apiKey: string | null;
  /** Bulunan ortam değişkeni ADI (tanılama için; değer asla değil). */
  keyName: string | null;
  model: string;
};

/** Ortam değişkeninden sağlayıcı yapılandırmasını okur (sunucu). */
export function geminiConfig(): GeminiConfig {
  let keyName: string | null = null;
  let apiKey: string | null = null;
  for (const name of KEY_CANDIDATES) {
    const v = process.env[name];
    if (v && v.trim()) {
      keyName = name;
      apiKey = v.trim();
      break;
    }
  }
  const model = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  return { apiKey, keyName, model };
}

/**
 * Tanılama çıktısı — API anahtarı DEĞİL, yalnızca varlık/ad/model bilgisi.
 * GET /api/ai üzerinden "mevcut ortam değişkeninin erişilebilirliği" doğrulanır.
 */
export function geminiDiagnostics(): { configured: boolean; keyName: string | null; model: string; api: string } {
  const c = geminiConfig();
  return { configured: Boolean(c.apiKey), keyName: c.keyName, model: c.model, api: API_BASE };
}

export type GeminiTextResult = {
  text: string;
  model: string;
  provider: "google-gemini";
  usage?: { inputTokens?: number; outputTokens?: number };
};

export type GeminiTextOptions = {
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Varsayılan 20 saniye — model yavaşsa istek erken bırakılır (fallback'e düşülür). */
  timeoutMs?: number;
};

/**
 * Metin üretimi (generateContent). Anahtar yoksa ya da HTTP/hataya düşerse
 * Error fırlatır — çağıran taraf mevcut şablon motoruna döner.
 * Hata mesajında anahtar ASLA geçmez.
 */
export async function generateGeminiText(opts: GeminiTextOptions): Promise<GeminiTextResult> {
  const { apiKey, model } = geminiConfig();
  if (!apiKey) throw new Error("GEMINI_KEY_MISSING");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, // anahtar URL'de DEĞİL
      signal: controller.signal,
      body: JSON.stringify({
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: opts.maxOutputTokens ?? 1024,
        },
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        detail = String(j.error?.message ?? "").slice(0, 200);
      } catch {
        /* gövde okunamadı */
      }
      throw new Error(`GEMINI_HTTP_${res.status}${detail ? `: ${detail}` : ""}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new Error("GEMINI_EMPTY_RESPONSE");

    return {
      text,
      model,
      provider: "google-gemini",
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount,
        outputTokens: json.usageMetadata?.candidatesTokenCount,
      },
    };
  } catch (e) {
    const err = e as Error;
    if (err?.name === "AbortError") throw new Error("GEMINI_TIMEOUT");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Modelin döndüğü metinden güvenli biçimde JSON çıkarır (```json çitleri dahil).
 * Geçersizse null döner → çağıran taraf fallback yapar.
 */
export function parseGeminiJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
