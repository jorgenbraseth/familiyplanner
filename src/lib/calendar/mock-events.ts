// Made-up Google Calendar events for the mock stack (src/lib/mock-mode.ts, docs/MOCK.md). Relative to the
// requested range, so pages always show current-looking weeks. Shaped like Google's events.list items.

import { addDays, dateInTimeZone, dayKey, startOfDay, type CalendarDate } from "../dates";

type Template = { weekday: number; from: string; to: string; title: string; location?: string };

// weekday: 1 = Monday ... 7 = Sunday. Keyed by the part of the calendar id before "@".
const TEMPLATES: Record<string, Template[]> = {
  emma: [
    { weekday: 2, from: "17:00", to: "18:30", title: "Fotballtrening", location: "Idrettshallen" },
    { weekday: 3, from: "16:00", to: "16:45", title: "Pianotime" },
    { weekday: 6, from: "11:00", to: "12:30", title: "Svømmekurs", location: "Svømmehallen" },
  ],
  jonas: [
    { weekday: 1, from: "16:30", to: "17:15", title: "Svømming", location: "Svømmehallen" },
    { weekday: 4, from: "17:00", to: "18:00", title: "Speider" },
    { weekday: 7, from: "10:00", to: "11:00", title: "Kidsklubben" },
  ],
  barna: [{ weekday: 6, from: "13:00", to: "16:00", title: "Besøk hos bestemor", location: "Bestemors hus" }],
  kari: [
    { weekday: 1, from: "07:30", to: "08:15", title: "Løpetur" },
    { weekday: 3, from: "19:00", to: "20:30", title: "Foreldremøte" },
  ],
  ola: [
    { weekday: 2, from: "20:00", to: "21:00", title: "Trening" },
    { weekday: 4, from: "18:00", to: "19:30", title: "Korøving" },
  ],
};
const FALLBACK: Template[] = [{ weekday: 3, from: "12:00", to: "13:00", title: "Lunsjmøte" }];

function weekdayOf({ year, month, day }: CalendarDate): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}

function at(date: CalendarDate, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(startOfDay(date).getTime() + (h * 60 + m) * 60_000).toISOString();
}

/** Google-shaped items for one calendar id between two instants. */
export function mockCalendarItems(calendarId: string, from: Date, to: Date): unknown[] {
  const owner = calendarId.split("@")[0].toLowerCase();
  const templates = TEMPLATES[owner] ?? FALLBACK;
  const items: unknown[] = [];
  const last = to.getTime();
  // Start a day early so an evening event of the day before the range is not missed.
  for (let date = addDays(dateInTimeZone(from), -1); startOfDay(date).getTime() <= last; date = addDays(date, 1)) {
    const key = dayKey(date);
    const weekday = weekdayOf(date);
    templates.forEach((tpl, i) => {
      if (tpl.weekday !== weekday) return;
      items.push({
        id: `mock-${owner}-${key}-${i}`,
        summary: tpl.title,
        location: tpl.location,
        start: { dateTime: at(date, tpl.from) },
        end: { dateTime: at(date, tpl.to) },
      });
    });
    if (date.day === 12 && owner === "barna") {
      items.push({ id: `mock-${owner}-${key}-allday`, summary: "Onkel Per har bursdag", start: { date: key }, end: { date: dayKey(addDays(date, 1)) } });
    }
  }
  return items;
}
