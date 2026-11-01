import { describe, expect, it } from "vitest";
import { pickPerson, screenHref, screenPeople, upcomingDays } from "./screen";

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

describe("upcomingDays", () => {
  const d = (key: string) => ({ key });
  const thisWeek = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"].map(d);
  const nextWeek = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"].map(d);
  it("crosses into next week on a Sunday", () => {
    expect(upcomingDays([thisWeek, nextWeek], "2026-11-08").map((x) => x.key)).toEqual(nextWeek.slice(0, 6).map((x) => x.key));
  });
  it("takes the rest of this week then next week on a Thursday", () => {
    expect(upcomingDays([thisWeek, nextWeek], "2026-11-05").map((x) => x.key)).toEqual([
      "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11",
    ]);
  });
  it("gives fewer days when next week is missing and ignores duplicates", () => {
    expect(upcomingDays([thisWeek, thisWeek], "2026-11-06").map((x) => x.key)).toEqual(["2026-11-07", "2026-11-08"]);
  });
});
