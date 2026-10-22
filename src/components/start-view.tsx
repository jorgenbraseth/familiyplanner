import Link from "next/link";
import { MemberAvatar } from "@/components/member-avatar";
import { Notice } from "@/components/notice";
import { PushCard } from "@/components/push-card";
import { RoutineBar } from "@/components/routine-bar";
import { StartHomework } from "@/components/start-homework";
import { StartSchool } from "@/components/start-school";
import { StartStarSheet } from "@/components/start-star-sheet";
import { loadAvatarUrls } from "@/lib/avatar-urls";
import { dateInTimeZone, dayKey, daysBetween, mondayOf, parseDayParam } from "@/lib/dates";
import { loadWeek } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";
import type { Member } from "@/lib/members";
import { formatWeekday, todayView } from "@/lib/plan-view";
import { loadRoutineToday } from "@/lib/routine-data";
import { currentSlot } from "@/lib/routines";
import { loadSchoolWeek } from "@/lib/school";
import { loadChildStars } from "@/lib/star-data";
import { isTomorrow, slotView } from "@/lib/start-view";

/** The children's start page (also shown when a parent previews a child). */
export async function StartView({
  member,
  previewing,
  dag,
}: {
  member: Member;
  previewing: boolean;
  /** The raw `?dag=` search param: the day "Min dag" shows (today when missing or invalid). */
  dag?: string | string[];
}) {
  const now = new Date();
  const today = dateInTimeZone(now);
  const selected = parseDayParam(dag, today);
  // Whole weeks between this week and the selected day's week (0 unless the day is in another week).
  const dayOffset = Math.round(daysBetween(mondayOf(today), mondayOf(selected)) / 7);
  const [school, routines, stars, week, selSchool, selWeek, avatars] = await Promise.all([
    loadSchoolWeek(member.id, 0, now),
    loadRoutineToday(member.id, now),
    loadChildStars(member.id),
    loadWeek([member], 0, now, { weekdayOnly: true, schoolEvents: { view: "kid", memberIds: [member.id] } }),
    dayOffset === 0 ? null : loadSchoolWeek(member.id, dayOffset, now),
    dayOffset === 0
      ? null
      : loadWeek([member], dayOffset, now, { weekdayOnly: true, schoolEvents: { view: "kid", memberIds: [member.id] } }),
    loadAvatarUrls([member]),
  ]);
  const view = todayView(school.items, school.today, school.timetable, school.hoursOverrides, "kid");
  const { slot, upcoming } = currentSlot(now, view.hours?.starts_at ?? null);
  const slotData = slotView(routines.items, routines.checks, slot);
  const hasStarTask = routines.starTaskIds[slot] !== null && stars !== null;

  // "Min dag" follows the selected day; routines, stars and homework stay on today.
  const daySchool = selSchool ?? school;
  const dayView = todayView(daySchool.items, selected, daySchool.timetable, daySchool.hoursOverrides, "kid");
  const selectedKey = dayKey(selected);
  const events = (selWeek ?? week).days.find((d) => d.key === selectedKey)?.events ?? [];
  const failedNames = [...new Set([...week.failedNames, ...(selWeek?.failedNames ?? [])])];
  const tomorrow = isTomorrow(school.today, view.nextSchoolDay);

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="flex min-w-0 items-center gap-3 text-4xl font-extrabold">
          {avatars[member.id] && <MemberAvatar colour={member.colour} url={avatars[member.id]} size={56} />}
          {member.name}
        </h1>
        {stars && (
          <Link
            href="/stars"
            aria-label={`${t.start.stars(stars.progress.approved, stars.progress.goal)}. ${t.start.starsLink}`}
            className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-chip px-4 text-lg font-extrabold text-chip-ink hover:bg-surface"
          >
            <span aria-hidden className="mr-2 text-accent">★</span>
            {t.start.stars(stars.progress.approved, stars.progress.goal)}
          </Link>
        )}
        <div className="md:ml-auto">
          <StartStarSheet tasks={stars?.tasks ?? []} previewing={previewing} />
        </div>
      </header>
      {previewing && <Notice>{t.preview.readOnly}</Notice>}
      {member.calendar_ids.length === 0 && <Notice>{t.home.noCalendar}</Notice>}
      {failedNames.length > 0 && <Notice>{t.calendar.failed(failedNames.join(", "))}</Notice>}

      <RoutineBar
        key={slot}
        slot={slot}
        upcoming={upcoming}
        items={slotData.items}
        initialChecked={slotData.checkedIds}
        hasStarTask={hasStarTask}
        readOnly={previewing}
      />

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <StartSchool view={dayView} events={events} date={selected} today={today} />
        <StartHomework
          items={view.homeworkDue}
          weekItems={view.weekHomework.filter((i) => !i.done)}
          tomorrow={tomorrow}
          weekday={formatWeekday(view.nextSchoolDay).toLocaleLowerCase()}
          readOnly={previewing}
        />
      </div>

      {!previewing && <PushCard />}
    </>
  );
}
