import { z } from "zod";

/** What Claude returns for a timeplan (fixed weekly timetable). Kept simple for structured outputs; validation happens in normalize. */
export const timeplanSchema = z.object({
  days: z
    .array(
      z.object({
        weekday: z.number().describe("ISO weekday: 1 = Monday ... 5 = Friday, 6 = Saturday, 7 = Sunday."),
        starts_at: z
          .string()
          .nullable()
          .describe("When school starts that weekday, 24-hour HH:MM (e.g. 08:15), or null if the document does not say."),
        ends_at: z
          .string()
          .nullable()
          .describe("When school ends that weekday, 24-hour HH:MM (e.g. 14:30), or null if the document does not say."),
      }),
    )
    .describe("One entry per weekday that has school."),
  periods: z
    .array(
      z.object({
        weekday: z.number().describe("ISO weekday: 1 = Monday ... 7 = Sunday."),
        period: z
          .number()
          .nullable()
          .describe("The period number in the school day (1, 2, 3, ...) as the document numbers it, or null if it has none."),
        starts_at: z
          .string()
          .nullable()
          .describe("When this period starts, 24-hour HH:MM, or null if the document gives no time for it."),
        ends_at: z
          .string()
          .nullable()
          .describe("When this period ends, 24-hour HH:MM, or null if the document gives no time for it."),
        subject: z.string().describe("The subject (or break/activity) in the document's own wording."),
      }),
    )
    .describe("Every period of the timetable, in the order they appear in the school day."),
});

export type RawTimeplan = z.infer<typeof timeplanSchema>;

/** What Claude returns for a ukeplan (weekly plan). */
export const ukeplanSchema = z.object({
  items: z.array(
    z.object({
      date: z
        .string()
        .nullable()
        .describe(
          "The calendar date YYYY-MM-DD from the weekday table (for homework: the day it is DUE), or null when the item is for the whole week.",
        ),
      kind: z
        .enum(["homework", "event", "message"])
        .describe(
          "homework = work to do or prepare (lekser, innleveringer, prøver to prepare for); event = an important event (trip, test day, parents' meeting, theme day); message = an important message or something to remember or bring.",
        ),
      subject: z.string().nullable().describe("The school subject, in the document's own wording, or null."),
      text: z
        .string()
        .describe(
          "The item text in the document's own language and wording; do not translate. Keep the source structure with line breaks (\\n): one point per line, list points as lines starting with '- ', a short section heading as a line ending with ':' followed by its bullets. No other markdown.",
        ),
      audience: z
        .enum(["child", "parent", "both"])
        .nullable()
        .describe(
          "child = the child must do, bring or know it; parent = addressed to parents/guardians (meetings, forms to sign, payments); both = general information for everyone.",
        ),
      starts_at: z.string().nullable().describe("Events only: start time, 24-hour HH:MM, or null. Always null for homework and messages."),
      ends_at: z.string().nullable().describe("Events only: end time, 24-hour HH:MM, or null. Always null for homework and messages."),
    }),
  ),
});

export type RawUkeplan = z.infer<typeof ukeplanSchema>;
