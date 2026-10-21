import { describe, expect, it } from "vitest";
import { micActive, micOutcome, micReducer } from "./mic-state";

describe("micReducer", () => {
  it("only shows listening after audio started", () => {
    let s = micReducer("idle", "press");
    expect(s).toBe("starting");
    expect(micActive(s)).toBe(true);
    s = micReducer(s, "audiostart");
    expect(s).toBe("listening");
    s = micReducer(s, "speech");
    expect(s).toBe("hearing");
  });

  it("does not go back from hearing and ignores late events after the end", () => {
    expect(micReducer("hearing", "audiostart")).toBe("hearing");
    expect(micReducer("idle", "audiostart")).toBe("idle");
    expect(micReducer("idle", "speech")).toBe("idle");
  });

  it("always returns to idle on end", () => {
    for (const s of ["idle", "starting", "listening", "hearing"] as const) {
      expect(micReducer(s, "end")).toBe("idle");
    }
  });
});

describe("micOutcome", () => {
  it("asks when words were heard, even with an error code", () => {
    expect(micOutcome({ said: " hei ", code: "network" })).toEqual({ kind: "ask", text: "hei" });
  });

  it("maps error codes to messages", () => {
    expect(micOutcome({ said: "", code: "not-allowed" })).toEqual({ kind: "error", message: "micDenied", retry: false });
    expect(micOutcome({ said: "", code: "audio-capture" })).toEqual({ kind: "error", message: "micMissing", retry: true });
    expect(micOutcome({ said: "", code: "network" })).toEqual({ kind: "error", message: "micNetwork", retry: true });
    expect(micOutcome({ said: "", code: "no-speech" })).toEqual({ kind: "error", message: "noSpeechHeard", retry: true });
    expect(micOutcome({ said: "", code: "weird" })).toEqual({ kind: "error", message: "micFailed", retry: true });
  });

  it("treats the watchdog and silent endings as nothing heard", () => {
    expect(micOutcome({ said: "", code: "", watchdog: true })).toEqual({ kind: "error", message: "noSpeechHeard", retry: true });
    expect(micOutcome({ said: "", code: "aborted", watchdog: true })).toEqual({ kind: "error", message: "noSpeechHeard", retry: true });
    expect(micOutcome({ said: "", code: "" })).toEqual({ kind: "error", message: "noSpeechHeard", retry: true });
  });

  it("goes idle only for an abort we caused, and shows an error for a system abort", () => {
    expect(micOutcome({ said: "", code: "aborted", userStopped: true })).toEqual({ kind: "idle" });
    expect(micOutcome({ said: "", code: "aborted" })).toEqual({ kind: "error", message: "noSpeechHeard", retry: true });
  });
});
