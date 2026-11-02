import { describe, expect, it } from "vitest";
import { callbackPath, loginErrorText, parseLoginError, parseSignInMode } from "./screen-mode";

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

describe("parseLoginError", () => {
  it("maps known codes and falls back to the generic failure", () => {
    expect(parseLoginError(undefined)).toBeNull();
    expect(parseLoginError("1")).toBe("failed");
    expect(parseLoginError("screen-parents-only")).toBe("screenParentsOnly");
    expect(parseLoginError(["screen-failed"])).toBe("screenFailed");
    expect(loginErrorText("screenParentsOnly")).toBe("Bare voksne kan starte familieskjermen.");
  });
});
