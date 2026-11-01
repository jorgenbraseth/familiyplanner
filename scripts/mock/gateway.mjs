// Mock Supabase gateway: one port acting as NEXT_PUBLIC_SUPABASE_URL.
//   /rest/v1/*     mini PostgREST (rest.mjs) against the mock Postgres, with real RLS
//   /auth/v1/*     GoTrue bits the SSR client calls (user, token refresh, logout, JWKS, settings)
//   /storage/v1/*  signed URLs and generated placeholder files (avatars, PDF, PNG)
// Anything else is logged loudly and answered 404.
import http from "node:http";
import { avatarSvg, placeholderPng, simplePdf } from "./assets.mjs";
import { runPsql } from "./pg.mjs";
import { createRest } from "./rest.mjs";
import { MOCK_JWT_SECRET, mintSession, parseRefreshToken, userFor, verifyJwt } from "./session.mjs";

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const send = (res, status, body, headers = {}) => {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body ?? "");
  res.writeHead(status, { "Content-Length": buf.length, ...headers });
  res.end(buf);
};
const sendJson = (res, status, body) => send(res, status, JSON.stringify(body), { "Content-Type": "application/json; charset=utf-8" });

export async function createGateway({ conn, catalog, port = 0, log = (m) => console.log(m) }) {
  const rest = createRest({ conn, catalog, log });
  let members = null;
  async function memberById(id) {
    if (!members) {
      const r = await runPsql(conn, "select coalesce(jsonb_object_agg(id, jsonb_build_object('name', name, 'colour', colour)), '{}') from public.members");
      members = JSON.parse(r.stdout.trim() || "{}");
    }
    return members[id] ?? null;
  }

  async function storageFile(res, bucket, objectPath) {
    const ext = objectPath.split(".").pop()?.toLowerCase();
    const memberId = objectPath.split("/")[0];
    const member = await memberById(memberId);
    if (bucket === "avatars") {
      return send(res, 200, avatarSvg({ name: member?.name, colour: member?.colour ?? "#64748b" }), { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    }
    if (ext === "pdf") {
      return send(res, 200, simplePdf([`Mock-dokument`, `${member?.name ?? "Ukjent"} - ${objectPath.split("/").pop()}`, "Laget av mock-stacken, ikke et ekte dokument."]), { "Content-Type": "application/pdf" });
    }
    if (ext === "png") return send(res, 200, placeholderPng(), { "Content-Type": "image/png" });
    return send(res, 200, avatarSvg({ name: "?", colour: "#94a3b8" }), { "Content-Type": "image/svg+xml" });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://gateway");
    const started = Date.now();
    try {
      if (url.pathname === "/__health") return sendJson(res, 200, { ok: true });
      if (url.pathname.startsWith("/rest/v1")) {
        const bodyText = req.method === "GET" || req.method === "HEAD" ? "" : await readBody(req);
        const out = await rest({
          method: req.method ?? "GET",
          path: url.pathname.slice("/rest/v1".length),
          search: url.search.slice(1),
          headers: req.headers,
          bodyText,
        });
        send(res, out.status, out.body, out.headers);
        if (out.status >= 400 && out.status !== 406) log(`[rest] ${req.method} ${url.pathname}${url.search} -> ${out.status} ${out.body.slice(0, 200)}`);
        return;
      }
      if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url);
      if (url.pathname.startsWith("/storage/v1")) return await storage(req, res, url);
      log(`[gateway] UNKNOWN ROUTE ${req.method} ${url.pathname}${url.search}`);
      sendJson(res, 404, { message: "mock gateway: unknown route", error: "not_found" });
    } catch (error) {
      log(`[gateway] ERROR ${req.method} ${req.url}: ${error?.stack ?? error}`);
      sendJson(res, 500, { message: String(error?.message ?? error) });
    } finally {
      void started;
    }
  });

  async function auth(req, res, url) {
    const route = url.pathname.slice("/auth/v1".length);
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    if (route === "/user" && req.method === "GET") {
      const claims = verifyJwt(bearer, MOCK_JWT_SECRET);
      if (!claims || claims.role !== "authenticated" || !claims.email) return sendJson(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return sendJson(res, 200, userFor(claims.email));
    }
    if (route === "/token" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const parsed = parseRefreshToken(body.refresh_token);
      if (!parsed) return sendJson(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      return sendJson(res, 200, mintSession({ email: parsed.email, sessionId: parsed.sessionId, issuer: `http://${req.headers.host}/auth/v1` }));
    }
    if (route === "/logout") {
      await readBody(req);
      return send(res, 204, "");
    }
    if (route === "/.well-known/jwks.json") return sendJson(res, 200, { keys: [] });
    if (route === "/settings") return sendJson(res, 200, { external: { google: true }, disable_signup: false, mailer_autoconfirm: true });
    log(`[gateway] UNSUPPORTED auth route ${req.method} ${url.pathname}${url.search}`);
    sendJson(res, 404, { code: 404, error_code: "not_found", msg: "mock gateway: unsupported auth route" });
  }

  async function storage(req, res, url) {
    const route = url.pathname.slice("/storage/v1".length);
    let m;
    if ((m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(route)) && req.method === "POST") {
      await readBody(req);
      return sendJson(res, 200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=mock` });
    }
    if ((m = /^\/object\/sign\/([^/]+)$/.exec(route)) && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      return sendJson(res, 200, (body.paths ?? []).map((p) => ({ error: null, path: p, signedURL: `/object/sign/${m[1]}/${p}?token=mock` })));
    }
    if ((m = /^\/object\/(?:sign|authenticated|public)\/([^/]+)\/(.+)$/.exec(route)) && (req.method === "GET" || req.method === "HEAD")) {
      return await storageFile(res, m[1], decodeURIComponent(m[2]));
    }
    if ((m = /^\/object\/([^/]+)\/(.+)$/.exec(route)) && req.method === "GET") return await storageFile(res, m[1], decodeURIComponent(m[2]));
    if (/^\/object\/([^/]+)(\/.+)?$/.test(route) && (req.method === "POST" || req.method === "PUT")) {
      await readBody(req);
      return sendJson(res, 200, { Key: route.slice("/object/".length), Id: "mock" });
    }
    if (/^\/object\/([^/]+)$/.test(route) && req.method === "DELETE") {
      await readBody(req);
      return sendJson(res, 200, []);
    }
    log(`[gateway] UNSUPPORTED storage route ${req.method} ${url.pathname}${url.search}`);
    sendJson(res, 404, { statusCode: "404", error: "not_found", message: "mock gateway: unsupported storage route" });
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  return { port: address.port, url: `http://127.0.0.1:${address.port}`, close: () => new Promise((r) => server.close(() => r())) };
}
