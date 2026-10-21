import { z } from "zod";
import { getSessionEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TtsError, synthesize } from "@/lib/tts";
import { TTS_MAX_INPUT_CHARS, prepareSpeechText } from "@/lib/tts-text";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Longer than TTS_MAX_INPUT_CHARS -> 413. Otherwise markdown is stripped and the text is cut
// at a sentence boundary to 2000 characters (see tts-text.ts).
const bodySchema = z.object({ text: z.string().trim().min(1) });

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const email = await getSessionEmail();
    if (!email) return json({ error: "unauthorized" }, 401);
    const supabase = await createClient();
    const { data: member, error } = await supabase.from("members").select("id").eq("email", email).maybeSingle();
    if (error) throw new Error("Could not read the member row");
    if (!member) return json({ error: "unauthorized" }, 401);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid" }, 400);
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return json({ error: "invalid" }, 400);
    if (parsed.data.text.length > TTS_MAX_INPUT_CHARS) return json({ error: "too_long" }, 413);
    const text = prepareSpeechText(parsed.data.text);
    if (!text) return json({ error: "invalid" }, 400);

    try {
      const audio = await synthesize(text);
      return new Response(audio as BodyInit, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
      });
    } catch (e) {
      console.error(e instanceof TtsError ? e.message : "Text-to-speech failed");
      return json({ error: "tts" }, 502);
    }
  } catch {
    console.error("TTS route failed");
    return json({ error: "failed" }, 500);
  }
}
