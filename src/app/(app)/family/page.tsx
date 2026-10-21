import { Notice } from "@/components/notice";
import { WeekNav } from "@/components/week-nav";
import { loadWeek, parseWeekOffset } from "@/lib/calendar/view";
import { visibleDays } from "@/lib/plan-view";
import { getViewer } from "@/lib/view-as";
import { t } from "@/lib/i18n";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { FamilyCalendar } from "./family-calendar";

export default async function FamilyPage({ searchParams }: PageProps<"/family">) {
  const { viewing } = await getViewer();
  const kidView = viewing.role === "child";
  const offset = parseWeekOffset((await searchParams).week);
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).order("created_at");
  if (error) throw new Error("Could not read members");
  const members = data as Member[];
  // Kids (and "Se som barn") see only their own school events, for audience child/both; parents see every
  // event of their children.
  const week = await loadWeek(members, offset, new Date(), {
    weekdayOnly: kidView,
    schoolEvents: kidView
      ? { view: "kid", memberIds: [viewing.id] }
      : { view: "all", memberIds: members.filter((m) => m.role === "child").map((m) => m.id) },
  });

  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.family.title}</h1>
      {week.failedNames.length > 0 && <Notice>{t.calendar.failed(week.failedNames.join(", "))}</Notice>}
      <WeekNav path="/family" offset={offset} isoWeek={week.isoWeek} />
      <FamilyCalendar
        days={visibleDays(week.days, week.todayKey, offset)}
        onlyMemberId={kidView ? viewing.id : undefined}
        hideEmptyDays={kidView}
        members={members.map((m) => ({ id: m.id, name: m.name, colour: m.colour }))}
      />
    </>
  );
}
