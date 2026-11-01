"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { shouldRetryOnGesture, shouldShowNote, type KeepAwakeState } from "@/lib/keep-awake";

/**
 * Keeps the family screen's display on with the Screen Wake Lock API. Re-acquires the lock when the page becomes
 * visible again or the lock is released while visible; a refused request (iOS Safari needs a gesture) is retried on
 * the next tap or key press. Renders nothing unless the lock is unavailable, then a small muted note.
 */
export function KeepAwake() {
  const [state, setState] = useState<KeepAwakeState | null>(null);

  useEffect(() => {
    const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
    let current: KeepAwakeState = { supported, held: false, failures: 0, lastError: null };
    const update = (patch: Partial<KeepAwakeState>) => {
      current = { ...current, ...patch };
      setState(current);
    };
    update({});
    if (!supported) return;

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
  }, []);

  if (!state || !shouldShowNote(state)) return null;
  return <p className="max-w-52 px-2 text-sm leading-snug text-muted">{t.screen.keepAwakeNote}</p>;
}
