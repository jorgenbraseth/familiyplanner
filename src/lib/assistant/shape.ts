// Result shaping and member lookup for the assistant's tools. Pure: no server access.

import { addDays, dateInTimeZone, dayKey, parseDayKey } from "../dates";
import type { PlanAudience, PlanItemKind } from "../plan";
import { formatSchoolHours, hoursForDate, minutesOf, periodsForDate, type SchoolHours, type Timetable } from "../plan-view";
import { minutesNowCopenhagen, relativeDayLabel, weekdayName } from "./range";
import { matchesSubject } from "./subject-match";

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
  /** Only when the current time is known: "i dag", "i morgen", "på torsdag"... */
  when?: string;
  /** Lessons in school order. `past` (only when the current time is known) is true for lessons already over (earlier days, or ended earlier today). */
  periods: { period: number | null; time: string | null; subject: string; past?: boolean }[];
};

/** School hours and periods for each day of an inclusive range that has any (from the timetable + date overrides). */
export function shapeSchoolDays(
  fromKey: string,
  toKey: string,
  timetable: Timetable,
  overrides?: ReadonlyMap<string, SchoolHours>,
  now?: Date,
): SchoolDayResult[] {
  const result: SchoolDayResult[] = [];
  const todayKey = now ? dayKey(dateInTimeZone(now)) : null;
  const nowMinutes = now ? minutesNowCopenhagen(now) : 0;
  for (let key = fromKey, guard = 0; key <= toKey && guard < 62; guard++) {
    const hours = hoursForDate(key, timetable, overrides);
    const periods = periodsForDate(key, timetable);
    if (hours || periods.length > 0) {
      result.push({
        date: key,
        weekday: weekdayName(key),
        school_hours: formatSchoolHours(hours?.starts_at, hours?.ends_at),
        ...(todayKey ? { when: relativeDayLabel(todayKey, key) } : {}),
        periods: periods.map((p) => ({
          period: p.period,
          time: p.time,
          subject: p.title,
          ...(todayKey
            ? {
                past:
                  key < todayKey ||
                  (key === todayKey && (minutesOf(p.endsAt ?? p.startsAt) ?? Number.POSITIVE_INFINITY) <= nowMinutes),
              }
            : {}),
        })),
      });
    }
    key = dayKey(addDays(parseDayKey(key), 1));
  }
  return result;
}

export type NamedMember = { id: string; name: string; role?: string; calendar_id?: string | null };

export type MemberLookup<M extends NamedMember> = { member: M } | { error: string };

const fold = (text: string) => text.trim().toLocaleLowerCase("nb-NO");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds a member by id or name, case-insensitively. Order: id, full name, first name, then a unique
 * substring match. Two matches at the same step are ambiguous (an error), never a guess.
 */
export function resolveMember<M extends NamedMember>(members: readonly M[], name: string): MemberLookup<M> {
  const wanted = fold(name);
  if (!wanted) return { error: "No member name given." };
  if (UUID.test(wanted)) {
    const byId = members.find((m) => m.id.toLowerCase() === wanted);
    return byId ? { member: byId } : { error: "No family member with that id." };
  }
  const steps: ((m: M) => boolean)[] = [
    (m) => fold(m.name) === wanted,
    (m) => fold(m.name).split(/\s+/)[0] === wanted,
    (m) => fold(m.name).includes(wanted),
  ];
  for (const matches of steps) {
    const found = members.filter(matches);
    if (found.length === 1) return { member: found[0] };
    if (found.length > 1) return { error: "More than one family member matches that name." };
  }
  return { error: "No family member with that name." };
}

const CHILDREN_WORDS = new Set(["children", "kids", "all children", "all kids", "barna", "alle barna", "barn", "ungene"]);
const FAMILY_WORDS = new Set(["everyone", "family", "all", "alle", "familien"]);

export type MembersLookup<M extends NamedMember> = { members: M[]; group: boolean } | { error: string };

/**
 * Who a tool call is about. null/empty means the person asking; "children" (or "kids", "barna") all children;
 * "everyone" (or "family") the whole family; anything else one member by id or name. `group` is true for
 * the two group words, so results are listed per member even when the family has a single child.
 */
export function resolveTargets<M extends NamedMember>(members: readonly M[], me: M, query: string | null): MembersLookup<M> {
  if (query === null || query.trim() === "") return { members: [me], group: false };
  const word = fold(query);
  if (CHILDREN_WORDS.has(word)) return { members: members.filter((m) => m.role === "child"), group: true };
  if (FAMILY_WORDS.has(word)) return { members: [...members], group: true };
  const found = resolveMember(members, query);
  return "error" in found ? found : { members: [found.member], group: false };
}

/** Keeps only the periods whose subject matches `subject` (aliases such as gym/kroppsøving, see matchesSubject) and drops days left without any. */
export function filterSchoolDaysBySubject(days: readonly SchoolDayResult[], subject: string | null): SchoolDayResult[] {
  if (subject === null || subject.trim() === "") return [...days];
  return days
    .map((d) => ({ ...d, periods: d.periods.filter((p) => matchesSubject(subject, p.subject)) }))
    .filter((d) => d.periods.length > 0);
}
