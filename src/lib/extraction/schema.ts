import { z } from "zod";

/** What Claude returns for a school week plan. Kept simple for structured outputs; validation happens in normalize. */
export const extractionSchema = z.object({
  days: z
    .array(
      z.object({
        date: z.string().describe("The calendar date, YYYY-MM-DD."),
        items: z.array(
          z.object({
            kind: z
              .enum(["lesson", "homework", "bring", "note"])
              .describe(
                "lesson = a timetable entry for that day; homework = work to hand in or prepare, dated by the day it is DUE; bring = things to pack (gym clothes, packed lunch, ...); note = anything else for that day.",
              ),
            subject: z.string().nullable().describe("The school subject, in the document's own wording, or null."),
            text: z.string().describe("The item text in the document's own language; do not translate."),
          }),
        ),
      }),
    )
    .describe("One entry per school day that has items."),
  notes: z.string().nullable().describe("General notes for the whole week that fit no single day, or null."),
});

export type Extraction = z.infer<typeof extractionSchema>;
