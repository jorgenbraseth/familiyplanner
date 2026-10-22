"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireParent } from "@/lib/auth";
import { allowedItemDays } from "@/lib/documents";
import { dayKey, mondayOfIsoWeek } from "@/lib/dates";
import { ExtractionError, extractTimeplan, extractUkeplan } from "@/lib/extraction/extract";
import type { TimeplanDay, TimeplanPeriod, UkeplanItem } from "@/lib/extraction/normalize";
import { locale, t } from "@/lib/i18n";
import { normalizeItemText } from "@/lib/item-text";
import {
  DOCUMENT_TYPES,
  MAX_UPLOAD_BYTES,
  PLAN_AUDIENCES,
  PLAN_ITEM_KINDS,
  documentPath,
  isAcceptedMimeType,
  type DocumentRow,
} from "@/lib/plan";
import { notifyMembers } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

const e = t.documents.errors;

export type CreateDocumentResult =
  | { ok: true; id: string; path: string }
  | { ok: false; error: string };
export type ProcessDocumentResult = { ok: boolean; error?: string };
export type SaveItemState = { ok: boolean; error?: string };

const idSchema = z.uuid();

const createSchema = z.object({
  memberId: z.uuid(),
  type: z.enum(DOCUMENT_TYPES),
  isoWeek: z.number().int().min(1).max(53).nullable(),
  isoYear: z.number().int().min(2000).max(2100).nullable(),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
});

function mapDbError(error: { code?: string }): string {
  return error.code === "42501" ? e.notAllowed : e.failed;
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function revalidateDocument(id: string) {
  revalidatePath("/documents");
  revalidatePath(`/documents/${id}`);
}

export async function createDocument(input: {
  memberId: string;
  type: string;
  /** Required for a ukeplan; ignored (stored as null) for a timeplan. */
  isoWeek: number | null;
  isoYear: number | null;
  mimeType: string;
  size: number;
}): Promise<CreateDocumentResult> {
  const parent = await requireParent();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: e.invalid };
  const { memberId, type, mimeType, size } = parsed.data;
  const timeplan = type === "timeplan";
  const isoWeek = timeplan ? null : parsed.data.isoWeek;
  const isoYear = timeplan ? null : parsed.data.isoYear;
  if (!timeplan && (isoWeek === null || isoYear === null))
    return { ok: false, error: e.invalid };
  if (!isAcceptedMimeType(mimeType)) return { ok: false, error: e.badType };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: e.tooLarge };

  const supabase = await createClient();
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, role")
    .eq("id", memberId)
    .maybeSingle();
  if (memberError) {
    console.error("createDocument member lookup failed", memberError.code);
    return { ok: false, error: mapDbError(memberError) };
  }
  if (!member || member.role !== "child")
    return { ok: false, error: e.notChild };

  const id = crypto.randomUUID();
  const path = documentPath(memberId, id, mimeType);
  const { error } = await supabase.from("documents").insert({
    id,
    member_id: memberId,
    type,
    iso_week: isoWeek,
    iso_year: isoYear,
    file_path: path,
    mime_type: mimeType,
    status: "processing",
    uploaded_by: parent.id,
  });
  if (error) {
    console.error("createDocument insert failed", error.code);
    return { ok: false, error: mapDbError(error) };
  }

  revalidatePath("/documents");
  return { ok: true, id, path };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Replaces a timeplan document's timetable rows. Returns an error message, or null on success. */
async function storeTimeplan(
  supabase: Supabase,
  id: string,
  memberId: string,
  days: TimeplanDay[],
  periods: TimeplanPeriod[],
): Promise<string | null> {
  for (const table of ["timetable_periods", "timetable_days"] as const) {
    const { error } = await supabase.from(table).delete().eq("document_id", id);
    if (error) {
      console.error("processDocument clear timetable failed", id, table, error.code);
      return mapDbError(error);
    }
  }
  if (days.length > 0) {
    const { error } = await supabase.from("timetable_days").insert(
      days.map((d) => ({
        document_id: id,
        member_id: memberId,
        weekday: d.weekday,
        starts_at: d.starts_at,
        ends_at: d.ends_at,
      })),
    );
    if (error) {
      console.error("processDocument insert timetable days failed", id, error.code);
      return mapDbError(error);
    }
  }
  if (periods.length > 0) {
    const { error } = await supabase.from("timetable_periods").insert(
      periods.map((p, index) => ({
        document_id: id,
        member_id: memberId,
        weekday: p.weekday,
        period: p.period,
        starts_at: p.starts_at,
        ends_at: p.ends_at,
        subject: p.subject,
        sort: index,
      })),
    );
    if (error) {
      console.error("processDocument insert timetable periods failed", id, error.code);
      return mapDbError(error);
    }
  }
  return null;
}

/** Replaces a ukeplan document's plan items. Returns an error message, or null on success. */
async function storeUkeplan(
  supabase: Supabase,
  id: string,
  memberId: string,
  items: UkeplanItem[],
): Promise<string | null> {
  const { error: deleteError } = await supabase.from("plan_items").delete().eq("document_id", id);
  if (deleteError) {
    console.error("processDocument clear items failed", id, deleteError.code);
    return mapDbError(deleteError);
  }
  if (items.length === 0) return null;
  const { error } = await supabase.from("plan_items").insert(
    items.map((item, index) => ({
      document_id: id,
      member_id: memberId,
      date: item.date,
      whole_week: item.whole_week,
      kind: item.kind,
      subject: item.subject,
      text: item.text,
      audience: item.audience,
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      sort: index,
    })),
  );
  if (error) {
    console.error("processDocument insert items failed", id, error.code);
    return mapDbError(error);
  }
  return null;
}

export async function processDocument(
  rawId: string,
): Promise<ProcessDocumentResult> {
  await requireParent();
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) return { ok: false, error: e.invalid };
  const id = parsedId.data;

  const supabase = await createClient();
  const { data, error: loadError } = await supabase
    .from("documents")
    .select(
      "id, member_id, type, iso_week, iso_year, file_path, mime_type, status, members!documents_member_id_fkey(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    console.error("processDocument load failed", id, loadError.code);
    return { ok: false, error: mapDbError(loadError) };
  }
  if (!data) return { ok: false, error: e.notFound };
  const doc = data as unknown as Pick<
    DocumentRow,
    | "id"
    | "member_id"
    | "type"
    | "iso_week"
    | "iso_year"
    | "file_path"
    | "mime_type"
    | "status"
  > & { members: { name: string } | { name: string }[] | null };
  if (doc.status === "published") return { ok: false, error: e.wrongStatus };
  const childName =
    (Array.isArray(doc.members) ? doc.members[0]?.name : doc.members?.name) ??
    "";

  async function fail(reason: string): Promise<ProcessDocumentResult> {
    const { error } = await supabase
      .from("documents")
      .update({ status: "failed", error: reason })
      .eq("id", id);
    if (error)
      console.error("processDocument could not mark failed", id, error.code);
    revalidateDocument(id);
    return { ok: false, error: reason };
  }

  await supabase
    .from("documents")
    .update({ status: "processing", error: null })
    .eq("id", id);

  const { data: file, error: downloadError } = await supabase.storage
    .from("documents")
    .download(doc.file_path);
  if (downloadError || !file) {
    console.error("processDocument download failed", id);
    return fail(e.download);
  }

  const input = {
    data: new Uint8Array(await file.arrayBuffer()),
    mimeType: doc.mime_type,
    childName,
    locale,
  };
  try {
    if (doc.type === "timeplan") {
      const { days, periods } = await extractTimeplan(input);
      const failed = await storeTimeplan(supabase, id, doc.member_id, days, periods);
      if (failed) return fail(failed);
    } else {
      const { items } = await extractUkeplan({
        ...input,
        isoYear: doc.iso_year as number,
        isoWeek: doc.iso_week as number,
      });
      const failed = await storeUkeplan(supabase, id, doc.member_id, items);
      if (failed) return fail(failed);
    }
  } catch (error) {
    if (error instanceof ExtractionError) {
      console.error(
        "processDocument extraction failed",
        id,
        error.code,
        error.reason,
      );
      return fail(e.extraction[error.code]);
    }
    console.error("processDocument crashed", id);
    return fail(e.failed);
  }

  const { error: statusError } = await supabase
    .from("documents")
    .update({ status: "review", error: null })
    .eq("id", id);
  if (statusError) {
    console.error("processDocument status update failed", id, statusError.code);
    return fail(mapDbError(statusError));
  }

  revalidateDocument(id);
  return { ok: true };
}

/** Removes the row of an upload that never reached storage. */
export async function discardUpload(rawId: string): Promise<void> {
  await requireParent();
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", parsedId.data);
  if (error) console.error("discardUpload failed", error.code);
  revalidatePath("/documents");
}

/** "HH:MM" (or "HH:MM:SS" as Postgres returns it) from a time input; empty = null. */
const timeField = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
    if (!match) {
      ctx.addIssue({ code: "custom", message: e.time });
      return z.NEVER;
    }
    return `${match[1]}:${match[2]}`;
  });

const subjectField = z
  .string()
  .trim()
  .max(100, e.subject)
  .transform((value) => (value === "" ? null : value));

const itemSchema = z.object({
  /** A day ("YYYY-MM-DD") or "whole" for the whole week. */
  day: z.string().regex(/^(whole|\d{4}-\d{2}-\d{2})$/),
  kind: z.enum(PLAN_ITEM_KINDS, e.kind),
  audience: z.enum(PLAN_AUDIENCES, e.audience),
  subject: subjectField,
  text: z
    .string()
    .transform(normalizeItemText)
    .pipe(z.string().min(1, e.text).max(1000, e.text)),
  starts_at: timeField,
  ends_at: timeField,
});

const weekdayField = z
  .string()
  .regex(/^[1-7]$/, e.weekday)
  .transform(Number);

const timetableDaySchema = z.object({
  weekday: weekdayField,
  starts_at: timeField,
  ends_at: timeField,
});

const periodSchema = z.object({
  weekday: weekdayField,
  period: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const n = Number(value);
      if (!/^\d{1,2}$/.test(value) || n < 1 || n > 15) {
        ctx.addIssue({ code: "custom", message: e.period });
        return z.NEVER;
      }
      return n;
    }),
  starts_at: timeField,
  ends_at: timeField,
  subject: z.string().trim().min(1, e.periodSubject).max(100, e.periodSubject),
});

type DocForEdit = { id: string; member_id: string; type: string; iso_week: number | null; iso_year: number | null; status: string };

async function loadDocForEdit(supabase: Supabase, documentId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, member_id, type, iso_week, iso_year, status")
    .eq("id", documentId)
    .maybeSingle();
  if (error) return { error: mapDbError(error) } as const;
  if (!data) return { error: e.notFound } as const;
  const doc = data as DocForEdit;
  if (doc.status === "processing") return { error: e.wrongStatus } as const;
  return { doc } as const;
}

export async function saveItem(
  _prev: SaveItemState,
  formData: FormData,
): Promise<SaveItemState> {
  await requireParent();
  const supabase = await createClient();

  const rawItemId = formString(formData, "id");
  let documentId: string;
  let itemId: string | null = null;
  let storedKind: string | null = null;

  if (rawItemId !== "") {
    const parsedItem = idSchema.safeParse(rawItemId);
    if (!parsedItem.success) return { ok: false, error: e.invalid };
    itemId = parsedItem.data;
    // The document comes from the stored item, not from the form.
    const { data: existing, error } = await supabase
      .from("plan_items")
      .select("document_id, kind")
      .eq("id", itemId)
      .maybeSingle();
    if (error) return { ok: false, error: mapDbError(error) };
    if (!existing) return { ok: false, error: e.notFound };
    documentId = existing.document_id as string;
    storedKind = existing.kind as string;
  } else {
    const parsedDoc = idSchema.safeParse(formString(formData, "document_id"));
    if (!parsedDoc.success) return { ok: false, error: e.invalid };
    documentId = parsedDoc.data;
  }

  const loaded = await loadDocForEdit(supabase, documentId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const doc = loaded.doc;
  if (doc.type !== "ukeplan" || doc.iso_week === null || doc.iso_year === null)
    return { ok: false, error: e.notUkeplan };

  const parsed = itemSchema.safeParse({
    day: formString(formData, "day"),
    kind: formString(formData, "kind"),
    audience: formString(formData, "audience"),
    subject: formString(formData, "subject"),
    text: formString(formData, "text"),
    starts_at: formString(formData, "starts_at"),
    ends_at: formString(formData, "ends_at"),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? e.invalid };
  const { day, kind, audience, subject, text } = parsed.data;
  // "lesson" only survives on old rows; it can't be chosen for anything else.
  if (kind === "lesson" && storedKind !== "lesson")
    return { ok: false, error: e.kind };
  // Times only mean something on events.
  const startsAt = kind === "event" ? parsed.data.starts_at : null;
  const endsAt = kind === "event" ? parsed.data.ends_at : null;
  if (startsAt && endsAt && endsAt <= startsAt)
    return { ok: false, error: e.timeOrder };

  const monday = dayKey(mondayOfIsoWeek(doc.iso_year, doc.iso_week));
  const wholeWeek = day === "whole";
  const date = wholeWeek ? monday : day;
  if (!wholeWeek && !allowedItemDays(doc.iso_year, doc.iso_week).includes(date))
    return { ok: false, error: e.date };

  const fields = {
    date,
    whole_week: wholeWeek,
    kind,
    audience,
    subject,
    text,
    // Legacy lessons keep their period and times.
    ...(kind === "lesson" ? {} : { period: null, starts_at: startsAt, ends_at: endsAt }),
  };

  if (itemId) {
    const { error } = await supabase
      .from("plan_items")
      .update(fields)
      .eq("id", itemId)
      .eq("document_id", documentId);
    if (error) {
      console.error("saveItem update failed", error.code);
      return { ok: false, error: mapDbError(error) };
    }
  } else {
    const { data: last } = await supabase
      .from("plan_items")
      .select("sort")
      .eq("document_id", documentId)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("plan_items").insert({
      ...fields,
      document_id: documentId,
      member_id: doc.member_id,
      sort: ((last?.sort as number | undefined) ?? -1) + 1,
    });
    if (error) {
      console.error("saveItem insert failed", error.code);
      return { ok: false, error: mapDbError(error) };
    }
  }

  revalidateDocument(documentId);
  return { ok: true };
}

/** Sets school start/end for one weekday of a timeplan; both empty removes the day. */
export async function saveTimetableDay(
  _prev: SaveItemState,
  formData: FormData,
): Promise<SaveItemState> {
  await requireParent();
  const supabase = await createClient();

  const parsedDoc = idSchema.safeParse(formString(formData, "document_id"));
  if (!parsedDoc.success) return { ok: false, error: e.invalid };
  const documentId = parsedDoc.data;

  const parsed = timetableDaySchema.safeParse({
    weekday: formString(formData, "weekday"),
    starts_at: formString(formData, "starts_at"),
    ends_at: formString(formData, "ends_at"),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? e.invalid };
  const { weekday, starts_at, ends_at } = parsed.data;
  if (starts_at && ends_at && ends_at <= starts_at)
    return { ok: false, error: e.timeOrder };

  const loaded = await loadDocForEdit(supabase, documentId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  if (loaded.doc.type !== "timeplan") return { ok: false, error: e.notTimeplan };

  if (!starts_at && !ends_at) {
    const { error } = await supabase
      .from("timetable_days")
      .delete()
      .eq("document_id", documentId)
      .eq("weekday", weekday);
    if (error) {
      console.error("saveTimetableDay delete failed", error.code);
      return { ok: false, error: mapDbError(error) };
    }
  } else {
    const { error } = await supabase.from("timetable_days").upsert(
      {
        document_id: documentId,
        member_id: loaded.doc.member_id,
        weekday,
        starts_at,
        ends_at,
      },
      { onConflict: "document_id,weekday" },
    );
    if (error) {
      console.error("saveTimetableDay upsert failed", error.code);
      return { ok: false, error: mapDbError(error) };
    }
  }

  revalidateDocument(documentId);
  return { ok: true };
}

/** Edits one timetable period (`id`), or adds one to a weekday of a timeplan (`document_id`). */
export async function saveTimetablePeriod(
  _prev: SaveItemState,
  formData: FormData,
): Promise<SaveItemState> {
  await requireParent();
  const supabase = await createClient();

  const rawId = formString(formData, "id");
  let documentId: string;
  let periodId: string | null = null;
  if (rawId !== "") {
    const parsedId = idSchema.safeParse(rawId);
    if (!parsedId.success) return { ok: false, error: e.invalid };
    periodId = parsedId.data;
    const { data: existing, error } = await supabase
      .from("timetable_periods")
      .select("document_id")
      .eq("id", periodId)
      .maybeSingle();
    if (error) return { ok: false, error: mapDbError(error) };
    if (!existing) return { ok: false, error: e.notFound };
    documentId = existing.document_id as string;
  } else {
    const parsedDoc = idSchema.safeParse(formString(formData, "document_id"));
    if (!parsedDoc.success) return { ok: false, error: e.invalid };
    documentId = parsedDoc.data;
  }

  const parsed = periodSchema.safeParse({
    weekday: formString(formData, "weekday"),
    period: formString(formData, "period"),
    starts_at: formString(formData, "starts_at"),
    ends_at: formString(formData, "ends_at"),
    subject: formString(formData, "subject"),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? e.invalid };
  const { starts_at, ends_at } = parsed.data;
  if (starts_at && ends_at && ends_at <= starts_at)
    return { ok: false, error: e.timeOrder };

  const loaded = await loadDocForEdit(supabase, documentId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  if (loaded.doc.type !== "timeplan") return { ok: false, error: e.notTimeplan };

  if (periodId) {
    const { error } = await supabase
      .from("timetable_periods")
      .update(parsed.data)
      .eq("id", periodId)
      .eq("document_id", documentId);
    if (error) {
      console.error("saveTimetablePeriod update failed", error.code);
      return { ok: false, error: mapDbError(error) };
    }
  } else {
    const { data: last } = await supabase
      .from("timetable_periods")
      .select("sort")
      .eq("document_id", documentId)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("timetable_periods").insert({
      ...parsed.data,
      document_id: documentId,
      member_id: loaded.doc.member_id,
      sort: ((last?.sort as number | undefined) ?? -1) + 1,
    });
    if (error) {
      console.error("saveTimetablePeriod insert failed", error.code);
      return { ok: false, error: mapDbError(error) };
    }
  }

  revalidateDocument(documentId);
  return { ok: true };
}

export async function deleteTimetablePeriod(formData: FormData): Promise<void> {
  await requireParent();
  const parsedId = idSchema.safeParse(formString(formData, "id"));
  if (!parsedId.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("timetable_periods")
    .delete()
    .eq("id", parsedId.data)
    .select("document_id")
    .maybeSingle();
  if (error) {
    console.error("deleteTimetablePeriod failed", error.code);
    return;
  }
  if (data) revalidateDocument(data.document_id as string);
}

export async function deleteItem(formData: FormData): Promise<void> {
  await requireParent();
  const parsedId = idSchema.safeParse(formString(formData, "id"));
  if (!parsedId.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_items")
    .delete()
    .eq("id", parsedId.data)
    .select("document_id")
    .maybeSingle();
  if (error) {
    console.error("deleteItem failed", error.code);
    return;
  }
  if (data) revalidateDocument(data.document_id as string);
}

export async function publishDocument(formData: FormData): Promise<void> {
  await requireParent();
  const parsedId = idSchema.safeParse(formString(formData, "id"));
  if (!parsedId.success) return;
  const supabase = await createClient();
  const { data: published, error } = await supabase
    .from("documents")
    .update({ status: "published", error: null })
    .eq("id", parsedId.data)
    .eq("status", "review")
    .select("member_id, type, iso_week")
    .maybeSingle();
  if (error) {
    console.error("publishDocument failed", error.code);
    return;
  }
  // Only a ukeplan has a week to announce; a timeplan just becomes the school-day setup.
  if (published && published.type === "ukeplan" && published.iso_week !== null) {
    await notifyMembers([published.member_id as string], {
      title: t.push.planPublishedTitle,
      body: t.push.planPublishedBody(published.iso_week as number),
      url: "/",
      tag: "plan-" + parsedId.data,
    });
  }
  revalidateDocument(parsedId.data);
  revalidatePath("/");
}

export async function deleteDocument(formData: FormData): Promise<void> {
  await requireParent();
  const parsedId = idSchema.safeParse(formString(formData, "id"));
  if (!parsedId.success) return;
  const id = parsedId.data;
  const supabase = await createClient();

  const { data: doc, error: loadError } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    console.error("deleteDocument load failed", loadError.code);
    return;
  }
  if (!doc) redirect("/documents");

  const { error: removeError } = await supabase.storage
    .from("documents")
    .remove([doc.file_path as string]);
  if (removeError) {
    console.error("deleteDocument storage remove failed", id);
    return;
  }
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) {
    console.error("deleteDocument failed", error.code);
    return;
  }

  revalidatePath("/documents");
  revalidatePath("/");
  redirect("/documents");
}
