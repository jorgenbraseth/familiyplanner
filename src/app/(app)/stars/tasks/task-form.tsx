"use client";

import { useActionState } from "react";
import { t } from "@/lib/i18n";
import { MAX_TASK_NAME, MAX_TASK_STARS, type StarTaskRow } from "@/lib/stars";
import { saveTask, type TaskActionState } from "../task-actions";

const initial: TaskActionState = { ok: false };
const label = "block space-y-1 text-sm font-bold";
const a = t.stars.tasksAdmin;

export type TaskChild = { id: string; name: string };

/** Adds a task (no `task`) or edits one. `who` is "Alle barn" or one child. */
export function TaskForm({ kids, task }: { kids: TaskChild[]; task?: StarTaskRow }) {
  const [state, formAction, pending] = useActionState(saveTask, initial);
  return (
    <form action={formAction} className="space-y-2">
      {task && <input type="hidden" name="id" value={task.id} />}
      <label className={label}>
        <span>{a.name}</span>
        <input
          type="text"
          name="name"
          required
          maxLength={MAX_TASK_NAME}
          defaultValue={task?.name ?? ""}
          placeholder={a.namePlaceholder}
          className="field"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          <span>{a.stars}</span>
          <select name="stars" defaultValue={task?.stars ?? 1} className="field">
            {Array.from({ length: MAX_TASK_STARS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {a.starsOption(n)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span>{a.who}</span>
          <select name="who" defaultValue={task ? (task.member_id ?? "all") : "all"} className="field">
            <option value="all">{a.whoAll}</option>
            {kids.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {task ? a.save : a.add}
        </button>
        {!pending && state.error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
        {!pending && state.ok && !task && <p className="text-sm font-semibold text-muted">✓</p>}
      </div>
    </form>
  );
}
