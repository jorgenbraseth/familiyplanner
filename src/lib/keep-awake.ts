/** Pure decisions for the app's Wake Lock (`src/components/keep-awake.tsx`); the family screen shows a note when it fails. */

export type KeepAwakeState = {
  /** `navigator.wakeLock` exists. */
  supported: boolean;
  /** We currently hold a lock. */
  held: boolean;
  /** Consecutive failed requests since the last success. */
  failures: number;
  /** Name of the last request error, if it failed. */
  lastError: string | null;
};

/** After this many failures in a row the screen shows the "turn off auto-lock" note. */
export const NOTE_AFTER_FAILURES = 2;

/** A refused request (iOS Safari wants a gesture) is worth retrying on the next tap or key press. */
export function shouldRetryOnGesture(s: KeepAwakeState): boolean {
  return s.supported && !s.held && s.failures > 0 && s.lastError === "NotAllowedError";
}

/** Show the muted note when the lock is unavailable or keeps failing. */
export function shouldShowNote(s: KeepAwakeState): boolean {
  if (!s.supported) return true;
  return !s.held && s.failures >= NOTE_AFTER_FAILURES;
}
