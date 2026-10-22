import Link from "next/link";
import { decideStar } from "@/app/(app)/stars/actions";
import { MemberAvatar } from "@/components/member-avatar";
import { ParentGiveStars } from "@/components/parent-give-stars";
import { StructuredText } from "@/components/structured-text";
import { dateInTimeZone, formatDayHeading, isoWeekOf, parseDayKey } from "@/lib/dates";
import { tintStyle } from "@/lib/colour";
import { t } from "@/lib/i18n";
import type { ParentHome } from "@/lib/parent-home";
import { uploadHref } from "@/lib/parent-home-view";
import { formatSchoolHours, formatWeekday } from "@/lib/plan-view";
import { rewardTextAt } from "@/lib/stars";

const sectionTitle = "text-2xl font-bold";

type Avatars = Record<string, string>;

function Dot({ colour, url }: { colour: string; url?: string }) {
  return <MemberAvatar colour={colour} url={url} size={url ? 28 : 14} />;
}

/**
 * The parents' home, top row (Layout E): pending star approvals (the one tinted attention block), when school ends
 * and the stars per child, as flat tiles tinted with each child's colour.
 */
export function ParentHomeTop({ data, avatars = {} }: { data: ParentHome; avatars?: Avatars }) {
  const { children } = data;
  if (children.length === 0) return <p className="text-muted">{t.parentHome.noChildren}</p>;
  const pending = children.flatMap((c) => c.pending.map((star) => ({ star, child: c.child })));

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-12 md:gap-10">
      {pending.length > 0 && (
        <section className="space-y-5 rounded-3xl bg-warning-soft p-5 md:p-6" aria-labelledby="pending-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="pending-title" className="text-xl font-bold text-on-warning-soft">
              {t.parentHome.pendingTitle}
            </h2>
            <Link href="/stars" className="shrink-0 text-sm font-bold text-on-warning-soft underline underline-offset-4">
              {t.stars.parent.pendingCardLink}
            </Link>
          </div>
          <ul className="space-y-5">
            {pending.map(({ star, child }) => (
              <li key={star.id} className="space-y-3">
                <p className="flex items-start gap-2 break-words text-lg font-bold">
                  <span className="mt-2"><Dot colour={child.colour} url={avatars[child.id]} /></span>
                  <span className="min-w-0 flex-1">
                    {child.name}: <span className="font-extrabold">{t.stars.amount(star.amount)}</span> {star.reason}
                    <span className="block text-sm font-semibold capitalize text-on-warning-soft">
                      {formatDayHeading(dateInTimeZone(new Date(star.created_at)))}
                    </span>
                  </span>
                </p>
                <form action={decideStar} className="flex items-center gap-3">
                  <input type="hidden" name="id" value={star.id} />
                  <button type="submit" name="decision" value="approve" className="btn btn-primary min-h-12 px-7 text-base">
                    {t.stars.parent.approve}
                  </button>
                  <button type="submit" name="decision" value="decline" className="btn btn-text min-h-11 text-base text-on-warning-soft">
                    {t.stars.parent.decline}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="end-title">
        <h2 id="end-title" className={`${sectionTitle} flex min-h-11 items-center`}>{t.parentHome.endTitle}</h2>
        <ul className="mt-1 flex flex-wrap gap-3">
          {children.map(({ child, schoolEnd }) => (
            <li key={child.id} className="min-w-32 flex-1 rounded-3xl px-5 py-4" style={tintStyle(child.colour)}>
              <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                <Dot colour={child.colour} url={avatars[child.id]} />
                <span className="min-w-0 break-words">{child.name}</span>
              </p>
              {schoolEnd.kind === "time" ? (
                <p className="font-display text-4xl font-bold leading-tight tabular-nums">{schoolEnd.time}</p>
              ) : (
                <p className="mt-1 text-lg font-bold text-muted">
                  {schoolEnd.kind === "unknown" ? t.parentHome.endUnknown : t.parentHome.endNone}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="give-title">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h2 id="give-title" className={sectionTitle}>{t.parentHome.starsTitle}</h2>
          <Link href="/stars" className="btn btn-text text-base">{t.parentHome.giveLink}</Link>
        </div>
        <ul className="mt-1 flex flex-col gap-3 sm:flex-row sm:flex-wrap [&>li]:sm:min-w-56 [&>li]:sm:flex-1">
          {children.map(({ child, stars }) => (
            <ParentGiveStars
              key={child.id}
              child={{ id: child.id, name: child.name, colour: child.colour, avatarUrl: avatars[child.id] ?? null }}
              track={
                stars
                  ? {
                      id: stars.track.id,
                      approved: stars.progress.approved,
                      goal: stars.progress.goal,
                      reward: rewardTextAt(stars.track, stars.progress.nextMilestone ?? stars.track.goal) || null,
                      tasks: stars.tasks,
                    }
                  : null
              }
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The parents' home, lower part: homework, notes from school and the upload links (plain, no boxes). */
export function ParentHomeCards({ data, avatars = {} }: { data: ParentHome; avatars?: Avatars }) {
  const { children, uploadWeek } = data;
  if (children.length === 0) return null;

  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:items-start 2xl:grid-cols-3">
      <section aria-labelledby="homework-title" className="space-y-4">
        <h2 id="homework-title" className={sectionTitle}>{t.parentHome.homeworkTitle}</h2>
        <ul className="space-y-6">
          {children.map(({ child, homework, homeworkTomorrow, nextSchoolDay }) => (
            <li key={child.id} className="space-y-1">
              <h3 className="flex items-center gap-2 text-lg font-extrabold">
                <Dot colour={child.colour} url={avatars[child.id]} />
                <span className="min-w-0 break-words">
                  {child.name}: {(homeworkTomorrow ? t.school.homeworkTomorrow : t.school.homeworkFor(formatWeekday(nextSchoolDay).toLocaleLowerCase())).toLocaleLowerCase()}
                </span>
              </h3>
              {homework.length === 0 ? (
                <p className="text-base text-muted">{t.parentHome.homeworkNone}</p>
              ) : (
                <ul className="space-y-2">
                  {homework.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 text-base">
                      <span
                        role="img"
                        aria-label={item.done ? t.parentHome.homeworkDone : t.parentHome.homeworkNotDone}
                        className="w-5 shrink-0 text-center font-extrabold text-primary-strong"
                      >
                        {item.done ? "✓" : "○"}
                      </span>
                      <div className="min-w-0 break-words">
                        {item.subject && <span className="block font-extrabold">{item.subject}</span>}
                        <StructuredText text={item.text} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="notes-title" className="space-y-4">
        <h2 id="notes-title" className={sectionTitle}>{t.parentHome.notesTitle}</h2>
        <ul className="space-y-6">
          {children.map(({ child, notes }) => (
            <li key={child.id} className="space-y-2">
              <h3 className="flex items-center gap-2 text-lg font-extrabold">
                <Dot colour={child.colour} url={avatars[child.id]} />
                <span className="min-w-0 break-words">{child.name}</span>
              </h3>
              {notes.length === 0 ? (
                <p className="text-base text-muted">{t.parentHome.notesNone}</p>
              ) : (
                notes.map((week) => (
                  <div key={week.mondayKey} className="space-y-2">
                    <h4 className="text-sm font-bold text-muted">{t.parentHome.notesWeek(isoWeekOf(week.monday).isoWeek)}</h4>
                    <ul className="space-y-3">
                      {week.entries.map((item) => {
                        const time = item.kind === "event" ? formatSchoolHours(item.starts_at, item.ends_at) : null;
                        return (
                          <li key={item.id} className="text-base">
                            <span className="block text-xs capitalize text-muted">
                              {[item.whole_week ? t.parentHome.notesWholeWeek : formatDayHeading(parseDayKey(item.date)), time]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            <div className="break-words">
                              {item.subject && <span className="block font-extrabold">{item.subject}</span>}
                              <StructuredText text={item.text} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="upload-title">
        <h2 id="upload-title" className={`${sectionTitle} flex min-h-11 items-center`}>{t.parentHome.uploadTitle}</h2>
        <div className="flex flex-col items-start">
          {children.map(({ child }) => (
            <Link key={child.id} href={uploadHref(child.id, uploadWeek)} className="btn btn-text justify-start px-0 text-base">
              {t.parentHome.uploadLink(child.name, uploadWeek.isoWeek)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
