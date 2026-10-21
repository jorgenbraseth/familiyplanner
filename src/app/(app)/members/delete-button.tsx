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
        className="btn btn-danger"
      >
        {t.members.delete}
      </button>
    </form>
  );
}
