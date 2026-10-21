import { t } from "@/lib/i18n";
import type { DocumentStatus } from "@/lib/plan";

const styles: Record<DocumentStatus, string> = {
  processing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  review: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  published: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {t.documents.statuses[status]}
    </span>
  );
}
