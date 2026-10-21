import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getEvents } from "../calendar/google";
import { addDays, dateInTimeZone, dayKey, formatDayHeading, formatTime, mondayOf, startOfDay } from "../dates";
import type { Member } from "../members";
import { REWARD_COLUMNS, STAR_COLUMNS, TRACK_COLUMNS } from "../star-data";
import { trackProgress, type RewardRow, type StarRow, type StarTrackRow } from "../stars";
import { validateRange } from "./range";
import { NEXT_SEARCH_DAYS, findNextOccurrence, type SchoolEventInput } from "./next-occurrence";
import { fetchHoursOverrides, fetchTimetable } from "../timetable";
import {
  NO_ACCESS_NOTE,
  PLAN_KIND_NAMES,
  filterSchoolDaysBySubject,
  normalizeKind,
  resolveTargets,
  shapePlanItems,
  shapeSchoolDays,
  type PlanItemInput,
} from "./shape";

// Every tool runs with the signed-in user's Supabase client: RLS decides what it can read.
// Never pass the admin client in here. Everyone in the family may ask about anyone in the family (RLS lets every
// member read the school, star and routine data of the others); parent-only rows stay invisible to children.

/** `members` is the family list, read with the same user-scoped client. */
/** `now` is the current instant (defaults to the real clock; tests pass a fixed one). */
export type ToolContext = { supabase: SupabaseClient; me: Member; members: Member[]; now?: Date };

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
const timetableInput = z.object({
  from: dayString,
  to: dayString,
  subject: z.string().max(60).nullable(),
  member_name: nullableName,
});

const findNextInput = z.object({ subject: z.string().min(1).max(60), member_name: nullableName });

const memberProperty = {
  anyOf: [{ type: "string" }, { type: "null" }],
  description:
    'Who it is about: the first name (or id) of any family member, "children" for all the children, "everyone" for the whole family, or null for the person asking.',
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
    name: "get_timetable",
    description:
      "School hours and lessons (timetable) of one child, of all children or of anyone, for a day range of at most 31 days (ranges longer than a week are fine). Use it for questions about a given day or period, such as which children have a subject tomorrow. For \"next\" questions use find_next instead. Pass a subject to get only the lessons of that subject: common names and abbreviations are understood (gymnastikk finds Kroppsøving, matte finds Matematikk). Each lesson has past true when it is already over, and each day says when it is (i dag, i morgen, på torsdag).",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "First day, YYYY-MM-DD." },
        to: { type: "string", description: "Last day (inclusive), YYYY-MM-DD." },
        subject: { anyOf: [{ type: "string" }, { type: "null" }], description: "Only lessons with this text in the subject name, or null for all lessons." },
        member_name: memberProperty,
      },
      required: ["from", "to", "subject", "member_name"],
      additionalProperties: false,
    },
  },
  {
    name: "find_next",
    description:
      "Finds the NEXT upcoming occurrence of a subject or keyword (gymnastikk, matte, svømming, foreldremøte...) for one person, for all children or for everyone, searching forward from the current moment for 21 days: school lessons (timetable), ukeplan events and calendar events. Anything that already started or ended today is skipped. Use it for any question like \"when is the next...\" or \"who has ... next\". It returns per person the first upcoming occurrence with date, weekday, time and a ready-made relative day (when), or next null with the days searched.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Subject or keyword to look for, as the person said it, for example gymnastikk." },
        member_name: memberProperty,
      },
      required: ["subject", "member_name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_calendar",
    description: "Calendar events of any family member (or all children, or everyone) for a day range of at most 31 days. Times are Europe/Copenhagen.",
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
    description: "Star status of any family member (or all children): active track, approved and pending stars, goal, next milestone and reward.",
    input_schema: {
      type: "object",
      properties: { member_name: memberProperty },
      required: ["member_name"],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((tool) => tool.name);

type Targets = { members: Member[]; group: boolean };

function targets(ctx: ToolContext, name: string | null): Targets | { error: string } {
  const found = resolveTargets(ctx.members, ctx.me, name);
  if ("error" in found) return found;
  if (found.members.length === 0) return { error: "No family member matches." };
  return found;
}

/** One result for a single member, or `{ results }` listing every member for a group. */
function wrapResults(t: Targets, results: Record<string, unknown>[]): unknown {
  return t.group || results.length > 1 ? { results } : results[0];
}

async function planItemsFor(
  ctx: ToolContext,
  member: Member,
  range: Extract<ReturnType<typeof validateRange>, { ok: true }>,
  filter: { kind: (typeof PLAN_KIND_NAMES)[number] | null; timetableOnly: boolean },
): Promise<Record<string, unknown>> {
  // Whole-week items are dated on the Monday of their week, so the query starts at the Monday of `from` and
  // day items before `from` are dropped again.
  // Children only get audience child/both (RLS); a parent asking gets everything. Always filtered to one member
  // explicitly, because RLS lets everyone read the whole family.
  let items: ReturnType<typeof shapePlanItems> = { items: [] };
  if (!filter.timetableOnly) {
    let query = ctx.supabase
      .from("plan_items")
      .select("date, kind, subject, text, done, sort, audience, whole_week, starts_at, ends_at, documents!inner(status)")
      .eq("member_id", member.id)
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
    fetchTimetable(ctx.supabase, member.id),
    fetchHoursOverrides(ctx.supabase, member.id, range.fromKey, range.toKey),
  ]);
  const schoolDays = shapeSchoolDays(range.fromKey, range.toKey, timetable, overrides);
  const empty = items.items.length === 0 && schoolDays.length === 0;
  return {
    member: member.name,
    items: items.items,
    school_days: schoolDays,
    ...(empty ? { note: NO_ACCESS_NOTE } : {}),
    ...(items.truncated ? { truncated: true } : {}),
  };
}

async function getPlanItems(ctx: ToolContext, raw: unknown): Promise<unknown> {
  const input = planInput.parse(raw);
  const range = validateRange(input.from, input.to);
  if (!range.ok) return { error: range.error };
  const target = targets(ctx, input.member_name);
  if ("error" in target) return { error: target.error };
  const filter = normalizeKind(input.kind);
  if ("error" in filter) return { error: filter.error };

  const results = [];
  for (const member of target.members) results.push(await planItemsFor(ctx, member, range, filter));
  const wrapped = wrapResults(target, results);
  return range.clamped ? { ...(wrapped as object), range_limited_to: range.toKey } : wrapped;
}

async function getTimetable(ctx: ToolContext, raw: unknown): Promise<unknown> {
  const input = timetableInput.parse(raw);
  const range = validateRange(input.from, input.to);
  if (!range.ok) return { error: range.error };
  const target = targets(ctx, input.member_name);
  if ("error" in target) return { error: target.error };

  const results: Record<string, unknown>[] = [];
  for (const member of target.members) {
    const [timetable, overrides] = await Promise.all([
      fetchTimetable(ctx.supabase, member.id),
      fetchHoursOverrides(ctx.supabase, member.id, range.fromKey, range.toKey),
    ]);
    const allDays = shapeSchoolDays(range.fromKey, range.toKey, timetable, overrides, ctx.now ?? new Date());
    const days = filterSchoolDaysBySubject(allDays, input.subject);
    const hasSubject = input.subject !== null && input.subject.trim() !== "";
    results.push({
      member: member.name,
      ...(hasSubject ? { subject: input.subject, has_subject: days.length > 0 } : {}),
      school_days: days,
      ...(allDays.length === 0 ? { note: "no timetable or school day found" } : {}),
    });
  }
  const wrapped = wrapResults(target, results);
  return range.clamped ? { ...(wrapped as object), range_limited_to: range.toKey } : wrapped;
}

async function findNext(ctx: ToolContext, raw: unknown): Promise<unknown> {
  const input = findNextInput.parse(raw);
  const target = targets(ctx, input.member_name);
  if ("error" in target) return { error: target.error };

  const now = ctx.now ?? new Date();
  const today = dateInTimeZone(now);
  const fromKey = dayKey(today);
  const toKey = dayKey(addDays(today, NEXT_SEARCH_DAYS));

  const withCalendar = target.members.filter((m) => m.calendar_id);
  const calendar =
    withCalendar.length === 0
      ? { events: [], failedMemberIds: [] as string[] }
      : await getEvents(
          withCalendar.map((m) => ({ memberId: m.id, calendarId: m.calendar_id })),
          startOfDay(today),
          startOfDay(addDays(today, NEXT_SEARCH_DAYS + 1)),
        );

  const results: Record<string, unknown>[] = [];
  for (const member of target.members) {
    const [timetable, overrides, events] = await Promise.all([
      fetchTimetable(ctx.supabase, member.id),
      fetchHoursOverrides(ctx.supabase, member.id, fromKey, toKey),
      ctx.supabase
        .from("plan_items")
        .select("date, subject, text, starts_at, ends_at, whole_week, documents!inner(status)")
        .eq("member_id", member.id)
        .eq("documents.status", "published")
        .eq("kind", "event")
        .gte("date", fromKey)
        .lte("date", toKey)
        .order("date")
        .limit(201),
    ]);
    if (events.error) throw new Error("Could not read plan items");
    const found = findNextOccurrence({
      now,
      query: input.subject,
      timetable,
      overrides,
      schoolEvents: (events.data ?? []) as unknown as SchoolEventInput[],
      calendarEvents: calendar.events.filter((e) => e.memberId === member.id),
    });
    const failed = calendar.failedMemberIds.includes(member.id);
    results.push({
      member: member.name,
      subject: input.subject,
      ...found,
      ...(failed ? { note: "The calendar could not be read right now, so calendar events are missing." } : {}),
    });
  }
  return { now_is: `${fromKey} ${formatTime(now)}`, ...(wrapResults(target, results) as object) };
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
  const target = targets(ctx, input.member_name);
  if ("error" in target) return { error: target.error };

  // Any family member may ask about any other member's calendar: calendar ids come from the members table (readable by the family).
  const withCalendar = target.members.filter((m) => m.calendar_id);
  const result =
    withCalendar.length === 0
      ? { events: [], failedMemberIds: [] as string[] }
      : await getEvents(
          withCalendar.map((m) => ({ memberId: m.id, calendarId: m.calendar_id })),
          startOfDay(range.from),
          startOfDay(addDays(range.to, 1)),
        );
  const results = target.members.map((member): Record<string, unknown> => {
    if (!member.calendar_id) return { member: member.name, events: [], note: "no calendar connected" };
    if (result.failedMemberIds.includes(member.id)) return { member: member.name, error: "The calendar could not be read right now." };
    const events = result.events.filter((e) => e.memberId === member.id).slice(0, 100).map(formatEvent);
    return { member: member.name, events, ...(events.length === 0 ? { note: "no events found" } : {}) };
  });
  if (target.members.length === 1 && "error" in results[0]) return { error: results[0].error };
  const wrapped = wrapResults(target, results);
  return range.clamped ? { ...(wrapped as object), range_limited_to: range.toKey } : wrapped;
}

async function starsFor(ctx: ToolContext, member: Member): Promise<Record<string, unknown>> {
  const { data: trackData, error } = await ctx.supabase
    .from("star_tracks")
    .select(TRACK_COLUMNS)
    .eq("member_id", member.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("Could not read the star track");
  if (!trackData) return { member: member.name, tracks: [], note: "no active star track" };
  const track = trackData as StarTrackRow;

  const [stars, rewards] = await Promise.all([
    ctx.supabase.from("stars").select(STAR_COLUMNS).eq("track_id", track.id).eq("member_id", member.id),
    ctx.supabase.from("rewards").select(REWARD_COLUMNS).eq("track_id", track.id),
  ]);
  if (stars.error || rewards.error) throw new Error("Could not read the stars");
  const progress = trackProgress(track, (stars.data ?? []) as StarRow[], (rewards.data ?? []) as RewardRow[]);
  const nextReward =
    progress.nextMilestone === null ? null : progress.nextMilestone >= track.goal ? track.big_reward : track.small_reward;
  return {
    member: member.name,
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

async function getStars(ctx: ToolContext, raw: unknown): Promise<unknown> {
  const input = starsInput.parse(raw);
  const target = targets(ctx, input.member_name);
  if ("error" in target) return { error: target.error };
  const results = [];
  for (const member of target.members) results.push(await starsFor(ctx, member));
  return wrapResults(target, results);
}

export type ToolOutcome = { content: string; isError: boolean };

/** Runs one tool. Input is validated with zod; failures come back as an error result for Claude, never thrown. */
export async function runTool(ctx: ToolContext, name: string, input: unknown): Promise<ToolOutcome> {
  try {
    let result: unknown;
    if (name === "get_plan_items") result = await getPlanItems(ctx, input);
    else if (name === "get_timetable") result = await getTimetable(ctx, input);
    else if (name === "find_next") result = await findNext(ctx, input);
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
