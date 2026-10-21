// Shared types for Phase 2: uploaded school documents and the plan items extracted from them.
// Must match supabase/migrations (documents, plan_items) and the `documents` storage bucket.

/** timeplan: a child's fixed weekly timetable (no ISO week). ukeplan: the weekly plan (needs an ISO week). */
export const DOCUMENT_TYPES = ["timeplan", "ukeplan"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** processing → review (parent checks) → published (child sees it). failed = extraction error. */
export const DOCUMENT_STATUSES = ["processing", "review", "published", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

// "lesson" is legacy: only old rows have it; new plans put lessons in the timetable tables.
export const PLAN_ITEM_KINDS = ["homework", "event", "message", "lesson"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

/** Who an item is for. Children never see "parent" items (enforced by RLS). */
export const PLAN_AUDIENCES = ["child", "parent", "both"] as const;
export type PlanAudience = (typeof PLAN_AUDIENCES)[number];

export type DocumentRow = {
  id: string;
  member_id: string;
  type: DocumentType;
  /** Null for a timeplan; set for a ukeplan. */
  iso_week: number | null;
  iso_year: number | null;
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
  audience: PlanAudience;
  /** Week-level homework/message: `date` is the Monday of the document's week. */
  whole_week: boolean;
  /** Legacy lessons: period number in the school day (1..15), if the plan has one. */
  period: number | null;
  /** Events (optional) and legacy lessons: start/end time as Postgres returns it ("HH:MM:SS"). */
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

/** School start/end for one ISO weekday (Monday = 1) of a timeplan. Times are "HH:MM:SS". */
export type TimetableDayRow = {
  id: string;
  document_id: string;
  member_id: string;
  weekday: number;
  starts_at: string | null;
  ends_at: string | null;
};

/** One period of a timeplan on one weekday. Times are "HH:MM:SS". */
export type TimetablePeriodRow = {
  id: string;
  document_id: string;
  member_id: string;
  weekday: number;
  period: number | null;
  starts_at: string | null;
  ends_at: string | null;
  subject: string;
  sort: number;
};

/** An item as extraction produces it, before it gets ids. */
export type ExtractedItem = Pick<PlanItemRow, "date" | "kind" | "subject" | "text"> & {
  /** Lessons only; null when the plan doesn't say. Times are "HH:MM". */
  period: number | null;
  starts_at: string | null;
  ends_at: string | null;
  audience: PlanAudience;
  whole_week: boolean;
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
