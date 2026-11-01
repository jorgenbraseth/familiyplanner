import { describe, expect, it } from "vitest";
import { pickPerson, screenHref, screenPeople } from "./screen";

const m = (id: string, name: string, role: string) => ({ id, name, role }) as { id: string; name: string; role: "parent" | "child" };
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";

describe("screenPeople", () => {
  it("keeps only parents and children, children first, each by name", () => {
    const list = screenPeople([m(A, "Mamma", "parent"), m(B, "Zoe", "child"), m("x", "Skjerm", "screen"), m(C, "Emma", "child")]);
    expect(list.map((p) => p.name)).toEqual(["Emma", "Zoe", "Mamma"]);
  });
});

describe("pickPerson", () => {
  const people = [{ id: A }, { id: B }];
  it("picks the named person", () => expect(pickPerson(people, B)).toEqual({ id: B }));
  it("falls back to the first on missing, invalid or unknown ids", () => {
    expect(pickPerson(people, undefined)).toEqual({ id: A });
    expect(pickPerson(people, "nope")).toEqual({ id: A });
    expect(pickPerson(people, C)).toEqual({ id: A });
  });
  it("returns null with nobody", () => expect(pickPerson([], A)).toBeNull());
});

describe("screenHref", () => {
  it("links to a person", () => expect(screenHref(A)).toBe(`/skjerm?person=${A}`));
});
