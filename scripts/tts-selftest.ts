/**
 * lib/tts.ts birim testleri — SAHTE speechSynthesis ile (gerçek cihaz testi DEĞİLDİR).
 * Çalıştır:  npx tsx scripts/tts-selftest.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { __resetTtsLogOnce, createTts, isTurkishVoice, pickTurkishVoice, splitForSpeech, type SpeakResult, type TtsHost } from "../lib/tts";

type Handler = ((e?: unknown) => void) | null;
class FakeUtter {
  text: string; lang = ""; voice: unknown = null; volume = 1; rate = 1; pitch = 1;
  onstart: Handler = null; onend: Handler = null; onerror: Handler = null;
  constructor(t: string) { this.text = t; }
}
type V = { name: string; lang: string; default?: boolean; localService?: boolean };

function setup(opts: { voices?: V[]; autoPlay?: boolean; startDelay?: number; hang?: boolean } = {}) {
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let now = 0, tid = 0;
  const listeners = new Map<string, Array<(e?: unknown) => void>>();
  const docListeners = new Map<string, Array<() => void>>();
  const doc = {
    visibilityState: "visible",
    addEventListener: (t: string, f: () => void) => { (docListeners.get(t) ?? docListeners.set(t, []).get(t)!).push(f); },
    removeEventListener: (t: string, f: () => void) => { docListeners.set(t, (docListeners.get(t) ?? []).filter((x) => x !== f)); },
  };
  const spoken: FakeUtter[] = [];
  const synth = {
    speaking: false, pending: false, paused: false,
    voices: (opts.voices ?? []) as V[],
    cancelCalls: 0, resumeCalls: 0, throwOnSpeak: false,
    queue: [] as FakeUtter[],
    cur: null as FakeUtter | null,
    vcListeners: [] as Array<() => void>,
    getVoices() { return this.voices; },
    addEventListener(t: string, f: () => void) { if (t === "voiceschanged") this.vcListeners.push(f); },
    removeEventListener(t: string, f: () => void) { this.vcListeners = this.vcListeners.filter((x) => x !== f); },
    speak(u: FakeUtter) {
      if (this.throwOnSpeak) throw new Error("boom");
      spoken.push(u); this.queue.push(u); this.pending = true;
      if (opts.autoPlay !== false) this.pump();
    },
    pump() {
      if (this.cur || !this.queue.length) return;
      const u = this.queue.shift()!; this.cur = u; this.speaking = true; this.pending = this.queue.length > 0;
      timers.push({ at: now + (opts.startDelay ?? 10), id: ++tid, fn: () => { if (this.cur !== u) return; u.onstart?.(); if (opts.hang) return; timers.push({ at: now + 50, id: ++tid, fn: () => { if (this.cur !== u) return; this.cur = null; this.speaking = false; u.onend?.(); this.pump(); } }); } });
    },
    cancel() {
      this.cancelCalls++;
      const dropped = [this.cur, ...this.queue].filter(Boolean) as FakeUtter[];
      this.cur = null; this.queue = []; this.speaking = false; this.pending = false;
      // gerçek tarayıcılar iptal edilenlere error:canceled/interrupted yollar (asenkron)
      for (const u of dropped) timers.push({ at: now + 5, id: ++tid, fn: () => u.onerror?.({ error: "interrupted" }) });
    },
    resume() { this.resumeCalls++; this.paused = false; },
    fail(err: string) { const u = this.cur; this.cur = null; this.speaking = false; u?.onerror?.({ error: err }); },
  };
  const host = {
    speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtter, document: doc,
    addEventListener: (t: string, f: (e?: unknown) => void) => { (listeners.get(t) ?? listeners.set(t, []).get(t)!).push(f); },
    removeEventListener: (t: string, f: (e?: unknown) => void) => { listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== f)); },
    setTimeout: (fn: () => void, ms = 0) => { const id = ++tid; timers.push({ at: now + ms, fn, id }); return id; },
    clearTimeout: (id: number) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
  } as unknown as TtsHost & { __dvTtsLog?: Array<{ code: string; detail?: string }> };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift(); now = Math.max(now, t.at); t.fn();
    }
    now = end;
  };
  const emit = (t: string) => (listeners.get(t) ?? []).forEach((f) => f());
  const setVisibility = (v: string) => { doc.visibilityState = v; (docListeners.get("visibilitychange") ?? []).forEach((f) => f()); };
  const codes = () => (host.__dvTtsLog ?? []).map((l) => l.code);
  return { host, synth, spoken, advance, emit, setVisibility, codes, listeners };
}
const TR: V = { name: "Yelda", lang: "tr-TR", localService: true };

test.beforeEach(() => __resetTtsLogOnce());

test("1 normal konuşma: başladı/bitti olayları + onDone", () => {
  const e = setup({ voices: [TR] }); const ev: boolean[] = [];
  const tts = createTts(e.host, { onSpeakingChange: (s) => ev.push(s) });
  let res = undefined as SpeakResult | undefined;
  tts.speak("Merhaba, nasıl yardımcı olabilirim?", { onDone: (r) => (res = r) });
  assert.equal(e.spoken.length, 1); // ilk konuşma EŞZAMANLI (dokunuş bağlamı)
  assert.equal(e.spoken[0].lang, "tr-TR"); assert.equal((e.spoken[0].voice as V).name, "Yelda"); assert.equal(e.spoken[0].volume, 1);
  e.advance(500);
  assert.deepEqual(ev, [true, false]); assert.equal(res?.ok, true); assert.equal(res?.reason, "done"); assert.deepEqual(e.codes(), []);
});

test("2 art arda konuşma: eskisi 'superseded', yenisi tamamlanır, sahte hata kaydı yok", () => {
  const e = setup({ voices: [TR] }); const tts = createTts(e.host);
  const r: Record<string, SpeakResult> = {};
  tts.speak("Birinci yanıt.", { onDone: (x) => (r.a = x) });
  e.advance(20);
  tts.speak("İkinci yanıt.", { onDone: (x) => (r.b = x) });
  e.advance(1000);
  assert.equal(r.a.reason, "superseded"); assert.equal(r.b.reason, "done"); assert.deepEqual(e.codes(), []);
  assert.equal(tts.isSpeaking(), false);
});

test("3 Türkçe ses yok → varsayılan ses + kayıt; liste boş → no_voices + lang tr-TR", () => {
  let e = setup({ voices: [{ name: "Samantha", lang: "en-US", default: true }] });
  createTts(e.host).speak("Merhaba"); e.advance(300);
  assert.equal(e.spoken[0].lang, "tr-TR"); assert.equal(e.spoken[0].voice, null); assert.deepEqual(e.codes(), ["no_turkish_voice"]);
  __resetTtsLogOnce();
  e = setup({ voices: [] });
  createTts(e.host).speak("Merhaba"); e.advance(300);
  assert.equal(e.spoken[0].lang, "tr-TR"); assert.equal(e.spoken[0].voice, null); assert.deepEqual(e.codes(), ["no_voices"]);
});

test("4 Android 'tr_TR' biçimi tanınır; voiceschanged ile geç gelen ses kullanılır", () => {
  assert.equal(isTurkishVoice({ lang: "tr_TR" }), true); assert.equal(isTurkishVoice({ lang: "en-US" }), false);
  assert.equal(pickTurkishVoice([{ lang: "en-US" }, { lang: "tr_TR", name: "x" }] as never)?.name, "x");
  const e = setup({ voices: [] }); const tts = createTts(e.host);
  e.synth.voices = [{ name: "Google Türkçe", lang: "tr_TR" }]; e.synth.vcListeners.forEach((f) => f());
  tts.speak("Merhaba"); e.advance(300);
  assert.equal((e.spoken[0].voice as V).name, "Google Türkçe"); assert.equal(e.spoken[0].lang, "tr-TR");
});

test("5 kullanıcı durdurur: onDone 'stopped', konuşma bayrağı kapanır, eski olaylar sessiz", () => {
  const e = setup({ voices: [TR] }); const ev: boolean[] = []; const tts = createTts(e.host, { onSpeakingChange: (s) => ev.push(s) });
  let res = undefined as SpeakResult | undefined; tts.speak("Uzun bir yanıt.", { onDone: (r) => (res = r) }); e.advance(20);
  tts.cancel("user"); e.advance(2000);
  assert.equal(res?.reason, "stopped"); assert.equal(tts.isSpeaking(), false); assert.deepEqual(ev, [true, false]); assert.deepEqual(e.codes(), []);
});

test("6 arka plana alma iptal eder; öne gelince takılı kuyruk temizlenir", () => {
  const e = setup({ voices: [TR] }); const tts = createTts(e.host);
  let res = undefined as SpeakResult | undefined; tts.speak("Merhaba dünya.", { onDone: (r) => (res = r) }); e.advance(20);
  e.setVisibility("hidden"); assert.equal(res?.reason, "cancelled"); assert.equal(tts.isSpeaking(), false);
  e.synth.paused = true; const before = e.synth.cancelCalls; e.setVisibility("visible");
  assert.ok(e.synth.cancelCalls > before);
  // tekrar açıldıktan sonra konuşma çalışır
  e.synth.paused = false; res = undefined; tts.speak("Tekrar.", { onDone: (r) => (res = r) }); e.advance(1000); assert.equal((res as SpeakResult | undefined)?.ok, true);
});

test("7 tarayıcı engelliyor: hiç onstart yok → blocked kaydı + onBlocked", () => {
  const e = setup({ voices: [TR], autoPlay: false }); let blocked = 0; const tts = createTts(e.host, { onBlocked: () => blocked++ });
  let res = undefined as SpeakResult | undefined; tts.speak("Merhaba.", { onDone: (r) => (res = r) }); e.advance(5100);
  assert.equal(res?.reason, "blocked"); assert.equal(blocked, 1); assert.deepEqual(e.codes(), ["blocked"]);
});

test("8 başlar ama bitmez: incomplete kaydı + temizlik", () => {
  const e = setup({ voices: [TR], hang: true }); const ev: boolean[] = []; const tts = createTts(e.host, { onSpeakingChange: (s) => ev.push(s) });
  let res = undefined as SpeakResult | undefined; tts.speak("Merhaba.", { onDone: (r) => (res = r) });
  e.advance(1000); assert.equal(tts.isSpeaking(), true); // başladı
  e.advance(60_000);
  assert.equal(res?.reason, "incomplete"); assert.deepEqual(e.codes(), ["incomplete"]); assert.equal(tts.isSpeaking(), false); assert.deepEqual(ev, [true, false]);
});

test("9 TTS desteklenmiyor: kayıt + onDone(unsupported), metin akışı etkilenmez", () => {
  const e = setup(); const bare = { ...e.host, speechSynthesis: undefined, SpeechSynthesisUtterance: undefined } as unknown as TtsHost & { __dvTtsLog?: Array<{ code: string }> };
  const tts = createTts(bare); let res = undefined as SpeakResult | undefined;
  tts.speak("Merhaba", { onDone: (r) => (res = r) });
  assert.equal(tts.supported, false); assert.equal(res?.reason, "unsupported"); assert.deepEqual((bare.__dvTtsLog ?? []).map((l) => l.code), ["unsupported"]);
});

test("10 motor hataları: speak() atar / not-allowed / language-unavailable→yeniden dene / beklenmedik iptal", () => {
  let e = setup({ voices: [TR] }); e.synth.throwOnSpeak = true;
  let res = undefined as SpeakResult | undefined; createTts(e.host).speak("x yanıtı.", { onDone: (r) => (res = r) });
  assert.equal(res?.reason, "error"); assert.deepEqual(e.codes(), ["engine_init"]);

  e = setup({ voices: [TR], autoPlay: false }); let blocked = 0; let t = createTts(e.host, { onBlocked: () => blocked++ });
  t.speak("Merhaba.", { onDone: (r) => (res = r) }); e.synth.cur = e.spoken[0]; e.synth.fail("not-allowed");
  assert.equal(res?.reason, "blocked"); assert.equal(blocked, 1); assert.ok(e.codes().includes("blocked"));

  e = setup({ voices: [TR], autoPlay: false }); t = createTts(e.host);
  res = undefined as SpeakResult | undefined; t.speak("Merhaba.", { onDone: (r) => (res = r) });
  e.synth.cur = e.spoken[0]; e.synth.fail("language-unavailable"); e.advance(100);
  assert.equal(e.spoken.length, 2); assert.equal(e.spoken[1].voice, null); assert.equal(e.spoken[1].lang, ""); // ses/dil dayatılmadan
  e.synth.pump(); e.advance(500); assert.equal(res?.ok, true);

  e = setup({ voices: [TR], autoPlay: false }); t = createTts(e.host); res = undefined;
  t.speak("Merhaba.", { onDone: (r) => (res = r) }); e.synth.cur = e.spoken[0]; e.synth.fail("interrupted");
  assert.equal((res as SpeakResult | undefined)?.reason, "cancelled"); assert.ok(e.codes().includes("cancelled"));
});

test("11 uzun metin cümle parçalarına bölünür (Chrome 15 sn kesmesi), hepsi bitince onDone", () => {
  const long = Array.from({ length: 12 }, (_, i) => `Bu ${i + 1}. cümle, sipariş özetini ve kampanya bilgisini sesli olarak okuyan uzun bir cümledir.`).join(" ");
  for (const c of splitForSpeech(long)) assert.ok(c.length <= 180, `parça uzun: ${c.length}`);
  assert.equal(splitForSpeech(long).join(" "), long);
  const noPunct = "kelime ".repeat(120);
  for (const c of splitForSpeech(noPunct)) assert.ok(c.length <= 180);
  const e = setup({ voices: [TR] }); const tts = createTts(e.host); let res = undefined as SpeakResult | undefined;
  tts.speak(long, { onDone: (r) => (res = r) }); assert.ok(e.spoken.length > 3);
  e.advance(e.spoken.length * 80 + 100); assert.equal(res?.reason, "done");
});

test("12 kilit: click ile sessiz utterance; onstart ile 'açık'; ardından gelen speak onu iptal ETMEZ", () => {
  const e = setup({ voices: [TR] }); const tts = createTts(e.host);
  e.emit("click");
  assert.equal(e.spoken.length, 1); assert.equal(e.spoken[0].volume, 0); assert.equal(tts.isUnlocked(), false);
  const c0 = e.synth.cancelCalls; tts.speak("Merhaba.");
  assert.equal(e.synth.cancelCalls, c0, "kilit utterance'ı varken cancel() çağrılmamalı (iOS yutma)");
  e.advance(1000); assert.equal(tts.isUnlocked(), true); assert.equal(e.spoken.length, 2);
  // pointerdown kilit için kullanılmaz
  assert.equal(e.listeners.get("pointerdown")?.length ?? 0, 0);
});

test("13 kilit açıldıktan sonraki art arda konuşma cancel sonrası kısa gecikmeyle başlar (iOS)", () => {
  const e = setup({ voices: [TR] }); const tts = createTts(e.host);
  tts.speak("Bir."); e.advance(1000); assert.equal(tts.isUnlocked(), true);
  tts.speak("İki yanıtı."); e.advance(5); tts.speak("Üç yanıtı."); const n = e.spoken.length;
  assert.equal(e.spoken.length, n); e.advance(2000); assert.ok(e.spoken.at(-1)!.text.startsWith("Üç"));
});
