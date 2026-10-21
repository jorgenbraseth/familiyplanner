import { undoDecision } from "@/app/(app)/stars/actions";
import { dateInTimeZone, formatDayHeading } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { StarRow } from "@/lib/stars";

const statusStyle = {
  pending: "bg-chip text-chip-ink",
  approved: "bg-primary text-on-primary",
  declined: "bg-danger-soft text-on-danger-soft",
} as const;

/** Stars, newest first: reason, status, parent note. Parents get an "Angre" button on decided stars. */
export function StarHistory({ stars, canUndo = false, empty }: { stars: StarRow[]; canUndo?: boolean; empty: string }) {
  if (stars.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y-2 divide-line">
      {stars.map((star) => (
        <li key={star.id} className="flex items-start gap-3 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="break-words font-semibold">
              <span className="mr-2 font-extrabold text-primary-strong">{t.stars.amount(star.amount)}</span>
              {star.reason}
            </p>
            <p className="text-xs text-muted capitalize">{formatDayHeading(dateInTimeZone(new Date(star.created_at)))}</p>
            {star.note && <p className="break-words text-sm text-muted">«{star.note}»</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle[star.status]}`}>
              {t.stars.status[star.status]}
            </span>
            {canUndo && star.status !== "pending" && (
              <form action={undoDecision}>
                <input type="hidden" name="id" value={star.id} />
                <button type="submit" className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-primary-strong underline underline-offset-4">
                  {t.stars.parent.undo}
                </button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
