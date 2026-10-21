import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth";
import { dateInTimeZone, dayKey, formatDayHeading, parseDayKey } from "@/lib/dates";
import { allowedItemDays } from "@/lib/documents";
import { locale, t } from "@/lib/i18n";
import type { DocumentRow, PlanItemRow } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { publishDocument } from "../actions";
import { StatusBadge } from "../status-badge";
import { DeleteDocumentButton } from "./delete-document-button";
import { ItemForm } from "./item-form";
import { ProcessButton } from "./process-button";

// The server actions used on this page (re-reading the document) run with this limit.
export const maxDuration = 120;

type DocumentWithChild = DocumentRow & { members: { name: string; colour: string } | null };
type ItemRow = Pick<PlanItemRow, "id" | "date" | "kind" | "subject" | "text" | "sort">;

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  await requireParent();
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("*, members(name, colour)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // A malformed id is a missing document; anything else is a real failure.
    if (error.code === "22P02") notFound();
    throw new Error("Could not read the document");
  }
  if (!data) notFound();
  const doc = data as unknown as DocumentWithChild;

  const [{ data: itemData }, { data: signed }] = await Promise.all([
    supabase
      .from("plan_items")
      .select("id, date, kind, subject, text, sort")
      .eq("document_id", doc.id)
      .order("date")
      .order("sort"),
    supabase.storage.from("documents").createSignedUrl(doc.file_path, 600),
  ]);
  const items = (itemData ?? []) as ItemRow[];
  const fileUrl = signed?.signedUrl ?? null;

  const days = allowedItemDays(doc.iso_year, doc.iso_week);
  const groups = new Map<string, ItemRow[]>();
  for (const item of items) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);

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
      <Link href="/documents" className="inline-flex min-h-11 items-center text-sm text-blue-700 dark:text-blue-400">
        ← {t.documents.back}
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="size-4 shrink-0 rounded-full"
            style={{ backgroundColor: doc.members?.colour ?? "#a1a1aa" }}
          />
          <h1 className="min-w-0 flex-1 break-words text-2xl font-semibold">{doc.members?.name ?? "?"}</h1>
          <StatusBadge status={doc.status} />
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t.documents.types[doc.type]} · {t.documents.week(doc.iso_week, doc.iso_year)} · {t.documents.created(created)}
        </p>
      </header>

      <section className="space-y-3">
        {fileUrl ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {t.documents.openOriginal}
          </a>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.documents.originalUnavailable}</p>
        )}
        {fileUrl && doc.mime_type !== "application/pdf" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl} alt={t.documents.imageAlt} className="max-w-full rounded-lg border border-zinc-200 dark:border-zinc-800" />
        )}
      </section>

      {doc.status === "failed" && (
        <section className="space-y-3 rounded-xl bg-red-50 p-3 dark:bg-red-950">
          <p className="break-words text-sm text-red-800 dark:text-red-200">{t.documents.failedNote(doc.error)}</p>
          <ProcessButton id={doc.id} label={t.documents.retry} primary />
        </section>
      )}
      {doc.status === "processing" && (
        <section className="space-y-3 rounded-xl bg-amber-50 p-3 dark:bg-amber-950">
          <p className="text-sm text-amber-800 dark:text-amber-200">{t.documents.processingNote}</p>
          <ProcessButton id={doc.id} label={t.documents.retry} primary />
        </section>
      )}
      {doc.status === "published" && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
          {t.documents.publishedNote}
        </p>
      )}

      {showItems && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t.documents.items}</h2>
          {items.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.documents.noItems}</p>
          )}
          {[...groups.entries()].map(([date, dayItems]) => (
            <div key={date} className="space-y-2">
              <h3 className="font-medium capitalize">{formatDayHeading(parseDayKey(date))}</h3>
              <ul className="space-y-3">
                {dayItems.map((item) => (
                  <li key={item.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <ItemForm item={item} documentId={doc.id} days={days} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="space-y-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <h3 className="font-medium">{t.documents.addItem}</h3>
            <ItemForm documentId={doc.id} days={days} defaultDate={days.includes(today) ? today : days[0]} />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {doc.status === "review" && (
          <form action={publishDocument} className="space-y-2">
            <input type="hidden" name="id" value={doc.id} />
            <button
              type="submit"
              className="min-h-11 w-full rounded-lg bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-700 sm:w-auto"
            >
              {t.documents.publish}
            </button>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.documents.publishHelp}</p>
          </form>
        )}
        {(doc.status === "review" || doc.status === "failed") && (
          <ProcessButton id={doc.id} label={t.documents.reread} confirmText={t.documents.confirmReread} />
        )}
        <DeleteDocumentButton id={doc.id} />
      </section>
    </>
  );
}
