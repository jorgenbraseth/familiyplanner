"use client";

import { useActionState, useRef } from "react";
import { t } from "@/lib/i18n";
import {
  deleteTimetablePeriod,
  saveTimetableDay,
  saveTimetablePeriod,
  type SaveItemState,
} from "../actions";

const initial: SaveItemState = { ok: false };
const input = "field";
const label = "block space-y-1 text-sm font-bold";

function Feedback({ pending, state }: { pending: boolean; state: SaveItemState }) {
  return (
    <>
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
    </>
  );
}

/** School start and end for one weekday ("HH:MM" or "HH:MM:SS"; both empty = no school that day). */
export function TimetableDayForm({
  documentId,
  weekday,
  startsAt,
  endsAt,
}: {
  documentId: string;
  weekday: number;
  startsAt: string | null;
  endsAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveTimetableDay, initial);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="weekday" value={weekday} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${label} flex-1`}>
          <span>{t.documents.schoolStarts}</span>
          <input type="time" name="starts_at" defaultValue={startsAt?.slice(0, 5) ?? ""} className={input} />
        </label>
        <label className={`${label} flex-1`}>
          <span>{t.documents.schoolEnds}</span>
          <input type="time" name="ends_at" defaultValue={endsAt?.slice(0, 5) ?? ""} className={input} />
        </label>
        <button type="submit" disabled={pending} className="btn btn-secondary">
          {t.documents.save}
        </button>
      </div>
      <Feedback pending={pending} state={state} />
    </form>
  );
}

type PeriodFields = {
  id: string;
  period: number | null;
  starts_at: string | null;
  ends_at: string | null;
  subject: string;
};

/** Edits one period, or adds one to `weekday` when `period` is missing (then `documentId` is required). */
export function PeriodForm({
  documentId,
  weekday,
  period,
}: {
  documentId: string;
  weekday: number;
  period?: PeriodFields;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: SaveItemState, formData: FormData) => {
      const result = await saveTimetablePeriod(prev, formData);
      if (result.ok && !period) formRef.current?.reset();
      return result;
    },
    initial,
  );
  return (
    <div className="space-y-2">
      <form ref={formRef} action={formAction} className="space-y-3">
        {period ? (
          <input type="hidden" name="id" value={period.id} />
        ) : (
          <input type="hidden" name="document_id" value={documentId} />
        )}
        <input type="hidden" name="weekday" value={weekday} />
        <div className="flex gap-3">
          <label className={`${label} w-24`}>
            <span>{t.documents.fields.period}</span>
            <input
              type="number"
              name="period"
              min={1}
              max={15}
              step={1}
              inputMode="numeric"
              defaultValue={period?.period ?? ""}
              className={input}
            />
          </label>
          <label className={`${label} flex-1`}>
            <span>{t.documents.fields.subject}</span>
            <input
              type="text"
              name="subject"
              required
              maxLength={100}
              defaultValue={period?.subject ?? ""}
              className={input}
            />
          </label>
        </div>
        <div className="flex gap-3">
          <label className={`${label} flex-1`}>
            <span>{t.documents.fields.starts}</span>
            <input type="time" name="starts_at" defaultValue={period?.starts_at?.slice(0, 5) ?? ""} className={input} />
          </label>
          <label className={`${label} flex-1`}>
            <span>{t.documents.fields.ends}</span>
            <input type="time" name="ends_at" defaultValue={period?.ends_at?.slice(0, 5) ?? ""} className={input} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {period ? t.documents.save : t.documents.addPeriod}
          </button>
          <Feedback pending={pending} state={state} />
        </div>
      </form>
      {period && (
        <form action={deleteTimetablePeriod}>
          <input type="hidden" name="id" value={period.id} />
          <button type="submit" className="btn btn-danger">
            {t.documents.deletePeriod}
          </button>
        </form>
      )}
    </div>
  );
}
