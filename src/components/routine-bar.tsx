"use client";

import { useState, useTransition } from "react";
import { toggleRoutineCheck } from "@/app/(app)/routine-actions";
import { t } from "@/lib/i18n";
import { routineCollapsed, type RoutineSlot } from "@/lib/routines";

/**
 * Morgenstell / Kveldstell: big tap chips. Ticking updates at once and reverts if saving fails.
 * Ticking the last one sends the star request (server side). A finished routine collapses to one
 * message (also on first render); "Vis" opens it again, and unticking an item reopens it by itself.
 */
export function RoutineBar({
  slot,
  upcoming,
  items,
  initialChecked,
  hasStarTask,
  readOnly = false,
}: {
  slot: RoutineSlot;
  upcoming: boolean;
  items: { id: string; name: string }[];
  initialChecked: string[];
  /** The slot gives a star (a task is set and the child has an active track). */
  hasStarTask: boolean;
  /** Preview mode: shown but can't be changed. */
  readOnly?: boolean;
}) {
  const [checked, setChecked] = useState(() => new Set(initialChecked));
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();

  const total = items.length;
  const done = items.filter((i) => checked.has(i.id)).length;
  const complete = total > 0 && done === total;
  const collapsed = routineCollapsed(complete, expanded);

  function toggle(id: string) {
    if (readOnly) return;
    const next = !checked.has(id);
    setFailed(false);
    // A routine that is finished again later should fold up again, not stay open.
    if (!next) setExpanded(false);
    setChecked((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
    startTransition(async () => {
      let ok = false;
      try {
        ok = (await toggleRoutineCheck(id, next)).ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        setFailed(true);
        setChecked((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(id);
          else copy.add(id);
          return copy;
        });
      }
    });
  }

  return (
    <section className="card space-y-3 p-4" aria-labelledby="routine-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="routine-title" className="text-2xl font-extrabold">
          {t.routines[slot]}
          {upcoming && (
            <span className="ml-2 rounded-full bg-chip px-2.5 py-0.5 align-middle text-sm font-bold text-chip-ink">
              {t.routines.tonight}
            </span>
          )}
        </h2>
        {complete && (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls="routine-list"
            onClick={() => setExpanded(!expanded)}
            className="min-h-11 rounded-full border-2 border-line bg-surface px-4 text-base font-bold text-ink hover:bg-chip"
          >
            {collapsed ? t.routines.show : t.routines.hide}
          </button>
        )}
        {total > 0 && !complete && (
          <span className="text-lg font-extrabold text-muted" aria-live="polite">
            {t.routines.progress(done, total)}
          </span>
        )}
      </div>

      {total === 0 ? (
        <div>
          <p className="text-xl font-extrabold">{t.routines.empty}</p>
          <p className="text-base text-muted">{t.routines.emptyHint}</p>
        </div>
      ) : (
        <div
          id="routine-list"
          aria-hidden={collapsed}
          inert={collapsed}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
            collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
        >
        <ul className="flex min-h-0 flex-wrap gap-2 overflow-hidden">
          {items.map((item) => {
            const on = checked.has(item.id);
            return (
              <li key={item.id} className="max-w-full grow basis-[14rem]">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={t.routines.checkLabel(item.name)}
                  disabled={readOnly}
                  onClick={() => toggle(item.id)}
                  className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-xl font-bold transition-colors disabled:cursor-default ${
                    on
                      ? "border-primary bg-primary text-on-primary"
                      : "border-line bg-surface text-ink hover:bg-chip"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-2xl leading-none ${
                      on ? "border-on-primary" : "border-line"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className={`min-w-0 [overflow-wrap:normal] [word-break:normal] hyphens-none ${on ? "line-through decoration-2" : ""}`}>{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
        </div>
      )}

      {complete && (
        <p role="status" className="rounded-2xl bg-warning-soft p-3 text-center text-xl font-extrabold text-on-warning-soft">
          {collapsed ? t.routines.doneCollapsed(slot) : hasStarTask ? t.routines.doneWithStar : t.routines.done}
          {collapsed && hasStarTask && (
            <span className="mt-1 block text-base font-semibold">{t.routines.starSent}</span>
          )}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {t.routines.saveFailed}
        </p>
      )}
    </section>
  );
}
