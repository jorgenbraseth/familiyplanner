"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE_SECONDS, THEME_IDS } from "@/lib/themes";

export type ThemeResult = { ok: boolean; error?: string };

const themeSchema = z.enum(THEME_IDS);

/** Saves the signed-in member's own theme (user-scoped client; RLS and a trigger allow only that) and mirrors it in the cookie. */
export async function setTheme(input: unknown): Promise<ThemeResult> {
  const me = await getCurrentMember();
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t.profile.theme.failed };

  const supabase = await createClient();
  const { data, error } = await supabase.from("members").update({ theme: parsed.data }).eq("id", me.id).select("id");
  if (error || !data || data.length === 0) {
    console.error("setTheme failed", error?.code);
    return { ok: false, error: t.profile.theme.failed };
  }

  (await cookies()).set(THEME_COOKIE, parsed.data, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
