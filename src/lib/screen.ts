import { z } from "zod";
import type { Member } from "./members";

/** Who the family screen can show: every parent and child (the signed-in parent appears as themselves). Children first, then by name. */
export function screenPeople<T extends Pick<Member, "role" | "name" | "id">>(members: readonly T[]): T[] {
  return members
    .filter((m) => m.role === "parent" || m.role === "child")
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "child" ? -1 : 1;
      return a.name.localeCompare(b.name, "nb") || a.id.localeCompare(b.id);
    });
}

const idSchema = z.uuid();

/** The person `?person=` names; an invalid or unknown id (or none) falls back to the first person. */
export function pickPerson<T extends { id: string }>(people: readonly T[], param: string | string[] | undefined): T | null {
  const parsed = idSchema.safeParse(Array.isArray(param) ? param[0] : param);
  return (parsed.success ? people.find((p) => p.id === parsed.data) : undefined) ?? people[0] ?? null;
}

/** The URL of a person's screen. */
export function screenHref(personId: string): string {
  return `/skjerm?person=${personId}`;
}

/**
 * The next `count` days after the selected day (`afterKey`, today by default in the caller), taken from the selected
 * day's week and the week after (in any order) so a Sunday still shows the coming week.
 */
export function upcomingDays<T extends { key: string }>(weeks: readonly (readonly T[])[], afterKey: string, count = 6): T[] {
  const byKey = new Map<string, T>();
  for (const day of weeks.flat()) if (day.key > afterKey && !byKey.has(day.key)) byKey.set(day.key, day);
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(0, count);
}
