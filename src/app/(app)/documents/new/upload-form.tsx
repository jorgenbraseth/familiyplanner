"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { t } from "@/lib/i18n";
import {
  DOCUMENT_TYPES,
  type DocumentType,
  MAX_UPLOAD_BYTES,
  isAcceptedMimeType,
} from "@/lib/plan";
import { createClient } from "@/lib/supabase/client";
import { createDocument, discardUpload, processDocument } from "../actions";

const input = "field";
const label = "block space-y-1 text-sm font-bold";

type Phase = "idle" | "uploading" | "reading";

export function UploadForm({
  kids,
  defaultChildId,
  defaultType,
  defaultWeek,
  defaultYear,
}: {
  kids: { id: string; name: string }[];
  defaultChildId?: string;
  defaultType: DocumentType;
  defaultWeek: number;
  defaultYear: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<DocumentType>(defaultType);
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
        isoWeek: type === "timeplan" ? null : Number(form.get("iso_week")),
        isoYear: type === "timeplan" ? null : Number(form.get("iso_year")),
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
    <form onSubmit={submit} className="max-w-2xl space-y-3">
      <fieldset disabled={busy} className="space-y-3">
        <label className={label}>
          <span>{t.documents.fields.child}</span>
          <select
            name="member_id"
            required
            defaultValue={defaultChildId ?? kids[0]?.id}
            className={input}
          >
            {kids.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span>{t.documents.fields.type}</span>
          <select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as DocumentType)}
            className={input}
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.documents.types[type]}
              </option>
            ))}
          </select>
        </label>
        {type === "ukeplan" && (
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
        )}
        <label className={label}>
          <span>{t.documents.fields.file}</span>
          <input
            type="file"
            name="file"
            required
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className={`${input} py-2`}
          />
          <span className="block text-xs font-normal text-muted">
            {t.documents.fields.fileHelp}
          </span>
        </label>
        <button type="submit" className="btn btn-primary">
          {t.documents.submit}
        </button>
      </fieldset>
      {busy && (
        <p
          role="status"
          className="rounded-xl bg-chip p-3 text-sm font-semibold text-chip-ink"
        >
          {phase === "uploading" ? t.documents.uploading : t.documents.reading}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
