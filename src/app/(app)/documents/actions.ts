"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireParent } from "@/lib/auth";
import { allowedItemDays } from "@/lib/documents";
import { ExtractionError, extractPlanItems } from "@/lib/extraction/extract";
import { locale, t } from "@/lib/i18n";
import {
  DOCUMENT_TYPES,
  MAX_UPLOAD_BYTES,
  PLAN_ITEM_KINDS,
  documentPath,
  isAcceptedMimeType,
  type DocumentRow,
} from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

const e = t.documents.errors;

export type CreateDocumentResult = { ok: true; id: string; path: string } | { ok: false; error: string };
export type ProcessDocumentResult = { ok: boolean; error?: string };
export type SaveItemState = { ok: boolean; error?: string };

const idSchema = z.uuid();

const createSchema = z.object({
  memberId: z.uuid(),
  type: z.enum(DOCUMENT_TYPES),
  isoWeek: z.number().int().min(1).max(53),
  isoYear: z.number().int().min(2000).max(2100),
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
  isoWeek: number;
  isoYear: number;
  mimeType: string;
  size: number;
}): Promise<CreateDocumentResult> {
  const parent = await requireParent();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: e.invalid };
  const { memberId, type, isoWeek, isoYear, mimeType, size } = parsed.data;
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
  if (!member || member.role !== "child") return { ok: false, error: e.notChild };

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

export async function processDocument(rawId: string): Promise<ProcessDocumentResult> {
  await requireParent();
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) return { ok: false, error: e.invalid };
  const id = parsedId.data;

  const supabase = await createClient();
  const { data, error: loadError } = await supabase
    .from("documents")
    .select("id, member_id, iso_week, iso_year, file_path, mime_type, status, members!documents_member_id_fkey(name)")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    console.error("processDocument load failed", id, loadError.code);
    return { ok: false, error: mapDbError(loadError) };
  }
  if (!data) return { ok: false, error: e.notFound };
  const doc = data as unknown as Pick<
    DocumentRow,
    "id" | "member_id" | "iso_week" | "iso_year" | "file_path" | "mime_type" | "status"
  > & { members: { name: string } | { name: string }[] | null };
  if (doc.status === "published") return { ok: false, error: e.wrongStatus };
  const childName = (Array.isArray(doc.members) ? doc.members[0]?.name : doc.members?.name) ?? "";

  async function fail(reason: string): Promise<ProcessDocumentResult> {
    const { error } = await supabase.from("documents").update({ status: "failed", error: reason }).eq("id", id);
    if (error) console.error("processDocument could not mark failed", id, error.code);
    revalidateDocument(id);
    return { ok: false, error: reason };
  }

  await supabase.from("documents").update({ status: "processing", error: null }).eq("id", id);

  const { data: file, error: downloadError } = await supabase.storage.from("documents").download(doc.file_path);
  if (downloadError || !file) {
    console.error("processDocument download failed", id);
    return fail(e.download);
  }

  let items;
  try {
    items = await extractPlanItems({
      data: new Uint8Array(await file.arrayBuffer()),
      mimeType: doc.mime_type,
      isoYear: doc.iso_year,
      isoWeek: doc.iso_week,
      childName,
      locale,
    });
  } catch (error) {
    if (error instanceof ExtractionError) {
      console.error("processDocument extraction failed", id, error.code, error.reason);
      return fail(e.extraction[error.code]);
    }
    console.error("processDocument crashed", id);
    return fail(e.failed);
  }

  const { error: deleteError } = await supabase.from("plan_items").delete().eq("document_id", id);
  if (deleteError) {
    console.error("processDocument clear items failed", id, deleteError.code);
    return fail(mapDbError(deleteError));
  }
  if (items.length > 0) {
    const { error: insertError } = await supabase.from("plan_items").insert(
      items.map((item, index) => ({
        document_id: id,
        member_id: doc.member_id,
        date: item.date,
        kind: item.kind,
        subject: item.subject,
        text: item.text,
        sort: index,
      })),
    );
    if (insertError) {
      console.error("processDocument insert items failed", id, insertError.code);
      return fail(mapDbError(insertError));
    }
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
  const { error } = await supabase.from("documents").delete().eq("id", parsedId.data);
  if (error) console.error("discardUpload failed", error.code);
  revalidatePath("/documents");
}

const itemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(PLAN_ITEM_KINDS, e.kind),
  subject: z
    .string()
    .trim()
    .max(100, e.subject)
    .transform((value) => (value === "" ? null : value)),
  text: z.string().trim().min(1, e.text).max(1000, e.text),
});

export async function saveItem(_prev: SaveItemState, formData: FormData): Promise<SaveItemState> {
  await requireParent();
  const supabase = await createClient();

  const rawItemId = formString(formData, "id");
  let documentId: string;
  let itemId: string | null = null;

  if (rawItemId !== "") {
    const parsedItem = idSchema.safeParse(rawItemId);
    if (!parsedItem.success) return { ok: false, error: e.invalid };
    itemId = parsedItem.data;
    // The document comes from the stored item, not from the form.
    const { data: existing, error } = await supabase
      .from("plan_items")
      .select("document_id")
      .eq("id", itemId)
      .maybeSingle();
    if (error) return { ok: false, error: mapDbError(error) };
    if (!existing) return { ok: false, error: e.notFound };
    documentId = existing.document_id as string;
  } else {
    const parsedDoc = idSchema.safeParse(formString(formData, "document_id"));
    if (!parsedDoc.success) return { ok: false, error: e.invalid };
    documentId = parsedDoc.data;
  }

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, member_id, iso_week, iso_year, status")
    .eq("id", documentId)
    .maybeSingle();
  if (docError) return { ok: false, error: mapDbError(docError) };
  if (!doc) return { ok: false, error: e.notFound };
  if (doc.status === "processing") return { ok: false, error: e.wrongStatus };

  const parsed = itemSchema.safeParse({
    date: formString(formData, "date"),
    kind: formString(formData, "kind"),
    subject: formString(formData, "subject"),
    text: formString(formData, "text"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? e.invalid };
  if (!allowedItemDays(doc.iso_year as number, doc.iso_week as number).includes(parsed.data.date)) {
    return { ok: false, error: e.date };
  }

  if (itemId) {
    const { error } = await supabase
      .from("plan_items")
      .update(parsed.data)
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
      ...parsed.data,
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
  const { error } = await supabase
    .from("documents")
    .update({ status: "published", error: null })
    .eq("id", parsedId.data)
    .eq("status", "review");
  if (error) {
    console.error("publishDocument failed", error.code);
    return;
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

  const { error: removeError } = await supabase.storage.from("documents").remove([doc.file_path as string]);
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
