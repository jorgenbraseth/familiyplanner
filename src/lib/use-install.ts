"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isIosDevice, selectInstallState, type InstallState } from "@/lib/install-platform";

type InstallPrompt = Event & { prompt: () => Promise<void> };

// One shared store, so the install card and the menu see the same single-use beforeinstallprompt event.
let promptEvent: InstallPrompt | null = null;
let appInstalled = false;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptEvent = e as InstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    appInstalled = true;
    emit();
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallState {
  return selectInstallState({
    standalone: isStandalone(),
    appInstalled,
    hasPromptEvent: promptEvent !== null,
    ios: isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
  });
}

/**
 * Install state of the app. "unknown" on the server and during hydration (so nothing mismatches), then
 * installed | promptable | ios | manual. `promptInstall` shows the browser's install prompt (promptable only).
 */
export function useInstall(): { state: InstallState; promptInstall: () => Promise<boolean> } {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => "unknown" as InstallState);
  const promptInstall = useCallback(async () => {
    const event = promptEvent;
    if (!event) return false;
    // A prompt event can be used once.
    promptEvent = null;
    emit();
    try {
      await event.prompt();
      const choice = (event as Event & { userChoice?: Promise<{ outcome: string }> }).userChoice;
      return choice ? (await choice).outcome === "accepted" : true;
    } catch {
      return false;
    }
  }, []);
  return { state, promptInstall };
}
