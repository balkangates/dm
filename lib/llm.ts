import "server-only";
/**
 * LLM sağlayıcıları: Gemini · Claude · ChatGPT (OpenAI) · OpenRouter.
 * Anahtarlar AES-256-GCM ile şifrelenip saklanır (sır: LLM_KEY_SECRET ortam değişkeni, ≥16 karakter).
 * Anahtar hiçbir zaman istemciye, log'a ya da hata mesajına yazılmaz.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type LlmProvider = "gemini" | "claude" | "openai" | "openrouter";
export const LLM_PROVIDERS: Array<{ id: LlmProvider; label: string; defaultModel: string }> = [
  { id: "gemini", label: "Gemini (Google)", defaultModel: "gemini-2.5-flash" },
  { id: "claude", label: "Claude (Anthropic)", defaultModel: "claude-sonnet-5-5" },
  { id: "openai", label: "ChatGPT (OpenAI)", defaultModel: "gpt-4o-mini" },
  { id: "openrouter", label: "OpenRouter", defaultModel: "anthropic/claude-sonnet-4.5" },
];
export const isProvider = (v: unknown): v is LlmProvider => LLM_PROVIDERS.some((p) => p.id === v);

function secretKey(): Buffer {
  const s = process.env.LLM_KEY_SECRET ?? "";
  if (s.length < 16) throw new Error("LLM_KEY_SECRET ortam değişkeni tanımlı değil (en az 16 karakter). Vercel/Netlify ortam değişkenlerine ekleyin.");
  return createHash("sha256").update(s).digest();
}
export const llmSecretConfigured = () => (process.env.LLM_KEY_SECRET ?? "").length >= 16;

export function encryptKey(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}
export function decryptKey(blob: string): string {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Anahtar biçimi geçersiz.");
  const d = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}

/** Tek istek/yanıt üretimi. Hata mesajları anahtar içermez. */
export async function generate(provider: LlmProvider, apiKey: string, model: string, prompt: string, maxTokens = 400): Promise<string> {
  const signal = AbortSignal.timeout(25000);
  let res: Response;
  if (provider === "gemini") {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal, headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: {
          maxOutputTokens: maxTokens, temperature: 0.7,
          // 2.5 Flash varsayılan olarak "düşünür"; düşünme token'ları çıktı bütçesini yer ve yanıt boş kalır. Flash için kapatılır.
          ...(/2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        } }),
    });
  } else if (provider === "claude") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal, headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
  } else {
    const url = provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
    res = await fetch(url, {
      method: "POST", signal, headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (j.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    throw new Error(String(err).slice(0, 200).replace(apiKey, "***"));
  }
  let text = "";
  if (provider === "gemini") {
    const parts = ((j.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined)?.[0]?.content?.parts ?? []);
    text = parts.map((p) => p.text ?? "").join("");
  } else if (provider === "claude") {
    text = ((j.content as Array<{ text?: string }> | undefined) ?? []).map((c) => c.text ?? "").join("");
  } else {
    text = (j.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content ?? "";
  }
  if (!text.trim()) {
    const fr = provider === "gemini" ? (j.candidates as Array<{ finishReason?: string }> | undefined)?.[0]?.finishReason : undefined;
    const block = provider === "gemini" ? (j.promptFeedback as { blockReason?: string } | undefined)?.blockReason : undefined;
    throw new Error(`Sağlayıcı boş yanıt döndürdü${fr ? ` (finishReason: ${fr})` : ""}${block ? ` (engellendi: ${block})` : ""}. Model adını ve anahtar kısıtlarını kontrol et.`);
  }
  return text.trim();
}
