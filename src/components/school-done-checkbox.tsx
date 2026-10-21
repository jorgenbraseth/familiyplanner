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
}: {
  id: string;
  done: boolean;
  label: string;
  detail?: string | null;
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
    <label className="flex min-h-12 cursor-pointer items-start gap-1 py-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => toggle(e.target.checked)}
        aria-label={t.school.markDone(label)}
        className="m-2 size-7 shrink-0 cursor-pointer accent-green-600"
      />
      <span className={`min-w-0 flex-1 break-words py-2 text-lg ${checked ? "text-zinc-400 line-through dark:text-zinc-500" : ""}`}>
        {detail && <span className="block text-sm font-semibold text-zinc-500 dark:text-zinc-400">{detail}</span>}
        {label}
        {failed && <span className="block text-sm text-red-600 no-underline">{t.school.saveFailed}</span>}
      </span>
    </label>
  );
}
