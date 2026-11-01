// Validation of the parents' routine editor. Pure, so it can be tested.
import { z } from "zod";
import { t } from "./i18n";
import { ROUTINE_MAX_ITEMS_PER_SLOT, ROUTINE_NAME_MAX } from "./routines";

const e = t.routines.admin.errors;

/** One checklist item. `id` is set for items that already exist. */
export const routineItemSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, e.itemName).max(ROUTINE_NAME_MAX, e.itemName),
});

export type RoutineItemInput = z.infer<typeof routineItemSchema>;

export const routineItemListSchema = z
  .array(routineItemSchema)
  .max(ROUTINE_MAX_ITEMS_PER_SLOT, e.itemCount(ROUTINE_MAX_ITEMS_PER_SLOT))
  .refine(
    (items) =>
      new Set(items.map((i) => i.name.toLowerCase())).size === items.length,
    {
      message: e.itemDuplicate,
    },
  );

/**
 * The list of the editor, sent as JSON `[{id?, name}]` in order. Blank rows (an untouched "add" row)
 * are dropped. Order of the list is the sort order.
 */
export const itemsFieldSchema = z
  .string()
  .transform((text, ctx) => {
    try {
      const value: unknown = JSON.parse(text === "" ? "[]" : text);
      if (!Array.isArray(value)) throw new Error("not a list");
      return value.filter(
        (row) =>
          !(
            row &&
            typeof row === "object" &&
            typeof row.name === "string" &&
            row.name.trim() === ""
          ),
      );
    } catch {
      ctx.addIssue({ code: "custom", message: e.items });
      return z.NEVER;
    }
  })
  .pipe(routineItemListSchema);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const saveRoutineSchema = z.object({
  childId: z.uuid(e.invalid),
  slot: z.enum(["morning", "evening"], e.invalid),
  items: itemsFieldSchema,
  /** "" means no star. */
  starTaskId: z.union([z.literal(""), z.uuid(e.star)]),
  /** "HH:MM" from/until when the list shows on the overview (from must be before until). */
  visibleFrom: z.string().regex(TIME_RE, e.window),
  visibleUntil: z.string().regex(TIME_RE, e.window),
}).refine((v) => v.visibleFrom < v.visibleUntil, { message: e.window, path: ["visibleUntil"] });

export type SaveRoutineInput = z.infer<typeof saveRoutineSchema>;

export function parseRoutineForm(formData: FormData) {
  const get = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : "";
  };
  return saveRoutineSchema.safeParse({
    childId: get("childId"),
    slot: get("slot"),
    items: get("items"),
    starTaskId: get("starTaskId"),
    visibleFrom: get("visibleFrom"),
    visibleUntil: get("visibleUntil"),
  });
}

/** Starter suggestions that are not already in the list (case-insensitive). */
export function missingStarters(
  starters: readonly string[],
  names: readonly string[],
): string[] {
  const have = new Set(names.map((n) => n.trim().toLowerCase()));
  return starters.filter((s) => !have.has(s.toLowerCase()));
}
