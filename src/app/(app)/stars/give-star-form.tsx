"use client";

import { useActionState, useId, useRef } from "react";
import { t } from "@/lib/i18n";
import { giveStar, type StarActionState } from "./actions";

const initial: StarActionState = { ok: false };

/** A parent gives an approved star directly to a child. Preset reasons are offered as suggestions. */
export function GiveStarForm({ childId, presets }: { childId: string; presets: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const [state, formAction, pending] = useActionState(async (prev: StarActionState, formData: FormData) => {
    const result = await giveStar(prev, formData);
    if (result.ok) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="child" value={childId} />
      <label className="block space-y-1 text-sm font-bold">
        <span>{t.stars.parent.giveReason}</span>
        <input
          type="text"
          name="reason"
          required
          maxLength={120}
          list={listId}
          placeholder={t.stars.parent.giveReasonPlaceholder}
          className="field"
        />
        <datalist id={listId}>
          {presets.map((reason) => (
            <option key={reason} value={reason} />
          ))}
        </datalist>
      </label>
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
