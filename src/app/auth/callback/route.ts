import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { normalizeEmail } from "@/lib/members";
import { parseSignInMode } from "@/lib/screen-mode";
import { createClient } from "@/lib/supabase/server";

// Google → Supabase → here. Exchanges the code for a session, then applies the allowlist and, for
// "Logg inn som familieskjerm", puts the session into
// screen mode: only a parent can, and the database then gives that session the screen's rights only.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  // The "Before User Created" hook rejects strangers; Supabase passes that back as an error.
  const errorText = `${searchParams.get("error_description") ?? ""} ${searchParams.get("error_code") ?? ""} ${searchParams.get("error") ?? ""}`;
  if (errorText.includes("not_invited")) return NextResponse.redirect(`${origin}/not-invited`);

  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=1`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data.user?.email;
  if (error || !email) return NextResponse.redirect(`${origin}/login?error=1`);

  // User-scoped read: RLS only returns the row if this email is allowlisted.
  const { data: member } = await supabase
    .from("members")
    .select("id, role")
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (!member) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(`${origin}/not-invited?email=${encodeURIComponent(normalizeEmail(email))}`);
  }

  // A device is never locked to a mode: a stale cookie from the old device lock is removed.
  (await cookies()).delete("screen_device");
  const mode = parseSignInMode(searchParams.get("mode"));
  if (mode === "normal") return NextResponse.redirect(`${origin}/`);

  // Screen mode. Never fall through to a normal session from here on.
  const refuse = async (reason: "screen-parents-only" | "screen-failed") => {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  };
  if (member.role !== "parent") return refuse("screen-parents-only");

  const { error: enterError } = await supabase.rpc("enter_screen_mode");
  if (enterError) {
    console.error("enter_screen_mode failed", enterError.code);
    return refuse("screen-failed");
  }

  return NextResponse.redirect(`${origin}/skjerm`);
}
