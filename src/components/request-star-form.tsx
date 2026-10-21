"use client";

import { useActionState } from "react";
import { requestStar, type StarActionState } from "@/app/(app)/stars/actions";
import { t } from "@/lib/i18n";

const initial: StarActionState = { ok: false };

/** "Legg til stjerne": a preset reason is one tap; free text is the fallback. */
export function RequestStarForm({
  presets,
  left,
  previewing,
}: {
  presets: string[];
  left: number;
  previewing: boolean;
}) {
  const [state, formAction, pending] = useActionState(requestStar, initial);
  const disabled = previewing || left <= 0 || pending;

  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-xl font-extrabold">{t.stars.request.title}</h2>
      {previewing ? (
        <p className="text-sm font-semibold text-muted">{t.stars.request.readOnly}</p>
      ) : (
        <p className="text-sm font-bold text-muted">
          {left > 0 ? t.stars.request.leftToday(left) : t.stars.request.noneLeft}
        </p>
      )}
      {presets.length > 0 && (
        <form action={formAction} className="space-y-2">
          <p className="text-sm font-bold">{t.stars.request.presets}</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((reason) => (
              <button
                key={reason}
                type="submit"
                name="reason"
                value={reason}
                disabled={disabled}
                className="btn btn-secondary min-h-12 text-base"
              >
                {reason}
              </button>
            ))}
          </div>
        </form>
      )}
      <form action={formAction} className="space-y-2">
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
