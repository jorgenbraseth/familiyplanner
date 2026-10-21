"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { DOCUMENT_TYPES, MAX_UPLOAD_BYTES, isAcceptedMimeType } from "@/lib/plan";
import { createClient } from "@/lib/supabase/client";
import { createDocument, discardUpload, processDocument } from "../actions";

const input =
  "min-h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700";
const label = "block space-y-1 text-sm font-medium";

type Phase = "idle" | "uploading" | "reading";

export function UploadForm({
  kids,
  defaultWeek,
  defaultYear,
}: {
  kids: { id: string; name: string }[];
  defaultWeek: number;
  defaultYear: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== "idle";

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError(t.documents.errors.invalid);
      return;
    }
    if (!isAcceptedMimeType(file.type)) {
      setError(t.documents.errors.badType);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t.documents.errors.tooLarge);
      return;
    }

    setError(null);
    setPhase("uploading");
    try {
      const created = await createDocument({
        memberId: String(form.get("member_id") ?? ""),
        type: String(form.get("type") ?? ""),
        isoWeek: Number(form.get("iso_week")),
        isoYear: Number(form.get("iso_year")),
        mimeType: file.type,
        size: file.size,
      });
      if (!created.ok) {
        setError(created.error);
        setPhase("idle");
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(created.path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        await discardUpload(created.id);
        setError(t.documents.errors.uploadFailed);
        setPhase("idle");
        return;
      }

      setPhase("reading");
      // A failed extraction is stored on the document; the review page shows it with a retry button.
      await processDocument(created.id);
      router.push(`/documents/${created.id}`);
    } catch {
      setError(t.documents.errors.failed);
      setPhase("idle");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <fieldset disabled={busy} className="space-y-3">
        <label className={label}>
          <span>{t.documents.fields.child}</span>
          <select name="member_id" required defaultValue={kids[0]?.id} className={input}>
            {kids.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span>{t.documents.fields.type}</span>
          <select name="type" defaultValue="week_schedule" className={input}>
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.documents.types[type]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3">
          <label className={`${label} flex-1`}>
            <span>{t.documents.fields.week}</span>
            <input
              type="number"
              name="iso_week"
              required
              min={1}
              max={53}
              inputMode="numeric"
              defaultValue={defaultWeek}
              className={input}
            />
          </label>
          <label className={`${label} flex-1`}>
            <span>{t.documents.fields.year}</span>
            <input
              type="number"
              name="iso_year"
              required
              min={2000}
              max={2100}
              inputMode="numeric"
              defaultValue={defaultYear}
              className={input}
            />
          </label>
        </div>
        <label className={label}>
          <span>{t.documents.fields.file}</span>
          <input
            type="file"
            name="file"
            required
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className={`${input} py-2`}
          />
          <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {t.documents.fields.fileHelp}
          </span>
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {t.documents.submit}
        </button>
      </fieldset>
      {busy && (
        <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
          {phase === "uploading" ? t.documents.uploading : t.documents.reading}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
