import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "../members";
import { runTool, TOOL_DEFINITIONS, TOOL_NAMES } from "./tools";

function findProblems(node: unknown, path: string, out: string[]) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => findProblems(item, `${path}[${i}]`, out));
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "type" && Array.isArray(value)) out.push(`${path}.type is an array`);
      findProblems(value, `${path}.${key}`, out);
    }
  }
}

describe("tool definitions", () => {
  it("never use strict or type arrays (the API rejects them with a 400)", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect("strict" in tool).toBe(false);
      const problems: string[] = [];
      findProblems(tool.input_schema, `${tool.name}.input_schema`, problems);
      expect(problems).toEqual([]);
    }
  });
});

const member = (id: string, name: string, role: "parent" | "child"): Member => ({
  id,
  name,
  email: `${id}@example.com`,
  role,
  calendar_id: null,
  colour: "#2563eb",
  locale: "nb-NO",
});
const kari = member("p1", "Kari Berg", "parent");
const mia = member("c1", "Mia", "child");
const emil = member("c2", "Emil", "child");
// No tool below should reach the database: a client that throws on any use proves it.
const noDb = new Proxy({}, { get: () => () => { throw new Error("database used"); } }) as unknown as SupabaseClient;
const ctx = { supabase: noDb, me: mia, members: [kari, mia, emil] };

describe("family-wide tools", () => {
  it("offers a member argument on every tool, and a timetable tool", () => {
    expect(TOOL_NAMES).toContain("get_timetable");
    for (const tool of TOOL_DEFINITIONS) {
      expect(JSON.stringify(tool.input_schema)).toContain("member_name");
    }
  });

  it("answers an unknown family member with an error instead of falling back to the asker", async () => {
    for (const name of ["get_stars", "get_calendar", "get_plan_items", "get_timetable"]) {
      const outcome = await runTool(ctx, name, { from: "2026-10-22", to: "2026-10-22", kind: null, subject: null, member_name: "Zed" });
      expect(outcome.isError).toBe(true);
      expect(outcome.content).toContain("No family member with that name.");
    }
  });

  it("find_next answers an unknown member with an error and needs a subject", async () => {
    const unknown = await runTool(ctx, "find_next", { subject: "gym", member_name: "Zed" });
    expect(unknown.isError).toBe(true);
    const empty = await runTool(ctx, "find_next", { subject: "", member_name: "children" });
    expect(empty.isError).toBe(true);
  });

  it("rejects an invalid date range before resolving anyone", async () => {
    const outcome = await runTool(ctx, "get_timetable", { from: "2026-10-23", to: "2026-10-22", subject: "mat", member_name: "children" });
    expect(outcome.isError).toBe(true);
  });

  it("answers a calendar question about a group without calendars with a note per member, no database needed", async () => {
    const outcome = await runTool(ctx, "get_calendar", { from: "2026-10-22", to: "2026-10-22", member_name: "kids" });
    expect(outcome.isError).toBe(false);
    const result = JSON.parse(outcome.content) as { results: { member: string; note: string }[] };
    expect(result.results.map((r) => r.member)).toEqual(["Mia", "Emil"]);
    expect(result.results.every((r) => r.note === "no calendar connected")).toBe(true);
  });
});
