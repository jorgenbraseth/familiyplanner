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
    ? "bg-blue-600 text-white hover:bg-blue-700"
    : "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`min-h-11 w-full rounded-lg px-5 text-sm font-medium disabled:opacity-60 sm:w-auto ${style}`}
      >
        {pending ? t.documents.reading : label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
