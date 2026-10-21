import { t } from "@/lib/i18n";
import { milestonesOf, type StarTrackRow, type TrackProgress } from "@/lib/stars";

/** A thick progress bar of approved stars towards the goal. */
export function StarBar({ approved, goal }: { approved: number; goal: number }) {
  const percent = goal > 0 ? Math.min(100, Math.round((approved / goal) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={approved}
      aria-label={t.stars.starCount(approved, goal)}
      className="h-4 w-full overflow-hidden rounded-full bg-chip"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** One cell per star up to the goal: approved filled, pending outlined, the rest faint. Milestones sit on a chip. */
export function StarGrid({ track, progress }: { track: StarTrackRow; progress: TrackProgress }) {
  const milestones = new Set(milestonesOf(track));
  return (
    <ol
      aria-label={t.stars.gridLabel(progress.approved, progress.pending, track.goal)}
      className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1"
    >
      {Array.from({ length: track.goal }, (_, i) => {
        const n = i + 1;
        const state = n <= progress.approved ? "approved" : n <= progress.approved + progress.pending ? "pending" : "empty";
        return (
          <li
            key={n}
            aria-hidden
            className={`flex aspect-square items-center justify-center rounded-lg text-2xl leading-none ${
              milestones.has(n) ? "bg-chip" : ""
            } ${state === "empty" ? "text-line" : "text-accent"}`}
          >
            {state === "pending" ? "☆" : "★"}
          </li>
        );
      })}
    </ol>
  );
}
