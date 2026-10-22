"use client";

import { useState, useTransition } from "react";
import { setPlanItemDone } from "@/app/(app)/school-actions";
import { flattenItemText } from "@/lib/item-text";
import { t } from "@/lib/i18n";
import { StructuredText } from "./structured-text";

/** A big tick box (44px+ touch target) with the item text. Updates at once, reverts if saving fails. */
export function SchoolDoneCheckbox({
  id,
  done,
  label,
  detail,
  readOnly = false,
  large = false,
}: {
  id: string;
  done: boolean;
  label: string;
  detail?: string | null;
  /** Preview mode: shown but can't be changed. */
  readOnly?: boolean;
  /** Bigger text for the Lekser page. */
  large?: boolean;
}) {
  const [checked, setChecked] = useState(done);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  function toggle(next: boolean) {
    const previous = checked;
    setChecked(next);
    setFailed(false);
    startTransition(async () => {
      let ok = false;
      try {
        ok = (await setPlanItemDone(id, next)).ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        setChecked(previous);
        setFailed(true);
      }
    });
  }

  return (
    <label className={`flex min-h-12 items-start gap-1 py-0.5 ${readOnly ? "" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={readOnly}
        onChange={(e) => toggle(e.target.checked)}
        aria-label={t.school.markDone(flattenItemText(label))}
        className={`tick m-2 ${large ? "size-9" : "size-7"} shrink-0 ${readOnly ? "opacity-70" : "cursor-pointer"}`}
      />
      <div className={`min-w-0 flex-1 break-words py-2 ${large ? "text-2xl font-semibold" : "text-lg"} ${checked ? "text-muted line-through" : ""}`}>
        {detail && <span className={`block ${large ? "text-xl font-extrabold text-ink" : "text-sm font-semibold text-muted"}`}>{detail}</span>}
        <StructuredText text={label} />
        {failed && <span className="block text-sm font-semibold text-danger no-underline">{t.school.saveFailed}</span>}
      </div>
    </label>
  );
}
