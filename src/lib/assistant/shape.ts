// Result shaping and member lookup for the assistant's tools. Pure: no server access.

import type { PlanItemKind } from "../plan";
import { weekdayName } from "./range";

export const MAX_PLAN_ITEMS = 200;
export const NO_ACCESS_NOTE = "no access or nothing found";

export type PlanItemInput = {
  date: string;
  kind: PlanItemKind;
  subject: string | null;
  text: string;
  done: boolean;
  sort?: number;
};

export type PlanItemResult = { date: string; weekday: string; kind: PlanItemKind; subject: string | null; text: string; done: boolean };

/** Sorts by date then sort order, caps the list and adds the weekday. */
export function shapePlanItems(rows: readonly PlanItemInput[]): { items: PlanItemResult[]; note?: string; truncated?: boolean } {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || (a.sort ?? 0) - (b.sort ?? 0));
  const items = sorted.slice(0, MAX_PLAN_ITEMS).map((r) => ({
    date: r.date,
    weekday: weekdayName(r.date),
    kind: r.kind,
    subject: r.subject,
    text: r.text,
    done: r.done,
  }));
  return {
    items,
    ...(items.length === 0 ? { note: NO_ACCESS_NOTE } : {}),
    ...(sorted.length > MAX_PLAN_ITEMS ? { truncated: true } : {}),
  };
}

export type NamedMember = { id: string; name: string; calendar_id?: string | null };

export type MemberLookup<M extends NamedMember> = { member: M } | { error: string };

/** Finds a member by name, case-insensitively: exact match first, then a unique prefix/substring match. */
export function resolveMember<M extends NamedMember>(members: readonly M[], name: string): MemberLookup<M> {
  const wanted = name.trim().toLocaleLowerCase("nb-NO");
  if (!wanted) return { error: "No member name given." };
  const exact = members.filter((m) => m.name.trim().toLocaleLowerCase("nb-NO") === wanted);
  if (exact.length === 1) return { member: exact[0] };
  const partial = members.filter((m) => m.name.toLocaleLowerCase("nb-NO").includes(wanted));
  if (exact.length === 0 && partial.length === 1) return { member: partial[0] };
  if (exact.length > 1 || partial.length > 1) return { error: "More than one family member matches that name." };
  return { error: "No family member with that name." };
}
