import { z } from "zod";
import type { Member } from "./members";

/** Who the family screen can show: parents and children (never the screen's own member). Children first, then by name. */
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
