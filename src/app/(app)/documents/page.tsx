import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import type { DocumentRow } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "./status-badge";

type ListedDocument = Pick<DocumentRow, "id" | "type" | "iso_week" | "iso_year" | "status"> & {
  members: { name: string; colour: string } | null;
};

export default async function DocumentsPage() {
  await requireParent();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, type, iso_week, iso_year, status, members(name, colour)")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not read documents");
  const documents = data as unknown as ListedDocument[];

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.documents.title}</h1>
        <Link
          href="/documents/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t.documents.upload}
        </Link>
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.documents.empty}</p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/documents/${doc.id}`}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full"
                  style={{ backgroundColor: doc.members?.colour ?? "#a1a1aa" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{doc.members?.name ?? "?"}</p>
                  <p className="break-words text-sm text-zinc-500 dark:text-zinc-400">
                    {t.documents.types[doc.type]} · {t.documents.week(doc.iso_week, doc.iso_year)}
                  </p>
                </div>
                <StatusBadge status={doc.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
