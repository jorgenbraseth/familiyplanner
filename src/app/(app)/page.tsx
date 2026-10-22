import { DaySwitcher } from "@/components/day-switcher";
import { NavPendingScope } from "@/components/nav-pending";
import { Notice } from "@/components/notice";
import { ParentDayCard } from "@/components/parent-day";
import { ParentHomeCards, ParentHomeTop } from "@/components/parent-home";
import { StartView } from "@/components/start-view";
import { dateInTimeZone, daysBetween, parseDayParam } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { loadAvatarUrls } from "@/lib/avatar-urls";
import { loadParentDay } from "@/lib/parent-day-data";
import { loadParentHome } from "@/lib/parent-home";
import { getViewer } from "@/lib/view-as";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { viewing: member, previewing } = await getViewer();
  if (member.role === "child") return <StartView member={member} previewing={previewing} dag={(await searchParams).dag} />;

  const now = new Date();
  const today = dateInTimeZone(now);
  const selected = parseDayParam((await searchParams).dag, today);
  const home = await loadParentHome(now);
  // Only "Dagen" follows the selected day; "Skolen slutter" and the other cards stay on today.
  const day = await loadParentDay(member, home.children.map((c) => c.child), selected);
  const avatars = await loadAvatarUrls([member, ...home.children.map((c) => c.child)]);

  return (
    <>
      <h1 className="text-4xl font-bold leading-tight">
        <span aria-hidden className="mr-2 text-accent">★</span>
        {t.home.greeting(member.name)}
      </h1>
      <ParentHomeTop data={home} avatars={avatars} />
      {member.calendar_ids.length === 0 && <Notice>{t.home.noCalendar}</Notice>}
      <NavPendingScope>
        <ParentDayCard
          key={day.dateKey}
          day={day}
          isToday={daysBetween(today, selected) === 0}
          switcher={<DaySwitcher date={selected} today={today} />}
          avatars={avatars}
        />
      </NavPendingScope>
      <ParentHomeCards data={home} avatars={avatars} />
    </>
  );
}
