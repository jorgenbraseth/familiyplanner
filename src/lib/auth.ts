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
 * True when this auth session was entered as Familieskjerm (database: `screen_sessions`, keyed by
 * the JWT's session_id). Fails closed: an error is thrown, never read as "normal session".
 */
export const isScreenSession = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_session_is_screen");
  if (error) throw new Error("Could not read the session mode");
  return data === true;
});

/**
 * The signed-in member, read with the user-scoped client: RLS only returns a row for an
 * allowlisted email. A parent whose session is in screen mode comes back with the effective role
 * "screen" (the row itself still says parent), so everything that already handles the family screen
 * applies. Signed out → /login; signed in but not (or no longer) allowlisted → signed
 * out and shown the "not invited" page.
 */
export const getCurrentMember = cache(async (): Promise<Member> => {
  const email = await getSessionEmail();
  if (!email) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).eq("email", email).maybeSingle();
  if (error) throw new Error("Could not read the member row");
  if (!data) redirect("/auth/not-invited");
  const member = data as Member;
  if (member.role === "parent" && (await isScreenSession())) return { ...member, role: "screen" };
  return member;
});

export async function requireParent(): Promise<Member> {
  const member = await getCurrentMember();
  if (member.role !== "parent") redirect("/");
  return member;
}

/** The shared family tablet (a parent's session in screen mode); everyone else goes to the normal app. */
export async function requireScreen(): Promise<Member> {
  const member = await getCurrentMember();
  if (member.role !== "screen") redirect("/");
  return member;
}
