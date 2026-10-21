"use client";

import { useActionState, useRef } from "react";
import { formatDayHeading, parseDayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { PLAN_ITEM_KINDS, type PlanItemRow } from "@/lib/plan";
import { deleteItem, saveItem, type SaveItemState } from "../actions";

const initial: SaveItemState = { ok: false };

const input =
  "min-h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700";
const label = "block space-y-1 text-sm font-medium";

type ItemFields = Pick<PlanItemRow, "id" | "date" | "kind" | "subject" | "text">;

/** Edits one plan item, or adds a new one when `item` is missing (then `documentId` is required). */
export function ItemForm({
  item,
  documentId,
  days,
  defaultDate,
}: {
  item?: ItemFields;
  documentId: string;
  days: string[];
  defaultDate?: string;
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

  return (
    <div className="space-y-2">
      <form ref={formRef} action={formAction} className="space-y-3">
        {item ? <input type="hidden" name="id" value={item.id} /> : <input type="hidden" name="document_id" value={documentId} />}
        <div className="flex gap-3">
          <label className={`${label} flex-1`}>
            <span>{t.documents.fields.date}</span>
            <select name="date" defaultValue={item?.date ?? defaultDate ?? days[0]} className={input}>
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
              {PLAN_ITEM_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t.documents.kinds[kind]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={label}>
          <span>{t.documents.fields.subject}</span>
          <input type="text" name="subject" maxLength={100} defaultValue={item?.subject ?? ""} className={input} />
        </label>
        <label className={label}>
          <span>{t.documents.fields.text}</span>
          <textarea
            name="text"
            required
            maxLength={1000}
            rows={3}
            defaultValue={item?.text ?? ""}
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-base dark:border-zinc-700"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {item ? t.documents.save : t.documents.addItem}
          </button>
          {!pending && state.error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {state.error}
            </p>
          )}
          {!pending && state.ok && (
            <p role="status" className="text-sm text-green-700 dark:text-green-300">
              {t.documents.saved}
            </p>
          )}
        </div>
      </form>
      {item && (
        <form action={deleteItem}>
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            {t.documents.deleteItem}
          </button>
        </form>
      )}
    </div>
  );
}
