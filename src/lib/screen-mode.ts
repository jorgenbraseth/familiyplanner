import { z } from "zod";
import { t } from "./i18n";

/** How the user chose to sign in: the normal app, or Familieskjerm (a parent's session in screen mode). */
export type SignInMode = "normal" | "screen";

/** Cookie naming the tablet that was set up as a family screen (httpOnly; the id is not a secret, the lock is in the database). */
export const SCREEN_DEVICE_COOKIE = "screen_device";
export const SCREEN_DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The `mode` query/form value; anything but exactly "screen" is the normal sign-in. */
export function parseSignInMode(value: unknown): SignInMode {
  return value === "screen" ? "screen" : "normal";
}

/** The OAuth return path for a mode (the origin is added by the caller). */
export function callbackPath(mode: SignInMode): string {
  return mode === "screen" ? "/auth/callback?mode=screen" : "/auth/callback";
}

const deviceIdSchema = z.uuid();

/** A device id from the cookie, or null when missing or not a UUID. */
export function parseDeviceId(value: unknown): string | null {
  const parsed = deviceIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** What to do after the allowlist check. Locked device forces screen mode whatever was asked. */
export function effectiveMode(requested: SignInMode, deviceLocked: boolean): SignInMode {
  return deviceLocked ? "screen" : requested;
}

export type LoginErrorKey = "failed" | "screenParentsOnly" | "screenFailed";

/** The `?error=` value on /login → a message key (unknown values are the generic failure). */
export function parseLoginError(value: string | string[] | undefined): LoginErrorKey | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === undefined || v === "") return null;
  if (v === "screen-parents-only") return "screenParentsOnly";
  if (v === "screen-failed") return "screenFailed";
  return "failed";
}

export function loginErrorText(key: LoginErrorKey): string {
  return t.login[key];
}
