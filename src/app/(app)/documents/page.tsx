import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import type { DocumentRow } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "./status-badge";

type ListedDocument = Pick<
  DocumentRow,
  "id" | "type" | "iso_week" | "iso_year" | "status"
> & {
  members: { name: string; colour: string } | null;
};

export default async function DocumentsPage() {
  await requireParent();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    // documents has two FKs to members (member_id, uploaded_by); without the explicit hint the
    // embed is ambiguous (PostgREST PGRST201). The result key stays "members".
    .select(
      "id, type, iso_week, iso_year, status, members!documents_member_id_fkey(name, colour)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not read documents");
  const documents = data as unknown as ListedDocument[];

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{t.documents.title}</h1>
        <Link href="/documents/new" className="btn btn-primary">
          {t.documents.upload}
        </Link>
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-muted">{t.documents.empty}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/documents/${doc.id}`}
                className="card flex min-h-11 items-center gap-3 p-3 hover:border-primary"
              >
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full"
                  style={{ backgroundColor: doc.members?.colour ?? "#a1a1aa" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold">
                    {doc.members?.name ?? "?"}
                  </p>
                  <p className="break-words text-sm text-muted">
                    {doc.iso_week !== null && doc.iso_year !== null
                      ? `${t.documents.types[doc.type]} · ${t.documents.week(doc.iso_week, doc.iso_year)}`
                      : t.documents.types[doc.type]}
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
