"use client";

import { t } from "@/lib/i18n";
import { deleteDocument } from "../actions";

export function DeleteDocumentButton({ id }: { id: string }) {
  return (
    <form
      action={deleteDocument}
      onSubmit={(event) => {
        if (!confirm(t.documents.confirmDelete)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="min-h-11 w-full rounded-lg border border-red-300 px-5 text-sm font-medium text-red-700 hover:bg-red-50 sm:w-auto dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
      >
        {t.documents.delete}
      </button>
    </form>
  );
}
