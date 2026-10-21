// Result shaping and member lookup for the assistant's tools. Pure: no server access.

import { addDays, dayKey, parseDayKey } from "../dates";
import type { PlanAudience, PlanItemKind } from "../plan";
import { formatSchoolHours, hoursForDate, periodsForDate, type SchoolHours, type Timetable } from "../plan-view";
import { weekdayName } from "./range";

export const MAX_PLAN_ITEMS = 200;
export const NO_ACCESS_NOTE = "no access or nothing found";

export type PlanItemInput = {
  date: string;
  kind: PlanItemKind;
  subject: string | null;
  text: string;
  done: boolean;
  sort?: number;
  audience?: PlanAudience;
  whole_week?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type PlanItemResult = {
  date: string;
  weekday: string;
  kind: PlanItemKind;
  subject: string | null;
  text: string;
  done: boolean;
  audience: PlanAudience;
  /** True for week-level items: `date` is then the Monday of the week they belong to. */
  whole_week: boolean;
  /** Events only: "08:30–09:15" when the plan gives times. */
  time: string | null;
};

/** The kinds the tool offers. Older names are still understood: bring/note are messages, lesson means the timetable. */
export const PLAN_KIND_NAMES = ["homework", "event", "message"] as const;
export type PlanKindName = (typeof PLAN_KIND_NAMES)[number];

export type KindFilter = { kind: PlanKindName | null; timetableOnly: boolean } | { error: string };

export function normalizeKind(raw: string | null): KindFilter {
  if (raw === null || raw.trim() === "") return { kind: null, timetableOnly: false };
  const name = raw.trim().toLowerCase();
  if ((PLAN_KIND_NAMES as readonly string[]).includes(name)) return { kind: name as PlanKindName, timetableOnly: false };
  if (name === "bring" || name === "note" || name === "notes") return { kind: "message", timetableOnly: false };
  if (name === "lesson" || name === "lessons" || name === "timetable") return { kind: null, timetableOnly: true };
  return { error: "Unknown kind. Use homework, event or message." };
}

/** Sorts by date then sort order, caps the list and adds the weekday. */
export function shapePlanItems(rows: readonly PlanItemInput[]): { items: PlanItemResult[]; note?: string; truncated?: boolean } {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || (a.sort ?? 0) - (b.sort ?? 0));
  const items = sorted.slice(0, MAX_PLAN_ITEMS).map((r) => ({
    date: r.date,
    weekday: weekdayName(r.date),
    kind: r.kind,
    subject: r.subject,
    text: r.text,
    done: r.done,
    audience: r.audience ?? "both",
    whole_week: r.whole_week ?? false,
    time: r.kind === "event" ? formatSchoolHours(r.starts_at, r.ends_at) : null,
  }));
  return {
    items,
    ...(items.length === 0 ? { note: NO_ACCESS_NOTE } : {}),
    ...(sorted.length > MAX_PLAN_ITEMS ? { truncated: true } : {}),
  };
}

export type SchoolDayResult = {
  date: string;
  weekday: string;
  school_hours: string | null;
  periods: { period: number | null; time: string | null; subject: string }[];
};

/** School hours and periods for each day of an inclusive range that has any (from the timetable + date overrides). */
export function shapeSchoolDays(
  fromKey: string,
  toKey: string,
  timetable: Timetable,
  overrides?: ReadonlyMap<string, SchoolHours>,
): SchoolDayResult[] {
  const result: SchoolDayResult[] = [];
  for (let key = fromKey, guard = 0; key <= toKey && guard < 62; guard++) {
    const hours = hoursForDate(key, timetable, overrides);
    const periods = periodsForDate(key, timetable);
    if (hours || periods.length > 0) {
      result.push({
        date: key,
        weekday: weekdayName(key),
        school_hours: formatSchoolHours(hours?.starts_at, hours?.ends_at),
        periods: periods.map((p) => ({ period: p.period, time: p.time, subject: p.title })),
      });
    }
    key = dayKey(addDays(parseDayKey(key), 1));
  }
  return result;
}

export type NamedMember = { id: string; name: string; calendar_id?: string | null };

export type MemberLookup<M extends NamedMember> = { member: M } | { error: string };

/** Finds a member by name, case-insensitively: exact match first, then a unique prefix/substring match. */
export function resolveMember<M extends NamedMember>(members: readonly M[], name: string): MemberLookup<M> {
  const wanted = name.trim().toLocaleLowerCase("nb-NO");
  if (!wanted) return { error: "No member name given." };
  const exact = members.filter((m) => m.name.trim().toLocaleLowerCase("nb-NO") === wanted);
  if (exact.length === 1) return { member: exact[0] };
  const partial = members.filter((m) => m.name.toLocaleLowerCase("nb-NO").includes(wanted));
  if (exact.length === 0 && partial.length === 1) return { member: partial[0] };
  if (exact.length > 1 || partial.length > 1) return { error: "More than one family member matches that name." };
  return { error: "No family member with that name." };
}
