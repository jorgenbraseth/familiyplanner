"use client";

import { useActionState } from "react";
import { t } from "@/lib/i18n";
import { saveSchoolDay, type SaveItemState } from "../actions";

const initial: SaveItemState = { ok: false };

/** Edits when school starts and ends on one day ("HH:MM" or "HH:MM:SS"; empty = unknown). */
export function SchoolDayForm({
  documentId,
  date,
  startsAt,
  endsAt,
}: {
  documentId: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveSchoolDay, initial);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="date" value={date} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 space-y-1 text-sm font-bold">
          <span>{t.documents.schoolStarts}</span>
          <input
            type="time"
            name="starts_at"
            defaultValue={startsAt?.slice(0, 5) ?? ""}
            className="field"
          />
        </label>
        <label className="block flex-1 space-y-1 text-sm font-bold">
          <span>{t.documents.schoolEnds}</span>
          <input
            type="time"
            name="ends_at"
            defaultValue={endsAt?.slice(0, 5) ?? ""}
            className="field"
          />
        </label>
        <button type="submit" disabled={pending} className="btn btn-secondary">
          {t.documents.save}
        </button>
      </div>
      {!pending && state.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
      {!pending && state.ok && (
        <p role="status" className="text-sm font-bold text-primary-strong">
          {t.documents.saved}
        </p>
      )}
    </form>
  );
}
