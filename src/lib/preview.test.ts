import { describe, expect, it } from "vitest";
import { canPreview, parseViewAsId } from "./preview";

describe("parseViewAsId", () => {
  it("accepts a uuid", () => {
    const id = "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60";
    expect(parseViewAsId(id)).toBe(id);
  });
  it.each([undefined, null, "", "abc", "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f6", "'; drop table members;--"])(
    "rejects %s",
    (value) => {
      expect(parseViewAsId(value)).toBeNull();
    },
  );
});

describe("canPreview", () => {
  it("lets a parent preview a child only", () => {
    expect(canPreview({ role: "parent" }, { role: "child" })).toBe(true);
    expect(canPreview({ role: "parent" }, { role: "parent" })).toBe(false);
    expect(canPreview({ role: "parent" }, null)).toBe(false);
    expect(canPreview({ role: "parent" }, undefined)).toBe(false);
  });
  it("never lets a child preview anyone", () => {
    expect(canPreview({ role: "child" }, { role: "child" })).toBe(false);
    expect(canPreview({ role: "child" }, { role: "parent" })).toBe(false);
  });
});
