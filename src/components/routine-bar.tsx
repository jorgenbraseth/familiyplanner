"use client";

import { useState, useTransition } from "react";
import { toggleRoutineCheck } from "@/app/(app)/routine-actions";
import { tintStyle } from "@/lib/colour";
import { t } from "@/lib/i18n";
import { routineCollapsed, type RoutineSlot } from "@/lib/routines";

/**
 * Morgenstell / Kveldstell: a block tinted with the child's colour holding big tap pills. Ticking updates at once and reverts if saving fails.
 * Ticking the last one sends the star request (server side). A finished routine collapses to one
 * quiet line (also on first render); "Vis" opens it again, and unticking an item reopens it by itself.
 */
export function RoutineBar({
  slot,
  upcoming,
  items,
  initialChecked,
  hasStarTask,
  readOnly = false,
  tint,
}: {
  slot: RoutineSlot;
  upcoming: boolean;
  items: { id: string; name: string }[];
  initialChecked: string[];
  /** The slot gives a star (a task is set and the child has an active track). */
  hasStarTask: boolean;
  /** Preview mode: shown but can't be changed. */
  readOnly?: boolean;
  /** The child's colour: the block is tinted with it (a soft chip when missing). */
  tint?: string;
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
    <section aria-label={t.routines[slot]} className="space-y-3">
      <div
        id="routine-list"
        aria-hidden={collapsed}
        inert={collapsed}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`space-y-4 rounded-3xl p-5 ${tint ? "" : "bg-chip"}`} style={tint ? tintStyle(tint) : undefined}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 id="routine-title" className="text-3xl font-bold">
                {t.routines[slot]}
                {upcoming && (
                  <span className="ml-2 rounded-full bg-surface/80 px-2.5 py-0.5 align-middle text-sm font-bold text-chip-ink">
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
                  className="btn btn-text text-base"
                >
                  {t.routines.hide}
                </button>
              )}
              {total > 0 && !complete && (
                <span className="text-lg font-extrabold" aria-live="polite">
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
              <>
                <div
                  role="progressbar"
                  aria-label={t.routines[slot]}
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={done}
                  className="h-2 w-full overflow-hidden rounded-full bg-surface/80"
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                </div>
                <ul className="flex flex-wrap gap-3">
                  {items.map((item) => {
                    const on = checked.has(item.id);
                    return (
                      <li key={item.id} className="max-w-full">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={t.routines.checkLabel(item.name)}
                          disabled={readOnly}
                          onClick={() => toggle(item.id)}
                          className={`flex min-h-16 max-w-full items-center gap-3 rounded-full bg-surface/80 py-2 pl-3.5 pr-6 text-left text-xl font-extrabold transition-colors hover:bg-surface disabled:cursor-default ${
                            on ? "text-muted" : "text-ink"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xl leading-none ${
                              on ? "bg-primary text-on-primary" : "border-[3px] border-primary bg-surface"
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
              </>
            )}

            {complete && !collapsed && (
              <p role="status" className="text-center text-xl font-extrabold">
                {hasStarTask ? t.routines.doneWithStar : t.routines.done}
              </p>
            )}
          </div>
        </div>
      </div>

      {complete && collapsed && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 px-1">
          <p role="status" className="min-w-0 text-base font-semibold text-muted">
            <span aria-hidden className="mr-2">✓</span>
            {t.routines.doneCollapsed(slot)}
            {hasStarTask && <span className="block text-sm">{t.routines.starSent}</span>}
          </p>
          <button
            type="button"
            aria-expanded={false}
            aria-controls="routine-list"
            onClick={() => setExpanded(true)}
            className="btn btn-text text-base"
          >
            {t.routines.show}
          </button>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {t.routines.saveFailed}
        </p>
      )}
    </section>
  );
}
