import { z } from "zod";

/** What Claude returns for a school week plan. Kept simple for structured outputs; validation happens in normalize. */
export const extractionSchema = z.object({
  days: z
    .array(
      z.object({
        date: z.string().describe("The calendar date, YYYY-MM-DD."),
        school_start: z
          .string()
          .nullable()
          .describe(
            "When school starts that day for this child, 24-hour HH:MM (e.g. 08:15), or null if the plan does not say.",
          ),
        school_end: z
          .string()
          .nullable()
          .describe(
            "When school ends that day for this child, 24-hour HH:MM (e.g. 14:30), or null if the plan does not say.",
          ),
        items: z.array(
          z.object({
            kind: z
              .enum(["lesson", "homework", "bring", "note"])
              .describe(
                "lesson = one timetable period for that day, with the subject in `subject`; homework = work to hand in or prepare, dated by the day it is DUE; bring = things to pack (gym clothes, packed lunch, ...); note = anything else for that day.",
              ),
            subject: z
              .string()
              .nullable()
              .describe(
                "The school subject, in the document's own wording, or null.",
              ),
            text: z
              .string()
              .describe(
                "The item text in the document's own language; do not translate. For a lesson it may repeat the subject or hold room/teacher notes.",
              ),
            period: z
              .number()
              .nullable()
              .describe(
                "Lessons only: the period number in the school day (1, 2, 3, ...), or null if the plan has none.",
              ),
            start: z
              .string()
              .nullable()
              .describe(
                "Lessons only: when this period starts, 24-hour HH:MM, or null if the plan gives no time for it.",
              ),
            end: z
              .string()
              .nullable()
              .describe(
                "Lessons only: when this period ends, 24-hour HH:MM, or null if the plan gives no time for it.",
              ),
          }),
        ),
      }),
    )
    .describe("One entry per school day that has items."),
  notes: z
    .string()
    .nullable()
    .describe(
      "General notes for the whole week that fit no single day, or null.",
    ),
});

export type RawExtraction = z.infer<typeof extractionSchema>;
