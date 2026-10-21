"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { parseMemberForm } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";

export type SaveMemberState = { ok: boolean; error?: string };

const idSchema = z.uuid();

function readId(formData: FormData): string | null {
  const value = formData.get("id");
  return typeof value === "string" ? value : null;
}

export async function saveMember(_prevState: SaveMemberState, formData: FormData): Promise<SaveMemberState> {
  await requireParent();

  const rawId = readId(formData);
  let id: string | null = null;
  if (rawId !== null && rawId !== "") {
    const parsedId = idSchema.safeParse(rawId);
    if (!parsedId.success) return { ok: false, error: t.members.errors.failed };
    id = parsedId.data;
  }

  const parsed = parseMemberForm(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? t.members.errors.failed };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("members").update(parsed.data).eq("id", id)
    : await supabase.from("members").insert(parsed.data);

  if (error) {
    console.error("saveMember failed", error.code);
    if (error.code === "23505") return { ok: false, error: t.members.errors.duplicate };
    if (error.code === "42501") return { ok: false, error: t.members.errors.notAllowed };
    return { ok: false, error: t.members.errors.failed };
  }

  revalidatePath("/members");
  return { ok: true };
}

export async function deleteMember(formData: FormData): Promise<void> {
  const parent = await requireParent();

  const parsedId = idSchema.safeParse(readId(formData));
  if (!parsedId.success) return;
  if (parsedId.data === parent.id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("id", parsedId.data);
  if (error) {
    console.error("deleteMember failed", error.code);
    return;
  }

  revalidatePath("/members");
}
