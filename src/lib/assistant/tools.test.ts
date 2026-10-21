import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TOOL_DEFINITIONS } from "./tools";

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
