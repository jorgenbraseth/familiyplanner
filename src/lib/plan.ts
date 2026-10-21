// Shared types for Phase 2: uploaded school documents and the plan items extracted from them.
// Must match supabase/migrations (documents, plan_items) and the `documents` storage bucket.

export const DOCUMENT_TYPES = ["week_schedule", "homework", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** processing → review (parent checks) → published (child sees it). failed = extraction error. */
export const DOCUMENT_STATUSES = ["processing", "review", "published", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const PLAN_ITEM_KINDS = ["lesson", "homework", "bring", "note"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

export type DocumentRow = {
  id: string;
  member_id: string;
  type: DocumentType;
  iso_week: number;
  iso_year: number;
  file_path: string;
  mime_type: AcceptedMimeType;
  status: DocumentStatus;
  error: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type PlanItemRow = {
  id: string;
  document_id: string;
  member_id: string;
  /** "YYYY-MM-DD" in Europe/Copenhagen. For homework: the day it is due. */
  date: string;
  kind: PlanItemKind;
  subject: string | null;
  text: string;
  done: boolean;
  sort: number;
  /** Lessons: period number in the school day (1..15), if the plan has one. */
  period: number | null;
  /** Lessons: start/end time as Postgres returns it ("HH:MM:SS"), if known. */
  starts_at: string | null;
  ends_at: string | null;
};

/** School start/end for one day of an uploaded week plan. Times are "HH:MM:SS" as Postgres returns them. */
export type SchoolDayRow = {
  id: string;
  document_id: string;
  member_id: string;
  /** "YYYY-MM-DD" in Europe/Copenhagen. */
  date: string;
  starts_at: string | null;
  ends_at: string | null;
};

/** An item as extraction produces it, before it gets ids. */
export type ExtractedItem = Pick<PlanItemRow, "date" | "kind" | "subject" | "text"> & {
  /** Lessons only; null when the plan doesn't say. Times are "HH:MM". */
  period: number | null;
  starts_at: string | null;
  ends_at: string | null;
};

/** School start/end extracted for one day ("HH:MM" or null). */
export type ExtractedDay = { date: string; starts_at: string | null; ends_at: string | null };

/** What extraction produces for one document. */
export type Extraction = { items: ExtractedItem[]; days: ExtractedDay[] };

/** Upload types Claude can read (PDF + images). HEIC isn't supported; phones send JPEG from the file picker. */
export const ACCEPTED_MIME_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type AcceptedMimeType = keyof typeof ACCEPTED_MIME_TYPES;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return Object.hasOwn(ACCEPTED_MIME_TYPES, value);
}

/** Storage path inside the `documents` bucket: `<member_id>/<document_id>.<ext>`. */
export function documentPath(memberId: string, documentId: string, mimeType: AcceptedMimeType): string {
  return `${memberId}/${documentId}.${ACCEPTED_MIME_TYPES[mimeType]}`;
}
