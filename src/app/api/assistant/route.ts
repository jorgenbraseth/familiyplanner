import { z } from "zod";
import { getSessionEmail } from "@/lib/auth";
import { questionsLeftToday } from "@/lib/assistant-limit";
import { buildSystemPrompt, firstNameOf } from "@/lib/assistant/prompt";
import { AssistantAiError, runAssistant } from "@/lib/assistant/run";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/view-as";

export const maxDuration = 60;

const bodySchema = z.object({ question: z.string().trim().min(1).max(500) });

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    // Auth without redirects: the allowlist is checked by reading the member row under RLS.
    const email = await getSessionEmail();
    if (!email) return json({ error: "unauthorized" }, 401);
    const supabase = await createClient();
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .eq("email", email)
      .maybeSingle();
    if (memberError) throw new Error("Could not read the member row");
    if (!memberData) return json({ error: "unauthorized" }, 401);
    const me = memberData as Member;

    // The family list, read with the asker's own client (every member may read all members).
    const { data: familyData, error: familyError } = await supabase.from("members").select(MEMBER_COLUMNS).order("created_at");
    if (familyError) throw new Error("Could not read the family members");
    const family = (familyData ?? []) as Member[];

    const viewer = await getViewer();
    if (viewer.previewing) return json({ error: "preview" }, 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid" }, 400);
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return json({ error: "invalid" }, 400);
    const { question } = parsed.data;

    if (me.role === "child") {
      const { data: count, error } = await supabase.rpc("assistant_questions_today");
      if (error) throw new Error("Could not count today's questions");
      if (questionsLeftToday(Number(count ?? 0), me.role) === 0) return json({ error: "limit" }, 429);
    }

    const model = process.env.ANTHROPIC_MODEL_ASSISTANT;
    if (!model) {
      console.error("ANTHROPIC_MODEL_ASSISTANT is not set");
      return json({ error: "failed" }, 500);
    }

    let result;
    try {
      result = await runAssistant({
        model,
        system: buildSystemPrompt({
          now: new Date(),
          meId: me.id,
          firstName: firstNameOf(me.name),
          role: me.role,
          family: family.map((m) => ({ id: m.id, name: m.name, role: m.role })),
        }),
        question,
        ctx: { supabase, me, members: family },
      });
    } catch (error) {
      if (error instanceof AssistantAiError) {
        console.error(`Assistant AI failure for member ${me.id}: ${error.message}`);
        return json({ error: "ai" }, 502);
      }
      throw error;
    }

    const { error: logError } = await supabase.from("assistant_log").insert({
      member_id: me.id,
      question,
      answer: result.answer.slice(0, 4000),
      tools_used: result.toolsUsed,
    });
    if (logError) {
      if (logError.message.includes("assistant_daily_limit")) return json({ error: "limit" }, 429);
      throw new Error(`Could not log the question (${logError.code ?? "unknown"})`);
    }

    let questionsLeft: number | null = null;
    if (me.role === "child") {
      const { data: count, error } = await supabase.rpc("assistant_questions_today");
      questionsLeft = error ? null : questionsLeftToday(Number(count ?? 0), me.role);
    }
    return json({ answer: result.answer, questionsLeft }, 200);
  } catch (error) {
    console.error("Assistant request failed:", error instanceof Error ? error.message : "unknown");
    return json({ error: "failed" }, 500);
  }
}
