"use server";

import { revalidatePath } from "next/cache";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { parseRoutineForm, type RoutineItemInput } from "@/lib/routine-forms";
import { ROUTINE_MAX_ITEMS_PER_SLOT, type RoutineSlot } from "@/lib/routines";
import { createClient } from "@/lib/supabase/server";

export type RoutineAdminState = { ok: boolean; error?: string };

const e = t.routines.admin.errors;

type Client = Awaited<ReturnType<typeof createClient>>;

function dbError(
  action: string,
  error: { code?: string; message?: string },
): string {
  console.error(`${action} failed`, error.code);
  if (error.code === "42501") return e.notAllowed;
  if (error.code === "23505") return e.itemDuplicate;
  if (error.code === "23514") return e.itemCount(ROUTINE_MAX_ITEMS_PER_SLOT);
  return e.failed;
}

/** Makes the child's items in `slot` equal to `items` (ids kept for existing ones, list order = sort). */
async function syncItems(
  supabase: Client,
  childId: string,
  slot: RoutineSlot,
  items: RoutineItemInput[],
): Promise<{ error?: { code?: string; message?: string } }> {
  const { data: existing, error } = await supabase
    .from("routine_items")
    .select("id")
    .eq("member_id", childId)
    .eq("slot", slot);
  if (error) return { error };
  const existingIds = new Set((existing ?? []).map((row) => row.id as string));
  const keep = new Set(
    items.flatMap((item) =>
      item.id && existingIds.has(item.id) ? [item.id] : [],
    ),
  );

  const removed = [...existingIds].filter((id) => !keep.has(id));
  if (removed.length > 0) {
    const { error: deleteError } = await supabase
      .from("routine_items")
      .delete()
      .in("id", removed);
    if (deleteError) return { error: deleteError };
  }
  for (const [sort, item] of items.entries()) {
    if (item.id && keep.has(item.id)) {
      const { error: updateError } = await supabase
        .from("routine_items")
        .update({ name: item.name, sort })
        .eq("id", item.id)
        .eq("member_id", childId)
        .eq("slot", slot);
      if (updateError) return { error: updateError };
    }
  }
  const added = items.flatMap((item, sort) =>
    item.id && keep.has(item.id)
      ? []
      : [{ member_id: childId, slot, name: item.name, sort }],
  );
  if (added.length > 0) {
    const { error: insertError } = await supabase
      .from("routine_items")
      .insert(added);
    if (insertError) return { error: insertError };
  }
  return {};
}

/** Saves one list (items and star task) of a child's routine. Parents only. */
export async function saveRoutine(
  _prev: RoutineAdminState,
  formData: FormData,
): Promise<RoutineAdminState> {
  await requireParent();
  const parsed = parseRoutineForm(formData);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? e.invalid };
  const { childId, slot, items, starTaskId } = parsed.data;

  const supabase = await createClient();
  const { data: child } = await supabase
    .from("members")
    .select("id")
    .eq("id", childId)
    .eq("role", "child")
    .maybeSingle();
  if (!child) return { ok: false, error: t.routines.admin.notFound };

  if (starTaskId !== "") {
    // The task must be on the child's active track (the database only requires one of the child's tracks).
    const { data: task } = await supabase
      .from("star_tasks")
      .select("id, star_tracks!inner(member_id, status)")
      .eq("id", starTaskId)
      .eq("star_tracks.member_id", childId)
      .eq("star_tracks.status", "active")
      .maybeSingle();
    if (!task) return { ok: false, error: e.star };
  }

  const synced = await syncItems(supabase, childId, slot, items);
  if (synced.error)
    return { ok: false, error: dbError("saveRoutine items", synced.error) };

  const { error: settingsError } = await supabase
    .from("routine_settings")
    .upsert(
      {
        member_id: childId,
        slot,
        star_task_id: starTaskId === "" ? null : starTaskId,
      },
      { onConflict: "member_id,slot" },
    );
  if (settingsError)
    return { ok: false, error: dbError("saveRoutine settings", settingsError) };

  revalidatePath(`/stars/routines/${childId}`);
  revalidatePath("/");
  return { ok: true };
}
