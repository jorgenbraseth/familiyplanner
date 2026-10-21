import type { Role } from "@/lib/members";

/**
 * Questions a child may ask the assistant per day. Must match `public.assistant_daily_limit()` in
 * supabase/migrations/20261024090000_assistant_log.sql, which is what actually enforces it.
 */
export const ASSISTANT_DAILY_LIMIT = 30;

/** Questions left today, or null when unlimited (parents). */
export function questionsLeftToday(countToday: number, role: Role): number | null {
  if (role === "parent") return null;
  return Math.max(0, ASSISTANT_DAILY_LIMIT - Math.max(0, Math.floor(countToday)));
}
