import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getEvents } from "../calendar/google";
import { addDays, dayKey, formatDayHeading, formatTime, mondayOf, startOfDay } from "../dates";
import { MEMBER_COLUMNS, type Member } from "../members";
import { REWARD_COLUMNS, STAR_COLUMNS, TRACK_COLUMNS } from "../star-data";
import { trackProgress, type RewardRow, type StarRow, type StarTrackRow } from "../stars";
import { validateRange } from "./range";
import { fetchHoursOverrides, fetchTimetable } from "../timetable";
import { NO_ACCESS_NOTE, PLAN_KIND_NAMES, normalizeKind, resolveMember, shapePlanItems, shapeSchoolDays, type PlanItemInput } from "./shape";

// Every tool runs with the signed-in user's Supabase client: RLS decides what it can read.
// Never pass the admin client in here.

export type ToolContext = { supabase: SupabaseClient; me: Member };

const nullableName = z.string().max(80).nullable();
const dayString = z.string().max(10);

const planInput = z.object({
  from: dayString,
  to: dayString,
  // Legacy names (bring, note, lesson) are accepted too: see normalizeKind.
  kind: z.string().max(20).nullable(),
  member_name: nullableName,
});
const calendarInput = z.object({ from: dayString, to: dayString, member_name: nullableName });
const starsInput = z.object({ member_name: nullableName });

const memberProperty = {
  anyOf: [{ type: "string" }, { type: "null" }],
  description: "First name of the family member, or null for the person asking.",
} as const;

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_plan_items",
    description:
      "School plan for a day range of at most 31 days: ukeplan items (homework, events, messages) plus the school hours and periods (timetable) of each school day. Homework dates are the day it is due. Items with whole_week true belong to the whole week: their date is the Monday of that week.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "First day, YYYY-MM-DD." },
        to: { type: "string", description: "Last day (inclusive), YYYY-MM-DD." },
        kind: { anyOf: [{ type: "string", enum: [...PLAN_KIND_NAMES] }, { type: "null" }], description: "Only this kind of item, or null for all." },
        member_name: memberProperty,
      },
      required: ["from", "to", "kind", "member_name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_calendar",
    description: "Calendar events for a day range of at most 31 days. Times are Europe/Copenhagen.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "First day, YYYY-MM-DD." },
        to: { type: "string", description: "Last day (inclusive), YYYY-MM-DD." },
        member_name: memberProperty,
      },
      required: ["from", "to", "member_name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_stars",
    description: "Star track progress: approved and pending stars, next milestone and rewards.",
    input_schema: {
      type: "object",
      properties: { member_name: memberProperty },
      required: ["member_name"],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((tool) => tool.name);

async function readMembers(ctx: ToolContext): Promise<Member[]> {
  const { data, error } = await ctx.supabase.from("members").select(MEMBER_COLUMNS);
  if (error) throw new Error("Could not read members");
  return (data ?? []) as Member[];
}

async function targetMember(ctx: ToolContext, name: string | null): Promise<{ member: Member } | { error: string }> {
  if (name === null || name.trim() === "") return { member: ctx.me };
  return resolveMember(await readMembers(ctx), name);
}

async function getPlanItems(ctx: ToolContext, raw: unknown): Promise<unknown> {
  const input = planInput.parse(raw);
  const range = validateRange(input.from, input.to);
  if (!range.ok) return { error: range.error };
  const target = await targetMember(ctx, input.member_name);
  if ("error" in target) return { error: target.error };

  const filter = normalizeKind(input.kind);
  if ("error" in filter) return { error: filter.error };

  // Whole-week items are dated on the Monday of their week, so the query starts at the Monday of `from` and
  // day items before `from` are dropped again.
  // Children only get audience child/both (RLS); a parent asking about a child gets everything.
  let items: ReturnType<typeof shapePlanItems> = { items: [] };
  if (!filter.timetableOnly) {
    let query = ctx.supabase
      .from("plan_items")
      .select("date, kind, subject, text, done, sort, audience, whole_week, starts_at, ends_at, documents!inner(status)")
      .eq("member_id", target.member.id)
      .eq("documents.status", "published")
      .neq("kind", "lesson")
      .gte("date", dayKey(mondayOf(range.from)))
      .lte("date", range.toKey);
    if (filter.kind) query = query.eq("kind", filter.kind);
    const { data, error } = await query.order("date").order("sort").limit(201);
    if (error) throw new Error("Could not read plan items");
    const rows = ((data ?? []) as unknown as PlanItemInput[]).filter((r) => r.whole_week || r.date >= range.fromKey);
    items = shapePlanItems(rows);
  }

  const [timetable, overrides] = await Promise.all([
    fetchTimetable(ctx.supabase, target.member.id),
    fetchHoursOverrides(ctx.supabase, target.member.id, range.fromKey, range.toKey),
  ]);
  const schoolDays = shapeSchoolDays(range.fromKey, range.toKey, timetable, overrides);
  const empty = items.items.length === 0 && schoolDays.length === 0;
  return {
    member: target.member.name,
    items: items.items,
    school_days: schoolDays,
    ...(empty ? { note: NO_ACCESS_NOTE } : {}),
    ...(items.truncated ? { truncated: true } : {}),
    ...(range.clamped ? { range_limited_to: range.toKey } : {}),
  };
}

function formatEvent(event: { title: string; start: string; end: string; allDay: boolean; location?: string }) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const dayOf = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(d).split("-").map(Number);
    return { year: parts[0], month: parts[1], day: parts[2] };
  };
  return {
    title: event.title,
    day: formatDayHeading(dayOf(start)),
    start: event.allDay ? null : formatTime(start),
    end: event.allDay ? null : formatTime(end),
    allDay: event.allDay,
    location: event.location ?? null,
  };
}

async function getCalendar(ctx: ToolContext, raw: unknown): Promise<unknown> {
  const input = calendarInput.parse(raw);
  const range = validateRange(input.from, input.to);
  if (!range.ok) return { error: range.error };
  const target = await targetMember(ctx, input.member_name);
  if ("error" in target) return { error: target.error };
  if (!target.member.calendar_id) return { member: target.member.name, events: [], note: "no calendar connected" };

  const result = await getEvents(
    [{ memberId: target.member.id, calendarId: target.member.calendar_id }],
    startOfDay(range.from),
    startOfDay(addDays(range.to, 1)),
  );
  if (result.failedMemberIds.length > 0) return { error: "The calendar could not be read right now." };
  const events = result.events.slice(0, 100).map(formatEvent);
  return {
    member: target.member.name,
    events,
    ...(events.length === 0 ? { note: "no events found" } : {}),
    ...(range.clamped ? { range_limited_to: range.toKey } : {}),
  };
}

async function getStars(ctx: ToolContext, raw: unknown): Promise<unknown> {
  const input = starsInput.parse(raw);
  const target = await targetMember(ctx, input.member_name);
  if ("error" in target) return { error: target.error };

  const { data: trackData, error } = await ctx.supabase
    .from("star_tracks")
    .select(TRACK_COLUMNS)
    .eq("member_id", target.member.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("Could not read the star track");
  if (!trackData) return { member: target.member.name, tracks: [], note: NO_ACCESS_NOTE };
  const track = trackData as StarTrackRow;

  const [stars, rewards] = await Promise.all([
    ctx.supabase.from("stars").select(STAR_COLUMNS).eq("track_id", track.id),
    ctx.supabase.from("rewards").select(REWARD_COLUMNS).eq("track_id", track.id),
  ]);
  if (stars.error || rewards.error) throw new Error("Could not read the stars");
  const progress = trackProgress(track, (stars.data ?? []) as StarRow[], (rewards.data ?? []) as RewardRow[]);
  const nextReward =
    progress.nextMilestone === null ? null : progress.nextMilestone >= track.goal ? track.big_reward : track.small_reward;
  return {
    member: target.member.name,
    tracks: [
      {
        track: track.name,
        goal: progress.goal,
        approved: progress.approved,
        pending: progress.pending,
        nextMilestone: progress.nextMilestone,
        starsToNext: progress.starsToNext,
        nextReward,
        rewardsOwed: progress.rewardsOwed.map((r) => ({ atCount: r.atCount, reward: r.text })),
      },
    ],
  };
}

export type ToolOutcome = { content: string; isError: boolean };

/** Runs one tool. Input is validated with zod; failures come back as an error result for Claude, never thrown. */
export async function runTool(ctx: ToolContext, name: string, input: unknown): Promise<ToolOutcome> {
  try {
    let result: unknown;
    if (name === "get_plan_items") result = await getPlanItems(ctx, input);
    else if (name === "get_calendar") result = await getCalendar(ctx, input);
    else if (name === "get_stars") result = await getStars(ctx, input);
    else return { content: JSON.stringify({ error: "Unknown tool." }), isError: true };
    const isError = typeof result === "object" && result !== null && "error" in result;
    return { content: JSON.stringify(result), isError };
  } catch (error) {
    // Log the tool name and error class only: messages could contain personal data.
    console.error(`Assistant tool ${name} failed:`, error instanceof z.ZodError ? "invalid input" : error instanceof Error ? error.name : "unknown");
    return { content: JSON.stringify({ error: "The tool failed." }), isError: true };
  }
}
