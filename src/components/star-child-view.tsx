import { RequestStarForm } from "@/components/request-star-form";
import { StarBar, StarGrid } from "@/components/star-progress";
import { StarHistory } from "@/components/star-history";
import { t } from "@/lib/i18n";
import type { ChildStars } from "@/lib/star-data";
import { celebratingReward, rewardTextAt } from "@/lib/stars";

const HISTORY_LIMIT = 15;

/** The child's /stars screen. Also used by a parent previewing (`previewing` disables requests). */
export function StarChildView({
  data,
  previewing,
}: {
  data: ChildStars | null;
  previewing: boolean;
}) {
  if (!data) {
    return (
      <section className="space-y-2 py-6 text-center">
        <p className="text-5xl" aria-hidden>
          ☆
        </p>
        <p className="text-lg font-bold">{t.stars.empty}</p>
      </section>
    );
  }

  const { track, progress, stars, tasks } = data;
  const celebrating = celebratingReward(progress, Math.max(1, ...tasks.map((task) => task.stars)));
  const nextReward =
    progress.nextMilestone === null
      ? null
      : rewardTextAt(track, progress.nextMilestone) || t.stars.rewardFallback;

  return (
    <>
      {previewing && <p className="text-sm font-semibold text-muted">{t.stars.readOnlyNote}</p>}
      {celebrating && (
        <section className="celebrate space-y-1 rounded-3xl p-5 text-center" role="status">
          <p className="text-5xl" aria-hidden>
            <span className="celebrate-star">🎉</span>
          </p>
          <h2 className="text-2xl font-extrabold">{t.stars.celebrateTitle(celebrating.atCount)}</h2>
          <p className="text-lg font-bold">{t.stars.celebrateBody(celebrating.text || t.stars.rewardFallback)}</p>
        </section>
      )}
      <div className="grid gap-12 lg:grid-cols-2 lg:items-start xl:grid-cols-3">
      <section className="space-y-3">
        <h2 className="text-2xl font-bold break-words">{track.name}</h2>
        <p className="text-lg font-bold">{t.stars.starCount(progress.approved, progress.goal)}</p>
        <StarBar approved={progress.approved} goal={progress.goal} />
        <StarGrid track={track} progress={progress} />
        {nextReward !== null && progress.nextMilestone !== null ? (
          <p className="text-base font-bold text-primary-strong">{t.stars.toNext(progress.starsToNext, nextReward)}</p>
        ) : (
          <p className="text-base font-bold text-primary-strong">{t.stars.goalReached}</p>
        )}
        {track.big_reward && progress.nextMilestone !== track.goal && !progress.complete && (
          <p className="text-sm text-muted">{t.stars.bigAt(track.goal, track.big_reward)}</p>
        )}
        {progress.pending > 0 && <p className="text-sm text-muted">{t.stars.pendingShort(progress.pending)}</p>}
      </section>
      {(progress.rewardsOwed.length > 0 || progress.rewardsGiven.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-2xl font-bold">{t.stars.rewardsTitle}</h2>
          <ul className="space-y-1">
            {progress.rewardsOwed.map((r) => (
              <li key={r.atCount} className="font-bold text-on-warning-soft">
                🎁 {t.stars.rewardOwedChild(r.text || t.stars.rewardFallback)}
              </li>
            ))}
            {progress.rewardsGiven.map((r) => (
              <li key={r.atCount} className="text-muted">
                {t.stars.rewardGivenChild(r.text || t.stars.rewardFallback)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <RequestStarForm tasks={tasks} previewing={previewing} />
      <section className="space-y-2">
        <h2 className="text-2xl font-bold">{t.stars.historyTitle}</h2>
        <StarHistory stars={stars.slice(0, HISTORY_LIMIT)} empty={t.stars.historyEmpty} />
      </section>
      </div>
    </>
  );
}
