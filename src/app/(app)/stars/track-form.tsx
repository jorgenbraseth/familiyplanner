"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { t } from "@/lib/i18n";
import { MAX_TASK_NAME, MAX_TASKS, MAX_TASK_STARS, type StarTaskRow, type StarTrackRow } from "@/lib/stars";
import { createTrack, updateTrack, type StarActionState } from "./actions";

const initial: StarActionState = { ok: false };
const label = "block space-y-1 text-sm font-bold";
const help = "block text-xs font-normal text-muted";

type TaskDraft = { key: string; id?: string; name: string; stars: number };

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-chip text-lg font-bold text-chip-ink disabled:opacity-40";

/** Create (`childId`) or edit (`track`, with its `tasks`) a star track. Both actions redirect to /stars on success. */
export function TrackForm({ childId, track, tasks }: { childId?: string; track?: StarTrackRow; tasks?: StarTaskRow[] }) {
  const [state, formAction, pending] = useActionState(track ? updateTrack : createTrack, initial);
  const [drafts, setDrafts] = useState<TaskDraft[]>(() =>
    (tasks ?? []).map((task) => ({ key: task.id, id: task.id, name: task.name, stars: task.stars })),
  );
  const patch = (key: string, change: Partial<TaskDraft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const move = (index: number, by: -1 | 1) =>
    setDrafts((list) => {
      const target = index + by;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  return (
    <form action={formAction} className="card space-y-3 p-4">
      {track ? <input type="hidden" name="id" value={track.id} /> : <input type="hidden" name="child" value={childId ?? ""} />}
      <label className={label}>
        <span>{t.stars.form.name}</span>
        <input type="text" name="name" required maxLength={60} defaultValue={track?.name ?? ""} className="field" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          <span>{t.stars.form.goal}</span>
          <input
            type="number"
            name="goal"
            required
            min={5}
            max={200}
            inputMode="numeric"
            defaultValue={track?.goal ?? 30}
            className="field"
          />
        </label>
        <label className={label}>
          <span>{t.stars.form.every}</span>
          <input
            type="number"
            name="milestone_every"
            required
            min={1}
            max={50}
            inputMode="numeric"
            defaultValue={track?.milestone_every ?? 5}
            className="field"
          />
        </label>
      </div>
      <p className={help}>{t.stars.form.everyHelp}</p>
      <label className={label}>
        <span>{t.stars.form.smallReward}</span>
        <input type="text" name="small_reward" maxLength={200} defaultValue={track?.small_reward ?? ""} className="field" />
      </label>
      <label className={label}>
        <span>{t.stars.form.bigReward}</span>
        <input type="text" name="big_reward" maxLength={200} defaultValue={track?.big_reward ?? ""} className="field" />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">{t.stars.form.tasks}</legend>
        <p className={help}>{t.stars.form.tasksHelp}</p>
        <input
          type="hidden"
          name="tasks"
          value={JSON.stringify(drafts.map(({ id, name, stars }) => ({ id, name, stars })))}
        />
        <ul className="space-y-2">
          {drafts.map((draft, index) => (
            <li key={draft.key} className="space-y-2 rounded-xl bg-chip p-2">
              <input
                type="text"
                aria-label={t.stars.form.taskName}
                maxLength={MAX_TASK_NAME}
                value={draft.name}
                placeholder={t.stars.form.taskNamePlaceholder}
                onChange={(event) => patch(draft.key, { name: event.target.value })}
                className="field"
              />
              <div className="flex items-center gap-2">
                <select
                  aria-label={t.stars.form.taskStars}
                  value={draft.stars}
                  onChange={(event) => patch(draft.key, { stars: Number(event.target.value) })}
                  className="field min-w-0 flex-1"
                >
                  {Array.from({ length: MAX_TASK_STARS }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {t.stars.form.taskStarsOption(n)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={t.stars.form.moveUp}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <span aria-hidden>↑</span>
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={t.stars.form.moveDown}
                  disabled={index === drafts.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <span aria-hidden>↓</span>
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={t.stars.form.removeTask}
                  onClick={() => setDrafts((list) => list.filter((d) => d.key !== draft.key))}
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
          disabled={drafts.length >= MAX_TASKS}
          onClick={() => setDrafts((list) => [...list, { key: crypto.randomUUID(), name: "", stars: 1 }])}
        >
          {t.stars.form.addTask}
        </button>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {track ? t.stars.form.save : t.stars.form.create}
        </button>
        <Link href="/stars" className="btn btn-secondary">
          {t.stars.form.cancel}
        </Link>
        {!pending && state.error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
