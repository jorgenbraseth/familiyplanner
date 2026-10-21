import { DayList } from "@/components/day-list";
import { Notice } from "@/components/notice";
import { WeekNav } from "@/components/week-nav";
import { getCurrentMember } from "@/lib/auth";
import { loadWeek, parseWeekOffset } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const member = await getCurrentMember();
  const offset = parseWeekOffset((await searchParams).week);
  const week = await loadWeek([member], offset);
  const today = week.days.find((d) => d.isToday);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.home.greeting(member.name)}</h1>
      {!member.calendar_id && <Notice>{t.home.noCalendar}</Notice>}
      {week.failedNames.length > 0 && <Notice>{t.calendar.failed(week.failedNames.join(", "))}</Notice>}
      {today && offset === 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t.home.today}</h2>
          <DayList days={[today]} />
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.home.thisWeek}</h2>
        <WeekNav path="/" offset={offset} isoWeek={week.isoWeek} />
        <DayList days={week.days} />
      </section>
    </>
  );
}
