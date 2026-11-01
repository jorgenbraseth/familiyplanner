import { signOut } from "@/app/auth/actions";
import { DaySwitcher } from "@/components/day-switcher";
import { MemberAvatar } from "@/components/member-avatar";
import { NavPendingScope, PendingContent } from "@/components/nav-pending";
import { Notice } from "@/components/notice";
import { ScreenAssistant } from "@/components/screen-assistant";
import { ScreenParentView } from "@/components/screen-parent";
import { ScreenRefresh } from "@/components/screen-refresh";
import { ScreenSwitcher } from "@/components/screen-switcher";
import { StartView } from "@/components/start-view";
import { ThemeSync } from "@/components/theme-sync";
import { requireScreen } from "@/lib/auth";
import { loadAvatarUrls } from "@/lib/avatar-urls";
import { firstNameOf } from "@/lib/assistant/prompt";
import { loadWeek } from "@/lib/calendar/view";
import { textOnColour, tintStyle } from "@/lib/colour";
import { dateInTimeZone, dayKey, daysBetween, formatDayHeading, mondayOf, parseDayParam, relativeDayLabel } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { getNow } from "@/lib/now";
import { pickPerson, screenPeople, upcomingDays } from "@/lib/screen";
import { loadPendingCount } from "@/lib/star-data";
import { createClient } from "@/lib/supabase/server";
import { parseThemeId } from "@/lib/themes";

export default async function ScreenPage({ searchParams }: PageProps<"/skjerm">) {
  await requireScreen();
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).order("created_at");
  if (error) throw new Error("Could not read members");
  const people = screenPeople((data ?? []) as Member[]);
  const person = pickPerson(people, params.person);
  if (!person) {
    return (
      <main className="p-8">
        <Notice>{t.screen.nobody}</Notice>
      </main>
    );
  }

  const now = await getNow();
  const today = dateInTimeZone(now);
  // The selected day (`?dag=`) applies to the whole overview, for children and parents alike.
  const selected = parseDayParam(params.dag, today);
  const dayOffset = Math.round(daysBetween(mondayOf(today), mondayOf(selected)) / 7);
  const avatars = await loadAvatarUrls(people);
  const isChild = person.role === "child";
  const [weeks, pending] = isChild
    ? [null, 0]
    : await Promise.all([Promise.all([loadWeek([person], dayOffset, now), loadWeek([person], dayOffset + 1, now)]), loadPendingCount()]);
  const failedNames = weeks ? [...new Set(weeks.flatMap((w) => w.failedNames))] : [];

  return (
    <NavPendingScope className="flex h-dvh flex-col min-[640px]:landscape:flex-row">
      {/* The person's own theme, shown without touching this tablet's saved theme. */}
      <ThemeSync theme={parseThemeId(person.theme)} preview />
      <ScreenRefresh />
      <ScreenSwitcher
        people={people.map((p) => ({ id: p.id, name: p.name, colour: p.colour, avatarUrl: avatars[p.id] ?? null }))}
        selectedId={person.id}
        signOutAction={signOut}
      />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden" style={tintStyle(person.colour, 0.07)}>
        <div key={person.id} className="space-y-10 px-5 pb-40 pt-5 min-[640px]:landscape:px-8">
          <header className="flex items-center gap-6 rounded-3xl p-5 sm:p-6" style={tintStyle(person.colour, 0.2)}>
            {avatars[person.id] ? (
              <MemberAvatar colour={person.colour} url={avatars[person.id]} size={112} className="border-4" />
            ) : (
              <span
                aria-hidden
                className={`flex size-28 shrink-0 items-center justify-center rounded-full font-display text-6xl font-bold leading-none ${textOnColour(person.colour)}`}
                style={{ backgroundColor: person.colour }}
              >
                {person.name.slice(0, 1).toLocaleUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="break-words font-display text-6xl font-bold leading-none sm:text-7xl">{person.name}</h1>
              <p className="mt-2 text-xl font-bold">{t.screen.thisIs(person.name)}</p>
              <p className="text-lg font-semibold capitalize text-muted">{formatDayHeading(selected)}</p>
            </div>
          </header>
          {/* Outside the dimmed content, so it can be tapped again while the next day loads. */}
          <DaySwitcher date={selected} today={today} base={{ path: "/skjerm", params: { person: person.id } }} size="screen" />
          <PendingContent className="space-y-10">
          {isChild ? (
            <StartView member={person} previewing={false} dag={params.dag} screen />
          ) : (
            <>
              {person.calendar_ids.length === 0 && <Notice>{t.screen.noCalendar}</Notice>}
              {failedNames.length > 0 && <Notice>{t.calendar.failed(failedNames.join(", "))}</Notice>}
              {weeks && (
                <ScreenParentView
                  heading={relativeDayLabel(selected, today)}
                  isToday={dayKey(selected) === dayKey(today)}
                  today={weeks[0].days.filter((d) => d.key === dayKey(selected))}
                  upcoming={upcomingDays([weeks[0].days, weeks[1].days], dayKey(selected))}
                  me={{ id: person.id, name: person.name, colour: person.colour, avatarUrl: avatars[person.id] ?? null }}
                  pending={pending}
                />
              )}
            </>
          )}
          </PendingContent>
        </div>
      </main>
      {/* Keyed on the person: switching person closes the assistant, so it never asks as the wrong one. */}
      <ScreenAssistant key={person.id} person={{ id: person.id, name: firstNameOf(person.name), colour: person.colour }} />
    </NavPendingScope>
  );
}
