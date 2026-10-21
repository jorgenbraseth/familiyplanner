import { DayList } from "@/components/day-list";
import { Notice } from "@/components/notice";
import { PushCard } from "@/components/push-card";
import { WeekNav } from "@/components/week-nav";
import { getCurrentMember } from "@/lib/auth";
import { loadWeek, parseWeekOffset } from "@/lib/calendar/view";
import { SchoolToday } from "@/components/school-today";
import { SchoolWeek } from "@/components/school-week";
import { t } from "@/lib/i18n";
import { groupItemsByDay, todayView } from "@/lib/plan-view";
import { loadSchoolWeek } from "@/lib/school";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const member = await getCurrentMember();
  const offset = parseWeekOffset((await searchParams).week);
  const [week, school] = await Promise.all([loadWeek([member], offset), loadSchoolWeek(member.id, offset)]);
  const today = week.days.find((d) => d.isToday);
  const schoolToday = todayView(school.items, school.today);
  const hasSchoolToday =
    schoolToday.lessons.length + schoolToday.bring.length + schoolToday.notes.length + schoolToday.homeworkDue.length > 0;

  return (
    <>
      <h1 className="text-3xl font-extrabold">
        <span aria-hidden className="mr-2 text-accent">★</span>
        {t.home.greeting(member.name)}
      </h1>
      {!member.calendar_id && <Notice>{t.home.noCalendar}</Notice>}
      {week.failedNames.length > 0 && <Notice>{t.calendar.failed(week.failedNames.join(", "))}</Notice>}
      {today && offset === 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-extrabold">{t.home.today}</h2>
          <DayList days={[today]} />
          {hasSchoolToday && <SchoolToday view={schoolToday} />}
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-xl font-extrabold">{t.home.thisWeek}</h2>
        <WeekNav path="/" offset={offset} isoWeek={week.isoWeek} />
        <DayList days={week.days} />
        <SchoolWeek
          days={groupItemsByDay(school.items, school.monday, 7)}
          documents={school.documents}
          todayKey={week.todayKey}
        />
      </section>
      <PushCard />
    </>
  );
}
