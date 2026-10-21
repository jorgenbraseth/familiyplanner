import { describe, expect, it } from "vitest";
import {
  STAR_DAILY_LIMIT,
  justReachedMilestone,
  milestonesOf,
  requestsLeftToday,
  rewardTextAt,
  trackProgress,
  type RewardRow,
  type StarRow,
  type StarStatus,
  type StarTrackRow,
} from "./stars";

const track: StarTrackRow = {
  id: "t1",
  member_id: "m1",
  name: "Tidy room",
  goal: 30,
  milestone_every: 5,
  small_reward: "Ice cream",
  big_reward: "Zoo trip",
  preset_reasons: ["Cleaned room"],
  status: "active",
  created_at: "2026-10-01T10:00:00Z",
  completed_at: null,
};

let seq = 0;
function stars(status: StarStatus, n: number, trackId = "t1"): StarRow[] {
  return Array.from({ length: n }, () => ({
    id: `s${seq++}`,
    track_id: trackId,
    member_id: "m1",
    reason: "Test",
    photo_path: null,
    status,
    requested_by: "m1",
    decided_by: null,
    decided_at: null,
    note: null,
    created_at: "2026-10-02T10:00:00Z",
  }));
}

function reward(atCount: number, kind: "small" | "big" = "small", trackId = "t1"): RewardRow {
  return { id: `r${atCount}`, track_id: trackId, at_count: atCount, kind, given_at: "2026-10-05T10:00:00Z", given_by: "p1" };
}

describe("milestonesOf", () => {
  it("lists multiples up to the goal", () => {
    expect(milestonesOf(track)).toEqual([5, 10, 15, 20, 25, 30]);
    expect(milestonesOf({ goal: 5, milestone_every: 1 })).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("trackProgress", () => {
  it("starts empty", () => {
    const p = trackProgress(track, [], []);
    expect(p).toMatchObject({ approved: 0, pending: 0, declined: 0, goal: 30, nextMilestone: 5, starsToNext: 5, complete: false });
    expect(p.milestonesReached).toEqual([]);
    expect(p.rewardsOwed).toEqual([]);
    expect(p.rewardsGiven).toEqual([]);
  });

  it("counts only approved stars toward progress", () => {
    const p = trackProgress(track, [...stars("approved", 3), ...stars("pending", 4), ...stars("declined", 2)], []);
    expect(p.approved).toBe(3);
    expect(p.pending).toBe(4);
    expect(p.declined).toBe(2);
    expect(p.nextMilestone).toBe(5);
    expect(p.starsToNext).toBe(2);
  });

  it("pending and declined stars never reach a milestone", () => {
    const p = trackProgress(track, [...stars("pending", 10), ...stars("declined", 10)], []);
    expect(p.milestonesReached).toEqual([]);
    expect(p.rewardsOwed).toEqual([]);
  });

  it("owes a small reward on reaching a milestone, exactly at the milestone", () => {
    const p = trackProgress(track, stars("approved", 5), []);
    expect(p.milestonesReached).toEqual([5]);
    expect(p.rewardsOwed).toEqual([{ atCount: 5, kind: "small", text: "Ice cream" }]);
    expect(p.nextMilestone).toBe(10);
    expect(p.starsToNext).toBe(5);
  });

  it("just below a milestone owes nothing", () => {
    const p = trackProgress(track, stars("approved", 9), [reward(5)]);
    expect(p.rewardsOwed).toEqual([]);
    expect(p.starsToNext).toBe(1);
  });

  it("splits owed and given rewards", () => {
    const p = trackProgress(track, stars("approved", 15), [reward(5), reward(15)]);
    expect(p.milestonesReached).toEqual([5, 10, 15]);
    expect(p.rewardsOwed.map((r) => r.atCount)).toEqual([10]);
    expect(p.rewardsGiven.map((r) => r.atCount)).toEqual([5, 15]);
    expect(p.rewardsGiven[0]).toMatchObject({ kind: "small", text: "Ice cream", givenBy: "p1" });
  });

  it("reaching the goal completes the track with a big reward owed", () => {
    const p = trackProgress(track, stars("approved", 30), [5, 10, 15, 20, 25].map((n) => reward(n)));
    expect(p.complete).toBe(true);
    expect(p.nextMilestone).toBeNull();
    expect(p.starsToNext).toBe(0);
    expect(p.rewardsOwed).toEqual([{ atCount: 30, kind: "big", text: "Zoo trip" }]);
  });

  it("caps over-approval at the goal", () => {
    const p = trackProgress(track, stars("approved", 33), []);
    expect(p.approved).toBe(30);
    expect(p.milestonesReached).toEqual([5, 10, 15, 20, 25, 30]);
    expect(p.complete).toBe(true);
    expect(p.rewardsOwed).toHaveLength(6);
  });

  it("works with milestone_every = 1", () => {
    const t = { ...track, goal: 5, milestone_every: 1 };
    const p = trackProgress(t, stars("approved", 3), [reward(1)]);
    expect(p.milestonesReached).toEqual([1, 2, 3]);
    expect(p.rewardsOwed.map((r) => [r.atCount, r.kind])).toEqual([[2, "small"], [3, "small"]]);
    expect(p.nextMilestone).toBe(4);
    const done = trackProgress(t, stars("approved", 5), []);
    expect(done.rewardsOwed.at(-1)).toEqual({ atCount: 5, kind: "big", text: "Zoo trip" });
  });

  it("ignores stars and rewards of other tracks", () => {
    const p = trackProgress(track, [...stars("approved", 2), ...stars("approved", 20, "other")], [reward(5, "small", "other")]);
    expect(p.approved).toBe(2);
    expect(p.rewardsGiven).toEqual([]);
  });

  it("ignores reward rows that aren't at a milestone", () => {
    const p = trackProgress(track, stars("approved", 5), [reward(7)]);
    expect(p.rewardsGiven).toEqual([]);
    expect(p.rewardsOwed.map((r) => r.atCount)).toEqual([5]);
  });
});

describe("justReachedMilestone", () => {
  it("returns the milestone crossed by one more star", () => {
    expect(justReachedMilestone(4, 5, track)).toBe(5);
    expect(justReachedMilestone(29, 30, track)).toBe(30);
  });

  it("returns null when no milestone is crossed", () => {
    expect(justReachedMilestone(5, 6, track)).toBeNull();
    expect(justReachedMilestone(0, 4, track)).toBeNull();
  });

  it("returns the highest milestone when several are crossed", () => {
    expect(justReachedMilestone(3, 11, track)).toBe(10);
  });

  it("returns null when the count doesn't go up", () => {
    expect(justReachedMilestone(5, 5, track)).toBeNull();
    expect(justReachedMilestone(10, 4, track)).toBeNull();
  });

  it("caps at the goal", () => {
    expect(justReachedMilestone(28, 40, track)).toBe(30);
    expect(justReachedMilestone(30, 35, track)).toBeNull();
  });

  it("works with every = 1", () => {
    const t = { goal: 5, milestone_every: 1 };
    expect(justReachedMilestone(0, 1, t)).toBe(1);
    expect(justReachedMilestone(2, 3, t)).toBe(3);
  });
});

describe("daily limit", () => {
  it("is 5, matching the database function", () => {
    expect(STAR_DAILY_LIMIT).toBe(5);
  });

  it("counts requests left", () => {
    expect(requestsLeftToday(0)).toBe(5);
    expect(requestsLeftToday(2)).toBe(3);
    expect(requestsLeftToday(5)).toBe(0);
    expect(requestsLeftToday(9)).toBe(0);
    expect(requestsLeftToday(-1)).toBe(5);
  });
});

describe("rewardTextAt", () => {
  it("gives the big reward at the goal and the small one before it", () => {
    const rewards = { goal: 30, small_reward: "Ice cream", big_reward: "Cinema" };
    expect(rewardTextAt(rewards, 5)).toBe("Ice cream");
    expect(rewardTextAt(rewards, 25)).toBe("Ice cream");
    expect(rewardTextAt(rewards, 30)).toBe("Cinema");
  });
});
