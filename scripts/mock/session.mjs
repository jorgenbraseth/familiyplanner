// Mock auth sessions: dev-only JWTs and the Supabase SSR auth cookie. Pure helpers + a small CLI
// (`node scripts/mock/session.mjs --as Emma [--session-id <uuid>]` prints the cookie as JSON).
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

// Dev-only secret: the mock gateway signs and verifies with it. It protects nothing real.
export const MOCK_JWT_SECRET = "mock-only-jwt-secret-not-for-production-0123456789";
const TEN_YEARS = 10 * 365 * 24 * 3600;

const b64u = (input) => Buffer.from(input).toString("base64url");

export function signJwt(payload, secret = MOCK_JWT_SECRET) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** Returns the claims, or null when the token is malformed, badly signed or expired. */
export function verifyJwt(token, secret = MOCK_JWT_SECRET, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  let actual;
  try {
    actual = Buffer.from(parts[2], "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof claims.exp === "number" && claims.exp < nowSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}

export function roleKey(role, nowSeconds = Math.floor(Date.now() / 1000)) {
  return signJwt({ iss: "supabase-mock", role, iat: nowSeconds, exp: nowSeconds + TEN_YEARS });
}

/** Deterministic UUID (version 5 style) for a name, so a member's auth user id never changes. */
export function stableUuid(name) {
  const h = crypto.createHash("sha1").update(`family-planner-mock:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** "Emma" -> emma@example.test; anything with an @ is taken as the email. */
export function emailFor(as) {
  const v = String(as ?? "").trim().toLowerCase();
  if (!v) throw new Error("--as needs a seeded first name or an email");
  return v.includes("@") ? v : `${v}@example.test`;
}

export function userFor(email) {
  const id = stableUuid(email);
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    phone: "",
    confirmed_at: "2026-01-01T00:00:00.000Z",
    last_sign_in_at: "2026-01-01T00:00:00.000Z",
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { email, email_verified: true, full_name: email.split("@")[0] },
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    is_anonymous: false,
  };
}

/** A GoTrue-shaped session for a member email. `sessionId` becomes the JWT's session_id claim. */
export function mintSession({ email, sessionId = crypto.randomUUID(), issuer = "http://127.0.0.1/auth/v1", nowSeconds = Math.floor(Date.now() / 1000) }) {
  const user = userFor(email);
  const exp = nowSeconds + TEN_YEARS;
  const access_token = signJwt({
    iss: issuer,
    aud: "authenticated",
    sub: user.id,
    email,
    phone: "",
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "oauth", timestamp: nowSeconds }],
    session_id: sessionId,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    is_anonymous: false,
    iat: nowSeconds,
    exp,
  });
  return { access_token, token_type: "bearer", expires_in: TEN_YEARS, expires_at: exp, refresh_token: `mock-refresh.${b64u(email)}.${sessionId}`, user };
}

/** Reads email and session id back out of a mock refresh token (the gateway's /auth/v1/token). */
export function parseRefreshToken(token) {
  const m = /^mock-refresh\.([\w-]+)\.([0-9a-f-]{36})$/.exec(String(token ?? ""));
  if (!m) return null;
  return { email: Buffer.from(m[1], "base64url").toString("utf8"), sessionId: m[2] };
}

/** supabase-js derives the cookie name from the first label of the project URL's host. */
export function storageKey(supabaseUrl) {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

export const MAX_CHUNK_SIZE = 3180;

/** The cookies @supabase/ssr reads: "base64-" + base64url(JSON), split into `.0`, `.1`... chunks when large. */
export function authCookies(supabaseUrl, session) {
  const key = storageKey(supabaseUrl);
  const value = `base64-${b64u(JSON.stringify(session))}`;
  // The value is base64url, so URL-encoding does not change its length.
  if (value.length <= MAX_CHUNK_SIZE) return [{ name: key, value }];
  const chunks = [];
  for (let i = 0; i * MAX_CHUNK_SIZE < value.length; i++) {
    chunks.push({ name: `${key}.${i}`, value: value.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE) });
  }
  return chunks;
}

/** Minimal `--flag value` / `--flag` parser; the first non-flag arguments are returned under `_`. */
export function parseArgs(argv, booleans = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const key = (eq === -1 ? a.slice(2) : a.slice(2, eq)).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (eq !== -1) out[key] = a.slice(eq + 1);
    else if (booleans.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith("--")) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const url = args.url ?? "http://127.0.0.1:54321";
  const session = mintSession({ email: emailFor(args.as), sessionId: args.sessionId, issuer: `${url}/auth/v1` });
  console.log(JSON.stringify({ cookies: authCookies(url, session), session }, null, 2));
}
