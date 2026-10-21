// Pure state logic for the push-to-talk microphone (kept free of React and the browser so it can be tested).

/**
 * starting: asked the browser to listen, nothing captured yet (permission prompt, audio session setup).
 * listening: the recogniser reports that it is capturing audio.
 * hearing: speech (or words) detected.
 */
export type MicStatus = "idle" | "starting" | "listening" | "hearing";

export type MicEvent = "press" | "audiostart" | "speech" | "end";

export function micReducer(status: MicStatus, event: MicEvent): MicStatus {
  switch (event) {
    case "press":
      return "starting";
    case "audiostart":
      // Late audio events never move us back from "hearing", and never revive an ended session.
      return status === "starting" ? "listening" : status;
    case "speech":
      return status === "idle" ? status : "hearing";
    case "end":
      return "idle";
  }
}

/** True while the mic is in use (the UI shows its "active" state and a press stops it). */
export function micActive(status: MicStatus): boolean {
  return status !== "idle";
}

export type MicMessageKey = "micDenied" | "micMissing" | "micNetwork" | "micFailed" | "noSpeechHeard";

export type MicOutcome =
  | { kind: "ask"; text: string }
  | { kind: "idle" }
  | { kind: "error"; message: MicMessageKey; retry: boolean };

/**
 * What to do when a recognition session has ended.
 * `userStopped`: we stopped or aborted it on purpose; `watchdog`: it timed out without hearing anything.
 */
export function micOutcome(input: {
  said: string;
  code: string;
  userStopped?: boolean;
  watchdog?: boolean;
}): MicOutcome {
  const text = input.said.trim();
  if (text) return { kind: "ask", text };
  const { code } = input;
  if (code === "not-allowed" || code === "service-not-allowed") return { kind: "error", message: "micDenied", retry: false };
  if (code === "audio-capture") return { kind: "error", message: "micMissing", retry: true };
  if (code === "network") return { kind: "error", message: "micNetwork", retry: true };
  if (code === "language-not-supported" || code === "bad-grammar") return { kind: "error", message: "micFailed", retry: false };
  if (input.watchdog || code === "no-speech") return { kind: "error", message: "noSpeechHeard", retry: true };
  if (code === "aborted") {
    // Aborted by the system (iOS audio interruptions do this) rather than by us: don't hang silently.
    return input.userStopped ? { kind: "idle" } : { kind: "error", message: "noSpeechHeard", retry: true };
  }
  if (code) return { kind: "error", message: "micFailed", retry: true };
  // Ended with no error and no words (released at once, or silence).
  return { kind: "error", message: "noSpeechHeard", retry: true };
}
