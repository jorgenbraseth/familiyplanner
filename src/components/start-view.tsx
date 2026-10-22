import Link from "next/link";
import { MemberAvatar } from "@/components/member-avatar";
import { Notice } from "@/components/notice";
import { RoutineBar } from "@/components/routine-bar";
import { StartHomework } from "@/components/start-homework";
import { StartSchool } from "@/components/start-school";
import { StartStarSheet } from "@/components/start-star-sheet";
import { loadAvatarUrls } from "@/lib/avatar-urls";
import { dateInTimeZone, dayKey, formatDayHeading, daysBetween, mondayOf, parseDayParam } from "@/lib/dates";
import { loadWeek } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";
import type { Member } from "@/lib/members";
import { formatWeekday, todayView } from "@/lib/plan-view";
import { loadRoutineToday } from "@/lib/routine-data";
import { currentSlot } from "@/lib/routines";
import { loadSchoolWeek } from "@/lib/school";
import { loadChildStars } from "@/lib/star-data";
import { rewardTextAt } from "@/lib/stars";
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
  const nextReward =
    stars && stars.progress.nextMilestone !== null
      ? rewardTextAt(stars.track, stars.progress.nextMilestone) || t.stars.rewardFallback
      : null;
  const starPercent = stars && stars.progress.goal > 0 ? Math.min(100, Math.round((stars.progress.approved / stars.progress.goal) * 100)) : 0;

  return (
    <>
      <header className="flex items-center gap-4">
        {avatars[member.id] ? (
          <MemberAvatar colour={member.colour} url={avatars[member.id]} size={64} />
        ) : (
          <span
            aria-hidden
            className="flex size-16 shrink-0 items-center justify-center rounded-full font-display text-3xl font-bold leading-none text-white"
            style={{ backgroundColor: member.colour }}
          >
            {member.name.slice(0, 1).toLocaleUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="break-words text-4xl font-bold leading-tight">{member.name}</h1>
          <p className="text-base font-semibold capitalize text-muted">{formatDayHeading(today)}</p>
        </div>
      </header>
      {previewing && <Notice>{t.preview.readOnly}</Notice>}
      {member.calendar_ids.length === 0 && <Notice>{t.home.noCalendar}</Notice>}
      {failedNames.length > 0 && <Notice>{t.calendar.failed(failedNames.join(", "))}</Notice>}

      {/* Stars + routine, "Min dag" and Lekser sit side by side on wide screens (1 column on phones, 2 from lg, 3 from xl). */}
      <div className="grid gap-12 lg:grid-cols-2 lg:items-start xl:grid-cols-3">
        <div className="space-y-8">
          {stars ? (
            <section className="space-y-3 rounded-3xl bg-warning-soft p-5 text-on-warning-soft" aria-labelledby="stars-title">
              <h2 id="stars-title" className="sr-only">{t.stars.title}</h2>
              <Link
                href="/stars"
                aria-label={`${t.start.stars(stars.progress.approved, stars.progress.goal)}. ${t.start.starsLink}`}
                className="flex items-baseline gap-3"
              >
                <span aria-hidden className="font-display text-6xl font-bold leading-none">{stars.progress.approved} ★</span>
                <span aria-hidden className="text-base font-bold">{t.start.starsWord}</span>
              </Link>
              <p className="text-lg font-bold text-ink">
                {nextReward !== null
                  ? t.start.starsToward(stars.progress.approved, stars.progress.goal, nextReward)
                  : t.start.stars(stars.progress.approved, stars.progress.goal)}
              </p>
              <div
                role="progressbar"
                aria-label={t.start.stars(stars.progress.approved, stars.progress.goal)}
                aria-valuemin={0}
                aria-valuemax={stars.progress.goal}
                aria-valuenow={stars.progress.approved}
                className="h-3 w-full overflow-hidden rounded-full bg-surface/80"
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${starPercent}%` }} />
              </div>
              <div className="pt-2">
                <StartStarSheet tasks={stars.tasks} previewing={previewing} />
              </div>
            </section>
          ) : (
            <StartStarSheet tasks={[]} previewing={previewing} />
          )}
          <RoutineBar
            key={slot}
            slot={slot}
            upcoming={upcoming}
            items={slotData.items}
            initialChecked={slotData.checkedIds}
            hasStarTask={hasStarTask}
            readOnly={previewing}
            tint={member.colour}
          />
        </div>
        <StartSchool view={dayView} events={events} date={selected} today={today} />
        <StartHomework
          items={view.homeworkDue}
          weekItems={view.weekHomework.filter((i) => !i.done)}
          tomorrow={tomorrow}
          weekday={formatWeekday(view.nextSchoolDay).toLocaleLowerCase()}
          readOnly={previewing}
        />
      </div>
    </>
  );
}
