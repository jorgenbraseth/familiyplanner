"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireParent } from "@/lib/auth";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { VIEW_AS_COOKIE, VIEW_AS_MAX_AGE_SECONDS, canPreview, parseViewAsId } from "@/lib/preview";
import { createClient } from "@/lib/supabase/server";

/** A parent starts previewing the app as a child. */
export async function startPreview(formData: FormData): Promise<void> {
  const me = await requireParent();
  const raw = formData.get("child");
  const id = parseViewAsId(typeof raw === "string" ? raw : null);
  if (!id) redirect("/preview");

  const supabase = await createClient();
  const { data } = await supabase.from("members").select(MEMBER_COLUMNS).eq("id", id).maybeSingle();
  if (!canPreview(me, data as Member | null)) redirect("/preview");

  (await cookies()).set(VIEW_AS_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIEW_AS_MAX_AGE_SECONDS,
  });
  redirect("/");
}

export async function stopPreview(): Promise<void> {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/");
}
