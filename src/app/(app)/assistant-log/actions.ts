"use server";

import { revalidatePath } from "next/cache";
import { requireParent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Deletes every row of the assistant log. User-scoped client: RLS only lets parents delete. */
export async function clearAssistantLog() {
  await requireParent();
  const supabase = await createClient();
  const { error } = await supabase.from("assistant_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error("Could not clear the assistant log");
  revalidatePath("/assistant-log");
}
