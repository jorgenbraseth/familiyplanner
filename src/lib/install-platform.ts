/** Pure helpers for the "add to home screen" feature (platform detection and state selection). */

export type InstallState = "unknown" | "installed" | "promptable" | "ios" | "manual";
export type ManualBrowser = "samsung" | "firefox" | "chromium" | "other";

/** iPadOS 13+ reports itself as a Mac with touch, so the platform and touch points are needed too. */
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function manualBrowser(userAgent: string): ManualBrowser {
  if (/SamsungBrowser/i.test(userAgent)) return "samsung";
  if (/Firefox|FxiOS/i.test(userAgent)) return "firefox";
  if (/Chrome|Chromium|CriOS|Edg|OPR/i.test(userAgent)) return "chromium";
  return "other";
}

export function selectInstallState(input: {
  standalone: boolean;
  appInstalled: boolean;
  hasPromptEvent: boolean;
  ios: boolean;
}): Exclude<InstallState, "unknown"> {
  if (input.standalone || input.appInstalled) return "installed";
  if (input.hasPromptEvent) return "promptable";
  if (input.ios) return "ios";
  return "manual";
}
