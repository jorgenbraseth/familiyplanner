"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@/lib/i18n";
import { processDocument } from "../actions";

/** Runs the extraction again. `confirmText` is asked first when it would replace edits. */
export function ProcessButton({
  id,
  label,
  confirmText,
  primary,
}: {
  id: string;
  label: string;
  confirmText?: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const result = await processDocument(id);
      if (!result.ok && result.error) setError(result.error);
      router.refresh();
    });
  }

  const style = primary
    ? "btn-primary"
    : "btn-secondary";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`btn w-full sm:w-auto ${style}`}
      >
        {pending ? t.documents.reading : label}
      </button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
