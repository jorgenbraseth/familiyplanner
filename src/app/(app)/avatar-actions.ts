"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { AVATAR_BUCKET, setAvatarSchema } from "@/lib/avatar";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export type AvatarResult = { ok: boolean; error?: string };

/**
 * Sets (or, with path null, removes) a member's picture after the browser uploaded the file. A parent may change
 * anyone's; a member only their own (checked here and by RLS/trigger). The previous file is deleted.
 */
export async function setAvatar(input: { memberId: string; path: string | null }): Promise<AvatarResult> {
  const me = await getCurrentMember();
  const parsed = setAvatarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t.avatar.errors.failed };
  const { memberId, path } = parsed.data;
  if (me.role !== "parent" && me.id !== memberId) return { ok: false, error: t.avatar.errors.notAllowed };

  const supabase = await createClient();
  const { data: current } = await supabase.from("members").select("avatar_path").eq("id", memberId).maybeSingle();
  const previous = (current?.avatar_path as string | null | undefined) ?? null;

  const { data: updated, error } = await supabase
    .from("members")
    .update({ avatar_path: path })
    .eq("id", memberId)
    .select("id");
  if (error || !updated || updated.length === 0) {
    console.error("setAvatar failed", error?.code);
    return { ok: false, error: error?.code === "42501" ? t.avatar.errors.notAllowed : t.avatar.errors.failed };
  }

  if (previous && previous !== path) {
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
    if (removeError) console.error("setAvatar: old file not removed");
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
