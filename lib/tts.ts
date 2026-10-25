/**
 * DampingVar — mobil uyumlu, ÜCRETSİZ tarayıcı TTS denetleyicisi.
 *
 * Yalnızca tarayıcının yerleşik SpeechSynthesis motorunu kullanır (dış API /
 * ücretli servis YOK). components/voice.tsx içindeki mevcut `speak(text)`
 * çağrılarının arkasındaki motor budur.
 *
 * Mobilde sessiz kalmanın bilinen nedenleri ve burada karşılıkları:
 *  1. İlk konuşma KULLANICI AKTİVASYONU içinde (click/touchend/keydown) açılmalı.
 *     `pointerdown` mobilde aktivasyon sayılmaz → kilit `click/touchend/keydown`'da
 *     denenir, yalnız utterance GERÇEKTEN başlayınca (onstart) "açıldı" sayılır.
 *  2. iOS: cancel() ile aynı tick'te speak() yutulur → yalnızca gerçekten
 *     konuşma/kuyruk varsa cancel edilir ve kısa gecikmeyle konuşulur. İlk
 *     konuşma (kuyruk boş) EŞZAMANLI başlatılır ki dokunuş bağlamı kaybolmasın.
 *  3. Ses listesi geç gelir (Android/iOS) → `voiceschanged` ile önbelleklenir.
 *     Android'de `voice.lang` "tr_TR" biçiminde olabilir → normalize edilir.
 *  4. Chrome ~15 sn'den uzun utterance'ı keser → metin cümle parçalarına bölünür.
 *  5. Bazı motorlarda onend hiç gelmez → tamamlanma bekçisi (watchdog).
 *  6. Sayfa arka plana alınınca iOS/Android kuyruğu takılır → arka planda
 *     iptal, öne gelince kuyruk temizlenir.
 *
 * Hata kaydı: console.warn + `window.__dvTtsLog` halka tamponu (son 50 kayıt).
 */

export type TtsErrorCode =
  | "unsupported" // TTS desteklenmiyor
  | "engine_init" // ses motoru başlatılamıyor / motor hatası
  | "cancelled" // konuşma isteği (beklenmedik şekilde) iptal edildi
  | "no_voices" // ses listesi boş
  | "no_turkish_voice" // Türkçe ses yok → varsayılan ses
  | "blocked" // mobil tarayıcı konuşmayı engelliyor
  | "incomplete"; // yanıt başladı ama tamamlanmadı

export type TtsLogEntry = { t: number; code: TtsErrorCode; detail?: string };

export type SpeakResult = {
  ok: boolean;
  reason: "done" | "empty" | "unsupported" | "stopped" | "cancelled" | "superseded" | "blocked" | "incomplete" | "error";
};

export type TtsEvents = {
  /** Konuşma başladı (true) / bitti-iptal-hata (false). */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Tarayıcı konuşmayı engelledi — kullanıcı dokunuşuyla tekrar denenmeli. */
  onBlocked?: () => void;
};

type SynthLike = {
  speaking: boolean;
  pending: boolean;
  paused: boolean;
  speak: (u: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  resume: () => void;
  getVoices: () => SpeechSynthesisVoice[];
  addEventListener?: (type: string, fn: () => void) => void;
  removeEventListener?: (type: string, fn: () => void) => void;
  onvoiceschanged?: (() => void) | null;
};

export type TtsHost = {
  speechSynthesis?: SynthLike;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
  document?: Document;
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
  setTimeout: Window["setTimeout"];
  clearTimeout: Window["clearTimeout"];
  __dvTtsLog?: TtsLogEntry[];
};

const LANG = "tr-TR";
const MAX_CHUNK = 180;
/** speak() çağrısından sonra hiçbir parça başlamazsa "engelleniyor" say. */
const NO_START_MS = 5000;
const LOG_MAX = 50;

const loggedOnce = new Set<TtsErrorCode>();

export function ttsLog(host: TtsHost | undefined, code: TtsErrorCode, detail?: string, once = false) {
  if (once) {
    if (loggedOnce.has(code)) return;
    loggedOnce.add(code);
  }
  const entry: TtsLogEntry = { t: Date.now(), code, detail };
  try {
    if (host) {
      const buf = (host.__dvTtsLog ??= []);
      buf.push(entry);
      if (buf.length > LOG_MAX) buf.splice(0, buf.length - LOG_MAX);
    }
    console.warn("[DampingVar TTS]", code, detail ?? "");
  } catch {
    /* kayıt hiçbir zaman akışı bozmaz */
  }
}

/** Test için: "bir kez" kayıt hafızasını sıfırla. */
export function __resetTtsLogOnce() {
  loggedOnce.clear();
}

export function isTurkishVoice(v: { lang?: string }): boolean {
  const l = (v.lang || "").toLowerCase().replace(/_/g, "-");
  return l === "tr" || l.startsWith("tr-");
}

export function pickTurkishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const tr = voices.filter(isTurkishVoice);
  if (!tr.length) return undefined;
  return (
    tr.find((v) => v.localService && (v.lang || "").toLowerCase().replace(/_/g, "-") === "tr-tr") ||
    tr.find((v) => (v.lang || "").toLowerCase().replace(/_/g, "-") === "tr-tr") ||
    tr[0]
  );
}

/** Metni cümle sınırlarından ≤ MAX_CHUNK karakterlik parçalara böler. */
export function splitForSpeech(text: string, max = MAX_CHUNK): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?…:;])\s+/);
  const out: string[] = [];
  let cur = "";
  const push = (s: string) => {
    if (s) out.push(s);
  };
  for (const s of sentences) {
    if (s.length > max) {
      push(cur);
      cur = "";
      // Uzun cümle: virgül, sonra boşluk sınırından böl.
      let rest = s;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(", ", max);
        if (cut < max * 0.4) cut = rest.lastIndexOf(" ", max);
        if (cut < 1) cut = max;
        push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trim();
      }
      cur = rest;
      continue;
    }
    if (cur && cur.length + 1 + s.length > max) {
      push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  push(cur);
  return out;
}

type Session = {
  gen: number;
  total: number;
  ended: number;
  started: boolean;
  finished: boolean;
  fallback: boolean;
  /** Her start() denemesi için artar; eski denemenin gecikmeli olayları yok sayılır. */
  attempt: number;
  text: string;
  onDone?: (r: SpeakResult) => void;
  noStartTimer?: number;
  doneTimer?: number;
};

export type Tts = ReturnType<typeof createTts>;

export function createTts(host: TtsHost | undefined, events: TtsEvents = {}) {
  const synth = host?.speechSynthesis;
  const Utter = host?.SpeechSynthesisUtterance;
  const supported = Boolean(host && synth && Utter);

  let voices: SpeechSynthesisVoice[] = [];
  let gen = 0;
  let session: Session | null = null;
  let unlocked = false;
  let unlocking = false;
  let speakingFlag = false;
  let destroyed = false;
  const cleanups: Array<() => void> = [];

  const setSpeaking = (v: boolean) => {
    if (speakingFlag === v) return;
    speakingFlag = v;
    try {
      events.onSpeakingChange?.(v);
    } catch {
      /* yoksay */
    }
  };

  if (!supported || !host || !synth || !Utter) {
    ttsLog(host, "unsupported", "speechSynthesis/SpeechSynthesisUtterance yok", true);
    return {
      supported: false as const,
      speak: (_t: string, o?: { onDone?: (r: SpeakResult) => void }) => o?.onDone?.({ ok: false, reason: "unsupported" }),
      cancel: (_r?: string) => {},
      unlock: () => {},
      isSpeaking: () => false,
      isUnlocked: () => false,
      getVoiceCount: () => 0,
      destroy: () => {},
    };
  }

  const H: TtsHost = host;
  const clearTimers = (s: Session) => {
    if (s.noStartTimer) H.clearTimeout(s.noStartTimer);
    if (s.doneTimer) H.clearTimeout(s.doneTimer);
    s.noStartTimer = s.doneTimer = undefined;
  };

  function finish(s: Session, result: SpeakResult, cancelEngine: boolean) {
    if (s.finished) return;
    s.finished = true;
    clearTimers(s);
    if (session === s) session = null;
    if (cancelEngine) {
      try {
        synth!.cancel();
      } catch {
        /* yoksay */
      }
    }
    if (!session) setSpeaking(false);
    try {
      s.onDone?.(result);
    } catch {
      /* yoksay */
    }
  }

  /* ---- ses listesi: geç yüklenme (voiceschanged) ---- */
  const refreshVoices = () => {
    try {
      const v = synth.getVoices();
      if (v && v.length) voices = v;
    } catch (e) {
      ttsLog(H, "engine_init", `getVoices: ${String(e)}`, true);
    }
  };
  refreshVoices();
  const onVoices = () => refreshVoices();
  if (synth.addEventListener) {
    synth.addEventListener("voiceschanged", onVoices);
    cleanups.push(() => synth.removeEventListener?.("voiceschanged", onVoices));
  } else {
    synth.onvoiceschanged = onVoices;
    cleanups.push(() => {
      synth.onvoiceschanged = null;
    });
  }

  /* ---- kilit: gerçek kullanıcı aktivasyonunda sessiz utterance ---- */
  function unlock() {
    if (unlocked || unlocking || destroyed) return;
    try {
      const u = new Utter!(".");
      u.volume = 0;
      u.lang = LANG;
      unlocking = true;
      u.onstart = () => {
        unlocked = true;
      };
      const done = () => {
        unlocking = false;
        if (unlocked) removeUnlockListeners();
      };
      u.onend = done;
      u.onerror = done;
      synth!.speak(u);
      // Motor hiç olay vermezse kilit takılı kalmasın.
      H.setTimeout(() => {
        unlocking = false;
      }, 3000);
    } catch (e) {
      unlocking = false;
      ttsLog(H, "engine_init", `unlock: ${String(e)}`, true);
    }
  }
  const unlockEvents = ["click", "touchend", "keydown"] as const;
  const onGesture = () => unlock();
  const removeUnlockListeners = () => {
    for (const ev of unlockEvents) H.removeEventListener(ev, onGesture, true);
  };
  for (const ev of unlockEvents) H.addEventListener(ev, onGesture, { capture: true, passive: true });
  cleanups.push(removeUnlockListeners);

  /* ---- konuşma ---- */
  function start(s: Session) {
    refreshVoices();
    const chunks = splitForSpeech(s.text);
    if (!chunks.length) {
      finish(s, { ok: true, reason: "empty" }, false);
      return;
    }
    s.total = chunks.length;
    const attempt = ++s.attempt;
    const stale = () => s.finished || s.gen !== gen || s.attempt !== attempt;
    const tr = s.fallback ? undefined : pickTurkishVoice(voices);
    if (!tr && !s.fallback) {
      // Türkçe ses listede görünmese bile lang=tr-TR istenir: Android/iOS motoru kendi Türkçe sesini
      // seçebilir. İngilizce varsayılan sese YALNIZ motor tr-TR'yi reddederse düşülür (aşağıda).
      if (!voices.length) ttsLog(H, "no_voices", "getVoices() boş — lang=tr-TR ile motorun kendi sesi", true);
      else ttsLog(H, "no_turkish_voice", `listede Türkçe ses yok (${voices.length} ses); lang=tr-TR isteniyor, motor reddederse varsayılan ses`, true);
    }

    let utterances: SpeechSynthesisUtterance[];
    try {
      utterances = chunks.map((c, idx) => {
        const u = new Utter!(c);
        u.rate = 1;
        u.pitch = 1;
        u.volume = 1;
        if (s.fallback) {
          // Son çare: ne ses ne dil dayatılır; motor kendi varsayılanını seçer.
        } else if (tr) {
          u.voice = tr;
          u.lang = LANG;
        } else {
          u.lang = LANG;
        }
        u.onstart = () => {
          if (stale()) return;
          s.started = true;
          unlocked = true;
          if (s.noStartTimer) H.clearTimeout(s.noStartTimer);
          s.noStartTimer = undefined;
          setSpeaking(true);
        };
        u.onend = () => {
          if (stale()) return;
          s.ended += 1;
          if (s.ended >= s.total) finish(s, { ok: true, reason: "done" }, false);
        };
        u.onerror = (ev) => {
          if (stale()) return; // bizim iptalimiz → eski olay
          const err = (ev as SpeechSynthesisErrorEvent).error || "unknown";
          if (err === "canceled" || err === "interrupted") {
            ttsLog(H, "cancelled", `parça ${idx + 1}/${s.total}: ${err}`);
            finish(s, { ok: false, reason: "cancelled" }, true);
          } else if (err === "not-allowed") {
            ttsLog(H, "blocked", `not-allowed (parça ${idx + 1})`);
            finish(s, { ok: false, reason: "blocked" }, true);
            events.onBlocked?.();
          } else if (!s.fallback && (err === "language-unavailable" || err === "voice-unavailable" || err === "invalid-argument")) {
            ttsLog(H, "engine_init", `${err} → ses/dil dayatmadan yeniden deneniyor`);
            s.attempt += 1; // kendi cancel()'ımızın eski parçalardan getireceği "interrupted" olayları yok sayılsın
            try {
              synth!.cancel();
            } catch {
              /* yoksay */
            }
            clearTimers(s);
            s.fallback = true;
            s.ended = 0;
            s.started = false;
            H.setTimeout(() => {
              if (!s.finished && s.gen === gen) start(s);
            }, 60);
          } else {
            ttsLog(H, "engine_init", `motor hatası: ${err}`);
            finish(s, { ok: false, reason: "error" }, true);
          }
        };
        return u;
      });
    } catch (e) {
      ttsLog(H, "engine_init", `utterance oluşturulamadı: ${String(e)}`);
      finish(s, { ok: false, reason: "error" }, false);
      return;
    }

    try {
      for (const u of utterances) synth!.speak(u);
      if (synth!.paused) synth!.resume();
    } catch (e) {
      ttsLog(H, "engine_init", `speak(): ${String(e)}`);
      finish(s, { ok: false, reason: "error" }, true);
      return;
    }

    // Hiçbir parça başlamadı → tarayıcı engelliyor (aktivasyon yok / ses kilidi).
    s.noStartTimer = H.setTimeout(() => {
      if (stale() || s.started) return;
      ttsLog(H, "blocked", `${NO_START_MS} ms içinde konuşma başlamadı (mobil tarayıcı engelliyor olabilir)`);
      finish(s, { ok: false, reason: "blocked" }, true);
      events.onBlocked?.();
    }, NO_START_MS);

    // Başladı ama bitmedi (onend hiç gelmedi) → bekçi.
    const budget = 8000 + s.text.length * 180;
    s.doneTimer = H.setTimeout(() => {
      if (stale()) return;
      ttsLog(H, "incomplete", `yanıt ${budget} ms içinde tamamlanmadı (${s.ended}/${s.total} parça)`);
      finish(s, { ok: false, reason: s.started ? "incomplete" : "blocked" }, true);
    }, budget);
  }

  function speak(text: string, opts?: { onDone?: (r: SpeakResult) => void }) {
    if (destroyed) {
      opts?.onDone?.({ ok: false, reason: "cancelled" });
      return;
    }
    const prev = session;
    const myGen = ++gen;
    if (prev) {
      // Art arda konuşma: öncekini sessizce bırak (tasarım gereği, hata değil).
      prev.finished = true;
      clearTimers(prev);
      session = null;
      try {
        prev.onDone?.({ ok: false, reason: "superseded" });
      } catch {
        /* yoksay */
      }
    }
    const s: Session = { gen: myGen, total: 0, ended: 0, started: false, finished: false, fallback: false, attempt: 0, text, onDone: opts?.onDone };
    session = s;

    // Yalnız sessiz kilit utterance'ı kuyruktaysa cancel ETME (iOS: cancel+speak aynı tick yutulur).
    const lockOnly = unlocking && !prev;
    const busy = Boolean(prev) || (!lockOnly && (synth!.speaking || synth!.pending || synth!.paused));
    if (busy) {
      try {
        synth!.cancel();
      } catch {
        /* yoksay */
      }
      // cancel sonrası kısa gecikme; kilit açılmadıysa gecikmesiz (aktivasyon bağlamı için) denenir.
      if (unlocked) {
        H.setTimeout(() => {
          if (!s.finished && s.gen === gen) start(s);
        }, 60);
        return;
      }
    }
    start(s);
  }

  function cancel(reason = "user") {
    gen += 1;
    const s = session;
    session = null;
    if (s && !s.finished) {
      s.finished = true;
      clearTimers(s);
      try {
        s.onDone?.({ ok: false, reason: reason === "user" || reason === "mic" || reason === "close" ? "stopped" : "cancelled" });
      } catch {
        /* yoksay */
      }
    }
    try {
      synth!.cancel();
    } catch {
      /* yoksay */
    }
    setSpeaking(false);
  }

  /* ---- sayfa arka plana alınırsa / geri gelirse ---- */
  const doc = H.document;
  if (doc) {
    const onVis = () => {
      if (doc.visibilityState === "hidden") {
        if (session) cancel("background");
      } else {
        // iOS/Android öne gelince takılı kuyruğu temizle.
        try {
          if (!session && (synth.speaking || synth.paused || synth.pending) && !unlocking) synth.cancel();
        } catch {
          /* yoksay */
        }
        refreshVoices();
      }
    };
    doc.addEventListener("visibilitychange", onVis);
    cleanups.push(() => doc.removeEventListener("visibilitychange", onVis));
  }
  const onPageHide = () => {
    if (session) cancel("background");
  };
  H.addEventListener("pagehide", onPageHide);
  cleanups.push(() => H.removeEventListener("pagehide", onPageHide));

  return {
    supported: true as const,
    speak,
    cancel,
    unlock,
    isSpeaking: () => speakingFlag,
    isUnlocked: () => unlocked,
    getVoiceCount: () => voices.length,
    destroy() {
      cancel("destroy");
      destroyed = true;
      for (const c of cleanups.splice(0)) {
        try {
          c();
        } catch {
          /* yoksay */
        }
      }
    },
  };
}
