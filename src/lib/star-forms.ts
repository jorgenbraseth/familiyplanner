// Validation of the star screens' forms. Pure, so it can be tested.
import { z } from "zod";
import { t } from "./i18n";
import { MAX_TASKS, MAX_TASK_NAME, MAX_TASK_STARS } from "./stars";

const e = t.stars.errors;

export { MAX_TASKS, MAX_TASK_NAME, MAX_TASK_STARS };

/** A task a child can request stars for. `id` is set for tasks that already exist. */
export const taskInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, e.taskName).max(MAX_TASK_NAME, e.taskName),
  stars: z.number(e.taskStars).int(e.taskStars).min(1, e.taskStars).max(MAX_TASK_STARS, e.taskStars),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskListSchema = z
  .array(taskInputSchema)
  .max(MAX_TASKS, e.taskCount)
  .refine((tasks) => new Set(tasks.map((task) => task.name.toLowerCase())).size === tasks.length, {
    message: e.taskDuplicate,
  });

/**
 * The tasks of the track form, sent as JSON `[{id?, name, stars}]` in order. Rows with a blank
 * name are dropped (an untouched "add task" row). Order of the list is the sort order.
 */
export const tasksFieldSchema = z
  .string()
  .transform((text, ctx) => {
    try {
      const value: unknown = JSON.parse(text === "" ? "[]" : text);
      if (!Array.isArray(value)) throw new Error("not a list");
      return value.filter((row) => !(row && typeof row === "object" && typeof row.name === "string" && row.name.trim() === ""));
    } catch {
      ctx.addIssue({ code: "custom", message: e.tasks });
      return z.NEVER;
    }
  })
  .pipe(taskListSchema);

/** Stars as the amount of a star given by a parent without a task. */
export const amountSchema = z.coerce.number(e.amount).int(e.amount).min(1, e.amount).max(MAX_TASK_STARS, e.amount);

/** The reason of a star request or a star given by a parent. */
export const reasonSchema = z.string().trim().min(1, e.reason).max(120, e.reason);

/** Optional note from a parent when deciding; empty becomes null. */
export const noteSchema = z
  .string()
  .trim()
  .max(200, e.note)
  .transform((value) => (value === "" ? null : value));

export const trackInputSchema = z
  .object({
    name: z.string().trim().min(1, e.name).max(60, e.name),
    goal: z.coerce.number(e.goal).int(e.goal).min(5, e.goal).max(200, e.goal),
    milestone_every: z.coerce.number(e.every).int(e.every).min(1, e.every).max(50, e.every),
    small_reward: z.string().trim().max(200, e.reward),
    big_reward: z.string().trim().max(200, e.reward),
    tasks: tasksFieldSchema,
  })
  .refine((track) => track.goal % track.milestone_every === 0, {
    message: e.everyDivides,
    path: ["milestone_every"],
  });

export type TrackInput = z.infer<typeof trackInputSchema>;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function parseTrackForm(formData: FormData) {
  return trackInputSchema.safeParse({
    name: field(formData, "name"),
    goal: field(formData, "goal"),
    milestone_every: field(formData, "milestone_every"),
    small_reward: field(formData, "small_reward"),
    big_reward: field(formData, "big_reward"),
    tasks: field(formData, "tasks"),
  });
}
