import { describe, expect, it } from "vitest";
import { callbackPath, effectiveMode, loginErrorText, parseDeviceId, parseLoginError, parseSignInMode } from "./screen-mode";

describe("parseSignInMode", () => {
  it("is screen only for exactly 'screen'", () => {
    expect(parseSignInMode("screen")).toBe("screen");
    for (const v of [null, undefined, "", "Screen", "normal", "screen ", 1, ["screen"]]) {
      expect(parseSignInMode(v)).toBe("normal");
    }
  });
});

describe("callbackPath", () => {
  it("adds the mode only for the screen", () => {
    expect(callbackPath("normal")).toBe("/auth/callback");
    expect(callbackPath("screen")).toBe("/auth/callback?mode=screen");
  });
});

describe("parseDeviceId", () => {
  it("accepts a uuid only", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(parseDeviceId(id)).toBe(id);
    expect(parseDeviceId("nope")).toBeNull();
    expect(parseDeviceId(undefined)).toBeNull();
    expect(parseDeviceId("")).toBeNull();
  });
});

describe("effectiveMode", () => {
  it("a locked device forces the screen", () => {
    expect(effectiveMode("normal", true)).toBe("screen");
    expect(effectiveMode("screen", true)).toBe("screen");
    expect(effectiveMode("normal", false)).toBe("normal");
    expect(effectiveMode("screen", false)).toBe("screen");
  });
});

describe("parseLoginError", () => {
  it("maps known codes and falls back to the generic failure", () => {
    expect(parseLoginError(undefined)).toBeNull();
    expect(parseLoginError("1")).toBe("failed");
    expect(parseLoginError("screen-parents-only")).toBe("screenParentsOnly");
    expect(parseLoginError(["screen-failed"])).toBe("screenFailed");
    expect(loginErrorText("screenParentsOnly")).toBe("Bare voksne kan starte familieskjermen.");
  });
});
