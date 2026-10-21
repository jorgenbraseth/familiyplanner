"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentMember, requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { notifyMembers, notifyParents } from "@/lib/push";
import { noteSchema, parseTrackForm, reasonSchema } from "@/lib/star-forms";
import { TRACK_COLUMNS } from "@/lib/star-data";
import { justReachedMilestone, milestonesOf, type StarTrackRow } from "@/lib/stars";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/view-as";

export type StarActionState = { ok: boolean; error?: string };

const idSchema = z.uuid();
const decisionSchema = z.enum(["approve", "decline"]);

type Client = Awaited<ReturnType<typeof createClient>>;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function refresh() {
  revalidatePath("/stars");
  revalidatePath("/");
}

function dbError(action: string, error: { code?: string; message?: string }): string {
  console.error(`${action} failed`, error.code);
  if (error.message === "star_daily_limit") return t.stars.errors.dailyLimit;
  if (error.code === "42501") return t.stars.errors.notAllowed;
  return t.stars.errors.failed;
}

async function approvedCount(supabase: Client, trackId: string): Promise<number> {
  const { count, error } = await supabase
    .from("stars")
    .select("id", { count: "exact", head: true })
    .eq("track_id", trackId)
    .eq("status", "approved");
  if (error) throw new Error("Could not count the approved stars");
  return count ?? 0;
}

async function readTrack(supabase: Client, trackId: string): Promise<StarTrackRow | null> {
  const { data } = await supabase.from("star_tracks").select(TRACK_COLUMNS).eq("id", trackId).maybeSingle();
  return (data as StarTrackRow | null) ?? null;
}

async function readChildName(supabase: Client, memberId: string): Promise<string> {
  const { data } = await supabase.from("members").select("name").eq("id", memberId).maybeSingle();
  return (data?.name as string | undefined) ?? "";
}

/** Notifications after a star was approved (by a decision or given directly), including a reached milestone. */
async function notifyApproved(
  track: StarTrackRow,
  reason: string,
  before: number,
  after: number,
  childName: string,
  title: string,
) {
  await notifyMembers([track.member_id], { title, body: reason, url: "/stars", tag: "star-decision" });
  const milestone = justReachedMilestone(before, after, track);
  if (milestone === null) return;
  const reward = (milestone >= track.goal ? track.big_reward : track.small_reward) || t.stars.rewardFallback;
  await Promise.all([
    notifyMembers([track.member_id], {
      title: t.stars.push.milestoneTitle(milestone),
      body: t.stars.push.milestoneBody(reward),
      url: "/stars",
      tag: "star-milestone",
    }),
    notifyParents({
      title: t.stars.push.milestoneParentTitle(childName, milestone),
      body: t.stars.push.milestoneParentBody(reward),
      url: "/stars",
      tag: "star-milestone",
    }),
  ]);
}

/** A child asks for a star on their active track (preset or free-text reason). */
export async function requestStar(_prev: StarActionState, formData: FormData): Promise<StarActionState> {
  const me = await getCurrentMember();
  const viewer = await getViewer();
  if (me.role !== "child" || viewer.previewing) return { ok: false, error: t.stars.errors.notAllowed };

  const reason = reasonSchema.safeParse(field(formData, "reason"));
  if (!reason.success) return { ok: false, error: t.stars.errors.reason };

  const supabase = await createClient();
  const { data: track, error: trackError } = await supabase
    .from("star_tracks")
    .select("id")
    .eq("member_id", me.id)
    .eq("status", "active")
    .maybeSingle();
  if (trackError) return { ok: false, error: dbError("requestStar", trackError) };
  if (!track) return { ok: false, error: t.stars.errors.noTrack };

  const { error } = await supabase.from("stars").insert({
    track_id: track.id,
    member_id: me.id,
    reason: reason.data,
    status: "pending",
    requested_by: me.id,
  });
  if (error) return { ok: false, error: dbError("requestStar", error) };

  await notifyParents({
    title: t.stars.push.requestTitle,
    body: t.stars.push.requestBody(me.name, reason.data),
    url: "/stars",
    tag: "star-request",
  });
  refresh();
  return { ok: true };
}

/** A parent approves or declines a pending request. */
export async function decideStar(formData: FormData): Promise<void> {
  await requireParent();
  const id = idSchema.safeParse(field(formData, "id"));
  const decision = decisionSchema.safeParse(field(formData, "decision"));
  const note = noteSchema.safeParse(field(formData, "note"));
  if (!id.success || !decision.success || !note.success) return;

  const supabase = await createClient();
  const { data: star } = await supabase.from("stars").select("id, track_id, reason, status").eq("id", id.data).maybeSingle();
  if (!star) return;
  const track = await readTrack(supabase, star.track_id as string);
  if (!track) return;

  const before = await approvedCount(supabase, track.id);
  const status = decision.data === "approve" ? "approved" : "declined";
  const { data, error } = await supabase
    .from("stars")
    .update({ status, note: note.data })
    .eq("id", id.data)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("decideStar failed", error.code);
    return;
  }
  const after = await approvedCount(supabase, track.id);

  if (status === "approved") {
    await notifyApproved(
      track,
      star.reason as string,
      before,
      after,
      await readChildName(supabase, track.member_id),
      t.stars.push.approvedTitle,
    );
  } else {
    await notifyMembers([track.member_id], {
      title: t.stars.push.declinedTitle,
      body: note.data ?? (star.reason as string),
      url: "/stars",
      tag: "star-decision",
    });
  }
  refresh();
}

/** A parent gives an approved star straight to a child's active track. */
export async function giveStar(_prev: StarActionState, formData: FormData): Promise<StarActionState> {
  const parent = await requireParent();
  const childId = idSchema.safeParse(field(formData, "child"));
  const reason = reasonSchema.safeParse(field(formData, "reason"));
  if (!childId.success) return { ok: false, error: t.stars.errors.failed };
  if (!reason.success) return { ok: false, error: t.stars.errors.reason };

  const supabase = await createClient();
  const { data: trackData, error: trackError } = await supabase
    .from("star_tracks")
    .select(TRACK_COLUMNS)
    .eq("member_id", childId.data)
    .eq("status", "active")
    .maybeSingle();
  if (trackError) return { ok: false, error: dbError("giveStar", trackError) };
  if (!trackData) return { ok: false, error: t.stars.errors.noTrack };
  const track = trackData as StarTrackRow;

  const before = await approvedCount(supabase, track.id);
  const { error } = await supabase.from("stars").insert({
    track_id: track.id,
    member_id: track.member_id,
    reason: reason.data,
    status: "approved",
    requested_by: parent.id,
  });
  if (error) return { ok: false, error: dbError("giveStar", error) };
  const after = await approvedCount(supabase, track.id);

  await notifyApproved(
    track,
    reason.data,
    before,
    after,
    await readChildName(supabase, track.member_id),
    t.stars.push.givenTitle,
  );
  refresh();
  return { ok: true };
}

/** A parent takes back a decision: the star is pending again. */
export async function undoDecision(formData: FormData): Promise<void> {
  await requireParent();
  const id = idSchema.safeParse(field(formData, "id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("stars").update({ status: "pending", note: null }).eq("id", id.data);
  if (error) {
    console.error("undoDecision failed", error.code);
    return;
  }
  refresh();
}

/** A parent marks the reward of a reached milestone as given. */
export async function markRewardGiven(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const trackId = idSchema.safeParse(field(formData, "track"));
  const atCount = z.coerce.number().int().positive().safeParse(field(formData, "at_count"));
  if (!trackId.success || !atCount.success) return;

  const supabase = await createClient();
  const track = await readTrack(supabase, trackId.data);
  if (!track || !milestonesOf(track).includes(atCount.data)) return;

  const { error } = await supabase.from("rewards").insert({
    track_id: track.id,
    at_count: atCount.data,
    kind: atCount.data === track.goal ? "big" : "small",
    given_by: parent.id,
  });
  // 23505: already marked as given (a double tap); fine.
  if (error && error.code !== "23505") {
    console.error("markRewardGiven failed", error.code);
    return;
  }
  refresh();
}

/** Creates the active track of a child, then goes back to /stars. */
export async function createTrack(_prev: StarActionState, formData: FormData): Promise<StarActionState> {
  await requireParent();
  const childId = idSchema.safeParse(field(formData, "child"));
  if (!childId.success) return { ok: false, error: t.stars.errors.failed };
  const parsed = parseTrackForm(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.stars.errors.failed };

  const supabase = await createClient();
  const { error } = await supabase.from("star_tracks").insert({ ...parsed.data, member_id: childId.data });
  if (error) {
    if (error.code === "23505") return { ok: false, error: t.stars.errors.alreadyActive };
    return { ok: false, error: dbError("createTrack", error) };
  }
  refresh();
  redirect("/stars");
}

/** Changes the settings of a track, then goes back to /stars. */
export async function updateTrack(_prev: StarActionState, formData: FormData): Promise<StarActionState> {
  await requireParent();
  const id = idSchema.safeParse(field(formData, "id"));
  if (!id.success) return { ok: false, error: t.stars.errors.failed };
  const parsed = parseTrackForm(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.stars.errors.failed };

  const supabase = await createClient();
  const { data, error } = await supabase.from("star_tracks").update(parsed.data).eq("id", id.data).select("id");
  if (error) return { ok: false, error: dbError("updateTrack", error) };
  if (!data || data.length === 0) return { ok: false, error: t.stars.errors.notAllowed };
  refresh();
  redirect("/stars");
}

/** Finishes the active track (kept as history); the parent can then start a new one. */
export async function completeTrack(formData: FormData): Promise<void> {
  await requireParent();
  const id = idSchema.safeParse(field(formData, "id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("star_tracks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("status", "active");
  if (error) {
    console.error("completeTrack failed", error.code);
    return;
  }
  refresh();
}
