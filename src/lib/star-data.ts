import "server-only";
import type { Member } from "./members";
import { createClient } from "./supabase/server";
import { trackProgress, visibleToChild, type RewardRow, type StarRow, type StarTaskRow, type StarTrackRow, type TrackProgress } from "./stars";

export const TRACK_COLUMNS =
  "id, member_id, name, goal, milestone_every, small_reward, big_reward, preset_reasons, status, created_at, completed_at";
export const STAR_COLUMNS =
  "id, track_id, member_id, reason, photo_path, status, requested_by, decided_by, decided_at, note, amount, task_id, created_at";
export const TASK_COLUMNS = "id, track_id, name, stars, sort, created_at";
export const REWARD_COLUMNS = "id, track_id, at_count, kind, given_at, given_by";

export type ChildStars = {
  track: StarTrackRow;
  /** Newest first. */
  stars: StarRow[];
  rewards: RewardRow[];
  /** The track's tasks in the parent's order. */
  tasks: StarTaskRow[];
  progress: TrackProgress;
};

/** The child's active track with its stars (declined ones left out) and rewards, or null. Only reads this child's rows. */
export async function loadChildStars(memberId: string): Promise<ChildStars | null> {
  const supabase = await createClient();
  const { data: trackData, error } = await supabase
    .from("star_tracks")
    .select(TRACK_COLUMNS)
    .eq("member_id", memberId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("Could not read the star track");
  if (!trackData) return null;
  const track = trackData as StarTrackRow;

  const [starsResult, rewardsResult, tasksResult] = await Promise.all([
    supabase.from("stars").select(STAR_COLUMNS).eq("track_id", track.id).order("created_at", { ascending: false }),
    supabase.from("rewards").select(REWARD_COLUMNS).eq("track_id", track.id),
    supabase.from("star_tasks").select(TASK_COLUMNS).eq("track_id", track.id).order("sort").order("created_at"),
  ]);
  if (starsResult.error) throw new Error("Could not read the stars");
  if (tasksResult.error) throw new Error("Could not read the star tasks");
  if (rewardsResult.error) throw new Error("Could not read the rewards");
  // Child-facing: declined requests are not shown (history, counts, progress).
  const stars = visibleToChild((starsResult.data ?? []) as StarRow[]);
  const rewards = (rewardsResult.data ?? []) as RewardRow[];
  return { track, stars, rewards, tasks: (tasksResult.data ?? []) as StarTaskRow[], progress: trackProgress(track, stars, rewards) };
}

export type ChildWithStars = {
  child: Member;
  active: ChildStars | null;
  completed: StarTrackRow[];
};

/** Every child with their active track, and finished tracks. For parents (RLS lets parents read it all). */
export async function loadAllChildStars(children: Member[]): Promise<ChildWithStars[]> {
  if (children.length === 0) return [];
  const supabase = await createClient();
  const childIds = children.map((c) => c.id);
  const { data: trackData, error } = await supabase
    .from("star_tracks")
    .select(TRACK_COLUMNS)
    .in("member_id", childIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not read the star tracks");
  const tracks = (trackData ?? []) as StarTrackRow[];
  const activeIds = tracks.filter((tr) => tr.status === "active").map((tr) => tr.id);

  let stars: StarRow[] = [];
  let rewards: RewardRow[] = [];
  let tasks: StarTaskRow[] = [];
  if (activeIds.length > 0) {
    const [starsResult, rewardsResult, tasksResult] = await Promise.all([
      supabase.from("stars").select(STAR_COLUMNS).in("track_id", activeIds).order("created_at", { ascending: false }),
      supabase.from("rewards").select(REWARD_COLUMNS).in("track_id", activeIds),
      supabase.from("star_tasks").select(TASK_COLUMNS).in("track_id", activeIds).order("sort").order("created_at"),
    ]);
    if (starsResult.error) throw new Error("Could not read the stars");
    if (tasksResult.error) throw new Error("Could not read the star tasks");
    if (rewardsResult.error) throw new Error("Could not read the rewards");
    stars = (starsResult.data ?? []) as StarRow[];
    rewards = (rewardsResult.data ?? []) as RewardRow[];
    tasks = (tasksResult.data ?? []) as StarTaskRow[];
  }

  return children.map((child) => {
    const own = tracks.filter((tr) => tr.member_id === child.id);
    const track = own.find((tr) => tr.status === "active");
    return {
      child,
      active: track
        ? {
            track,
            stars: stars.filter((s) => s.track_id === track.id),
            rewards: rewards.filter((r) => r.track_id === track.id),
            tasks: tasks.filter((k) => k.track_id === track.id),
            progress: trackProgress(track, stars, rewards),
          }
        : null,
      completed: own.filter((tr) => tr.status === "completed"),
    };
  });
}

/** Number of star requests waiting for a parent. 0 on any failure (it is only a badge). */
export async function loadPendingCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("stars")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}
