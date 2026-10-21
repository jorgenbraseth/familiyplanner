"use client";

import { useActionState, useRef, useState } from "react";
import { MAX_TASK_STARS, type StarTaskRow } from "@/lib/stars";
import { t } from "@/lib/i18n";
import { giveStar, type StarActionState } from "./actions";

const initial: StarActionState = { ok: false };

/** A parent gives approved stars directly: pick a task (gives its stars) or write a reason and an amount (1-10). */
export function GiveStarForm({ childId, tasks }: { childId: string; tasks: StarTaskRow[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [task, setTask] = useState("");
  const other = task === "";
  const [state, formAction, pending] = useActionState(async (prev: StarActionState, formData: FormData) => {
    const result = await giveStar(prev, formData);
    if (result.ok) {
      formRef.current?.reset();
      setTask("");
    }
    return result;
  }, initial);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="child" value={childId} />
      {tasks.length > 0 && (
        <label className="block space-y-1 text-sm font-bold">
          <span>{t.stars.parent.giveTask}</span>
          <select name="task" value={task} onChange={(event) => setTask(event.target.value)} className="field">
            {tasks.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} ({t.stars.amount(k.stars)})
              </option>
            ))}
            <option value="">{t.stars.parent.giveOther}</option>
          </select>
        </label>
      )}
      {other && (
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <label className="block space-y-1 text-sm font-bold">
            <span>{t.stars.parent.giveReason}</span>
            <input
              type="text"
              name="reason"
              required
              maxLength={120}
              placeholder={t.stars.parent.giveReasonPlaceholder}
              className="field"
            />
          </label>
          <label className="block space-y-1 text-sm font-bold">
            <span>{t.stars.parent.giveAmount}</span>
            <select name="amount" defaultValue="1" className="field">
              {Array.from({ length: MAX_TASK_STARS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {t.stars.parent.give}
        </button>
        {!pending && state.error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
        {!pending && state.ok && (
          <p role="status" className="text-sm font-bold text-primary-strong">
            {t.stars.parent.given}
          </p>
        )}
      </div>
    </form>
  );
}
