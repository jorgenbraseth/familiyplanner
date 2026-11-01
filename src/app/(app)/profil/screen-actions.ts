"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireParent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();

/**
 * A parent (normal session) frees a tablet that was set up as a family screen. The user-scoped
 * client does the update; RLS and a trigger decide (a screen session cannot release, a release is
 * final and records who and when). It does not sign the screen out.
 */
export async function releaseScreenDevice(formData: FormData): Promise<void> {
  await requireParent();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("screen_devices")
    .update({ released_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("released_at", null);
  if (error) console.error("releaseScreenDevice failed", error.code);
  revalidatePath("/profil");
}
