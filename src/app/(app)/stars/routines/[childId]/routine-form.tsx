"use client";

import { useActionState, useState } from "react";
import { t } from "@/lib/i18n";
import { missingStarters } from "@/lib/routine-forms";
import {
  ROUTINE_MAX_ITEMS_PER_SLOT,
  ROUTINE_NAME_MAX,
  type RoutineSlot,
} from "@/lib/routines";
import {
  saveRoutine,
  type RoutineAdminState,
} from "../../../routine-admin-actions";

const initial: RoutineAdminState = { ok: false };
const label = "block space-y-1 text-sm font-bold";
const iconButton =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-chip text-lg font-bold text-chip-ink disabled:opacity-40";

type Draft = { key: string; id?: string; name: string };
export type StarTaskOption = { id: string; name: string; stars: number };

/** Editor of one list (Morgenstell or Kveldstell) of a child. `starTasks` is null when the child has no active track. */
export function RoutineForm({
  childId,
  slot,
  items,
  starTaskId,
  starTasks,
}: {
  childId: string;
  slot: RoutineSlot;
  items: { id: string; name: string }[];
  starTaskId: string | null;
  starTasks: StarTaskOption[] | null;
}) {
  const a = t.routines.admin;
  const [state, formAction, pending] = useActionState(saveRoutine, initial);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    items.map((i) => ({ key: i.id, id: i.id, name: i.name })),
  );
  const [star, setStar] = useState(starTaskId ?? "");
  const [dirty, setDirty] = useState(false);

  const change = (update: (list: Draft[]) => Draft[]) => {
    setDirty(true);
    setDrafts(update);
  };
  const move = (index: number, by: -1 | 1) =>
    change((list) => {
      const target = index + by;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  const full = drafts.length >= ROUTINE_MAX_ITEMS_PER_SLOT;
  const starters = missingStarters(
    slot === "morning" ? a.starterMorning : a.starterEvening,
    drafts.map((d) => d.name),
  );
  const showStarters = drafts.every((d) => d.name.trim() === "");

  return (
    <form
      action={(formData) => {
        setDirty(false);
        formAction(formData);
      }}
      className="card space-y-3 p-4"
    >
      <h2 className="text-xl font-extrabold">
        {slot === "morning" ? t.routines.morning : t.routines.evening}
      </h2>
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="slot" value={slot} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(drafts.map(({ id, name }) => ({ id, name })))}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">{a.itemsLabel}</legend>
        <ul className="space-y-2">
          {drafts.map((draft, index) => (
            <li key={draft.key} className="space-y-2 rounded-xl bg-chip p-2">
              <input
                type="text"
                aria-label={a.itemName}
                maxLength={ROUTINE_NAME_MAX}
                value={draft.name}
                placeholder={a.itemPlaceholder}
                onChange={(event) => {
                  const name = event.target.value;
                  change((list) =>
                    list.map((d) => (d.key === draft.key ? { ...d, name } : d)),
                  );
                }}
                className="field"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className={iconButton}
                  aria-label={a.moveUp}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <span aria-hidden>↑</span>
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={a.moveDown}
                  disabled={index === drafts.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <span aria-hidden>↓</span>
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={a.remove}
                  onClick={() =>
                    change((list) => list.filter((d) => d.key !== draft.key))
                  }
                >
                  <span aria-hidden>✕</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={full}
          onClick={() =>
            change((list) => [...list, { key: crypto.randomUUID(), name: "" }])
          }
        >
          {a.add}
        </button>
        {full && (
          <p className="text-xs text-muted">
            {a.full(ROUTINE_MAX_ITEMS_PER_SLOT)}
          </p>
        )}
      </fieldset>

      {showStarters && starters.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold">{a.starterTitle}</p>
          <div className="flex flex-wrap gap-2">
            {starters.map((name) => (
              <button
                key={name}
                type="button"
                disabled={full}
                className="inline-flex min-h-11 items-center rounded-full bg-chip px-4 text-sm font-bold text-chip-ink disabled:opacity-40"
                onClick={() =>
                  change((list) => [
                    ...list.filter((d) => d.name.trim() !== ""),
                    { key: crypto.randomUUID(), name },
                  ])
                }
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {starTasks ? (
        <label className={label}>
          <span>{a.starLabel}</span>
          <select
            name="starTaskId"
            value={star}
            onChange={(event) => {
              setStar(event.target.value);
              setDirty(true);
            }}
            className="field"
          >
            <option value="">{a.noStar}</option>
            {starTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {a.starOption(task.name, task.stars)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <input type="hidden" name="starTaskId" value="" />
          <p className="text-sm text-muted">{a.noTrack}</p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {a.save}
        </button>
        {!pending && state.error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
        {!pending && state.ok && !state.error && !dirty && (
          <p
            role="status"
            className="text-sm font-semibold text-primary-strong"
          >
            {a.saved}
          </p>
        )}
      </div>
    </form>
  );
}
