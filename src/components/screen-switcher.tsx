"use client";

import { KeepAwake } from "@/components/keep-awake";
import { NavLink } from "@/components/nav-pending";
import { MemberAvatar } from "@/components/member-avatar";
import { tintStyle, textOnColour } from "@/lib/colour";
import { t } from "@/lib/i18n";
import { screenHref } from "@/lib/screen";

export type ScreenPerson = { id: string; name: string; colour: string; avatarUrl: string | null };

/**
 * Who the family screen shows: a full-height rail in landscape, a scrollable row at the top otherwise. The selected
 * person's tile is filled with their colour; the others are a light tint. Must sit inside a `NavPendingScope`.
 */
export function ScreenSwitcher({
  people,
  selectedId,
  signOutAction,
}: {
  people: ScreenPerson[];
  selectedId: string;
  signOutAction: () => void | Promise<void>;
}) {
  return (
    <nav
      aria-label={t.screen.switchPerson}
      className="flex shrink-0 items-stretch gap-2 overflow-x-auto p-3 min-[640px]:landscape:w-60 min-[640px]:landscape:flex-col min-[640px]:landscape:overflow-y-auto min-[640px]:landscape:overflow-x-hidden min-[640px]:landscape:p-4 min-[640px]:landscape:pb-3"
    >
      <ul className="flex flex-1 gap-2 min-[640px]:landscape:flex-col">
        {people.map((p) => {
          const selected = p.id === selectedId;
          return (
            <li key={p.id} className="shrink-0">
              <NavLink
                href={screenHref(p.id)}
                prefetch
                scroll={false}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-16 items-center gap-3 rounded-3xl px-4 py-2 font-display text-2xl font-bold leading-tight min-[640px]:landscape:w-full ${
                  selected ? textOnColour(p.colour) : "text-ink"
                }`}
                style={selected ? { backgroundColor: p.colour } : tintStyle(p.colour, 0.14)}
              >
                <Avatar person={p} selected={selected} />
                <span className="min-w-0 break-words">{p.name}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
      <form action={signOutAction} className="shrink-0 self-center min-[640px]:landscape:self-start">
        <button type="submit" className="btn btn-text">
          {t.nav.signOut}
        </button>
      </form>
      <KeepAwake />
    </nav>
  );
}

function Avatar({ person, selected }: { person: ScreenPerson; selected: boolean }) {
  if (person.avatarUrl) return <MemberAvatar colour={selected ? "#ffffff" : person.colour} url={person.avatarUrl} size={44} />;
  return (
    <span
      aria-hidden
      className={`flex size-11 shrink-0 items-center justify-center rounded-full text-xl font-bold leading-none ${
        selected ? "bg-white/30" : `${textOnColour(person.colour)}`
      }`}
      style={selected ? undefined : { backgroundColor: person.colour }}
    >
      {person.name.slice(0, 1).toLocaleUpperCase()}
    </span>
  );
}
