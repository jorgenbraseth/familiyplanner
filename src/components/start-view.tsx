import Link from "next/link";
import { Fragment } from "react";
import { DaySwitcher } from "@/components/day-switcher";
import { Linger } from "@/components/linger";
import { MemberAvatar } from "@/components/member-avatar";
import { NavPendingScope, PendingContent } from "@/components/nav-pending";
import { Notice } from "@/components/notice";
import { ScreenRefresh } from "@/components/screen-refresh";
import { RoutineBar } from "@/components/routine-bar";
import { StartHomework } from "@/components/start-homework";
import { StartSchool } from "@/components/start-school";
import { StartStarSheet } from "@/components/start-star-sheet";
import { loadAvatarUrls } from "@/lib/avatar-urls";
import { addDays, dateInTimeZone, dayKey, formatDayHeading, formatTime, daysBetween, mondayOf, parseDayParam } from "@/lib/dates";
import { dayHref } from "@/lib/day-nav";
import { loadWeek } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";
import type { Member } from "@/lib/members";
import { formatWeekday, todayView } from "@/lib/plan-view";
import { loadRoutineToday } from "@/lib/routine-data";
import { wallClockMinutes, type RoutineSlot } from "@/lib/routines";
import { loadSchoolWeek } from "@/lib/school";
import { loadChildStars } from "@/lib/star-data";
import { rewardTextAt } from "@/lib/stars";
import { overviewForDay } from "@/lib/overview-day";
import { slotView, starsLeftText } from "@/lib/start-view";
import { dayStillActive, inWindow, visibleRoutineSlots } from "@/lib/start-visibility";
import { getNow } from "@/lib/now";

/** The children's start page (also shown when a parent previews a child). */
export async function StartView({
  member,
  previewing,
  dag,
  screen = false,
}: {
  member: Member;
  previewing: boolean;
  /** The raw `?dag=` search param: the day "Min dag" shows (today when missing or invalid). */
  dag?: string | string[];
  /** On the family screen: the screen supplies the header, nothing links into the normal app, star requests name the child. */
  screen?: boolean;
}) {
  const now = await getNow();
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
  // Which lists show now: inside their window (the parents set it per child), with items, and not finished.
  const slots: RoutineSlot[] = ["morning", "evening"];
  const slotData = Object.fromEntries(slots.map((s) => [s, slotView(routines.items, routines.checks, s)])) as Record<RoutineSlot, ReturnType<typeof slotView>>;
  const visibleSlots = visibleRoutineSlots(now, routines.windows, {
    morning: slotData.morning.progress,
    evening: slotData.evening.progress,
  });
  // Lists in their window with items are rendered; a finished one is hidden by <Linger> after a few seconds
  // (so ticking the last item shows the "done" message first), and is not rendered at all on later loads.
  const nowMinutes = wallClockMinutes(now);
  const renderSlots = slots.filter((s) => inWindow(nowMinutes, routines.windows[s]) && slotData[s].progress.total > 0);

  // The whole overview follows the selected day: its school day, events, messages and the homework to do that day.
  // Today also has the routines, the carried-over homework and the hiding rules (see overviewForDay).
  const daySchool = selSchool ?? school;
  const dayView = todayView(daySchool.items, selected, daySchool.timetable, daySchool.hoursOverrides, "kid");
  const selectedKey = dayKey(selected);
  const events = (selWeek ?? week).days.find((d) => d.key === selectedKey)?.events ?? [];
  const failedNames = [...new Set([...week.failedNames, ...(selWeek?.failedNames ?? [])])];
  const overview = overviewForDay({
    today,
    selected,
    dayActive: dayStillActive(now, { hours: dayView.hours, periods: dayView.periods }, events),
    visibleRoutineCount: visibleSlots.length,
    carriedOver: school.carriedOver,
    homeworkDue: dayView.homeworkDue,
    weekHomework: dayView.weekHomework,
    nextSchoolDay: dayView.nextSchoolDay,
  });
  const showToday = overview.isToday;
  const showDay = overview.showDay;
  const homework = overview.homework;
  const hasStarTask = (slot: RoutineSlot) => routines.starTaskIds[slot] !== null && stars !== null;
  const allClear = overview.allClear;
  const dayBase = screen ? { path: "/skjerm", params: { person: member.id } } : undefined;
  const nextReward =
    stars && stars.progress.nextMilestone !== null
      ? rewardTextAt(stars.track, stars.progress.nextMilestone) || t.stars.rewardFallback
      : null;
  const starsLine = stars ? starsLeftText(stars.progress.approved, stars.progress.nextMilestone, nextReward) : null;
  const starPercent = stars && stars.progress.goal > 0 ? Math.min(100, Math.round((stars.progress.approved / stars.progress.goal) * 100)) : 0;

  // The family screen already has the scope and the dimming around the page; the kids' page gets its own.
  const Scope = screen ? Fragment : NavPendingScope;
  const Body = screen ? "div" : PendingContent;
  const switcher = <DaySwitcher date={selected} today={today} base={dayBase} size={screen ? "screen" : "page"} />;

  return (
    <Scope {...(screen ? {} : { className: "space-y-8" })}>
      {!screen && (
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
          <p className="text-base font-semibold capitalize text-muted">{formatDayHeading(selected)}</p>
        </div>
      </header>
      )}
      {/* One day switcher for the whole overview (on the screen the page puts it under the person's header). */}
      {!screen && switcher}
      {/* Things appear and disappear with the clock, so the page refreshes itself (the family screen does the same). */}
      {!screen && <ScreenRefresh />}
      {previewing && <Notice>{t.preview.readOnly}</Notice>}
      {member.calendar_ids.length === 0 && <Notice>{t.home.noCalendar}</Notice>}
      {failedNames.length > 0 && <Notice>{t.calendar.failed(failedNames.join(", "))}</Notice>}

      <Body className={screen ? "space-y-10" : "space-y-12"}>
      {/* Stars + routine, "Min dag" and Lekser sit side by side on wide screens (1 column on phones, 2 from lg, 3 from xl). */}
      <div className={screen ? "grid gap-10 md:grid-cols-2 md:items-start 2xl:grid-cols-3" : "grid gap-12 lg:grid-cols-2 lg:items-start xl:grid-cols-3"}>
        <div className="space-y-8">
          {stars ? (
            <section className="space-y-3 rounded-3xl bg-warning-soft p-5 text-on-warning-soft" aria-labelledby="stars-title">
              <h2 id="stars-title" className="sr-only">{t.stars.title}</h2>
              {screen ? (
                <p aria-label={t.start.stars(stars.progress.approved, stars.progress.goal)} className="flex items-baseline gap-3">
                  <span aria-hidden className="font-display text-6xl font-bold leading-none">{stars.progress.approved} ★</span>
                  <span aria-hidden className="text-base font-bold">{t.start.starsWord}</span>
                </p>
              ) : (
                <Link
                  href="/stars"
                  aria-label={`${t.start.stars(stars.progress.approved, stars.progress.goal)}. ${t.start.starsLink}`}
                  className="flex items-baseline gap-3"
                >
                  <span aria-hidden className="font-display text-6xl font-bold leading-none">{stars.progress.approved} ★</span>
                  <span aria-hidden className="text-base font-bold">{t.start.starsWord}</span>
                </Link>
              )}
              <p className="text-lg font-bold text-ink">
                {starsLine ?? t.start.stars(stars.progress.approved, stars.progress.goal)}
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
                <StartStarSheet tasks={stars.tasks} previewing={previewing} memberId={screen ? member.id : undefined} />
              </div>
            </section>
          ) : (
            <StartStarSheet tasks={[]} previewing={previewing} memberId={screen ? member.id : undefined} />
          )}
          {overview.showRoutines && renderSlots.map((slot) => (
            <Linger key={slot} show={!slotData[slot].progress.complete} finished={slotData[slot].progress.complete}>
              <RoutineBar
                slot={slot}
                items={slotData[slot].items}
                initialChecked={slotData[slot].checkedIds}
                hasStarTask={hasStarTask(slot)}
                readOnly={previewing}
                tint={member.colour}
              />
            </Linger>
          ))}
          {allClear && <p className="text-xl font-extrabold">{t.start.allDone}</p>}
          {!showDay && showToday && (
            <Link href={dayHref(addDays(today, 1), today, dayBase)} scroll={false} className="btn btn-text text-base">
              {t.start.seeTomorrow}
            </Link>
          )}
        </div>
        {showDay && (
          <StartSchool
            view={dayView}
            events={events}
            date={selected}
            today={today}
            now={showToday ? { minutes: nowMinutes, time: formatTime(now) } : undefined}
          />
        )}
        <Linger show={homework.show} finished={!homework.show}>
          <StartHomework
            carried={homework.carried}
            items={homework.items}
            weekItems={homework.weekItems}
            tomorrow={homework.tomorrow}
            weekday={formatWeekday(dayView.nextSchoolDay).toLocaleLowerCase()}
            readOnly={previewing}
            otherDay={homework.otherDay}
          />
        </Linger>
      </div>
      </Body>
    </Scope>
  );
}
