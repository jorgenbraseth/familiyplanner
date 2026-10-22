import { describe, expect, it } from "vitest";
import { isIosDevice, manualBrowser, selectInstallState } from "./install-platform";

const base = { standalone: false, appInstalled: false, hasPromptEvent: false, ios: false };

describe("isIosDevice", () => {
  it("detects iPhone and iPad user agents", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", "iPad", 5)).toBe(true);
  });
  it("detects iPadOS posing as a Mac, but not a real Mac", () => {
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false);
  });
  it("is false on Android", () => {
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14) Chrome/120", "Linux armv8l", 5)).toBe(false);
  });
});

describe("manualBrowser", () => {
  it("tells the browsers apart", () => {
    expect(manualBrowser("Mozilla/5.0 (Linux; Android 14) SamsungBrowser/23.0 Chrome/115")).toBe("samsung");
    expect(manualBrowser("Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0")).toBe("firefox");
    expect(manualBrowser("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36 Edg/120")).toBe("chromium");
    expect(manualBrowser("Mozilla/5.0 (Macintosh) Version/17 Safari/605.1.15")).toBe("other");
  });
});

describe("selectInstallState", () => {
  it("is installed when standalone or appinstalled fired, whatever else is true", () => {
    expect(selectInstallState({ ...base, standalone: true, hasPromptEvent: true })).toBe("installed");
    expect(selectInstallState({ ...base, appInstalled: true, ios: true })).toBe("installed");
  });
  it("prefers the prompt event over iOS and manual", () => {
    expect(selectInstallState({ ...base, hasPromptEvent: true, ios: true })).toBe("promptable");
  });
  it("falls back to ios, then manual", () => {
    expect(selectInstallState({ ...base, ios: true })).toBe("ios");
    expect(selectInstallState(base)).toBe("manual");
  });
});
