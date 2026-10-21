import { DayList } from "@/components/day-list";
import { Notice } from "@/components/notice";
import { PushCard } from "@/components/push-card";
import { WeekNav } from "@/components/week-nav";
import { loadWeek, parseWeekOffset } from "@/lib/calendar/view";
import { SchoolToday } from "@/components/school-today";
import { SchoolWeek } from "@/components/school-week";
import { t } from "@/lib/i18n";
import { groupItemsByDay, todayView } from "@/lib/plan-view";
import { loadSchoolWeek } from "@/lib/school";
import { StarCard } from "@/components/star-card";
import { loadChildStars, loadPendingCount } from "@/lib/star-data";
import { getViewer } from "@/lib/view-as";
import Link from "next/link";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { me, viewing: member, previewing } = await getViewer();
  const offset = parseWeekOffset((await searchParams).week);
  const showPendingCard = me.role === "parent" && !previewing;
  const [week, school, stars, pendingStars] = await Promise.all([
    loadWeek([member], offset),
    loadSchoolWeek(member.id, offset),
    member.role === "child" ? loadChildStars(member.id) : null,
    showPendingCard ? loadPendingCount() : 0,
  ]);
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
      {previewing && <Notice>{t.preview.readOnly}</Notice>}
      {pendingStars > 0 && (
        <Link href="/stars" className="card flex items-center justify-between gap-3 border-accent bg-warning-soft p-4">
          <span className="text-lg font-extrabold text-on-warning-soft">{t.stars.parent.pendingCard(pendingStars)}</span>
          <span className="shrink-0 text-sm font-bold text-on-warning-soft underline underline-offset-4">
            {t.stars.parent.pendingCardLink}
          </span>
        </Link>
      )}
      {stars && <StarCard data={stars} />}
      {!member.calendar_id && <Notice>{t.home.noCalendar}</Notice>}
      {week.failedNames.length > 0 && <Notice>{t.calendar.failed(week.failedNames.join(", "))}</Notice>}
      {today && offset === 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-extrabold">{t.home.today}</h2>
          <DayList days={[today]} />
          {hasSchoolToday && <SchoolToday view={schoolToday} readOnly={previewing} />}
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
          readOnly={previewing}
        />
      </section>
      {!previewing && <PushCard />}
    </>
  );
}
