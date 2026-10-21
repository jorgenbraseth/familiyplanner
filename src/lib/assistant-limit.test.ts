import { describe, expect, it } from "vitest";
import { ASSISTANT_DAILY_LIMIT, questionsLeftToday } from "./assistant-limit";

describe("questionsLeftToday", () => {
  it("counts down for children", () => {
    expect(questionsLeftToday(0, "child")).toBe(ASSISTANT_DAILY_LIMIT);
    expect(questionsLeftToday(1, "child")).toBe(ASSISTANT_DAILY_LIMIT - 1);
    expect(questionsLeftToday(ASSISTANT_DAILY_LIMIT, "child")).toBe(0);
  });

  it("never goes below zero or above the limit", () => {
    expect(questionsLeftToday(ASSISTANT_DAILY_LIMIT + 5, "child")).toBe(0);
    expect(questionsLeftToday(-3, "child")).toBe(ASSISTANT_DAILY_LIMIT);
    expect(questionsLeftToday(2.9, "child")).toBe(ASSISTANT_DAILY_LIMIT - 2);
  });

  it("is unlimited (null) for parents", () => {
    expect(questionsLeftToday(0, "parent")).toBeNull();
    expect(questionsLeftToday(500, "parent")).toBeNull();
  });
});
