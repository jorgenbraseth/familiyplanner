import { describe, expect, it } from "vitest";
import { shouldRetryOnGesture, shouldShowNote, type KeepAwakeState } from "./keep-awake";

const base: KeepAwakeState = { supported: true, held: false, failures: 0, lastError: null };

describe("keep awake decisions", () => {
  it("shows the note when unsupported", () => {
    expect(shouldShowNote({ ...base, supported: false })).toBe(true);
    expect(shouldRetryOnGesture({ ...base, supported: false, failures: 1, lastError: "NotAllowedError" })).toBe(false);
  });
  it("is quiet while held or before repeated failures", () => {
    expect(shouldShowNote({ ...base, held: true })).toBe(false);
    expect(shouldShowNote(base)).toBe(false);
    expect(shouldShowNote({ ...base, failures: 1, lastError: "NotAllowedError" })).toBe(false);
  });
  it("shows the note after repeated failures", () => {
    expect(shouldShowNote({ ...base, failures: 2, lastError: "NotAllowedError" })).toBe(true);
    expect(shouldShowNote({ ...base, held: true, failures: 5 })).toBe(false);
  });
  it("retries on a gesture only after a NotAllowedError", () => {
    expect(shouldRetryOnGesture({ ...base, failures: 1, lastError: "NotAllowedError" })).toBe(true);
    expect(shouldRetryOnGesture({ ...base, failures: 1, lastError: "AbortError" })).toBe(false);
    expect(shouldRetryOnGesture({ ...base, held: true, failures: 1, lastError: "NotAllowedError" })).toBe(false);
    expect(shouldRetryOnGesture(base)).toBe(false);
  });
});
