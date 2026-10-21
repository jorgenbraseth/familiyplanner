"use client";

import { useState, useTransition } from "react";
import { setPlanItemDone } from "@/app/(app)/school-actions";
import { t } from "@/lib/i18n";

/** A big tick box (44px+ touch target) with the item text. Updates at once, reverts if saving fails. */
export function SchoolDoneCheckbox({
  id,
  done,
  label,
  detail,
  readOnly = false,
}: {
  id: string;
  done: boolean;
  label: string;
  detail?: string | null;
  /** Preview mode: shown but can't be changed. */
  readOnly?: boolean;
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
        aria-label={t.school.markDone(label)}
        className={`tick m-2 size-7 shrink-0 ${readOnly ? "opacity-70" : "cursor-pointer"}`}
      />
      <span className={`min-w-0 flex-1 break-words py-2 text-lg ${checked ? "text-muted line-through" : ""}`}>
        {detail && <span className="block text-sm font-semibold text-muted">{detail}</span>}
        {label}
        {failed && <span className="block text-sm font-semibold text-danger no-underline">{t.school.saveFailed}</span>}
      </span>
    </label>
  );
}
