import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { isoWeekNow } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

// The upload form's server actions (createDocument, processDocument) run with this limit.
export const maxDuration = 120;

export default async function NewDocumentPage() {
  await requireParent();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("role", "child")
    .order("created_at");
  if (error) throw new Error("Could not read members");
  const children = (data as Member[]).map((m) => ({ id: m.id, name: m.name }));
  const { isoYear, isoWeek } = isoWeekNow();

  return (
    <>
      <Link href="/documents" className="inline-flex min-h-11 items-center text-sm font-bold text-primary-strong">
        ← {t.documents.back}
      </Link>
      <h1 className="text-3xl font-extrabold">{t.documents.newTitle}</h1>
      {children.length === 0 ? (
        <p className="text-sm text-muted">{t.documents.noChildren}</p>
      ) : (
        <UploadForm kids={children} defaultWeek={isoWeek} defaultYear={isoYear} />
      )}
    </>
  );
}
