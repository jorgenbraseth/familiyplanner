import Link from "next/link";
import { StarBar } from "@/components/star-progress";
import { StarHistory } from "@/components/star-history";
import { dateInTimeZone, formatDayHeading } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { ChildWithStars } from "@/lib/star-data";
import { completeTrack, decideStar, markRewardGiven } from "./actions";
import { GiveStarForm } from "./give-star-form";

const sectionTitle = "text-lg font-extrabold";

/** The parent's /stars screen: one section per child. */
export function StarParentView({ rows }: { rows: ChildWithStars[] }) {
  if (rows.length === 0) return <p className="text-muted">{t.stars.parent.noChildren}</p>;
  return (
    <div className="space-y-6">
      <Link href="/stars/tasks" className="btn btn-secondary">
        {t.stars.parent.tasksLink}
      </Link>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start 2xl:grid-cols-3">
      {rows.map(({ child, active, completed }) => {
        const pending = active?.stars.filter((s) => s.status === "pending").reverse() ?? [];
        const decided = active?.stars.filter((s) => s.status !== "pending") ?? [];
        return (
          <section key={child.id} className="card space-y-4 p-4">
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-2xl font-extrabold">
                <span aria-hidden className="size-4 shrink-0 rounded-full" style={{ backgroundColor: child.colour }} />
                {child.name}
              </h2>
              {active ? (
                <>
                  <p className="font-bold break-words">{active.track.name}</p>
                  <StarBar approved={active.progress.approved} goal={active.progress.goal} />
                  <p className="text-sm font-bold text-muted">
                    {t.stars.parent.summary(active.progress.approved, active.progress.goal, active.progress.pending)}
                  </p>
                </>
              ) : (
                <p className="text-muted">{t.stars.parent.noTrack}</p>
              )}
            </div>

            {active && pending.length > 0 && (
              <div className="space-y-3">
                <h3 className={sectionTitle}>{t.stars.parent.pendingTitle}</h3>
                <ul className="space-y-3">
                  {pending.map((star) => (
                    <li key={star.id} className="space-y-2 rounded-xl bg-warning-soft p-3">
                      <p className="break-words text-lg font-bold text-on-warning-soft">
                        <span className="mr-2 font-extrabold">{t.stars.amount(star.amount)}</span>
                        {star.reason}
                      </p>
                      <p className="text-xs capitalize text-on-warning-soft">
                        {formatDayHeading(dateInTimeZone(new Date(star.created_at)))}
                      </p>
                      <form action={decideStar} className="space-y-2">
                        <input type="hidden" name="id" value={star.id} />
                        <input
                          type="text"
                          name="note"
                          maxLength={200}
                          aria-label={t.stars.parent.noteLabel}
                          placeholder={t.stars.parent.notePlaceholder}
                          className="field"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button type="submit" name="decision" value="approve" className="btn btn-primary min-h-14 text-base">
                            {t.stars.parent.approve}
                          </button>
                          <button type="submit" name="decision" value="decline" className="btn btn-danger min-h-14 text-base">
                            {t.stars.parent.decline}
                          </button>
                        </div>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {active && active.progress.rewardsOwed.length > 0 && (
              <div className="space-y-2">
                <h3 className={sectionTitle}>{t.stars.parent.rewardsOwedTitle}</h3>
                <ul className="space-y-2">
                  {active.progress.rewardsOwed.map((reward) => (
                    <li key={reward.atCount} className="flex items-center gap-3 rounded-xl bg-chip p-3">
                      <span aria-hidden>🎁</span>
                      <span className="min-w-0 flex-1 break-words font-bold">
                        {t.stars.parent.rewardOwed(reward.atCount, reward.text || t.stars.rewardFallback)}
                      </span>
                      <form action={markRewardGiven}>
                        <input type="hidden" name="track" value={active.track.id} />
                        <input type="hidden" name="at_count" value={reward.atCount} />
                        <button type="submit" className="btn btn-primary">
                          {t.stars.parent.markGiven}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {active && (
              <div className="space-y-2">
                <h3 className={sectionTitle}>{t.stars.parent.giveTitle}</h3>
                <GiveStarForm childId={child.id} tasks={active.tasks} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4">
              {active ? (
                <Link
                  href={`/stars/${active.track.id}/edit`}
                  className="inline-flex min-h-11 items-center text-base font-bold text-primary-strong underline underline-offset-4"
                >
                  {t.stars.parent.editTrack}
                </Link>
              ) : (
                <Link href={`/stars/new?child=${child.id}`} className="btn btn-primary">
                  {t.stars.parent.newTrack}
                </Link>
              )}
              <Link
                href={`/stars/routines/${child.id}`}
                className="inline-flex min-h-11 items-center text-base font-bold text-primary-strong underline underline-offset-4"
              >
                {t.routines.admin.link}
              </Link>
            </div>

            {active && (
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-base font-bold text-primary-strong">
                  {t.stars.parent.completeTrack}
                </summary>
                <form action={completeTrack} className="space-y-2 pt-1">
                  <input type="hidden" name="id" value={active.track.id} />
                  <p className="text-sm">{t.stars.parent.completeConfirm}</p>
                  <button type="submit" className="btn btn-danger">
                    {t.stars.parent.completeYes}
                  </button>
                </form>
              </details>
            )}

            {active && (
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-base font-bold text-primary-strong">
                  {t.stars.parent.history}
                </summary>
                <div className="pt-1">
                  <StarHistory stars={decided} canUndo empty={t.stars.parent.noHistory} />
                </div>
              </details>
            )}

            {completed.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-muted">{t.stars.parent.completedTracks}</h3>
                <ul className="text-sm text-muted">
                  {completed.map((track) => (
                    <li key={track.id} className="break-words">
                      {track.name}
                      {track.completed_at && ` · ${formatDayHeading(dateInTimeZone(new Date(track.completed_at)))}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
      </div>
    </div>
  );
}
