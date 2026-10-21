"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

type InstallPrompt = Event & { prompt: () => Promise<void> };
type Mode = "hidden" | "prompt" | "ios";

const DISMISS_KEY = "install-card-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  // iPadOS 13+ reports itself as a Mac with touch.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** "Installer appen" card: Chrome's install prompt on Android, short instructions on iPhone. Hidden once installed. */
export function InstallCard() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [promptEvent, setPromptEvent] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if (isStandalone() || readDismissed()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPrompt);
      setMode("prompt");
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setMode("hidden");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Effect-time detection of the platform (needs the browser, so it cannot run during render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isIos()) setMode("ios");
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Hidden for this visit only.
    }
    setMode("hidden");
  }

  async function install() {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
    } catch {
      // The browser refused; the card stays.
      return;
    }
    // A prompt event can be used once.
    setPromptEvent(null);
    setMode("hidden");
  }

  if (mode === "hidden") return null;
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-surface p-4 shadow-(--card-shadow)">
      <h2 className="text-xl font-extrabold">{t.install.title}</h2>
      <p className="text-sm text-muted">{mode === "ios" ? t.install.iosSteps : t.install.description}</p>
      <div className="flex flex-wrap gap-2">
        {mode === "prompt" && (
          <button type="button" onClick={install} className="btn btn-primary min-h-11">
            {t.install.button}
          </button>
        )}
        <button type="button" onClick={dismiss} className="btn btn-secondary min-h-11">
          {t.install.dismiss}
        </button>
      </div>
    </section>
  );
}
