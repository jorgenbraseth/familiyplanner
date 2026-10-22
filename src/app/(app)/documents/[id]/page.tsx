import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth";
import {
  dateInTimeZone,
  dayKey,
  formatDayHeading,
  parseDayKey,
} from "@/lib/dates";
import { allowedItemDays } from "@/lib/documents";
import { locale, t } from "@/lib/i18n";
import type {
  DocumentRow,
  PlanAudience,
  PlanItemRow,
  TimetableDayRow,
  TimetablePeriodRow,
} from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { publishDocument } from "../actions";
import { StatusBadge } from "../status-badge";
import { DeleteDocumentButton } from "./delete-document-button";
import { ItemForm } from "./item-form";
import { ProcessButton } from "./process-button";
import { PeriodForm, TimetableDayForm } from "./timetable-forms";

// The server actions used on this page (re-reading the document) run with this limit.
export const maxDuration = 120;

type DocumentWithChild = DocumentRow & {
  members: { name: string; colour: string } | null;
};
type ItemRow = Pick<
  PlanItemRow,
  | "id"
  | "date"
  | "kind"
  | "subject"
  | "text"
  | "sort"
  | "audience"
  | "whole_week"
  | "starts_at"
  | "ends_at"
>;
type TimetableDay = Pick<TimetableDayRow, "weekday" | "starts_at" | "ends_at">;
type TimetablePeriod = Pick<
  TimetablePeriodRow,
  "id" | "weekday" | "period" | "starts_at" | "ends_at" | "subject" | "sort"
>;

const AUDIENCE_STYLES: Record<PlanAudience, string> = {
  child: "bg-primary text-on-primary",
  parent: "bg-accent text-on-accent",
  both: "bg-chip text-chip-ink",
};

function timeRange(start: string | null, end: string | null): string {
  if (start && end) return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
  return (start ?? end)?.slice(0, 5) ?? "";
}

function ItemCard({
  item,
  documentId,
  days,
}: {
  item: ItemRow;
  documentId: string;
  days: string[];
}) {
  const time =
    item.kind === "event" ? timeRange(item.starts_at, item.ends_at) : "";
  return (
    <li className="space-y-2 rounded-3xl bg-chip p-4">
      <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
        <span>{t.documents.kinds[item.kind]}</span>
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-extrabold ${AUDIENCE_STYLES[item.audience]}`}
        >
          {t.documents.audiences[item.audience]}
        </span>
        {time && <span className="text-muted">{time}</span>}
        {item.kind === "lesson" && (
          <span className="text-muted">{t.documents.legacyLesson}</span>
        )}
      </p>
      <ItemForm item={item} documentId={documentId} days={days} />
    </li>
  );
}

export default async function DocumentPage({
  params,
}: PageProps<"/documents/[id]">) {
  await requireParent();
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("*, members!documents_member_id_fkey(name, colour)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // A malformed id is a missing document; anything else is a real failure.
    if (error.code === "22P02") notFound();
    throw new Error("Could not read the document");
  }
  if (!data) notFound();
  const doc = data as unknown as DocumentWithChild;

  const isTimeplan = doc.type === "timeplan";
  const [
    { data: itemData },
    { data: tDayData },
    { data: tPeriodData },
    { data: signed },
    { data: previous },
  ] = await Promise.all([
    isTimeplan
      ? Promise.resolve({ data: [] })
      : supabase
          .from("plan_items")
          .select(
            "id, date, kind, subject, text, sort, audience, whole_week, starts_at, ends_at",
          )
          .eq("document_id", doc.id)
          .order("date")
          .order("sort"),
    isTimeplan
      ? supabase
          .from("timetable_days")
          .select("weekday, starts_at, ends_at")
          .eq("document_id", doc.id)
      : Promise.resolve({ data: [] }),
    isTimeplan
      ? supabase
          .from("timetable_periods")
          .select("id, weekday, period, starts_at, ends_at, subject, sort")
          .eq("document_id", doc.id)
      : Promise.resolve({ data: [] }),
    supabase.storage.from("documents").createSignedUrl(doc.file_path, 600),
    // Another published timeplan for the same child: this one replaces it when published.
    isTimeplan && doc.status !== "published"
      ? supabase
          .from("documents")
          .select("id")
          .eq("member_id", doc.member_id)
          .eq("type", "timeplan")
          .eq("status", "published")
          .neq("id", doc.id)
          .limit(1)
      : Promise.resolve({ data: [] }),
  ]);
  const fileUrl = signed?.signedUrl ?? null;
  const replacesPrevious = ((previous ?? []) as unknown[]).length > 0;

  // Ukeplan: whole-week items first, then Monday to Friday and any other day that has items.
  const items = (itemData ?? []) as ItemRow[];
  const days =
    doc.iso_week !== null && doc.iso_year !== null
      ? allowedItemDays(doc.iso_year, doc.iso_week)
      : [];
  const wholeWeekItems = items.filter((i) => i.whole_week);
  const groups = new Map<string, ItemRow[]>(
    days.slice(0, 5).map((d) => [d, []]),
  );
  for (const item of items)
    if (!item.whole_week)
      groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  const orderedGroups = [...groups.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  // Timeplan: Monday to Friday, plus Saturday/Sunday only when they have something.
  const timetableDays = new Map(
    ((tDayData ?? []) as TimetableDay[]).map((d) => [d.weekday, d]),
  );
  const periods = (tPeriodData ?? []) as TimetablePeriod[];
  const periodsByDay = new Map<number, TimetablePeriod[]>();
  for (const p of periods)
    periodsByDay.set(p.weekday, [...(periodsByDay.get(p.weekday) ?? []), p]);
  for (const list of periodsByDay.values())
    list.sort(
      (a, b) =>
        (a.period ?? 99) - (b.period ?? 99) ||
        (a.starts_at ?? "99:99").localeCompare(b.starts_at ?? "99:99") ||
        a.sort - b.sort,
    );
  const weekdays = [1, 2, 3, 4, 5, 6, 7].filter(
    (w) => w <= 5 || timetableDays.has(w) || periodsByDay.has(w),
  );

  const created = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Copenhagen",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(doc.created_at));
  const showItems = doc.status === "review" || doc.status === "published";
  const today = dayKey(dateInTimeZone(new Date()));

  return (
    <>
      <Link
        href="/documents"
        className="inline-flex min-h-11 items-center text-sm font-bold text-primary-strong"
      >
        ← {t.documents.back}
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="size-4 shrink-0 rounded-full"
            style={{ backgroundColor: doc.members?.colour ?? "#a1a1aa" }}
          />
          <h1 className="min-w-0 flex-1 break-words text-3xl font-extrabold">
            {doc.members?.name ?? "?"}
          </h1>
          <StatusBadge status={doc.status} />
        </div>
        <p className="text-sm text-muted">
          {t.documents.types[doc.type]} ·{" "}
          {doc.iso_week !== null && doc.iso_year !== null
            ? `${t.documents.week(doc.iso_week, doc.iso_year)} · `
            : ""}
          {t.documents.created(created)}
        </p>
      </header>

      {/* Wide screens: the original on the left (stays in view), the extracted items and actions on the right. */}
      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-8 lg:space-y-0">
      <section className="space-y-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
        {fileUrl ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            {t.documents.openOriginal}
          </a>
        ) : (
          <p className="text-sm text-muted">
            {t.documents.originalUnavailable}
          </p>
        )}
        {fileUrl && doc.mime_type !== "application/pdf" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fileUrl}
            alt={t.documents.imageAlt}
            className="max-w-full rounded-2xl"
          />
        )}
      </section>

      <div className="min-w-0 space-y-10">
      {doc.status === "failed" && (
        <section className="space-y-3 rounded-2xl bg-danger-soft p-3">
          <p className="break-words text-sm font-semibold text-on-danger-soft">
            {t.documents.failedNote(doc.error)}
          </p>
          <ProcessButton id={doc.id} label={t.documents.retry} primary />
        </section>
      )}
      {doc.status === "processing" && (
        <section className="space-y-3 rounded-2xl bg-warning-soft p-3">
          <p className="text-sm font-semibold text-on-warning-soft">
            {t.documents.processingNote}
          </p>
          <ProcessButton id={doc.id} label={t.documents.retry} primary />
        </section>
      )}
      {doc.status === "published" && (
        <p className="rounded-xl bg-chip p-3 text-sm font-bold text-chip-ink">
          {t.documents.publishedNote}
        </p>
      )}

      {showItems && isTimeplan && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t.documents.timetable}</h2>
          <p className="text-sm text-muted">{t.documents.timeplanIntro}</p>
          {replacesPrevious && (
            <p className="rounded-xl bg-warning-soft p-3 text-sm font-bold text-on-warning-soft">
              {t.documents.replacesPrevious}
            </p>
          )}
          {weekdays.map((weekday) => {
            const day = timetableDays.get(weekday);
            const dayPeriods = periodsByDay.get(weekday) ?? [];
            return (
              <div key={weekday} className="space-y-2">
                <h3 className="font-display text-base font-extrabold">
                  {t.documents.weekdays[weekday - 1]}
                </h3>
                <div className="rounded-2xl bg-chip p-3">
                  <TimetableDayForm
                    key={`${day?.starts_at}-${day?.ends_at}`}
                    documentId={doc.id}
                    weekday={weekday}
                    startsAt={day?.starts_at ?? null}
                    endsAt={day?.ends_at ?? null}
                  />
                </div>
                {dayPeriods.length === 0 && (
                  <p className="text-sm text-muted">{t.documents.noPeriods}</p>
                )}
                <ul className="grid gap-3 xl:grid-cols-2 xl:items-start">
                  {dayPeriods.map((p) => (
                    <li key={p.id} className="space-y-2 rounded-2xl bg-chip p-3">
                      <p className="text-sm font-extrabold">
                        {t.documents.periodLine(
                          p.period,
                          timeRange(p.starts_at, p.ends_at),
                          p.subject,
                        )}
                      </p>
                      <PeriodForm
                        key={p.id}
                        documentId={doc.id}
                        weekday={weekday}
                        period={p}
                      />
                    </li>
                  ))}
                </ul>
                <details className="rounded-2xl bg-chip p-3">
                  <summary className="min-h-11 cursor-pointer font-display text-base font-extrabold">
                    {t.documents.addPeriod}
                  </summary>
                  <div className="pt-2">
                    <PeriodForm documentId={doc.id} weekday={weekday} />
                  </div>
                </details>
              </div>
            );
          })}
        </section>
      )}

      {showItems && !isTimeplan && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t.documents.ukeplanItems}</h2>
          {items.length === 0 && (
            <p className="text-sm text-muted">{t.documents.noItems}</p>
          )}
          <div className="space-y-2">
            <h3 className="font-display text-base font-extrabold">
              {t.documents.wholeWeek}
            </h3>
            <ul className="grid gap-3 xl:grid-cols-2 xl:items-start">
              {wholeWeekItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  documentId={doc.id}
                  days={days}
                />
              ))}
            </ul>
          </div>
          {orderedGroups.map(([date, dayItems]) => (
            <div key={date} className="space-y-2">
              <h3 className="font-display text-base font-extrabold capitalize">
                {formatDayHeading(parseDayKey(date))}
              </h3>
              <ul className="grid gap-3 xl:grid-cols-2 xl:items-start">
                {dayItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    documentId={doc.id}
                    days={days}
                  />
                ))}
              </ul>
            </div>
          ))}
          <div className="space-y-2 rounded-3xl bg-chip p-4">
            <h3 className="font-display text-base font-extrabold">
              {t.documents.addItem}
            </h3>
            <ItemForm
              documentId={doc.id}
              days={days}
              defaultDay={days.includes(today) ? today : days[0]}
            />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {doc.status === "review" && (
          <form action={publishDocument} className="space-y-2">
            <input type="hidden" name="id" value={doc.id} />
            <button type="submit" className="btn btn-primary w-full sm:w-auto">
              {t.documents.publish}
            </button>
            <p className="text-xs text-muted">
              {isTimeplan
                ? t.documents.publishTimeplanHelp
                : t.documents.publishHelp}
            </p>
            {isTimeplan && replacesPrevious && (
              <p className="text-xs font-bold text-muted">
                {t.documents.replacesPrevious}
              </p>
            )}
          </form>
        )}
        {(doc.status === "review" || doc.status === "failed") && (
          <ProcessButton
            id={doc.id}
            label={t.documents.reread}
            confirmText={t.documents.confirmReread}
          />
        )}
        <DeleteDocumentButton id={doc.id} />
      </section>
      </div>
      </div>
    </>
  );
}
