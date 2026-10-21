import { Notice } from "@/components/notice";
import { ParentDayCard } from "@/components/parent-day";
import { ParentHomeCards } from "@/components/parent-home";
import { PushCard } from "@/components/push-card";
import { StartView } from "@/components/start-view";
import { t } from "@/lib/i18n";
import { loadParentDay } from "@/lib/parent-day-data";
import { loadParentHome } from "@/lib/parent-home";
import { getViewer } from "@/lib/view-as";

export default async function HomePage() {
  const { viewing: member, previewing } = await getViewer();
  if (member.role === "child") return <StartView member={member} previewing={previewing} />;

  const now = new Date();
  const home = await loadParentHome(now);
  const day = await loadParentDay(member, home.children.map((c) => c.child), now);

  return (
    <>
      <h1 className="text-3xl font-extrabold">
        <span aria-hidden className="mr-2 text-accent">★</span>
        {t.home.greeting(member.name)}
      </h1>
      {!member.calendar_id && <Notice>{t.home.noCalendar}</Notice>}
      <ParentDayCard day={day} />
      <ParentHomeCards data={home} />
      <PushCard />
    </>
  );
}
