"use client";

import { t } from "@/lib/i18n";
import { deleteMember } from "./actions";

export function DeleteButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteMember}
      onSubmit={(event) => {
        if (!confirm(t.members.confirmDelete(name))) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="min-h-11 rounded-lg border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
      >
        {t.members.delete}
      </button>
    </form>
  );
}
