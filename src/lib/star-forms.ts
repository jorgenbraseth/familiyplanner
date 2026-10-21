// Validation of the star screens' forms. Pure, so it can be tested.
import { z } from "zod";
import { t } from "./i18n";
import { MAX_TASK_NAME, MAX_TASK_STARS } from "./stars";

const e = t.stars.errors;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export { MAX_TASK_NAME, MAX_TASK_STARS };

/**
 * A task a child can request stars for (the add/edit form of the task list). `who` is "all" for a
 * task that applies to all children, or the id of the one child it is for.
 */
export const taskFormSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, e.taskName).max(MAX_TASK_NAME, e.taskName),
  stars: z.coerce.number(e.taskStars).int(e.taskStars).min(1, e.taskStars).max(MAX_TASK_STARS, e.taskStars),
  who: z.union([z.literal("all"), z.uuid()], e.taskWho),
});

export type TaskFormInput = z.infer<typeof taskFormSchema>;

/** The child a task is for, or null when it applies to all children. */
export function taskMemberOf(input: Pick<TaskFormInput, "who">): string | null {
  return input.who === "all" ? null : input.who;
}

export function parseTaskForm(formData: FormData) {
  const id = field(formData, "id");
  return taskFormSchema.safeParse({
    id: id === "" ? undefined : id,
    name: field(formData, "name"),
    stars: field(formData, "stars"),
    who: field(formData, "who"),
  });
}

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
  })
  .refine((track) => track.goal % track.milestone_every === 0, {
    message: e.everyDivides,
    path: ["milestone_every"],
  });

export type TrackInput = z.infer<typeof trackInputSchema>;


export function parseTrackForm(formData: FormData) {
  return trackInputSchema.safeParse({
    name: field(formData, "name"),
    goal: field(formData, "goal"),
    milestone_every: field(formData, "milestone_every"),
    small_reward: field(formData, "small_reward"),
    big_reward: field(formData, "big_reward"),
  });
}
