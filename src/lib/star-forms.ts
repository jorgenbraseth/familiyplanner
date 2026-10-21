// Validation of the star screens' forms. Pure, so it can be tested.
import { z } from "zod";
import { t } from "./i18n";

const e = t.stars.errors;

export const MAX_PRESET_REASONS = 20;
export const MAX_PRESET_LENGTH = 60;

/** One preset reason per line: trimmed, empty lines dropped, duplicates removed. */
export function parsePresetReasons(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const reason = line.trim();
    if (reason === "" || seen.has(reason)) continue;
    seen.add(reason);
    out.push(reason);
  }
  return out;
}

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
    preset_reasons: z
      .string()
      .transform(parsePresetReasons)
      .pipe(
        z
          .array(z.string().max(MAX_PRESET_LENGTH, e.presetLength))
          .max(MAX_PRESET_REASONS, e.presetCount),
      ),
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
    preset_reasons: field(formData, "preset_reasons"),
  });
}
