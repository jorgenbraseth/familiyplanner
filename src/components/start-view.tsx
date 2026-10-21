import Link from "next/link";
import { Notice } from "@/components/notice";
import { PushCard } from "@/components/push-card";
import { RoutineBar } from "@/components/routine-bar";
import { StartHomework } from "@/components/start-homework";
import { StartSchool } from "@/components/start-school";
import { StartStarSheet } from "@/components/start-star-sheet";
import { loadWeek } from "@/lib/calendar/view";
import { dayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { Member } from "@/lib/members";
import { formatWeekday, todayView } from "@/lib/plan-view";
import { loadRoutineToday } from "@/lib/routine-data";
import { currentSlot } from "@/lib/routines";
import { loadSchoolHours, loadSchoolWeek } from "@/lib/school";
import { loadChildStars } from "@/lib/star-data";
import { isTomorrow, slotView } from "@/lib/start-view";

/** The children's start page (also shown when a parent previews a child). */
export async function StartView({ member, previewing }: { member: Member; previewing: boolean }) {
  const now = new Date();
  const [school, routines, stars, week] = await Promise.all([
    loadSchoolWeek(member.id, 0, now),
    loadRoutineToday(member.id, now),
    loadChildStars(member.id),
    loadWeek([member], 0, now, true),
  ]);
  const hours = (await loadSchoolHours(member.id, school.monday)).get(dayKey(school.today));
  const { slot, upcoming } = currentSlot(now, hours?.starts_at ?? null);
  const slotData = slotView(routines.items, routines.checks, slot);
  const hasStarTask = routines.starTaskIds[slot] !== null && stars !== null;

  const view = todayView(school.items, school.today);
  const events = week.days.find((d) => d.isToday)?.events ?? [];
  const tomorrow = isTomorrow(school.today, view.nextSchoolDay);

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="min-w-0 break-words text-4xl font-extrabold">{member.name}</h1>
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
      {!member.calendar_id && <Notice>{t.home.noCalendar}</Notice>}
      {week.failedNames.length > 0 && <Notice>{t.calendar.failed(week.failedNames.join(", "))}</Notice>}

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
        <StartSchool view={view} hours={hours} events={events} />
        <StartHomework
          items={view.homeworkDue}
          tomorrow={tomorrow}
          weekday={formatWeekday(view.nextSchoolDay).toLocaleLowerCase()}
          readOnly={previewing}
        />
      </div>

      {!previewing && <PushCard />}
    </>
  );
}
