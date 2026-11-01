// A mini PostgREST: the subset of the HTTP API @supabase/postgrest-js sends for this app, run against the mock
// Postgres through psql. One transaction per request: set local role, set request.jwt.claims, run the statement.
// Row-level security therefore does the real authorization work, exactly as on Supabase.
import {
  BadRequest,
  Unsupported,
  buildDelete,
  buildInsert,
  buildRowsSelect,
  buildRpc,
  buildUpdate,
  countSql,
  ident,
  lit,
  mapPgError,
  parseParams,
  parsePrefer,
  parsePsqlError,
} from "./query.mjs";
import { runPsql } from "./pg.mjs";
import { verifyJwt, MOCK_JWT_SECRET } from "./session.mjs";

const ROLES = new Set(["anon", "authenticated", "service_role"]);
const SCHEMAS = new Set(["public"]);

const CATALOG_SQL = `
select jsonb_build_object(
  'fks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', c.conname, 'table', t.relname, 'refTable', rt.relname,
      'columns', (select jsonb_agg(a.attname order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum),
      'refColumns', (select jsonb_agg(a.attname order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)))
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
    join pg_class rt on rt.oid = c.confrelid
    where c.contype = 'f' and n.nspname = 'public'), '[]'::jsonb),
  'pks', coalesce((
    select jsonb_object_agg(t.relname, cols) from (
      select t.relname, (select jsonb_agg(a.attname order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols
      from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'p' and n.nspname = 'public') t(relname, cols)), '{}'::jsonb),
  'funcs', coalesce((
    select jsonb_object_agg(p.proname, jsonb_build_object(
      'argnames', to_jsonb(coalesce(p.proargnames, '{}'::text[])),
      'argtypes', (select coalesce(jsonb_agg(format_type(ty, null)), '[]'::jsonb) from unnest(p.proargtypes::oid[]) ty),
      'retset', p.proretset,
      'rettype', case when p.prorettype = 'void'::regtype then 'void' when rt.typtype = 'c' then 'composite' else 'scalar' end))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
    where n.nspname = 'public'), '{}'::jsonb))
`;

export async function loadCatalog(conn) {
  const r = await runPsql(conn, CATALOG_SQL);
  if (r.code !== 0) throw new Error(`catalog query failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim());
}

const json = (status, body, headers = {}) => ({
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  body: body === undefined ? "" : JSON.stringify(body),
});

function authenticate(headers) {
  const bearer = /^Bearer\s+(.+)$/i.exec(headers.authorization ?? "")?.[1] ?? headers.apikey ?? null;
  if (!bearer) return { role: "anon", claims: { role: "anon" } };
  const claims = verifyJwt(bearer, MOCK_JWT_SECRET);
  if (!claims) return { error: json(401, { code: "PGRST301", details: null, hint: null, message: "JWT invalid or expired" }) };
  if (!ROLES.has(claims.role)) return { error: json(401, { code: "PGRST303", details: null, hint: null, message: `JWT role "${claims.role}" is not allowed` }) };
  return { role: claims.role, claims };
}

/**
 * @param {{ conn: string, catalog: object, log?: (msg: string) => void }} options
 * @returns {(req: { method: string, path: string, search: string, headers: Record<string,string>, bodyText: string }) => Promise<{status:number, headers:Record<string,string>, body:string}>}
 */
export function createRest({ conn, catalog, log = console.error }) {
  async function runInTransaction(auth, statement) {
    const script = [
      "begin;",
      `set local role ${ident(auth.role)};`,
      `set local request.jwt.claims = ${lit(JSON.stringify(auth.claims))};`,
      `${statement};`,
      "commit;",
    ].join("\n");
    const result = await runPsql(conn, script);
    if (result.code !== 0) {
      const err = parsePsqlError(result.stderr);
      return { error: mapPgError(err, auth.role) };
    }
    const line = result.stdout.trim().split("\n").filter(Boolean).pop();
    if (!line) return { value: null };
    return { value: JSON.parse(line) };
  }

  return async function handle(req) {
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(",") : v]));
    const auth = authenticate(headers);
    if (auth.error) return auth.error;
    try {
      const path = req.path.replace(/^\/+/, "").replace(/\/+$/, "");
      if (path === "") return json(200, { swagger: "2.0", info: { title: "mock" }, paths: {} });
      const schema = (req.method === "GET" || req.method === "HEAD" ? headers["accept-profile"] : headers["content-profile"]) ?? "public";
      if (!SCHEMAS.has(schema)) throw new Unsupported(`schema "${schema}"`);
      const entries = [...new URLSearchParams(req.search)];
      const prefer = parsePrefer(headers.prefer);
      const wantsObject = (headers.accept ?? "").includes("application/vnd.pgrst.object+json");
      let body;
      if (req.bodyText) {
        try {
          body = JSON.parse(req.bodyText);
        } catch {
          return json(400, { code: "PGRST102", details: null, hint: null, message: "Empty or invalid json" });
        }
      }

      if (path.startsWith("rpc/")) return await handleRpc({ auth, schema, name: path.slice(4), method: req.method, entries, body });

      const table = decodeURIComponent(path);
      const params = parseParams(entries);
      const representation = prefer.return === "representation";
      const wantsCount = ["exact", "planned", "estimated"].includes(prefer.count);

      if (req.method === "GET" || req.method === "HEAD") {
        const rows = buildRowsSelect({ schema, table, params, catalog });
        const unpaged = buildRowsSelect({ schema, table, params: { ...params, limit: null, offset: null }, catalog, withLimit: false });
        const parts = [
          `'rows', coalesce((select jsonb_agg(to_jsonb("q")) from "q"), '[]'::jsonb)`,
          `'n', (select count(*) from "q")`,
        ];
        if (wantsCount) parts.push(`'total', ${countSql(unpaged)}`);
        if (wantsObject) parts.push(`'chk', mock.assert_single((select count(*) from "q"))`);
        const result = await runInTransaction(auth, `with "q" as (${rows.sql}) select jsonb_build_object(${parts.join(", ")})`);
        if (result.error) return json(result.error.status, result.error.body);
        return readResponse(result.value, { wantsObject, wantsCount, offset: params.offset ?? 0, head: req.method === "HEAD" });
      }

      let mutation;
      let status;
      if (req.method === "POST") {
        mutation = buildInsert({ schema, table, body, prefer, params, pkColumns: catalog.pks[table] });
        status = 201;
        if (mutation === null) return json(201, representation ? [] : undefined);
      } else if (req.method === "PATCH") {
        mutation = buildUpdate({ schema, table, body, params });
        status = representation ? 200 : 204;
        if (mutation === null) {
          // Nothing to set: PostgREST matches the rows and changes nothing.
          const sel = buildRowsSelect({ schema, table, params, catalog });
          mutation = `select "t".* from ${sel.fromSql} as "t"${sel.whereSql ? ` where ${sel.whereSql}` : ""}`;
        }
      } else if (req.method === "DELETE") {
        mutation = buildDelete({ schema, table, params });
        status = representation ? 200 : 204;
      } else {
        return json(405, { code: "PGRST117", details: null, hint: null, message: `Unsupported HTTP method: ${req.method}` });
      }

      const returning = buildRowsSelect({
        schema,
        table,
        params: { ...params, filters: [], logic: [], embedded: params.embedded.size > 0 ? new Map() : params.embedded },
        catalog,
        source: "m",
      });
      const parts = [
        `'rows', ${representation ? `coalesce((select jsonb_agg(to_jsonb("q")) from "q"), '[]'::jsonb)` : "'[]'::jsonb"}`,
        `'n', (select count(*) from "m")`,
      ];
      if (wantsObject && representation) parts.push(`'chk', mock.assert_single((select count(*) from "m"))`);
      const result = await runInTransaction(auth, `with "m" as (${mutation}), "q" as (${returning.sql}) select jsonb_build_object(${parts.join(", ")})`);
      if (result.error) return json(result.error.status, result.error.body);
      if (!representation) return { status, headers: {}, body: "" };
      const out = result.value.rows;
      return json(status, wantsObject ? out[0] : out, wantsObject ? { "Content-Type": "application/vnd.pgrst.object+json; charset=utf-8" } : {});
    } catch (error) {
      if (error instanceof Unsupported) {
        log(`[mock-rest] UNSUPPORTED ${req.method} ${req.path}?${req.search}: ${error.message}`);
        return json(400, { code: "MOCK_UNSUPPORTED", details: null, hint: "Extend scripts/mock/query.mjs", message: `mock PostgREST does not support: ${error.message}` });
      }
      if (error instanceof BadRequest) return json(error.code === "PGRST200" || error.code === "PGRST202" ? 404 : 400, { code: error.code, details: null, hint: null, message: error.message });
      log(`[mock-rest] INTERNAL ${req.method} ${req.path}?${req.search}: ${error?.stack ?? error}`);
      return json(500, { code: "MOCK_INTERNAL", details: null, hint: null, message: String(error?.message ?? error) });
    }
  };

  async function handleRpc({ auth, schema, name, method, entries, body }) {
    const fn = catalog.funcs[name];
    if (!fn) return json(404, { code: "PGRST202", details: null, hint: null, message: `Could not find the function ${schema}.${name} in the schema cache` });
    if (method !== "POST" && method !== "GET") throw new Unsupported(`rpc via ${method}`);
    const args = method === "POST" ? (body ?? {}) : Object.fromEntries(entries);
    const { sql, kind } = buildRpc({ schema, name, args, fn });
    const result = await runInTransaction(auth, sql);
    if (result.error) return json(result.error.status, result.error.body);
    if (kind === "void") return { status: 204, headers: {}, body: "" };
    const value = kind === "rows" ? result.value : result.value;
    return { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(value) };
  }
}

function readResponse(value, { wantsObject, wantsCount, offset, head }) {
  const { rows, n, total } = value;
  const range = n === 0 ? `*/${wantsCount ? total : "*"}` : `${offset}-${offset + n - 1}/${wantsCount ? total : "*"}`;
  const headers = { "Content-Range": range };
  if (wantsObject) {
    headers["Content-Type"] = "application/vnd.pgrst.object+json; charset=utf-8";
    return { status: 200, headers, body: head ? "" : JSON.stringify(rows[0]) };
  }
  headers["Content-Type"] = "application/json; charset=utf-8";
  return { status: 200, headers, body: head ? "" : JSON.stringify(rows) };
}
