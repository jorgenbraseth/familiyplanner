import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { runTool, TOOL_DEFINITIONS, type ToolContext } from "./tools";

export const MAX_TOOL_ROUNDS = 4;

export type AssistantRun = { answer: string; toolsUsed: string[] };

export class AssistantAiError extends Error {}

/** `api_400 invalid_request_error: message`. API validation messages describe the request shape, not user content. */
function describeApiError(error: InstanceType<typeof Anthropic.APIError>): string {
  let detail = "";
  const body: unknown = error.error;
  if (typeof body === "object" && body !== null) {
    const inner: unknown = (body as { error?: unknown }).error;
    if (typeof inner === "object" && inner !== null) {
      const { type, message } = inner as { type?: unknown; message?: unknown };
      const parts = [typeof type === "string" ? type : "", typeof message === "string" ? message : ""].filter(Boolean);
      if (parts.length > 0) detail = ` ${parts.length === 2 ? `${parts[0]}: ${parts[1]}` : parts[0]}`;
    }
  }
  return `api_${error.status ?? "unknown"}${detail}`.slice(0, 300);
}

/** Runs the manual tool loop against Claude and returns the spoken answer. Throws AssistantAiError on AI failures. */
export async function runAssistant(params: {
  model: string;
  system: string;
  question: string;
  ctx: ToolContext;
}): Promise<AssistantRun> {
  const client = new Anthropic({ timeout: 45_000 });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: params.question }];
  const toolsUsed: string[] = [];

  try {
    for (let round = 0; ; round++) {
      const response = await client.messages.create({
        model: params.model,
        max_tokens: 2000,
        system: params.system,
        messages,
        tools: TOOL_DEFINITIONS,
        output_config: { effort: "low" },
      });

      if (response.stop_reason === "refusal") throw new AssistantAiError("refusal");
      if (response.stop_reason === "max_tokens") throw new AssistantAiError("max_tokens");

      if (response.stop_reason === "tool_use") {
        if (round >= MAX_TOOL_ROUNDS) throw new AssistantAiError("too_many_tool_rounds");
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          if (!toolsUsed.includes(block.name)) toolsUsed.push(block.name);
          const outcome = await runTool(params.ctx, block.name, block.input);
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: outcome.content,
            ...(outcome.isError ? { is_error: true } : {}),
          });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const answer = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
      if (!answer) throw new AssistantAiError("empty");
      return { answer, toolsUsed };
    }
  } catch (error) {
    if (error instanceof AssistantAiError) throw error;
    if (error instanceof Anthropic.RateLimitError) throw new AssistantAiError("rate_limit");
    if (error instanceof Anthropic.APIConnectionError) throw new AssistantAiError("connection");
    if (error instanceof Anthropic.APIError) throw new AssistantAiError(describeApiError(error));
    throw error;
  }
}
