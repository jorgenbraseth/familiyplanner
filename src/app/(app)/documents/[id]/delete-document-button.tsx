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
        className="btn btn-danger w-full sm:w-auto"
      >
        {t.documents.delete}
      </button>
    </form>
  );
}
