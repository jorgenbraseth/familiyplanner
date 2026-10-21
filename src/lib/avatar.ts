import { z } from "zod";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 100 * 1024;

const PATH_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[A-Za-z0-9_-]+\.(webp|jpg|png)$/i;

/** True when `path` is `<memberId>/<name>.(webp|jpg|png)` for exactly this member. */
export function isAvatarPathFor(memberId: string, path: string): boolean {
  const match = PATH_RE.exec(path);
  return match !== null && match[1].toLowerCase() === memberId.toLowerCase();
}

export const setAvatarSchema = z
  .object({ memberId: z.uuid(), path: z.string().max(200).nullable() })
  .refine((v) => v.path === null || isAvatarPathFor(v.memberId, v.path));

export function avatarFileName(ext: "webp" | "jpg"): string {
  return `${crypto.randomUUID()}.${ext}`;
}
