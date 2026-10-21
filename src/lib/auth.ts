import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { MEMBER_COLUMNS, normalizeEmail, type Member } from "./members";
import { createClient } from "./supabase/server";

/** The signed-in Google user's email, or null. Verifies the session JWT. */
export const getSessionEmail = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  return typeof email === "string" ? normalizeEmail(email) : null;
});

/**
 * The signed-in member, read with the user-scoped client: RLS only returns a row for an
 * allowlisted email. Signed out → /login; signed in but not (or no longer) allowlisted → signed
 * out and shown the "not invited" page.
 */
export const getCurrentMember = cache(async (): Promise<Member> => {
  const email = await getSessionEmail();
  if (!email) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).eq("email", email).maybeSingle();
  if (error) throw new Error("Could not read the member row");
  if (!data) redirect("/auth/not-invited");
  return data as Member;
});

export async function requireParent(): Promise<Member> {
  const member = await getCurrentMember();
  if (member.role !== "parent") redirect("/");
  return member;
}
