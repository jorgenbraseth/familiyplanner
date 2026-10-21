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
import type { DocumentRow, PlanItemRow, SchoolDayRow } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { publishDocument } from "../actions";
import { StatusBadge } from "../status-badge";
import { DeleteDocumentButton } from "./delete-document-button";
import { ItemForm } from "./item-form";
import { ProcessButton } from "./process-button";
import { SchoolDayForm } from "./school-day-form";

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
  | "period"
  | "starts_at"
  | "ends_at"
>;

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

  const [{ data: itemData }, { data: dayData }, { data: signed }] =
    await Promise.all([
      supabase
        .from("plan_items")
        .select(
          "id, date, kind, subject, text, sort, period, starts_at, ends_at",
        )
        .eq("document_id", doc.id)
        .order("date")
        .order("sort"),
      supabase
        .from("school_days")
        .select("date, starts_at, ends_at")
        .eq("document_id", doc.id),
      supabase.storage.from("documents").createSignedUrl(doc.file_path, 600),
    ]);
  const items = (itemData ?? []) as ItemRow[];
  const fileUrl = signed?.signedUrl ?? null;

  const days = allowedItemDays(doc.iso_year as number, doc.iso_week as number);
  const schoolDays = new Map(
    (
      (dayData ?? []) as Pick<SchoolDayRow, "date" | "starts_at" | "ends_at">[]
    ).map((d) => [d.date, d]),
  );
  // Every weekday of the document's week, plus any other day that has items or school times.
  const weekdays = days.slice(0, 5); // Monday to Friday of the document's week
  const groups = new Map<string, ItemRow[]>(weekdays.map((d) => [d, []]));
  for (const d of schoolDays.keys()) if (!groups.has(d)) groups.set(d, []);
  for (const item of items)
    groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  const orderedGroups = [...groups.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
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
          {doc.iso_week !== null && doc.iso_year !== null ? t.documents.week(doc.iso_week, doc.iso_year) : ""} ·{" "}
          {t.documents.created(created)}
        </p>
      </header>

      <section className="space-y-3">
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
            className="max-w-full rounded-xl border-2 border-line"
          />
        )}
      </section>

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

      {showItems && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold">{t.documents.items}</h2>
          {items.length === 0 && schoolDays.size === 0 && (
            <p className="text-sm text-muted">{t.documents.noItems}</p>
          )}
          {orderedGroups.map(([date, dayItems]) => {
            const schoolDay = schoolDays.get(date);
            return (
              <div key={date} className="space-y-2">
                <h3 className="font-display text-base font-extrabold capitalize">
                  {formatDayHeading(parseDayKey(date))}
                </h3>
                <div className="card p-3">
                  <SchoolDayForm
                    key={`${schoolDay?.starts_at}-${schoolDay?.ends_at}`}
                    documentId={doc.id}
                    date={date}
                    startsAt={schoolDay?.starts_at ?? null}
                    endsAt={schoolDay?.ends_at ?? null}
                  />
                </div>
                <ul className="space-y-3">
                  {dayItems.map((item) => (
                    <li key={item.id} className="card space-y-2 p-3">
                      {item.kind === "lesson" && (
                        <p className="text-sm font-extrabold">
                          {t.documents.lessonLabel(item.period)}
                          {item.starts_at &&
                            ` ${item.starts_at.slice(0, 5)}${item.ends_at ? `–${item.ends_at.slice(0, 5)}` : ""}`}
                          {item.subject && ` ${item.subject}`}
                        </p>
                      )}
                      <ItemForm item={item} documentId={doc.id} days={days} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div className="space-y-2 rounded-2xl border-2 border-dashed border-line p-3">
            <h3 className="font-display text-base font-extrabold">
              {t.documents.addItem}
            </h3>
            <ItemForm
              documentId={doc.id}
              days={days}
              defaultDate={days.includes(today) ? today : days[0]}
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
            <p className="text-xs text-muted">{t.documents.publishHelp}</p>
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
    </>
  );
}
