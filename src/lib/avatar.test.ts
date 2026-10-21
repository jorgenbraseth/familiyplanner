import { describe, expect, it } from "vitest";
import { isAvatarPathFor, setAvatarSchema } from "./avatar";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

describe("avatar paths", () => {
  it("accepts the member's own folder", () => {
    expect(isAvatarPathFor(id, `${id}/abc-123.webp`)).toBe(true);
    expect(isAvatarPathFor(id, `${id}/abc.jpg`)).toBe(true);
  });
  it("rejects other folders, traversal and other types", () => {
    expect(isAvatarPathFor(id, `${other}/a.webp`)).toBe(false);
    expect(isAvatarPathFor(id, `${id}/../a.webp`)).toBe(false);
    expect(isAvatarPathFor(id, `${id}/a.gif`)).toBe(false);
    expect(isAvatarPathFor(id, `${id}/x/a.webp`)).toBe(false);
  });
  it("schema allows null (remove) and valid paths only", () => {
    expect(setAvatarSchema.safeParse({ memberId: id, path: null }).success).toBe(true);
    expect(setAvatarSchema.safeParse({ memberId: id, path: `${id}/a.webp` }).success).toBe(true);
    expect(setAvatarSchema.safeParse({ memberId: id, path: `${other}/a.webp` }).success).toBe(false);
  });
});
