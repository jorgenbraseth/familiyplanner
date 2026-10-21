import { Notice } from "@/components/notice";
import { WeekNav } from "@/components/week-nav";
import { getCurrentMember } from "@/lib/auth";
import { loadWeek, parseWeekOffset } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { FamilyCalendar } from "./family-calendar";

export default async function FamilyPage({ searchParams }: PageProps<"/family">) {
  await getCurrentMember();
  const offset = parseWeekOffset((await searchParams).week);
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).order("created_at");
  if (error) throw new Error("Could not read members");
  const members = data as Member[];
  const week = await loadWeek(members, offset);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.family.title}</h1>
      {week.failedNames.length > 0 && <Notice>{t.calendar.failed(week.failedNames.join(", "))}</Notice>}
      <WeekNav path="/family" offset={offset} isoWeek={week.isoWeek} />
      <FamilyCalendar
        days={week.days}
        members={members.map((m) => ({ id: m.id, name: m.name, colour: m.colour }))}
      />
    </>
  );
}
