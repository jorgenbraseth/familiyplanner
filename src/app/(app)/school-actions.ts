"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/view-as";

const inputSchema = z.object({ id: z.uuid(), done: z.boolean() });

/** Tick or untick a plan item. RLS and a trigger make sure only the owner's published items change, and only `done`. */
export async function setPlanItemDone(id: string, done: boolean): Promise<{ ok: boolean }> {
  await getCurrentMember();
  // A parent previewing a child's app can only look.
  if ((await getViewer()).previewing) return { ok: false };
  const parsed = inputSchema.safeParse({ id, done });
  if (!parsed.success) return { ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_items")
    .update({ done: parsed.data.done })
    .eq("id", parsed.data.id)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("setPlanItemDone failed", error.code);
    return { ok: false };
  }
  revalidatePath("/");
  return { ok: true };
}
