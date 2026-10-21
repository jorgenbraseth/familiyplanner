"use client";

import Link from "next/link";
import { useActionState } from "react";
import { t } from "@/lib/i18n";
import type { StarTrackRow } from "@/lib/stars";
import { createTrack, updateTrack, type StarActionState } from "./actions";

const initial: StarActionState = { ok: false };
const label = "block space-y-1 text-sm font-bold";
const help = "block text-xs font-normal text-muted";

/** Create (`childId`) or edit (`track`) a star track. Both actions redirect to /stars on success. */
export function TrackForm({ childId, track }: { childId?: string; track?: StarTrackRow }) {
  const [state, formAction, pending] = useActionState(track ? updateTrack : createTrack, initial);
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
      <label className={label}>
        <span>{t.stars.form.presets}</span>
        <textarea
          name="preset_reasons"
          rows={6}
          defaultValue={(track?.preset_reasons ?? []).join("\n")}
          className="field py-2"
        />
        <span className={help}>{t.stars.form.presetsHelp}</span>
      </label>
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
