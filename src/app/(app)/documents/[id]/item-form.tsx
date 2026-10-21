"use client";

import { useActionState, useRef } from "react";
import { formatDayHeading, parseDayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { PLAN_AUDIENCES, type PlanAudience, type PlanItemKind, type PlanItemRow } from "@/lib/plan";
import { deleteItem, saveItem, type SaveItemState } from "../actions";

const initial: SaveItemState = { ok: false };

const input = "field";
const label = "block space-y-1 text-sm font-bold";

type ItemFields = Pick<
  PlanItemRow,
  "id" | "date" | "kind" | "subject" | "text" | "audience" | "whole_week" | "starts_at" | "ends_at"
>;

const EDITABLE_KINDS: PlanItemKind[] = ["homework", "event", "message"];

/** Edits one ukeplan item, or adds a new one when `item` is missing (then `documentId` is required). */
export function ItemForm({
  item,
  documentId,
  days,
  defaultDay,
  defaultAudience = "child",
}: {
  item?: ItemFields;
  documentId: string;
  days: string[];
  /** "whole" or a day key. */
  defaultDay?: string;
  defaultAudience?: PlanAudience;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: SaveItemState, formData: FormData) => {
      const result = await saveItem(prev, formData);
      if (result.ok && !item) formRef.current?.reset();
      return result;
    },
    initial,
  );
  const kinds = item?.kind === "lesson" ? [...EDITABLE_KINDS, "lesson" as const] : EDITABLE_KINDS;

  return (
    <div className="space-y-2">
      <form ref={formRef} action={formAction} className="space-y-3">
        {item ? (
          <input type="hidden" name="id" value={item.id} />
        ) : (
          <input type="hidden" name="document_id" value={documentId} />
        )}
        <div className="flex gap-3">
          <label className={`${label} flex-1`}>
            <span>{t.documents.fields.date}</span>
            <select
              name="day"
              defaultValue={item ? (item.whole_week ? "whole" : item.date) : (defaultDay ?? "whole")}
              className={input}
            >
              <option value="whole">{t.documents.wholeWeek}</option>
              {days.map((day) => (
                <option key={day} value={day}>
                  {formatDayHeading(parseDayKey(day))}
                </option>
              ))}
            </select>
          </label>
          <label className={`${label} flex-1`}>
            <span>{t.documents.fields.kind}</span>
            <select name="kind" defaultValue={item?.kind ?? "homework"} className={input}>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t.documents.kinds[kind]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-3">
          <label className={`${label} flex-1`}>
            <span>{t.documents.audience}</span>
            <select
              name="audience"
              defaultValue={item?.audience ?? defaultAudience}
              className={input}
            >
              {PLAN_AUDIENCES.map((audience) => (
                <option key={audience} value={audience}>
                  {t.documents.audiences[audience]}
                </option>
              ))}
            </select>
          </label>
          <label className={`${label} flex-1`}>
            <span>{t.documents.fields.subject}</span>
            <input
              type="text"
              name="subject"
              maxLength={100}
              defaultValue={item?.subject ?? ""}
              className={input}
            />
          </label>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold">{t.documents.eventTime}</p>
          <div className="flex gap-3">
            <label className="block flex-1 space-y-1 text-sm font-bold">
              <span className="sr-only">{t.documents.fields.starts}</span>
              <input
                type="time"
                name="starts_at"
                aria-label={t.documents.fields.starts}
                defaultValue={item?.starts_at?.slice(0, 5) ?? ""}
                className={input}
              />
            </label>
            <label className="block flex-1 space-y-1 text-sm font-bold">
              <span className="sr-only">{t.documents.fields.ends}</span>
              <input
                type="time"
                name="ends_at"
                aria-label={t.documents.fields.ends}
                defaultValue={item?.ends_at?.slice(0, 5) ?? ""}
                className={input}
              />
            </label>
          </div>
        </div>
        <label className={label}>
          <span>{t.documents.fields.text}</span>
          <textarea
            name="text"
            required
            maxLength={1000}
            rows={3}
            defaultValue={item?.text ?? ""}
            className="field py-2"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {item ? t.documents.save : t.documents.addItem}
          </button>
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
        </div>
      </form>
      {item && (
        <form action={deleteItem}>
          <input type="hidden" name="id" value={item.id} />
          <button type="submit" className="btn btn-danger">
            {t.documents.deleteItem}
          </button>
        </form>
      )}
    </div>
  );
}
