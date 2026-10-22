import Link from "next/link";
import { decideStar } from "@/app/(app)/stars/actions";
import { MemberAvatar } from "@/components/member-avatar";
import { ParentGiveStars } from "@/components/parent-give-stars";
import { StructuredText } from "@/components/structured-text";
import { dateInTimeZone, formatDayHeading, isoWeekOf, parseDayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { ParentHome } from "@/lib/parent-home";
import { uploadHref } from "@/lib/parent-home-view";
import { formatSchoolHours, formatWeekday } from "@/lib/plan-view";

const cardTitle = "text-xl font-extrabold";

type Avatars = Record<string, string>;

function Dot({ colour, url }: { colour: string; url?: string }) {
  return <MemberAvatar colour={colour} url={url} size={url ? 28 : 14} />;
}

/** The parents' home cards for the children: give stars, pending approvals, upload, homework, notes. */
export function ParentHomeCards({ data, avatars = {} }: { data: ParentHome; avatars?: Avatars }) {
  const { children, uploadWeek } = data;
  if (children.length === 0) return <p className="card p-4 text-muted">{t.parentHome.noChildren}</p>;
  const pending = children.flatMap((c) => c.pending.map((star) => ({ star, child: c.child })));

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start 2xl:grid-cols-3">
      <section className="card space-y-3 p-4" aria-labelledby="give-title">
        <h2 id="give-title" className={cardTitle}>
          <span aria-hidden className="mr-2 text-accent">★</span>
          {t.parentHome.giveTitle}
        </h2>
        <ul className="divide-y-2 divide-line">
          {children.map(({ child, stars }) => (
            <ParentGiveStars
              key={child.id}
              child={{ id: child.id, name: child.name, colour: child.colour, avatarUrl: avatars[child.id] ?? null }}
              track={
                stars ? { id: stars.track.id, approved: stars.progress.approved, goal: stars.progress.goal, tasks: stars.tasks } : null
              }
            />
          ))}
        </ul>
      </section>

      {pending.length > 0 && (
        <section className="card space-y-3 border-accent bg-warning-soft p-4" aria-labelledby="pending-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="pending-title" className="text-xl font-extrabold text-on-warning-soft">
              {t.parentHome.pendingTitle}
            </h2>
            <Link href="/stars" className="shrink-0 text-sm font-bold text-on-warning-soft underline underline-offset-4">
              {t.stars.parent.pendingCardLink}
            </Link>
          </div>
          <ul className="space-y-3">
            {pending.map(({ star, child }) => (
              <li key={star.id} className="space-y-2 rounded-xl bg-surface p-3">
                <p className="flex items-start gap-2 break-words text-base font-bold">
                  <span className="mt-1.5"><Dot colour={child.colour} url={avatars[child.id]} /></span>
                  <span className="min-w-0 flex-1">
                    {child.name}: <span className="font-extrabold text-primary-strong">{t.stars.amount(star.amount)}</span> {star.reason}
                    <span className="block text-xs font-normal capitalize text-muted">
                      {formatDayHeading(dateInTimeZone(new Date(star.created_at)))}
                    </span>
                  </span>
                </p>
                <form action={decideStar} className="grid grid-cols-2 gap-2">
                  <input type="hidden" name="id" value={star.id} />
                  <button type="submit" name="decision" value="approve" className="btn btn-primary min-h-12 text-base">
                    {t.stars.parent.approve}
                  </button>
                  <button type="submit" name="decision" value="decline" className="btn btn-danger min-h-12 text-base">
                    {t.stars.parent.decline}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-3 p-4" aria-labelledby="upload-title">
        <h2 id="upload-title" className={cardTitle}>{t.parentHome.uploadTitle}</h2>
        <div className="flex flex-wrap gap-2">
          {children.map(({ child }) => (
            <Link key={child.id} href={uploadHref(child.id, uploadWeek)} className="btn btn-secondary min-h-12 gap-2 px-4 text-base">
              <Dot colour={child.colour} url={avatars[child.id]} />
              {t.parentHome.uploadFor(child.name, uploadWeek.isoWeek)}
            </Link>
          ))}
        </div>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="homework-title">
        <h2 id="homework-title" className={cardTitle}>{t.parentHome.homeworkTitle}</h2>
        <ul className="divide-y-2 divide-line">
          {children.map(({ child, homework, homeworkTomorrow, nextSchoolDay }) => (
            <li key={child.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <h3 className="flex items-center gap-2 text-lg font-extrabold">
                <Dot colour={child.colour} url={avatars[child.id]} />
                <span className="min-w-0 break-words">
                  {child.name}: {(homeworkTomorrow ? t.school.homeworkTomorrow : t.school.homeworkFor(formatWeekday(nextSchoolDay).toLocaleLowerCase())).toLocaleLowerCase()}
                </span>
              </h3>
              {homework.length === 0 ? (
                <p className="text-base text-muted">{t.parentHome.homeworkNone}</p>
              ) : (
                <ul className="space-y-1">
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

      <section className="card space-y-3 p-4" aria-labelledby="notes-title">
        <h2 id="notes-title" className={cardTitle}>{t.parentHome.notesTitle}</h2>
        <ul className="divide-y-2 divide-line">
          {children.map(({ child, notes }) => (
            <li key={child.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <h3 className="flex items-center gap-2 text-lg font-extrabold">
                <Dot colour={child.colour} url={avatars[child.id]} />
                <span className="min-w-0 break-words">{child.name}</span>
              </h3>
              {notes.length === 0 ? (
                <p className="text-base text-muted">{t.parentHome.notesNone}</p>
              ) : (
                notes.map((week) => (
                  <div key={week.mondayKey} className="space-y-1">
                    <h4 className="text-sm font-bold text-muted">{t.parentHome.notesWeek(isoWeekOf(week.monday).isoWeek)}</h4>
                    <ul className="space-y-1">
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
    </div>
  );
}

/** "Skolen slutter": when each child's school day ends. Shown at the top of the parents' home page. */
export function ParentSchoolEndCard({ data, avatars = {} }: { data: ParentHome; avatars?: Avatars }) {
  const { children } = data;
  if (children.length === 0) return null;

  return (
    <section className="card space-y-3 p-4" aria-labelledby="end-title">
      <h2 id="end-title" className={cardTitle}>{t.parentHome.endTitle}</h2>
      <ul className="space-y-1 md:flex md:flex-wrap md:gap-x-10 md:space-y-0">
        {children.map(({ child, schoolEnd }) => (
          <li key={child.id} className="flex items-center gap-2 text-lg">
            <Dot colour={child.colour} url={avatars[child.id]} />
            <span className="font-extrabold">{child.name}:</span>
            <span className={schoolEnd.kind === "time" ? "font-bold" : "text-muted"}>
              {schoolEnd.kind === "time" ? schoolEnd.time : schoolEnd.kind === "unknown" ? t.parentHome.endUnknown : t.parentHome.endNone}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
