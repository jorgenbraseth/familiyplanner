"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { parseTaskForm, taskMemberOf } from "@/lib/star-forms";
import { MAX_TASKS } from "@/lib/stars";
import { createClient } from "@/lib/supabase/server";

export type TaskActionState = { ok: boolean; error?: string };

const idSchema = z.uuid();
const e = t.stars.errors;

type Client = Awaited<ReturnType<typeof createClient>>;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function refresh() {
  revalidatePath("/stars/tasks");
  revalidatePath("/stars");
  revalidatePath("/");
}

function dbError(action: string, error: { code?: string; message?: string }): string {
  console.error(`${action} failed`, error.code);
  if (error.code === "42501") return e.notAllowed;
  if (error.code === "23505") return e.taskDuplicate;
  return e.failed;
}

/** Rows of one list (a child's own tasks, or the all-children ones) in the parents' order. */
async function readGroup(supabase: Client, memberId: string | null) {
  const query = supabase.from("star_tasks").select("id, sort");
  const { data, error } = await (memberId === null ? query.is("member_id", null) : query.eq("member_id", memberId))
    .order("sort")
    .order("created_at");
  if (error) throw new Error("Could not read the star tasks");
  return (data ?? []) as { id: string; sort: number }[];
}

/** Adds a task, or changes an existing one (name, stars, who). Parents only. */
export async function saveTask(_prev: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireParent();
  const parsed = parseTaskForm(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? e.failed };
  const { id, name, stars } = parsed.data;
  const memberId = taskMemberOf(parsed.data);

  const supabase = await createClient();
  if (memberId !== null) {
    const { data: child } = await supabase.from("members").select("id").eq("id", memberId).eq("role", "child").maybeSingle();
    if (!child) return { ok: false, error: e.taskWho };
  }

  if (id) {
    const { data: current } = await supabase.from("star_tasks").select("member_id").eq("id", id).maybeSingle();
    if (!current) return { ok: false, error: e.taskGone };
    const group = await readGroup(supabase, memberId);
    // Moving to another list puts the task last there.
    const update: { name: string; stars: number; member_id: string | null; sort?: number } = { name, stars, member_id: memberId };
    if ((current.member_id as string | null) !== memberId) {
      if (group.length >= MAX_TASKS) return { ok: false, error: e.taskCount };
      update.sort = group.length === 0 ? 0 : Math.max(...group.map((row) => row.sort)) + 1;
    }
    const { data, error } = await supabase.from("star_tasks").update(update).eq("id", id).select("id");
    if (error) return { ok: false, error: dbError("saveTask", error) };
    if (!data || data.length === 0) return { ok: false, error: e.taskGone };
  } else {
    const group = await readGroup(supabase, memberId);
    if (group.length >= MAX_TASKS) return { ok: false, error: e.taskCount };
    const sort = group.length === 0 ? 0 : Math.max(...group.map((row) => row.sort)) + 1;
    const { error } = await supabase.from("star_tasks").insert({ name, stars, member_id: memberId, sort });
    if (error) return { ok: false, error: dbError("saveTask", error) };
  }
  refresh();
  return { ok: true };
}

/** Deletes a task. Stars already given keep their amount (their task link is cleared). Parents only. */
export async function deleteTask(formData: FormData): Promise<void> {
  await requireParent();
  const id = idSchema.safeParse(field(formData, "id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("star_tasks").delete().eq("id", id.data);
  if (error) {
    console.error("deleteTask failed", error.code);
    return;
  }
  refresh();
}

/** Moves a task one step up or down inside its list. Parents only. */
export async function moveTask(formData: FormData): Promise<void> {
  await requireParent();
  const id = idSchema.safeParse(field(formData, "id"));
  const direction = z.enum(["up", "down"]).safeParse(field(formData, "direction"));
  if (!id.success || !direction.success) return;

  const supabase = await createClient();
  const { data: task } = await supabase.from("star_tasks").select("member_id").eq("id", id.data).maybeSingle();
  if (!task) return;
  const group = await readGroup(supabase, task.member_id as string | null);
  const index = group.findIndex((row) => row.id === id.data);
  const target = direction.data === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= group.length) return;

  const order = group.map((row) => row.id);
  [order[index], order[target]] = [order[target], order[index]];
  // Rewrite the whole list's sort, so equal sort values can never leave the move without effect.
  for (const [sort, rowId] of order.entries()) {
    const { error } = await supabase.from("star_tasks").update({ sort }).eq("id", rowId);
    if (error) {
      console.error("moveTask failed", error.code);
      return;
    }
  }
  refresh();
}
