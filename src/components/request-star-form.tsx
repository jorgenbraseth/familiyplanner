"use client";

import { useActionState } from "react";
import { requestStar, type StarActionState } from "@/app/(app)/stars/actions";
import { t } from "@/lib/i18n";
import { starIcons, type StarTaskRow } from "@/lib/stars";

const initial: StarActionState = { ok: false };

/** "Hva har du gjort?": one big button per task (one tap requests its stars); free text is the small fallback. */
export function RequestStarForm({
  tasks,
  previewing,
}: {
  tasks: StarTaskRow[];
  previewing: boolean;
}) {
  const [state, formAction, pending] = useActionState(requestStar, initial);
  const disabled = previewing || pending;

  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-xl font-extrabold">{t.stars.request.title}</h2>
      {previewing && <p className="text-sm font-semibold text-muted">{t.stars.request.readOnly}</p>}
      {tasks.length > 0 ? (
        <form action={formAction} className="space-y-2">
          <p className="text-sm font-bold">{t.stars.request.tasksLabel}</p>
          <div className="grid grid-cols-2 gap-2">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="submit"
                name="task"
                value={task.id}
                disabled={disabled}
                aria-label={`${task.name}, ${t.stars.amountLabel(task.stars)}`}
                className="btn btn-secondary flex min-h-24 flex-col items-center justify-center gap-1 px-2 py-3 text-center"
              >
                <span className="break-words text-lg font-extrabold leading-tight">{task.name}</span>
                <span aria-hidden className="text-base leading-none">
                  {starIcons(task.stars)}
                </span>
              </button>
            ))}
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">{t.stars.request.noTasks}</p>
      )}
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-base font-bold text-primary-strong">
          {t.stars.request.otherSummary}
        </summary>
        <form action={formAction} className="space-y-2 pt-1">
          <label className="block space-y-1 text-sm font-bold">
            <span>{t.stars.request.otherLabel}</span>
            <input
              type="text"
              name="reason"
              required
              maxLength={120}
              disabled={disabled}
              placeholder={t.stars.request.otherPlaceholder}
              className="field"
            />
          </label>
          <button type="submit" disabled={disabled} className="btn btn-primary w-full min-h-12 text-base">
            {t.stars.request.send}
          </button>
        </form>
      </details>
      {!pending && state.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
      {!pending && state.ok && (
        <p role="status" className="text-sm font-bold text-primary-strong">
          {t.stars.request.sent}
        </p>
      )}
    </section>
  );
}
