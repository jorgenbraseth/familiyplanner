import { t } from "@/lib/i18n";
import type { DocumentStatus } from "@/lib/plan";

const styles: Record<DocumentStatus, string> = {
  processing: "bg-chip text-chip-ink",
  review: "bg-accent text-on-accent",
  published: "bg-primary text-on-primary",
  failed: "bg-danger-soft text-on-danger-soft",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${styles[status]}`}
    >
      {t.documents.statuses[status]}
    </span>
  );
}
