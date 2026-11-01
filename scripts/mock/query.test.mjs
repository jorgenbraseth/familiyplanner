import { describe, expect, it } from "vitest";
import { buildDelete, buildInsert, buildRowsSelect, buildRpc, conditionSql, ident, lit, mapPgError, parseParams, parsePrefer, parseSelect, splitTop } from "./query.mjs";

const catalog = {
  fks: [{ schema: "public", name: "documents_member_id_fkey", table: "documents", columns: ["member_id"], refTable: "members", refColumns: ["id"] }],
  pks: { routine_checks: ["id"] },
};
const params = (qs) => parseParams([...new URLSearchParams(qs)]);

describe("quoting", () => {
  it("quotes identifiers and literals", () => {
    expect(ident('a"b')).toBe('"a""b"');
    expect(lit("it's")).toBe("'it''s'");
    expect(lit(null)).toBe("null");
    expect(() => lit("a\0b")).toThrow();
  });
});

describe("splitTop / parseSelect", () => {
  it("splits at top-level commas only", () => {
    expect(splitTop('a,(b,c),"d,e"')).toEqual(["a", "(b,c)", '"d,e"']);
  });
  it("parses columns, embeds and hints", () => {
    const items = parseSelect("id, members!documents_member_id_fkey(name, colour), documents!inner(status), *");
    expect(items[1]).toMatchObject({ kind: "embed", name: "members", hints: ["documents_member_id_fkey"], inner: false });
    expect(items[2]).toMatchObject({ kind: "embed", name: "documents", inner: true });
    expect(items[3]).toEqual({ kind: "star" });
  });
});

describe("conditions", () => {
  it("maps operators", () => {
    expect(conditionSql('"t"."a"', "eq", "x")).toBe(`"t"."a" = 'x'`);
    expect(conditionSql('"t"."a"', "not.in", '(1,"b c")')).toBe(`not ("t"."a" in ('1', 'b c'))`);
    expect(conditionSql('"t"."a"', "is", "null")).toBe('"t"."a" is null');
    expect(conditionSql('"t"."a"', "ilike", "*x*")).toBe(`"t"."a" ilike '%x%'`);
    expect(conditionSql('"t"."a"', "cs", "{a,b}")).toBe(`"t"."a" @> '{a,b}'`);
    expect(() => conditionSql('"t"."a"', "fts", "x")).toThrow(/operator/);
  });
  it("does not let values escape the literal", () => {
    expect(conditionSql('"t"."a"', "eq", "x'; drop table members; --")).toBe(`"t"."a" = 'x''; drop table members; --'`);
  });
});

describe("buildRowsSelect", () => {
  it("builds inner embeds with embedded filters, or, order and limit", () => {
    const cat = { fks: [{ schema: "public", name: "k", table: "plan_items", columns: ["document_id"], refTable: "documents", refColumns: ["id"] }], pks: {} };
    const p = params("select=id,documents!inner(status)&documents.status=eq.published&member_id=eq.1&or=(date.gte.2026-01-01,kind.eq.homework)&order=date.desc.nullslast&limit=5");
    const { sql } = buildRowsSelect({ schema: "public", table: "plan_items", params: p, catalog: cat });
    expect(sql).toContain(`exists (select 1 from "public"."documents"`);
    expect(sql).toContain(`"status" = 'published'`);
    expect(sql).toContain(`("t"."date" >= '2026-01-01' or "t"."kind" = 'homework')`);
    expect(sql).toContain('order by "t"."date" desc nulls last limit 5');
  });
  it("embeds a many-to-one resource", () => {
    const p = params("select=id,members!documents_member_id_fkey(name)&status=eq.review&order=created_at.desc&limit=2");
    const { sql } = buildRowsSelect({ schema: "public", table: "documents", params: p, catalog });
    expect(sql).toContain('"members"');
    expect(sql).toContain(`"t"."status" = 'review'`);
    expect(sql).toContain('order by "t"."created_at" desc');
    expect(sql).toContain("limit 2");
  });
  it("rejects unknown relationships", () => {
    expect(() => buildRowsSelect({ schema: "public", table: "documents", params: params("select=x(id)"), catalog })).toThrow(/relationship/);
  });
});

describe("mutations", () => {
  it("builds bulk upserts", () => {
    const sql = buildInsert({ schema: "public", table: "routine_checks", body: [{ item_id: "a", date: "d" }], prefer: parsePrefer("resolution=merge-duplicates"), params: params("on_conflict=item_id"), pkColumns: ["id"] });
    expect(sql).toContain('on conflict ("item_id") do update set "date" = excluded."date"');
  });
  it("builds deletes with filters", () => {
    expect(buildDelete({ schema: "public", table: "stars", params: params("id=eq.1") })).toContain(`where "t"."id" = '1'`);
  });
});

describe("rpc / errors / prefer", () => {
  it("calls a function with named args", () => {
    const fn = { argnames: ["member"], argtypes: ["uuid"], retset: false, rettype: "scalar" };
    expect(buildRpc({ schema: "public", name: "f", args: { member: "x" }, fn }).sql).toBe(`select to_jsonb("public"."f"("member" => 'x'))`);
  });
  it("maps errors", () => {
    expect(mapPgError({ sqlstate: "23505", message: "dup" }).status).toBe(409);
    expect(mapPgError({ sqlstate: "P0001", message: "PGRST116:0" })).toMatchObject({ status: 406, body: { code: "PGRST116" } });
  });
  it("parses Prefer", () => {
    expect(parsePrefer("return=representation, count=exact")).toEqual({ return: "representation", count: "exact" });
  });
});
