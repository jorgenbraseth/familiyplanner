import "server-only";
import { JWT } from "google-auth-library";
import { z } from "zod";
import { TTS_DEFAULT_VOICE, buildSynthesizeBody, parseSpeakingRate } from "./tts-text";

// Google Cloud Text-to-Speech with the calendar service account (docs/SETUP.md 3B).
// Never log the text: it is the family's answers. Only status codes are logged.

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const serviceAccountSchema = z.object({ client_email: z.string(), private_key: z.string() });
const responseSchema = z.object({ audioContent: z.string().min(1) });

let jwt: JWT | null | undefined;

function serviceAccount(): JWT | null {
  if (jwt !== undefined) return jwt;
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  jwt = null;
  if (!encoded) return jwt;
  try {
    const key = serviceAccountSchema.parse(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
    jwt = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  } catch {
    console.error("GOOGLE_SERVICE_ACCOUNT_KEY is not a base64-encoded service account JSON key");
  }
  return jwt;
}

export class TtsError extends Error {}

export type TtsDeps = {
  getToken: () => Promise<string | null | undefined>;
  fetch: typeof fetch;
  voice?: string;
  speakingRate?: number;
};

async function defaultToken() {
  const client = serviceAccount();
  if (!client) return null;
  const { token } = await client.getAccessToken();
  return token;
}

/** Returns MP3 bytes. Throws TtsError on any failure. */
export async function synthesize(text: string, deps: Partial<TtsDeps> = {}): Promise<Uint8Array> {
  const getToken = deps.getToken ?? defaultToken;
  const doFetch = deps.fetch ?? fetch;
  const voice = deps.voice ?? (process.env.GOOGLE_TTS_VOICE?.trim() || TTS_DEFAULT_VOICE);
  const rate = deps.speakingRate ?? parseSpeakingRate(process.env.GOOGLE_TTS_SPEAKING_RATE);

  let token: string | null | undefined;
  try {
    token = await getToken();
  } catch {
    throw new TtsError("Could not get a Google access token");
  }
  if (!token) throw new TtsError("Google service account is not configured");

  const call = (name: string | null) =>
    doFetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildSynthesizeBody(text, name, rate)),
      cache: "no-store",
    });

  let response = await call(voice);
  // A wrong voice name must never break read-aloud: retry once with just the language.
  if (response.status === 400) response = await call(null);
  if (!response.ok) throw new TtsError(`Google Text-to-Speech responded ${response.status}`);
  const parsed = responseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new TtsError("Google Text-to-Speech returned no audio");
  return new Uint8Array(Buffer.from(parsed.data.audioContent, "base64"));
}
