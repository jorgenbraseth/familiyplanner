// Pure helpers of the mock PostgREST: parse the query string / body that @supabase/postgrest-js sends and
// build SQL. No I/O here (unit tested in query.test.mjs). Every identifier is quoted and every value is an
// escaped string literal (standard_conforming_strings is on), so nothing from a request is interpolated raw.

export class Unsupported extends Error {
  constructor(message) {
    super(message);
    this.name = "Unsupported";
  }
}

export class BadRequest extends Error {
  constructor(message, code = "PGRST100") {
    super(message);
    this.name = "BadRequest";
    this.code = code;
  }
}

export function ident(name) {
  if (typeof name !== "string" || name.length === 0 || name.includes("\0")) throw new BadRequest("invalid identifier");
  return `"${name.replace(/"/g, '""')}"`;
}

export function lit(value) {
  if (value === null || value === undefined) return "null";
  const s = String(value);
  if (s.includes("\0")) throw new BadRequest("invalid value");
  return `'${s.replace(/'/g, "''")}'`;
}


/** Splits at commas outside parentheses, double quotes and braces. */
export function splitTop(str) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quoted) {
      current += c;
      if (c === "\\" && i + 1 < str.length) current += str[++i];
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') {
      quoted = true;
      current += c;
    } else if (c === "(" || c === "{") {
      depth++;
      current += c;
    } else if (c === ")" || c === "}") {
      depth--;
      current += c;
    } else if (c === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += c;
  }
  if (current.length > 0 || parts.length > 0) parts.push(current);
  return parts;
}

// ---- select ---------------------------------------------------------------------------------------------------

/**
 * "id, name, members!documents_member_id_fkey(name), documents!inner(status), *" ->
 * [{kind:"col", name, alias, cast}, {kind:"star"}, {kind:"embed", name, alias, hints, inner, children}]
 */
export function parseSelect(str) {
  const items = [];
  for (const raw of splitTop(str ?? "*")) {
    const part = raw.trim();
    if (part === "") continue;
    if (part === "*") {
      items.push({ kind: "star" });
      continue;
    }
    let alias = null;
    let rest = part;
    const aliasMatch = /^([A-Za-z_][\w]*):(?!:)(.*)$/.exec(rest);
    if (aliasMatch) {
      alias = aliasMatch[1];
      rest = aliasMatch[2];
    }
    const embed = /^([A-Za-z_][\w]*)((?:![\w]+)*)\(([\s\S]*)\)$/.exec(rest);
    if (embed) {
      const hints = embed[2].split("!").filter(Boolean);
      const inner = hints.includes("inner");
      items.push({
        kind: "embed",
        name: embed[1],
        alias,
        hints: hints.filter((h) => h !== "inner" && h !== "left"),
        inner,
        children: parseSelect(embed[3]),
      });
      continue;
    }
    const col = /^([A-Za-z_][\w]*)(?:::([A-Za-z_][\w ]*))?$/.exec(rest);
    if (!col) throw new Unsupported(`select item "${part}"`);
    items.push({ kind: "col", name: col[1], alias, cast: col[2] ?? null });
  }
  return items;
}

// ---- filters --------------------------------------------------------------------------------------------------

const SIMPLE_OPS = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  cs: "@>",
  cd: "<@",
  ov: "&&",
  sl: "<<",
  sr: ">>",
  nxr: "&<",
  nxl: "&>",
  adj: "-|-",
  match: "~",
  imatch: "~*",
};

/** Unquotes a PostgREST list/value element. */
function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\(.)/g, "$1");
  return s;
}

/** SQL for one `op.value` condition on a column expression. */
export function conditionSql(colSql, opWithNot, value) {
  let negate = false;
  let op = opWithNot;
  if (op.startsWith("not.")) {
    negate = true;
    op = op.slice(4);
  }
  let sql;
  if (op in SIMPLE_OPS) {
    const raw = ["cs", "cd", "ov", "sl", "sr", "nxr", "nxl", "adj"].includes(op);
    sql = `${colSql} ${SIMPLE_OPS[op]} ${lit(raw ? value : unquote(value))}`;
  } else if (op === "like" || op === "ilike") {
    sql = `${colSql} ${op} ${lit(unquote(value).replace(/\*/g, "%"))}`;
  } else if (op === "in") {
    const m = /^\(([\s\S]*)\)$/.exec(value.trim());
    if (!m) throw new BadRequest(`in.${value}: expected (a,b,...)`);
    const list = splitTop(m[1]).map(unquote);
    sql = list.length === 0 || (list.length === 1 && list[0] === "" && m[1].trim() === "") ? "false" : `${colSql} in (${list.map(lit).join(", ")})`;
  } else if (op === "is") {
    const v = value.trim().toLowerCase();
    if (!["null", "true", "false", "unknown"].includes(v)) throw new BadRequest(`is.${value}`);
    sql = `${colSql} is ${v}`;
  } else if (op === "isdistinct") {
    sql = `${colSql} is distinct from ${lit(unquote(value))}`;
  } else {
    throw new Unsupported(`filter operator "${op}"`);
  }
  return negate ? `not (${sql})` : sql;
}

/** Parses the inside of or=(...)/and=(...) into a tree. */
export function parseLogic(op, inner, negate = false) {
  const items = [];
  for (const raw of splitTop(inner)) {
    const part = raw.trim();
    if (part === "") continue;
    const nested = /^(not\.)?(and|or)\(([\s\S]*)\)$/.exec(part);
    if (nested) {
      items.push(parseLogic(nested[2], nested[3], !!nested[1]));
      continue;
    }
    const dot = part.indexOf(".");
    if (dot < 1) throw new BadRequest(`invalid filter "${part}"`);
    items.push({ kind: "cond", col: part.slice(0, dot), rest: part.slice(dot + 1) });
  }
  return { kind: "logic", op, negate, items };
}

function condRest(rest) {
  // "not.eq.5" / "eq.5": the operator (with optional not.) and the value.
  const negated = rest.startsWith("not.");
  const body = negated ? rest.slice(4) : rest;
  const dot = body.indexOf(".");
  if (dot < 1) throw new BadRequest(`invalid filter value "${rest}"`);
  return { op: (negated ? "not." : "") + body.slice(0, dot), value: body.slice(dot + 1) };
}

/** SQL for a logic tree; `col` is a plain column name resolved against `alias`. */
export function logicSql(tree, alias) {
  const parts = tree.items.map((item) => {
    if (item.kind === "logic") return logicSql(item, alias);
    if (item.col.includes("->")) throw new Unsupported(`JSON path filter "${item.col}"`);
    const { op, value } = condRest(item.rest);
    return conditionSql(`${ident(alias)}.${ident(item.col)}`, op, value);
  });
  if (parts.length === 0) return "true";
  const joined = `(${parts.join(tree.op === "or" ? " or " : " and ")})`;
  return tree.negate ? `not ${joined}` : joined;
}

/**
 * Splits the query string into the pieces the builders need.
 * Embedded filters (`documents.status=eq.published`) are returned under `embedded[<path>]`.
 */
export function parseParams(entries) {
  const out = { select: null, order: [], limit: null, offset: null, onConflict: null, filters: [], logic: [], embedded: new Map() };
  const embedded = (path) => {
    const key = path.join(".");
    if (!out.embedded.has(key)) out.embedded.set(key, { path, order: [], limit: null, offset: null, filters: [], logic: [] });
    return out.embedded.get(key);
  };
  for (const [key, value] of entries) {
    if (key === "select") out.select = value;
    else if (key === "order") out.order = parseOrder(value);
    else if (key === "limit") out.limit = parseCount(value, "limit");
    else if (key === "offset") out.offset = parseCount(value, "offset");
    else if (key === "on_conflict") out.onConflict = value.split(",").map((c) => c.trim()).filter(Boolean);
    else if (key === "columns") continue;
    else if (key === "or" || key === "and" || key === "not.or" || key === "not.and") {
      const m = /^\(([\s\S]*)\)$/.exec(value.trim());
      if (!m) throw new BadRequest(`${key}=${value}`);
      out.logic.push(parseLogic(key.endsWith("or") ? "or" : "and", m[1], key.startsWith("not.")));
    } else {
      const parts = key.split(".");
      const last = parts[parts.length - 1];
      // `embed.order=...`, `embed.limit=...`, `embed.or=(...)`
      if (parts.length > 1 && ["order", "limit", "offset", "or", "and"].includes(last)) {
        const target = embedded(parts.slice(0, -1));
        if (last === "order") target.order = parseOrder(value);
        else if (last === "limit") target.limit = parseCount(value, "limit");
        else if (last === "offset") target.offset = parseCount(value, "offset");
        else {
          const m = /^\(([\s\S]*)\)$/.exec(value.trim());
          if (!m) throw new BadRequest(`${key}=${value}`);
          target.logic.push(parseLogic(last, m[1]));
        }
      } else if (parts.length > 1) {
        embedded(parts.slice(0, -1)).filters.push({ col: last, ...condRest(value) });
      } else {
        out.filters.push({ col: key, ...condRest(value) });
      }
    }
  }
  return out;
}

function parseCount(value, what) {
  if (!/^\d+$/.test(value)) throw new BadRequest(`${what} must be a non-negative integer`);
  return Number(value);
}

export function parseOrder(str) {
  return splitTop(str).map((raw) => {
    const [col, ...mods] = raw.trim().split(".");
    if (!col || col.includes("->")) throw new Unsupported(`order term "${raw}"`);
    let dir = "asc";
    let nulls = null;
    for (const m of mods) {
      if (m === "asc" || m === "desc") dir = m;
      else if (m === "nullsfirst") nulls = "first";
      else if (m === "nullslast") nulls = "last";
      else throw new BadRequest(`order modifier "${m}"`);
    }
    return { col, dir, nulls };
  });
}

function orderSql(terms, alias) {
  if (terms.length === 0) return "";
  return ` order by ${terms.map((t) => `${ident(alias)}.${ident(t.col)} ${t.dir}${t.nulls ? ` nulls ${t.nulls}` : ""}`).join(", ")}`;
}

function filtersSql(filters, logic, alias) {
  const parts = filters.map((f) => {
    if (f.col.includes("->")) throw new Unsupported(`JSON path filter "${f.col}"`);
    return conditionSql(`${ident(alias)}.${ident(f.col)}`, f.op, f.value);
  });
  for (const tree of logic) parts.push(logicSql(tree, alias));
  return parts;
}

// ---- relationships ---------------------------------------------------------------------------------------------

/**
 * Finds the foreign key between `parent` and `name` (an embedded table). `catalog.fks` entries:
 * { schema, name, table, columns, refTable, refColumns }. Returns { kind: "m2o" | "o2m", fk }.
 */
export function resolveRelationship(catalog, schema, parent, name, hints = []) {
  const matches = (fk) => hints.length === 0 || hints.some((h) => fk.name === h || fk.columns.includes(h) || fk.refColumns.includes(h));
  const candidates = [];
  for (const fk of catalog.fks) {
    if (fk.schema !== schema) continue;
    if (fk.table === parent && fk.refTable === name && matches(fk)) candidates.push({ kind: "m2o", fk });
    else if (fk.table === name && fk.refTable === parent && matches(fk)) candidates.push({ kind: "o2m", fk });
  }
  if (candidates.length === 0) throw new BadRequest(`Could not find a relationship between '${parent}' and '${name}'`, "PGRST200");
  if (candidates.length > 1) throw new BadRequest(`Could not embed '${name}' in '${parent}': more than one relationship found`, "PGRST201");
  return candidates[0];
}

// ---- select builder --------------------------------------------------------------------------------------------

let aliasCounter = 0;
const nextAlias = () => `e${++aliasCounter}`;

function joinSql(rel, parentAlias, childAlias) {
  const { fk } = rel;
  // m2o: parent holds the fk columns; o2m: child holds them.
  return fk.columns
    .map((c, i) =>
      rel.kind === "m2o"
        ? `${ident(childAlias)}.${ident(fk.refColumns[i])} = ${ident(parentAlias)}.${ident(c)}`
        : `${ident(childAlias)}.${ident(c)} = ${ident(parentAlias)}.${ident(fk.refColumns[i])}`,
    )
    .join(" and ");
}

/**
 * The SELECT list (and where-conditions contributed by `!inner` embeds) for a parsed select on `table` aliased
 * `alias`. `embedParams` carries the embedded filters/order by dotted path.
 */
function selectList(items, ctx, table, alias, path, embedParams) {
  const cols = [];
  const innerConds = [];
  const list = items.length === 0 ? [{ kind: "star" }] : items;
  for (const item of list) {
    if (item.kind === "star") cols.push(`${ident(alias)}.*`);
    else if (item.kind === "col") {
      const base = `${ident(alias)}.${ident(item.name)}${item.cast ? `::${castType(item.cast)}` : ""}`;
      cols.push(item.alias ? `${base} as ${ident(item.alias)}` : item.cast ? `${base} as ${ident(item.name)}` : base);
    } else {
      const key = item.alias ?? item.name;
      const rel = resolveRelationship(ctx.catalog, ctx.schema, table, item.name, item.hints);
      const childAlias = nextAlias();
      const childPath = [...path, key];
      const own = embedParams.get(childPath.join(".")) ?? embedParams.get([...path, item.name].join(".")) ?? { order: [], limit: null, offset: null, filters: [], logic: [] };
      const nested = selectList(item.children, ctx, item.name, childAlias, childPath, embedParams);
      const conds = [joinSql(rel, alias, childAlias), ...filtersSql(own.filters, own.logic, childAlias), ...nested.innerConds];
      const where = conds.join(" and ");
      const inner = `select ${nested.cols.join(", ")} from ${ident(ctx.schema)}.${ident(item.name)} as ${ident(childAlias)} where ${where}${orderSql(own.order, childAlias)}${own.limit !== null ? ` limit ${own.limit}` : ""}${own.offset !== null ? ` offset ${own.offset}` : ""}`;
      if (rel.kind === "m2o") cols.push(`(select to_jsonb(x) from (${inner}) x) as ${ident(key)}`);
      else cols.push(`coalesce((select jsonb_agg(to_jsonb(x)) from (${inner}) x), '[]'::jsonb) as ${ident(key)}`);
      // Same alias in a sibling subquery scope: legal, and keeps the join/filter text identical.
      if (item.inner) innerConds.push(`exists (select 1 from ${ident(ctx.schema)}.${ident(item.name)} as ${ident(childAlias)} where ${where})`);
    }
  }
  return { cols, innerConds };
}

function castType(type) {
  if (!/^[A-Za-z_][A-Za-z_ ]*$/.test(type)) throw new BadRequest(`cast "${type}"`);
  return type;
}

/**
 * Builds the row-producing SELECT for a read (or for the RETURNING part of a mutation, where `source` is the
 * CTE name to read instead of the table).
 */
export function buildRowsSelect({ schema, table, params, catalog, source = null, withLimit = true }) {
  const ctx = { catalog, schema };
  const alias = "t";
  const items = parseSelect(params.select ?? "*");
  const { cols, innerConds } = selectList(items, ctx, table, alias, [], params.embedded);
  const where = [...filtersSql(params.filters, params.logic, alias), ...innerConds];
  const from = source ? ident(source) : `${ident(schema)}.${ident(table)}`;
  let sql = `select ${cols.join(", ")} from ${from} as ${ident(alias)}`;
  if (where.length > 0) sql += ` where ${where.join(" and ")}`;
  sql += orderSql(params.order, alias);
  if (withLimit) {
    if (params.limit !== null) sql += ` limit ${params.limit}`;
    if (params.offset !== null) sql += ` offset ${params.offset}`;
  }
  return { sql, whereSql: where.join(" and "), fromSql: from };
}

export function countSql({ fromSql, whereSql }) {
  return `(select count(*) from ${fromSql} as "t"${whereSql ? ` where ${whereSql}` : ""})`;
}

// ---- mutations --------------------------------------------------------------------------------------------------

function bodyRows(body) {
  const rows = Array.isArray(body) ? body : [body];
  for (const r of rows) if (r === null || typeof r !== "object" || Array.isArray(r)) throw new BadRequest("All object keys must match", "PGRST102");
  return rows;
}

export function bodyColumns(rows) {
  const cols = [];
  for (const row of rows) for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
  return cols;
}

/** INSERT (optionally upsert) statement text ending in `returning *`. */
export function buildInsert({ schema, table, body, prefer, params, pkColumns }) {
  const rows = bodyRows(body);
  const target = `${ident(schema)}.${ident(table)}`;
  const cols = bodyColumns(rows);
  if (rows.length === 0) return null;
  if (cols.length === 0) return `insert into ${target} default values returning *`;
  const colList = cols.map(ident).join(", ");
  let sql = `insert into ${target} (${colList}) select ${colList} from jsonb_populate_recordset(null::${target}, ${lit(JSON.stringify(rows))}::jsonb)`;
  const resolution = prefer.resolution;
  if (resolution === "merge-duplicates" || resolution === "ignore-duplicates") {
    const conflict = params.onConflict ?? pkColumns;
    if (!conflict || conflict.length === 0) throw new BadRequest("upsert without on_conflict needs a primary key");
    sql += ` on conflict (${conflict.map(ident).join(", ")})`;
    const updatable = cols.filter((c) => !conflict.includes(c));
    if (resolution === "ignore-duplicates" || updatable.length === 0) sql += " do nothing";
    else sql += ` do update set ${updatable.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`;
  }
  return `${sql} returning *`;
}

/** UPDATE statement text ending in `returning "t".*`; null when the body has no columns. */
export function buildUpdate({ schema, table, body, params }) {
  const rows = bodyRows(body);
  if (rows.length !== 1) throw new BadRequest("PATCH body must be a single object");
  const target = `${ident(schema)}.${ident(table)}`;
  const cols = Object.keys(rows[0]);
  const where = filtersSql(params.filters, params.logic, "t");
  if (params.embedded.size > 0) throw new Unsupported("filters on embedded resources in a PATCH/DELETE");
  if (cols.length === 0) return null;
  return `update ${target} as "t" set ${cols.map((c) => `${ident(c)} = "__r".${ident(c)}`).join(", ")} from (select * from jsonb_populate_record(null::${target}, ${lit(JSON.stringify(rows[0]))}::jsonb)) as "__r"${where.length > 0 ? ` where ${where.join(" and ")}` : ""} returning "t".*`;
}

export function buildDelete({ schema, table, params }) {
  const where = filtersSql(params.filters, params.logic, "t");
  if (params.embedded.size > 0) throw new Unsupported("filters on embedded resources in a PATCH/DELETE");
  return `delete from ${ident(schema)}.${ident(table)} as "t"${where.length > 0 ? ` where ${where.join(" and ")}` : ""} returning "t".*`;
}

// ---- rpc ----------------------------------------------------------------------------------------------------------

function pgArrayLiteral(values) {
  return `{${values.map((v) => (v === null ? "NULL" : `"${String(v).replace(/(["\\])/g, "\\$1")}"`)).join(",")}}`;
}

/** Argument literal for a function parameter of type `type` (as format_type prints it). */
export function rpcArg(value, type) {
  if (value === null || value === undefined) return "null";
  if (/^jsonb?$/.test(type)) return `${lit(JSON.stringify(value))}::${type}`;
  if (type.endsWith("[]") && Array.isArray(value)) return lit(pgArrayLiteral(value));
  if (typeof value === "object") return lit(JSON.stringify(value));
  return lit(value);
}

/**
 * `select ... ` text for calling function `name` with named args. `fn` is the catalog entry
 * { argnames, argtypes, retset, rettype ("void" | "composite" | "scalar") }.
 */
export function buildRpc({ schema, name, args, fn }) {
  const entries = Object.entries(args ?? {});
  const known = new Set(fn.argnames);
  for (const [k] of entries) if (!known.has(k)) throw new BadRequest(`Could not find the function ${schema}.${name}(${entries.map(([n]) => n).join(", ")}) in the schema cache`, "PGRST202");
  const call = `${ident(schema)}.${ident(name)}(${entries.map(([k, v]) => `${ident(k)} => ${rpcArg(v, fn.argtypes[fn.argnames.indexOf(k)])}`).join(", ")})`;
  if (fn.rettype === "void") return { sql: `select ${call} is null as v`, kind: "void" };
  if (fn.retset) {
    const row = fn.rettype === "composite" ? 'to_jsonb("r")' : 'to_jsonb("r"."v")';
    const from = fn.rettype === "composite" ? `${call} as "r"` : `${call} as "r"("v")`;
    return { sql: `select coalesce(jsonb_agg(${row}), '[]'::jsonb) from ${from}`, kind: "rows" };
  }
  return { sql: `select to_jsonb(${call})`, kind: "value" };
}

// ---- headers / errors ---------------------------------------------------------------------------------------------

export function parsePrefer(header) {
  const out = {};
  for (const part of String(header ?? "").split(",")) {
    const [k, v] = part.trim().split("=");
    if (k) out[k.trim()] = (v ?? "true").trim();
  }
  return out;
}

/** Maps a Postgres/psql error to the PostgREST JSON error shape and an HTTP status. */
export function mapPgError({ sqlstate, message, detail, hint }, role = "authenticated") {
  const single = /^PGRST116:(\d+)$/.exec(message ?? "");
  if (single) {
    return {
      status: 406,
      body: { code: "PGRST116", details: `The result contains ${single[1]} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" },
    };
  }
  let status = 400;
  if (sqlstate === "23505" || sqlstate === "23503") status = 409;
  else if (sqlstate === "42501") status = role === "anon" ? 401 : 403;
  else if (sqlstate === "42P01" || sqlstate === "42883") status = 404;
  else if (/^(53|57|58|XX)/.test(sqlstate ?? "")) status = 500;
  return { status, body: { code: sqlstate ?? "XX000", details: detail ?? null, hint: hint ?? null, message: message ?? "unknown error" } };
}

/** Parses psql's VERBOSITY=verbose error text. */
export function parsePsqlError(stderr) {
  const first = /ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/.exec(stderr);
  if (!first) return { sqlstate: "XX000", message: stderr.trim().split("\n")[0] || "psql failed", detail: null, hint: null };
  return {
    sqlstate: first[1],
    message: first[2],
    detail: /\nDETAIL:\s+([^\n]*)/.exec(stderr)?.[1] ?? null,
    hint: /\nHINT:\s+([^\n]*)/.exec(stderr)?.[1] ?? null,
  };
}
