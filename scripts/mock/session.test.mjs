import { describe, expect, it } from "vitest";
import { MAX_CHUNK_SIZE, authCookies, emailFor, mintSession, parseArgs, parseRefreshToken, stableUuid, storageKey, verifyJwt } from "./session.mjs";
import { clickList, resolveViewport, shotFileName } from "./shot-lib.mjs";

describe("session", () => {
  it("mints verifiable tokens with the claims RLS needs", () => {
    const s = mintSession({ email: "emma@example.test", sessionId: "11111111-1111-4111-8111-111111111111" });
    const claims = verifyJwt(s.access_token);
    expect(claims).toMatchObject({ role: "authenticated", email: "emma@example.test", session_id: "11111111-1111-4111-8111-111111111111", aal: "aal1" });
    expect(claims.sub).toBe(stableUuid("emma@example.test"));
    expect(verifyJwt(s.access_token + "x")).toBeNull();
    expect(parseRefreshToken(s.refresh_token)).toEqual({ email: "emma@example.test", sessionId: "11111111-1111-4111-8111-111111111111" });
  });
  it("derives the cookie like supabase-js and SSR", () => {
    expect(storageKey("http://127.0.0.1:5555")).toBe("sb-127-auth-token");
    expect(storageKey("https://abcd.supabase.co")).toBe("sb-abcd-auth-token");
    const [c] = authCookies("https://abcd.supabase.co", { a: 1 });
    expect(c.value.startsWith("base64-")).toBe(true);
    expect(JSON.parse(Buffer.from(c.value.slice(7), "base64url").toString())).toEqual({ a: 1 });
  });
  it("chunks big cookies", () => {
    const cookies = authCookies("https://abcd.supabase.co", { big: "x".repeat(MAX_CHUNK_SIZE * 2) });
    expect(cookies.map((c) => c.name)).toEqual(["sb-abcd-auth-token.0", "sb-abcd-auth-token.1", "sb-abcd-auth-token.2"]);
  });
  it("maps names to emails and parses args", () => {
    expect(emailFor("Emma")).toBe("emma@example.test");
    expect(emailFor("a@b.c")).toBe("a@b.c");
    expect(parseArgs(["--as", "Emma", "--full-page", "--path=/x"], ["fullPage"])).toEqual({ _: [], as: "Emma", fullPage: true, path: "/x" });
  });
});

describe("shot helpers", () => {
  it("resolves viewports", () => {
    expect(resolveViewport("tablet")).toMatchObject({ width: 1180, height: 820 });
    expect(resolveViewport("800x600")).toMatchObject({ width: 800, height: 600 });
    expect(() => resolveViewport("huge")).toThrow();
  });
  it("lists the clicks", () => {
    expect(clickList(undefined)).toEqual([]);
    expect(clickList(true)).toEqual([]);
    expect(clickList("button.a")).toEqual(["button.a"]);
    expect(clickList("button.a ;; text=Hei")).toEqual(["button.a", "text=Hei"]);
    expect(clickList(["x", " "])).toEqual(["x"]);
  });
  it("names files", () => {
    expect(shotFileName({ as: "Emma", path: "/documents/abc?x=1", viewport: "phone" })).toBe("emma-documents-abc-x-1-phone.png");
  });
});
