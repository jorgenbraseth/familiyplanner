import { z } from "zod";

const personIdSchema = z.uuid();

/**
 * The person a question is asked as on the family screen (`asPerson` in the request body): a parent or a
 * child of the family list. Anything else (missing, not a uuid, unknown, wrong role) is null, and the
 * route refuses the question. Only used for screen sessions; normal sessions ignore `asPerson`.
 */
export function pickAsPerson<T extends { id: string; role: string }>(family: readonly T[], asPerson: unknown): T | null {
  const parsed = personIdSchema.safeParse(asPerson);
  if (!parsed.success) return null;
  const person = family.find((m) => m.id === parsed.data);
  return person && (person.role === "parent" || person.role === "child") ? person : null;
}
