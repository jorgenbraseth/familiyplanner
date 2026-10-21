"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { pickVoice } from "@/lib/speech-voice";
import { MicIcon } from "./assistant-button";

const MUTE_KEY = "assistant-muted";
const MAX_LENGTH = 500;
/** A press longer than this counts as "hold to talk"; a shorter one toggles listening. */
const HOLD_MS = 450;

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

export function AssistantPanel({ locale, onClose }: { locale: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
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
  const pressRef = useRef({ downAt: 0, ignoreUp: false });
  const transcriptRef = useRef({ final: "", interim: "", error: "" });

  async function speak(message: string) {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const token = ++speakTokenRef.current;
    const voice = pickVoice(await loadVoices(), locale);
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

  function stopSpeaking() {
    speakTokenRef.current++;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setSpeaking(false);
  }

  async function ask(raw: string) {
    const q = raw.trim().slice(0, MAX_LENGTH);
    if (!q) return;
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

  function startListening() {
    const Recognition = recognitionConstructor();
    if (!Recognition) return;
    stopSpeaking();
    abortRef.current?.abort();
    const recognition = new Recognition();
    recognition.lang = locale;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    transcriptRef.current = { final: "", interim: "", error: "" };
    recognition.onresult = (event) => {
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
    };
    recognition.onerror = (event) => {
      transcriptRef.current.error = event.error;
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      const { final, interim, error: code } = transcriptRef.current;
      const said = (final || interim).trim();
      if (said) {
        void ask(said);
      } else if (code === "not-allowed" || code === "service-not-allowed") {
        setError(t.assistant.micDenied);
        setPhase("error");
      } else if (code && code !== "no-speech" && code !== "aborted") {
        setError(t.assistant.micFailed);
        setPhase("error");
      } else if (code === "aborted") {
        setPhase("idle");
      } else {
        setError(t.assistant.noSpeechHeard);
        setPhase("error");
      }
    };
    recognitionRef.current = recognition;
    setHeard("");
    setError("");
    setPhase("listening");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setError(t.assistant.micFailed);
      setPhase("error");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
  }

  const listening = phase === "listening";

  function onMicPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pressRef.current.ignoreUp = false;
    if (listening) {
      // A second tap ends a tap-started recording.
      pressRef.current.ignoreUp = true;
      stopListening();
      return;
    }
    if (phase === "thinking") return;
    pressRef.current.downAt = event.timeStamp;
    startListening();
  }

  function onMicPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const press = pressRef.current;
    if (press.ignoreUp) {
      press.ignoreUp = false;
      return;
    }
    // Held long enough: push-to-talk ends on release. A short tap keeps listening until the next tap.
    if (recognitionRef.current && event.timeStamp - press.downAt >= HOLD_MS) stopListening();
  }

  function onMicKeyClick(event: React.MouseEvent<HTMLButtonElement>) {
    // Keyboard and assistive tech activate with a click that has no pointer (detail 0): toggle.
    if (event.detail !== 0) return;
    if (listening) stopListening();
    else if (phase !== "thinking") startListening();
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
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition?.abort();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);

  const hasSynthesis = typeof speechSynthesis !== "undefined";
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
          {listening && !heard && <p className="text-2xl font-extrabold">{t.assistant.listening}</p>}
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
        </div>

        <div className="space-y-3 border-t-2 border-line px-4 pt-3 pb-3">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <p className="text-sm font-bold text-muted">{left !== null ? t.assistant.questionsLeft(left) : ""}</p>
            {hasSynthesis && phase === "answer" && !noVoice && (
              <button type="button" onClick={() => (speaking ? stopSpeaking() : void speak(answer))} className="btn btn-secondary min-h-11">
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
                  listening ? "ring-4 ring-accent" : ""
                }`}
              >
                {listening && <span aria-hidden className="assistant-pulse absolute inset-0 rounded-full bg-accent/50" />}
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
