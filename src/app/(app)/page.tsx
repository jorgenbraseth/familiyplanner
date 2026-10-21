import { DayList } from "@/components/day-list";
import { Notice } from "@/components/notice";
import { ParentHomeCards } from "@/components/parent-home";
import { PushCard } from "@/components/push-card";
import { StartView } from "@/components/start-view";
import { loadWeek } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";
import { loadParentHome } from "@/lib/parent-home";
import { getViewer } from "@/lib/view-as";

export default async function HomePage() {
  const { viewing: member, previewing } = await getViewer();
  if (member.role === "child") return <StartView member={member} previewing={previewing} />;

  const now = new Date();
  const [home, week] = await Promise.all([loadParentHome(now), loadWeek([member], 0, now)]);
  const today = week.days.find((d) => d.isToday);

  return (
    <>
      <h1 className="text-3xl font-extrabold">
        <span aria-hidden className="mr-2 text-accent">★</span>
        {t.home.greeting(member.name)}
      </h1>
      <ParentHomeCards data={home} />
      {!member.calendar_id && <Notice>{t.home.noCalendar}</Notice>}
      {week.failedNames.length > 0 && <Notice>{t.calendar.failed(week.failedNames.join(", "))}</Notice>}
      {today && (
        <section className="space-y-2">
          <h2 className="text-xl font-extrabold">{t.home.today}</h2>
          <DayList days={[today]} />
        </section>
      )}
      <PushCard />
    </>
  );
}
