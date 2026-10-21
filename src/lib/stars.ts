// Star tracks: pure progress and milestone logic. No database or server access here.
// Row types match supabase/migrations/20261023090000_stars.sql (snake_case as Supabase returns them).

export type StarStatus = "pending" | "approved" | "declined";
export type TrackStatus = "active" | "completed";
export type RewardKind = "small" | "big";

export type StarTrackRow = {
  id: string;
  member_id: string;
  name: string;
  goal: number;
  milestone_every: number;
  small_reward: string;
  big_reward: string;
  preset_reasons: string[];
  status: TrackStatus;
  created_at: string;
  completed_at: string | null;
};

export type StarRow = {
  id: string;
  track_id: string;
  member_id: string;
  reason: string;
  photo_path: string | null;
  status: StarStatus;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  /** Stars this row is worth (1..10). */
  amount: number;
  task_id: string | null;
  created_at: string;
};

/** A task is for one child (`member_id`) or for all children (null) and applies to the child's active track. */
export type StarTaskRow = {
  id: string;
  member_id: string | null;
  name: string;
  /** Stars awarded for the task (1..10). */
  stars: number;
  sort: number;
  created_at: string;
};

export type RewardRow = {
  id: string;
  track_id: string;
  at_count: number;
  kind: RewardKind;
  given_at: string;
  given_by: string | null;
};

/** What a child gets to see: declined stars are hidden from them (parents keep seeing them, with undo). */
export function visibleToChild<T extends { status: StarStatus }>(stars: readonly T[]): T[] {
  return stars.filter((s) => s.status !== "declined");
}

/** Limits of a list of tasks: the all-children list and each child's own list (the database enforces the name length and stars). */
export const MAX_TASKS = 20;
export const MAX_TASK_NAME = 60;
export const MAX_TASK_STARS = 10;

export type OwedReward = { atCount: number; kind: RewardKind; text: string };
export type GivenReward = OwedReward & { givenAt: string; givenBy: string | null };

export type TrackProgress = {
  /** Sum of approved star amounts, capped at the goal. */
  approved: number;
  pending: number;
  declined: number;
  goal: number;
  /** The next milestone above `approved`, or null once the goal is reached. */
  nextMilestone: number | null;
  /** Stars still needed to reach `nextMilestone` (0 when complete). */
  starsToNext: number;
  /** Milestones (multiples of milestone_every up to the goal) reached so far. */
  milestonesReached: number[];
  /** Reached milestones with no reward row yet. */
  rewardsOwed: OwedReward[];
  rewardsGiven: GivenReward[];
  complete: boolean;
};

/** Milestones of a track: every `milestone_every` up to and including the goal. */
export function milestonesOf(track: Pick<StarTrackRow, "goal" | "milestone_every">): number[] {
  const every = Math.max(1, Math.floor(track.milestone_every));
  const out: number[] = [];
  for (let n = every; n <= track.goal; n += every) out.push(n);
  return out;
}

function rewardKindAt(track: StarTrackRow, atCount: number): RewardKind {
  return atCount >= track.goal ? "big" : "small";
}

function rewardText(track: StarTrackRow, kind: RewardKind): string {
  return kind === "big" ? track.big_reward : track.small_reward;
}

export function trackProgress(
  track: StarTrackRow,
  stars: readonly StarRow[],
  rewards: readonly RewardRow[],
): TrackProgress {
  const own = stars.filter((s) => s.track_id === track.id);
  const sumOf = (status: StarStatus) =>
    own.filter((s) => s.status === status).reduce((sum, s) => sum + s.amount, 0);
  const approved = Math.min(track.goal, sumOf("approved"));
  const pending = sumOf("pending");
  const declined = sumOf("declined");

  const milestones = milestonesOf(track);
  const milestonesReached = milestones.filter((m) => m <= approved);
  const nextMilestone = milestones.find((m) => m > approved) ?? null;

  const ownRewards = rewards.filter((r) => r.track_id === track.id);
  const givenAt = new Set(ownRewards.map((r) => r.at_count));
  const rewardsOwed = milestonesReached
    .filter((m) => !givenAt.has(m))
    .map((atCount) => {
      const kind = rewardKindAt(track, atCount);
      return { atCount, kind, text: rewardText(track, kind) };
    });
  const rewardsGiven = ownRewards
    .filter((r) => milestones.includes(r.at_count))
    .sort((a, b) => a.at_count - b.at_count)
    .map((r) => ({
      atCount: r.at_count,
      kind: r.kind,
      text: rewardText(track, r.kind),
      givenAt: r.given_at,
      givenBy: r.given_by,
    }));

  return {
    approved,
    pending,
    declined,
    goal: track.goal,
    nextMilestone,
    starsToNext: nextMilestone === null ? 0 : nextMilestone - approved,
    milestonesReached,
    rewardsOwed,
    rewardsGiven,
    complete: approved >= track.goal,
  };
}

/**
 * The highest milestone crossed when the approved count goes from `prevApproved` to `newApproved`
 * (for celebrations), or null if none. Counts above the goal are treated as the goal.
 */
export function justReachedMilestone(
  prevApproved: number,
  newApproved: number,
  track: Pick<StarTrackRow, "goal" | "milestone_every">,
): number | null {
  const prev = Math.min(track.goal, Math.max(0, prevApproved));
  const next = Math.min(track.goal, Math.max(0, newApproved));
  if (next <= prev) return null;
  const crossed = milestonesOf(track).filter((m) => m > prev && m <= next);
  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}

/** The reward text promised at a milestone: the big one at the goal, otherwise the small one. */
export function rewardTextAt(
  track: Pick<StarTrackRow, "goal" | "small_reward" | "big_reward">,
  atCount: number,
): string {
  return atCount >= track.goal ? track.big_reward : track.small_reward;
}

/** Total of the amounts of the approved stars (what milestones and rewards are checked against). */
export function approvedTotal(stars: readonly Pick<StarRow, "status" | "amount">[]): number {
  return stars.reduce((sum, s) => (s.status === "approved" ? sum + s.amount : sum), 0);
}

/** "⭐⭐" for a task worth 2 stars. Clamped to 1..10. */
export function starIcons(amount: number): string {
  const n = Math.min(10, Math.max(1, Math.floor(amount)));
  return "⭐".repeat(n);
}

/**
 * The owed reward to celebrate right now: the highest milestone reached within the last
 * `window` approved stars (use the largest task size, so a multi-star task that jumps over a
 * milestone still celebrates). With window 1 this is "approved is exactly on a milestone".
 */
export function celebratingReward(progress: Pick<TrackProgress, "approved" | "rewardsOwed">, window = 1): OwedReward | null {
  const w = Math.max(1, Math.floor(window));
  const recent = progress.rewardsOwed.filter((r) => r.atCount <= progress.approved && r.atCount > progress.approved - w);
  return recent.length > 0 ? recent[recent.length - 1] : null;
}

/** True when the task applies to the child: it is for all children or for this child. */
export function taskAppliesTo(task: Pick<StarTaskRow, "member_id">, childId: string): boolean {
  return task.member_id === null || task.member_id === childId;
}

/** The tasks a child can use (their own and the all-children ones), keeping the given order. */
export function tasksForChild<T extends Pick<StarTaskRow, "member_id">>(tasks: readonly T[], childId: string): T[] {
  return tasks.filter((task) => taskAppliesTo(task, childId));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PostgREST `or` filter for the tasks that apply to a child: `.or(taskScopeFilter(childId))`.
 * The id is validated as a uuid first, because it ends up inside the filter text.
 */
export function taskScopeFilter(childId: string): string {
  if (!UUID.test(childId)) throw new Error("Invalid child id");
  return `member_id.is.null,member_id.eq.${childId}`;
}
