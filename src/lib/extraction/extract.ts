import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { addDays, dayKey, mondayOfIsoWeek } from "../dates";
import { z } from "zod";
import type { AcceptedMimeType } from "../plan";
import { ExtractionError } from "./errors";
import {
  normalizeTimeplan,
  normalizeUkeplan,
  type TimeplanExtraction,
  type UkeplanExtraction,
} from "./normalize";
import { timeplanSchema, ukeplanSchema } from "./schema";

export { ExtractionError } from "./errors";

export type ExtractInput = {
  data: Uint8Array;
  mimeType: AcceptedMimeType;
  childName: string;
  locale: string;
};
export type ExtractUkeplanInput = ExtractInput & { isoYear: number; isoWeek: number };

const COMMON_RULES = `- Keep the school's own wording and language for subjects and text. Do not translate.
- Do not invent anything. If something is not in the document, leave it out.
- If the document covers several children or classes, extract only what applies to the named child or to the whole class.
- Times are 24-hour HH:MM.`;

const TIMEPLAN_PROMPT = `You read Norwegian school timetables ("timeplan") and turn them into structured data for a family planner. The timetable is fixed and repeats every week; it has no dates.

Rules:
- "days": for each weekday with school (1 = Monday ... 5 = Friday; 6 and 7 only if the timetable has Saturday/Sunday), when school starts and ends ("starts_at" / "ends_at"). Use the start of the first period and the end of the last period of that day if the document gives period times but no explicit start/end. If the document gives no times at all, use null.
- "periods": one entry per period per weekday, in school-day order, with the subject in "subject" (the document's own wording; breaks, lunch and activities that the timetable lists are fine as subjects), the period number in "period" (1, 2, 3, ... as the document numbers them; null if it has no numbers) and "starts_at"/"ends_at" only when the document gives times for that period, otherwise null. Do not guess times or period numbers.
${COMMON_RULES}`;

const UKEPLAN_PROMPT = `You read Norwegian school week plans ("ukeplan") and turn them into structured data for a family planner. Lessons and the timetable are NOT extracted from a ukeplan; only the items below.

Item kinds:
- homework: work to do or prepare (lekser, innleveringer, øving, "til tirsdag", tests to study for). Its date is the day it is DUE. If it is listed per weekday as "til tirsdag" (or similar), use that day. If it is for the whole week ("lekser denne uken", "ukas lekser", "ukelekse") or names no day, set date to null.
  Homework or tasks that apply EVERY DAY ("hver dag", "daglig", "alle dager", "hver skoledag", "hjemme hver dag", "kvar dag" in nynorsk, "every day" and similar, e.g. "les 10 minutter hver dag") must NOT be one whole-week item. Emit one separate homework item per school day of the week, Monday to Friday, each with that day's date from the weekday-to-date table and the same subject and text. Skip a day only when the plan says it is free or has no school. Week-level homework that is not daily ("les en bok denne uka", "innen fredag") stays a single item as described above.
  Split homework into separately completable tasks: when one sentence or paragraph asks for several actions (read, write, practise, learn, bring, hand in), emit one homework item per action, so a child can tick each off on its own. Every split item keeps the date (or whole-week / per-day treatment), subject and audience of the original; for "every day" homework each split task is repeated for each school day. Keep the document's order.
  Homework NEVER has a time of day: always set starts_at and ends_at to null for homework, even if the plan mentions a time.
  Alternatives ("s. 41 og/eller s. 42", "p. 41 and/or p. 42") become separate items; the later ones start with "og/eller" / "and/or" (in the plan's language), e.g. "Les side 41 i tekstboka" and "Og/eller les side 42 i tekstboka".
  Reminders, hints, examples, sentence starters and "husk ..." notes that belong to a task stay in that task's text; they are NOT separate items. Do not split one action into steps the plan does not list.
  Write each item as a full, readable instruction in the plan's own language and wording (do not translate). Expand obvious abbreviations ("s."/"p." to side/page, "TB" to tekstbok/textbook when the plan explains it), but do not add content the plan does not have.
  Example (plan in English): "Read p. 41 AND/OR p. 42 in TB (textbook). Write at least (minst) 3 sentences about yourself. Husk å skrive i skriveboka di. Forslag til setningsstartere: I am... I like..." becomes three homework items: "Read page 41 in the textbook" / "And/or read page 42 in the textbook" / "Write at least 3 sentences about yourself. Husk å skrive i skriveboka di. Forslag til setningsstartere: I am... I like...".
- event: an important event in the week (tur, prøve, temadag, skolefotografering, foreldremøte, svømming). Give the day as date, or null if it spans the week. Set starts_at/ends_at only when the document gives times.
- message: an important message or something to remember that week, including things to bring (gymtøy, matpakke, skiutstyr, "husk ...", informasjon fra læreren). Give the day as date when it is day-specific, otherwise null (whole week).

Audience (every item): 
- "parent": addressed to parents/guardians ("kjære foresatte", "foreldre", "foresatte"): parent meetings, forms to sign or return, payments, volunteering, info about the school's routines for parents. Example: "Foreldremøte onsdag kl. 18:00" and "Husk å signere samtykkeskjema" are parent.
- "child": things the child must do, bring or know. Example: "Ta med gymtøy torsdag" and "Prøve i matte fredag" are child.
- "both": general information both should see. Example: "Temadag om trafikk onsdag" is both.
- Homework is "child" unless it is clearly meant for parents.
- If unsure, use "both".

Other rules:
- Do not turn the timetable or lessons into items.
- Dates are YYYY-MM-DD and must come from the weekday-to-date table in the user message.
${COMMON_RULES}`;

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function weekTable(isoYear: number, isoWeek: number): string {
  const monday = mondayOfIsoWeek(isoYear, isoWeek);
  return WEEKDAYS.map(
    (name, i) => `${name}: ${dayKey(addDays(monday, i))}`,
  ).join("\n");
}

function fileBlock(
  data: Uint8Array,
  mimeType: AcceptedMimeType,
): Anthropic.Messages.ContentBlockParam {
  const base64 = Buffer.from(data).toString("base64");
  if (mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    };
  }
  return {
    type: "image",
    source: { type: "base64", media_type: mimeType, data: base64 },
  };
}

function toExtractionError(error: unknown): ExtractionError {
  if (error instanceof ExtractionError) return error;
  if (error instanceof Anthropic.RateLimitError)
    return new ExtractionError(
      "busy",
      "The AI service is busy. Try again in a minute.",
      { cause: error },
    );
  if (error instanceof Anthropic.AuthenticationError)
    return new ExtractionError(
      "auth",
      "The AI service rejected our credentials.",
      { cause: error },
    );
  if (error instanceof Anthropic.BadRequestError)
    return new ExtractionError(
      "unreadable",
      "The AI service could not read this file.",
      { cause: error },
    );
  if (error instanceof Anthropic.APIConnectionError)
    return new ExtractionError(
      "connection",
      "Could not reach the AI service.",
      { cause: error },
    );
  if (error instanceof Anthropic.APIError)
    return new ExtractionError(
      "service",
      `The AI service failed (status ${error.status ?? "unknown"}).`,
      { cause: error },
    );
  return new ExtractionError("unexpected", "Extraction failed unexpectedly.", {
    cause: error,
  });
}

async function run<S extends z.ZodType>(
  input: ExtractInput,
  system: string,
  userText: string,
  schema: S,
): Promise<unknown> {
  const model = process.env.ANTHROPIC_MODEL_EXTRACT;
  if (!model) throw new Error("ANTHROPIC_MODEL_EXTRACT is not set.");

  const client = new Anthropic({ timeout: 120_000 });
  let response;
  try {
    response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system,
      messages: [
        {
          role: "user",
          content: [fileBlock(input.data, input.mimeType), { type: "text", text: userText }],
        },
      ],
      output_config: { format: zodOutputFormat(schema) },
    });
  } catch (error) {
    throw toExtractionError(error);
  }

  if (response.stop_reason === "refusal")
    throw new ExtractionError("refused", "The AI service declined to read this document.");
  if (response.stop_reason === "max_tokens")
    throw new ExtractionError("too_large", "The document is too large to extract in one go.");
  if (!response.parsed_output)
    throw new ExtractionError("bad_result", "The AI service returned an unreadable result.");
  return response.parsed_output;
}

/** Sends a timeplan to Claude and returns the weekday hours and periods. */
export async function extractTimeplan(input: ExtractInput): Promise<TimeplanExtraction> {
  const userText = `Child: ${input.childName}
UI locale: ${input.locale}

Extract the timetable from the attached document.`;
  return normalizeTimeplan(await run(input, TIMEPLAN_PROMPT, userText, timeplanSchema));
}

/** Sends a ukeplan to Claude and returns the homework, events and messages of the given ISO week. */
export async function extractUkeplan(input: ExtractUkeplanInput): Promise<UkeplanExtraction> {
  const { isoYear, isoWeek } = input;
  const userText = `Child: ${input.childName}
UI locale: ${input.locale}
ISO week ${isoWeek} of ${isoYear}. Dates of that week:
${weekTable(isoYear, isoWeek)}

Extract the homework, events and messages from the attached document.`;
  return normalizeUkeplan(await run(input, UKEPLAN_PROMPT, userText, ukeplanSchema), isoYear, isoWeek);
}
