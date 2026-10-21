import Link from "next/link";
import { StarBar } from "@/components/star-progress";
import { t } from "@/lib/i18n";
import type { ChildStars } from "@/lib/star-data";
import { rewardTextAt } from "@/lib/stars";

/** Compact star card for the Meg page. */
export function StarCard({ data }: { data: ChildStars }) {
  const { track, progress } = data;
  const reward =
    progress.nextMilestone === null ? null : rewardTextAt(track, progress.nextMilestone) || t.stars.rewardFallback;
  return (
    <Link href="/stars" className="card block space-y-2 p-4 hover:bg-chip">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate text-xl font-extrabold">
          <span aria-hidden className="mr-2 text-accent">★</span>
          {track.name}
        </h2>
        <span className="shrink-0 text-sm font-bold text-muted">{t.stars.starCount(progress.approved, progress.goal)}</span>
      </div>
      <StarBar approved={progress.approved} goal={progress.goal} />
      <p className="text-sm font-bold text-primary-strong">
        {reward !== null ? t.stars.toNext(progress.starsToNext, reward) : t.stars.goalReached}
      </p>
    </Link>
  );
}
