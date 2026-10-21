"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { locale as SPEECH_LANGUAGE, t } from "@/lib/i18n";
import { micActive, micOutcome, micReducer } from "@/lib/mic-state";
import { pickVoice } from "@/lib/speech-voice";
import { MicIcon } from "./assistant-button";

const MUTE_KEY = "assistant-muted";
const MAX_LENGTH = 500;
/** Empty 8-bit mono WAV used to unlock audio playback inside a tap (see unlockAudio). */
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
/** A press longer than this counts as "hold to talk"; a shorter one toggles listening. */
const HOLD_MS = 450;
/** No audio capture started this long after start(): give up instead of hanging in "listening". */
const START_TIMEOUT_MS = 5000;
/** Capturing, but no speech or words this long: stop and say so. */
const NO_SPEECH_TIMEOUT_MS = 7000;
/** Some browsers fire onstart but never onaudiostart; treat the mic as live after this. */
const AUDIO_START_FALLBACK_MS = 1500;
/** The unlock clip is empty; never wait longer than this for it before starting recognition. */
const UNLOCK_WAIT_MS = 400;

type Phase = "idle" | "listening" | "thinking" | "answer" | "error";

const errorMessages: Record<string, string> = {
  invalid: t.assistant.errors.invalid,
  unauthorized: t.assistant.errors.unauthorized,
  preview: t.assistant.errors.preview,
  limit: t.assistant.errors.limit,
  ai: t.assistant.errors.ai,
  failed: t.assistant.errors.failed,
};

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** getVoices() is often empty until `voiceschanged` fires; wait for it, but not forever. */
function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const state: { timer?: ReturnType<typeof setTimeout> } = {};
    const done = () => {
      clearTimeout(state.timer);
      speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    state.timer = setTimeout(done, timeoutMs);
  });
}

function recognitionConstructor(): SpeechRecognitionConstructorLike | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [mic, dispatchMic] = useReducer(micReducer, "idle");
  const [left, setLeft] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [noVoice, setNoVoice] = useState(false);
  const [muted, setMuted] = useState(readMuted);
  const [canListen] = useState(() => recognitionConstructor() !== undefined);

  const panelRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mutedRef = useRef(muted);
  const speakTokenRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const pressRef = useRef({ downAt: 0, ignoreUp: false });
  const transcriptRef = useRef({ final: "", interim: "", error: "", userStopped: false, watchdog: false });
  const timersRef = useRef<{ watchdog?: ReturnType<typeof setTimeout>; fallback?: ReturnType<typeof setTimeout>; force?: ReturnType<typeof setTimeout> }>({});
  const startTokenRef = useRef(0);
  const unlockedRef = useRef(false);

  function clearMicTimers() {
    const timers = timersRef.current;
    clearTimeout(timers.watchdog);
    clearTimeout(timers.fallback);
    clearTimeout(timers.force);
    timersRef.current = {};
  }

  /** Drop the current recogniser without letting its late events touch the UI. */
  function discardRecognition() {
    clearMicTimers();
    const old = recognitionRef.current;
    recognitionRef.current = null;
    if (old) {
      old.onstart = null;
      old.onaudiostart = null;
      old.onspeechstart = null;
      old.onresult = null;
      old.onerror = null;
      old.onend = null;
      try {
        old.abort();
      } catch {
        // Already stopped.
      }
    }
  }

  /** Device voice: the fallback when Google TTS fails or the browser blocks audio playback. */
  async function speakWithDevice(message: string, token: number) {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const voice = pickVoice(await loadVoices(), SPEECH_LANGUAGE);
    if (token !== speakTokenRef.current) return; // Stopped, muted or a newer request meanwhile.
    if (!voice) {
      setNoVoice(true);
      return;
    }
    setNoVoice(false);
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
  }

  function releaseAudio() {
    const audio = audioRef.current;
    if (audio) {
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }

  /**
   * Mobile Safari only lets an element play audio after it was started from a tap. The answer arrives
   * after a network call (and speech recognition ends outside a tap), so a silent clip is played on the
   * one shared element during the tap; later `src` changes on it may then play. Failure is harmless:
   * play() then rejects and speak() falls back to the device voice.
   */
  function unlockAudio(): Promise<void> {
    if (typeof Audio === "undefined") return Promise.resolve();
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    if (unlockedRef.current || audioUrlRef.current || !audio.paused) return Promise.resolve();
    unlockedRef.current = true;
    audio.src = SILENT_WAV;
    // Resolves when the clip has played (or failed), so a caller can wait for it before opening the
    // microphone: on iOS a clip playing while recognition starts leaves recognition deaf.
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, UNLOCK_WAIT_MS);
      const done = () => {
        clearTimeout(timer);
        audio.pause();
        resolve();
      };
      audio.play().then(done, done);
    });
  }

  async function speak(message: string) {
    const token = ++speakTokenRef.current;
    ttsAbortRef.current?.abort();
    releaseAudio();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setNoVoice(false);
    const audio = audioRef.current ?? (typeof Audio !== "undefined" ? (audioRef.current = new Audio()) : null);
    if (!audio) {
      await speakWithDevice(message, token);
      return;
    }
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("tts failed");
      const blob = await response.blob();
      if (token !== speakTokenRef.current) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const finish = () => {
        if (token !== speakTokenRef.current) return;
        releaseAudio();
        setSpeaking(false);
      };
      audio.onplaying = () => setSpeaking(true);
      audio.onended = finish;
      audio.onerror = finish;
      audio.src = url;
      await audio.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (token !== speakTokenRef.current) return;
      // Request failed or playback was blocked: use the device voice instead.
      releaseAudio();
      setSpeaking(false);
      await speakWithDevice(message, token);
    }
  }

  function stopSpeaking() {
    speakTokenRef.current++;
    ttsAbortRef.current?.abort();
    releaseAudio();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setSpeaking(false);
  }

  async function ask(raw: string) {
    const q = raw.trim().slice(0, MAX_LENGTH);
    if (!q) return;
    void unlockAudio();
    stopSpeaking();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setQuestion(q);
    setHeard("");
    setText("");
    setError("");
    setNoVoice(false);
    setPhase("thinking");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : "failed";
        setError(errorMessages[code] ?? t.assistant.errors.failed);
        setPhase("error");
        return;
      }
      const data = body as { answer?: unknown; questionsLeft?: unknown } | null;
      if (!data || typeof data.answer !== "string") {
        setError(t.assistant.errors.failed);
        setPhase("error");
        return;
      }
      setAnswer(data.answer);
      setLeft(typeof data.questionsLeft === "number" ? data.questionsLeft : null);
      setPhase("answer");
      if (!mutedRef.current) void speak(data.answer);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(t.assistant.errors.network);
      setPhase("error");
    }
  }

  function failMic(message: string, retry: boolean) {
    setError(message);
    setCanRetry(retry);
    setPhase("error");
  }

  /** The one place a recognition session ends: handles words, errors, timeouts. Safe to call twice. */
  function finishRecognition(recognition: SpeechRecognitionLike) {
    if (recognitionRef.current !== recognition) return;
    recognitionRef.current = null;
    clearMicTimers();
    dispatchMic("end");
    const { final, interim, error: code, userStopped, watchdog } = transcriptRef.current;
    const outcome = micOutcome({ said: final || interim, code, userStopped, watchdog });
    if (outcome.kind === "ask") {
      void ask(outcome.text);
    } else if (outcome.kind === "idle") {
      setPhase("idle");
    } else {
      failMic(t.assistant[outcome.message], outcome.retry);
    }
  }

  /** Stop listening and treat it as "heard nothing" (or whatever was heard so far). */
  function expireRecognition(recognition: SpeechRecognitionLike) {
    if (recognitionRef.current !== recognition) return;
    transcriptRef.current.watchdog = true;
    try {
      recognition.abort();
    } catch {
      // Already stopped.
    }
    // abort() normally fires onend; if the browser never does, finish ourselves.
    timersRef.current.force = setTimeout(() => finishRecognition(recognition), 1000);
  }

  function armWatchdog(recognition: SpeechRecognitionLike, ms: number) {
    clearTimeout(timersRef.current.watchdog);
    timersRef.current.watchdog = setTimeout(() => expireRecognition(recognition), ms);
  }

  function stopEverythingAudible() {
    stopSpeaking();
    abortRef.current?.abort();
  }

  async function startListening() {
    const Recognition = recognitionConstructor();
    if (!Recognition) return;
    const token = ++startTokenRef.current;
    // Nothing may play while the microphone opens, or iOS recognition hears nothing.
    stopEverythingAudible();
    discardRecognition();
    setHeard("");
    setError("");
    setCanRetry(false);
    setPhase("listening");
    dispatchMic("press");
    // The unlock clip must start inside this tap; recognition starts only once it is over.
    await unlockAudio();
    if (token !== startTokenRef.current) return; // Stopped or restarted while waiting.

    // A fresh recogniser per press; a reused one throws InvalidStateError or keeps stale state.
    const recognition = new Recognition();
    recognition.lang = SPEECH_LANGUAGE;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    transcriptRef.current = { final: "", interim: "", error: "", userStopped: false, watchdog: false };
    const live = () => recognitionRef.current === recognition;
    recognition.onstart = () => {
      if (!live()) return;
      clearTimeout(timersRef.current.fallback);
      timersRef.current.fallback = setTimeout(() => {
        if (!live()) return;
        dispatchMic("audiostart");
        armWatchdog(recognition, NO_SPEECH_TIMEOUT_MS);
      }, AUDIO_START_FALLBACK_MS);
    };
    recognition.onaudiostart = () => {
      if (!live()) return;
      clearTimeout(timersRef.current.fallback);
      dispatchMic("audiostart");
      armWatchdog(recognition, NO_SPEECH_TIMEOUT_MS);
    };
    recognition.onspeechstart = () => {
      if (!live()) return;
      dispatchMic("speech");
      clearTimeout(timersRef.current.watchdog);
    };
    recognition.onresult = (event) => {
      if (!live()) return;
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      transcriptRef.current.final = finalText;
      transcriptRef.current.interim = interim;
      setHeard((finalText + interim).trim());
      clearTimeout(timersRef.current.fallback);
      clearTimeout(timersRef.current.watchdog);
      dispatchMic("audiostart");
      dispatchMic("speech");
    };
    recognition.onerror = (event) => {
      if (!live()) return;
      transcriptRef.current.error = event.error;
    };
    recognition.onend = () => finishRecognition(recognition);
    recognitionRef.current = recognition;
    armWatchdog(recognition, START_TIMEOUT_MS);
    try {
      recognition.start();
    } catch {
      discardRecognition();
      dispatchMic("end");
      failMic(t.assistant.micFailed, true);
    }
  }

  function stopListening() {
    const recognition = recognitionRef.current;
    if (!recognition) {
      // Still waiting for the unlock clip: cancel the start.
      startTokenRef.current++;
      dispatchMic("end");
      setPhase("idle");
      return;
    }
    transcriptRef.current.userStopped = true;
    clearTimeout(timersRef.current.watchdog);
    try {
      recognition.stop();
    } catch {
      // Already stopped.
    }
    // stop() normally fires onend; if the browser never does, finish ourselves.
    clearTimeout(timersRef.current.force);
    timersRef.current.force = setTimeout(() => finishRecognition(recognition), 2000);
  }

  const listening = phase === "listening" && micActive(mic);
  const capturing = mic === "listening" || mic === "hearing";

  function onMicPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not capturable (pointer already gone); the press still works.
    }
    pressRef.current.ignoreUp = false;
    if (listening) {
      // A second tap ends a tap-started recording.
      pressRef.current.ignoreUp = true;
      stopListening();
      return;
    }
    if (phase === "thinking") return;
    pressRef.current.downAt = event.timeStamp;
    void startListening();
  }

  function onMicPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const press = pressRef.current;
    if (press.ignoreUp) {
      press.ignoreUp = false;
      return;
    }
    // Held long enough: push-to-talk ends on release. A short tap keeps listening until the next tap.
    if (event.type === "pointercancel") {
      // The browser took the touch (scroll, system gesture): never leave the mic running.
      if (micActive(mic)) stopListening();
      return;
    }
    if (recognitionRef.current && event.timeStamp - press.downAt >= HOLD_MS) stopListening();
  }

  function onMicKeyClick(event: React.MouseEvent<HTMLButtonElement>) {
    // Keyboard and assistive tech activate with a click that has no pointer (detail 0): toggle.
    if (event.detail !== 0) return;
    if (listening) stopListening();
    else if (phase !== "thinking") void startListening();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      // Not remembered; fine.
    }
    if (next) stopSpeaking();
  }

  useEffect(() => {
    // Escape closes; Tab stays inside the sheet.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href]"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    // Focus the dialog on open; stop everything and lock page scroll while it is open.
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      abortRef.current?.abort();
      const startToken = startTokenRef;
      startToken.current += 1;
      const timers = timersRef.current;
      clearTimeout(timers.watchdog);
      clearTimeout(timers.fallback);
      clearTimeout(timers.force);
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onend = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.abort();
      }
      ttsAbortRef.current?.abort();
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);

  const hasSynthesis = typeof Audio !== "undefined" || typeof speechSynthesis !== "undefined";
  const shownQuestion = listening ? heard : question;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
        onClick={(event) => event.stopPropagation()}
        className="flex h-[min(42rem,92dvh)] w-full max-w-2xl flex-col rounded-t-3xl border-2 border-b-0 border-line bg-surface shadow-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          <h2 id="assistant-title" className="min-w-0 flex-1 text-xl font-extrabold">
            {t.assistant.title}
          </h2>
          {hasSynthesis && (
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={!muted}
              aria-label={t.assistant.muteLabel}
              className="btn btn-secondary min-h-11 px-3"
            >
              {muted ? t.assistant.muteOn : t.assistant.muteOff}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label={t.assistant.close} className="btn btn-secondary size-11 px-0 text-xl">
            <span aria-hidden>✕</span>
          </button>
        </div>

        {/* Fixed-size answer area; long answers scroll inside it. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
          {phase === "idle" && (
            <div className="space-y-3">
              <p className="text-lg text-muted">{t.assistant.examplesTitle}</p>
              <ul className="flex flex-col gap-2">
                {t.assistant.examples.map((example) => (
                  <li key={example}>
                    <button type="button" onClick={() => void ask(example)} className="btn btn-secondary min-h-12 w-full justify-start text-left text-base">
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {shownQuestion && phase !== "idle" && (
            <p className="mb-2 text-base text-muted">
              <span className="font-bold">{t.assistant.youAsked}: </span>
              {shownQuestion}
            </p>
          )}
          {listening && !heard && (
            <p className="text-2xl font-extrabold">{capturing ? t.assistant.listening : t.assistant.starting}</p>
          )}
          {phase === "thinking" && <p className="text-2xl font-extrabold">{t.assistant.thinking}</p>}
          {phase === "answer" && <p className="whitespace-pre-wrap text-2xl font-bold leading-snug">{answer}</p>}
          {phase === "answer" && noVoice && (
            <p className="mt-3 space-y-1 text-base text-muted">
              <span className="block font-bold">{t.assistant.noVoice}</span>
              <span className="block">{t.assistant.noVoiceHelp}</span>
            </p>
          )}
          {phase === "error" && (
            <p role="alert" className="rounded-xl bg-danger-soft p-3 text-lg font-bold text-on-danger-soft">
              {error}
            </p>
          )}
          {phase === "error" && canRetry && canListen && (
            <button type="button" onClick={() => void startListening()} className="btn btn-primary mt-3 min-h-12">
              {t.assistant.retry}
            </button>
          )}
        </div>

        <div className="space-y-3 border-t-2 border-line px-4 pt-3 pb-3">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <p className="text-sm font-bold text-muted">{left !== null ? t.assistant.questionsLeft(left) : ""}</p>
            {hasSynthesis && phase === "answer" && !noVoice && (
              <button type="button" onClick={() => {
                  if (speaking) {
                    stopSpeaking();
                  } else {
                    void unlockAudio();
                    void speak(answer);
                  }
                }} className="btn btn-secondary min-h-11">
                {speaking ? t.assistant.stop : t.assistant.readAgain}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {canListen ? (
              <button
                type="button"
                data-autofocus
                onPointerDown={onMicPointerDown}
                onPointerUp={onMicPointerUp}
                onPointerCancel={onMicPointerUp}
                onClick={onMicKeyClick}
                disabled={phase === "thinking"}
                aria-pressed={listening}
                aria-label={t.assistant.hold}
                className={`relative flex size-20 shrink-0 touch-none select-none items-center justify-center rounded-full bg-primary text-on-primary outline-offset-4 focus-visible:outline-4 focus-visible:outline-accent disabled:opacity-60 ${
                  capturing ? "ring-4 ring-accent" : ""
                }`}
              >
                {capturing && <span aria-hidden className="assistant-pulse absolute inset-0 rounded-full bg-accent/50" />}
                <MicIcon className="relative size-10" />
              </button>
            ) : null}
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void ask(text);
              }}
            >
              <input
                type="text"
                className="field min-w-0 flex-1"
                value={text}
                maxLength={MAX_LENGTH}
                onChange={(event) => setText(event.target.value)}
                placeholder={t.assistant.textPlaceholder}
                aria-label={t.assistant.textLabel}
                enterKeyHint="send"
                autoComplete="off"
                data-autofocus={canListen ? undefined : true}
                disabled={phase === "thinking"}
              />
              <button type="submit" className="btn btn-primary" disabled={phase === "thinking" || text.trim() === ""}>
                {t.assistant.ask}
              </button>
            </form>
          </div>
          <p className="min-h-5 text-sm text-muted">{canListen ? t.assistant.holdHint : t.assistant.noSpeech}</p>
        </div>
      </div>
    </div>
  );
}
