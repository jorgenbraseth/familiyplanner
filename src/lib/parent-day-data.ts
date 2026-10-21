import "server-only";
import { buildTracksFromEntries, collect, type DayCalendarEvent, type DayMember, type DaySchoolHours, type ParentTracks, type Raw } from "./parent-day";
import { getEvents } from "./calendar/google";
import { addDays, dateInTimeZone, dayKey, startOfDay, type CalendarDate } from "./dates";
import type { Member } from "./members";
import { hoursForDate } from "./plan-view";
import { loadSchoolEvents } from "./school";
import { createClient } from "./supabase/server";
import { fetchHoursOverrides, fetchTimetable } from "./timetable";

export type ParentDay = {
  /** The shown day as `YYYY-MM-DD` (Copenhagen). */
  dateKey: string;
  tracks: ParentTracks;
  failedNames: string[];
  /** Serialisable inputs for re-laying out the axis client-side for a subset of members. */
  members: DayMember[];
  entries: Raw[];
};

/**
 * The selected day's events of the parent and all children for the parents' "Dagen i dag": Google calendars, published
 * ukeplan events (every audience) and each child's school hours. A failing source only drops that part (its member
 * is named in `failedNames`). Uses the user-scoped client, so RLS decides what is readable. Logs no event content.
 */
export async function loadParentDay(
  parent: Member,
  children: Member[],
  /** The shown day (today when omitted). */
  date: CalendarDate = dateInTimeZone(new Date()),
): Promise<ParentDay> {
  const key = dayKey(date);
  const dayStart = startOfDay(date);
  const dayEnd = startOfDay(addDays(date, 1));
  const members = [parent, ...children];
  const failed = new Set<string>();

  const calendars = getEvents(members.map((m) => ({ memberId: m.id, calendarIds: m.calendar_ids })), dayStart, dayEnd)
    .then((r) => {
      r.failedMemberIds.forEach((id) => failed.add(id));
      return r.events as DayCalendarEvent[];
    })
    .catch(() => {
      console.error("Parent day: calendars failed");
      members.forEach((m) => failed.add(m.id));
      return [] as DayCalendarEvent[];
    });

  const schoolEvents = loadSchoolEvents(children.map((c) => c.id), key, key)
    .then((rows) =>
      rows.map((i) => ({ memberId: i.member_id, subject: i.subject, text: i.text, startsAt: i.starts_at, endsAt: i.ends_at })),
    )
    .catch(() => {
      console.error("Parent day: school events failed");
      children.forEach((c) => failed.add(c.id));
      return [];
    });

  const hours = Promise.all(
    children.map(async (child): Promise<DaySchoolHours | null> => {
      try {
        const supabase = await createClient();
        const [timetable, overrides] = await Promise.all([
          fetchTimetable(supabase, child.id),
          fetchHoursOverrides(supabase, child.id, key, key),
        ]);
        const h = hoursForDate(key, timetable, overrides);
        return h ? { memberId: child.id, startsAt: h.starts_at, endsAt: h.ends_at } : null;
      } catch {
        console.error("Parent day: school hours failed");
        failed.add(child.id);
        return null;
      }
    }),
  );

  const [calendarEvents, school, schoolHours] = await Promise.all([calendars, schoolEvents, hours]);
  const entries = collect({
    members,
    dayStart,
    dayEnd,
    calendarEvents,
    schoolEvents: school,
    schoolHours: schoolHours.filter((h): h is DaySchoolHours => h !== null),
  });
  const dayMembers = members.map((m) => ({ id: m.id, name: m.name, colour: m.colour }));
  return {
    dateKey: key,
    tracks: buildTracksFromEntries(dayMembers, entries),
    failedNames: members.filter((m) => failed.has(m.id)).map((m) => m.name),
    members: dayMembers,
    entries,
  };
}
