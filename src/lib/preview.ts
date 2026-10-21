// "Se som barn": pure rules for the preview cookie. The server-side reading lives in view-as.ts.
import { z } from "zod";
import type { Member } from "./members";

export const VIEW_AS_COOKIE = "view_as";
/** The preview ends by itself after about eight hours. */
export const VIEW_AS_MAX_AGE_SECONDS = 8 * 60 * 60;

const idSchema = z.uuid();

/** The member id from the cookie value, or null when it isn't a valid uuid. */
export function parseViewAsId(value: string | undefined | null): string | null {
  const parsed = idSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Only a parent may preview, and only a child. A child can never preview anyone. */
export function canPreview(me: Pick<Member, "role">, target: Pick<Member, "role"> | null | undefined): boolean {
  return me.role === "parent" && !!target && target.role === "child";
}
