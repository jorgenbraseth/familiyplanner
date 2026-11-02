"use client";

import { useEffect, useSyncExternalStore } from "react";
import { t } from "@/lib/i18n";
import { shouldRetryOnGesture, shouldShowNote, type KeepAwakeState } from "@/lib/keep-awake";

/**
 * The app's one Screen Wake Lock owner. A module-level controller (so it can never be acquired twice) re-acquires
 * the lock when the page becomes visible again or the lock is released while visible; a refused request (iOS Safari
 * needs a gesture) is retried on the next tap or key press. State is shared through a tiny subscribe/getSnapshot
 * store that `KeepAwakeNote` reads.
 */
let snapshot: KeepAwakeState | null = null;
const listeners = new Set<() => void>();

function setSnapshot(next: KeepAwakeState) {
  snapshot = next;
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getSnapshot = () => snapshot;
const getServerSnapshot = () => null;

/** Starts the controller; returns the cleanup. Only `KeepAwake` calls this. */
function startKeepAwake(): () => void {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  let current: KeepAwakeState = { supported, held: false, failures: 0, lastError: null };
  const update = (patch: Partial<KeepAwakeState>) => {
    current = { ...current, ...patch };
    setSnapshot(current);
  };
  update({});
  if (!supported) return () => {};

  let sentinel: WakeLockSentinel | null = null;
  let disposed = false;
  let requesting = false;
  let gestureArmed = false;

  const onGesture = () => {
    gestureArmed = false;
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    void acquire();
  };
  const armGesture = () => {
    if (gestureArmed || disposed) return;
    gestureArmed = true;
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
  };

  async function acquire() {
    if (disposed || requesting || sentinel || document.visibilityState !== "visible") return;
    requesting = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (disposed) {
        void lock.release().catch(() => {});
        return;
      }
      sentinel = lock;
      update({ held: true, failures: 0, lastError: null });
      lock.addEventListener("release", () => {
        if (sentinel === lock) sentinel = null;
        if (disposed) return;
        update({ held: false });
        void acquire();
      });
    } catch (e) {
      update({ held: false, failures: current.failures + 1, lastError: e instanceof Error ? e.name : "Error" });
      if (shouldRetryOnGesture(current)) armGesture();
    } finally {
      requesting = false;
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === "visible") void acquire();
  };
  document.addEventListener("visibilitychange", onVisibility);
  void acquire();

  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    const lock = sentinel;
    sentinel = null;
    void lock?.release().catch(() => {});
  };
}

/** Headless: keeps the display on for the whole app. Mounted once in the root layout. */
export function KeepAwake() {
  useEffect(() => startKeepAwake(), []);
  return null;
}

/** Family screen only: the muted note when the lock is unavailable or keeps failing. */
export function KeepAwakeNote() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!state || !shouldShowNote(state)) return null;
  return <p className="max-w-52 px-2 text-sm leading-snug text-muted">{t.screen.keepAwakeNote}</p>;
}
