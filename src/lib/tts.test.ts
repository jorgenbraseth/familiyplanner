import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { synthesize } = await import("./tts");

const audio = Buffer.from("mp3bytes").toString("base64");
const ok = () => new Response(JSON.stringify({ audioContent: audio }), { status: 200 });
const getToken = async () => "tok";

describe("synthesize", () => {
  it("posts voice and rate with the bearer token and returns bytes", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    const bytes = await synthesize("Hei", { getToken, fetch: f, voice: "v1", speakingRate: 1.1 });
    expect(Buffer.from(bytes).toString()).toBe("mp3bytes");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://texttospeech.googleapis.com/v1/text:synthesize");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      input: { text: "Hei" },
      voice: { languageCode: "nb-NO", name: "v1" },
      audioConfig: { audioEncoding: "MP3", speakingRate: 1.1 },
    });
  });

  it("retries once without the voice name on 400", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 400 })).mockResolvedValueOnce(ok());
    await synthesize("Hei", { getToken, fetch: f, voice: "bad" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[1][1].body).voice).toEqual({ languageCode: "nb-NO" });
  });

  it("throws when the retry also fails, and on other errors without retrying", async () => {
    const bad = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(synthesize("Hei", { getToken, fetch: bad })).rejects.toThrow("400");
    expect(bad).toHaveBeenCalledTimes(2);
    const denied = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(synthesize("Hei", { getToken, fetch: denied })).rejects.toThrow("403");
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it("throws without a token", async () => {
    const f = vi.fn();
    await expect(synthesize("Hei", { getToken: async () => null, fetch: f })).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});
