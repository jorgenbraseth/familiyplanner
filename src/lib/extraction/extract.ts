import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { addDays, dayKey, mondayOfIsoWeek } from "../dates";
import type { AcceptedMimeType, ExtractedItem } from "../plan";
import { ExtractionError } from "./errors";
import { normalizeExtraction } from "./normalize";
import { extractionSchema } from "./schema";

export { ExtractionError } from "./errors";

export type ExtractPlanInput = {
  data: Uint8Array;
  mimeType: AcceptedMimeType;
  isoYear: number;
  isoWeek: number;
  childName: string;
  locale: string;
};

const SYSTEM_PROMPT = `You read Norwegian and Danish school week plans ("ukeplan" / "ugeplan") and homework sheets and turn them into structured data for a family planner.

Rules:
- Extract per day: lessons (the timetable entries), homework, things the child must bring, and other notes for that day.
- Keep the school's own wording and language for subjects and text. Do not translate.
- A homework item's date is the day it is DUE. If the plan lists homework per weekday as "til tirsdag" (or similar), use that day. If it only says "this week" or gives no day, use Friday of that week.
- Things to pack (gym clothes, swimming kit, packed lunch, ...) are "bring" items on the day they are needed.
- Anything for the whole week that fits no single day goes in "notes".
- Do not invent items. If something is not in the document, leave it out.
- If the document covers several children or classes, extract only what applies to the named child or to the whole class.
- Dates are YYYY-MM-DD and must come from the weekday-to-date table in the user message.`;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function weekTable(isoYear: number, isoWeek: number): string {
  const monday = mondayOfIsoWeek(isoYear, isoWeek);
  return WEEKDAYS.map((name, i) => `${name}: ${dayKey(addDays(monday, i))}`).join("\n");
}

function fileBlock(data: Uint8Array, mimeType: AcceptedMimeType): Anthropic.Messages.ContentBlockParam {
  const base64 = Buffer.from(data).toString("base64");
  if (mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  }
  return { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };
}

function toExtractionError(error: unknown): ExtractionError {
  if (error instanceof ExtractionError) return error;
  if (error instanceof Anthropic.RateLimitError) return new ExtractionError("The AI service is busy. Try again in a minute.", { cause: error });
  if (error instanceof Anthropic.AuthenticationError) return new ExtractionError("The AI service rejected our credentials.", { cause: error });
  if (error instanceof Anthropic.BadRequestError) return new ExtractionError("The AI service could not read this file.", { cause: error });
  if (error instanceof Anthropic.APIConnectionError) return new ExtractionError("Could not reach the AI service.", { cause: error });
  if (error instanceof Anthropic.APIError) return new ExtractionError(`The AI service failed (status ${error.status ?? "unknown"}).`, { cause: error });
  return new ExtractionError("Extraction failed unexpectedly.", { cause: error });
}

/** Sends a school document to Claude and returns the plan items for the given ISO week. */
export async function extractPlanItems(input: ExtractPlanInput): Promise<ExtractedItem[]> {
  const model = process.env.ANTHROPIC_MODEL_EXTRACT;
  if (!model) throw new Error("ANTHROPIC_MODEL_EXTRACT is not set.");

  const { isoYear, isoWeek } = input;
  const userText = `Child: ${input.childName}
UI locale: ${input.locale}
ISO week ${isoWeek} of ${isoYear}. Dates of that week:
${weekTable(isoYear, isoWeek)}

Extract the plan from the attached document.`;

  const client = new Anthropic({ timeout: 120_000 });
  let response;
  try {
    response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [fileBlock(input.data, input.mimeType), { type: "text", text: userText }] },
      ],
      output_config: { format: zodOutputFormat(extractionSchema) },
    });
  } catch (error) {
    throw toExtractionError(error);
  }

  if (response.stop_reason === "refusal") throw new ExtractionError("The AI service declined to read this document.");
  if (response.stop_reason === "max_tokens") throw new ExtractionError("The document is too large to extract in one go.");
  if (!response.parsed_output) throw new ExtractionError("The AI service returned an unreadable result.");

  return normalizeExtraction(response.parsed_output, isoYear, isoWeek);
}
