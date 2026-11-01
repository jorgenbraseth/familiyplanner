import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { normalizeEmail } from "@/lib/members";
import {
  effectiveMode,
  parseDeviceId,
  parseSignInMode,
  SCREEN_DEVICE_COOKIE,
  SCREEN_DEVICE_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/screen-mode";
import { createClient } from "@/lib/supabase/server";

// Google → Supabase → here. Exchanges the code for a session, then applies the allowlist and, for
// "Logg inn som familieskjerm" (or a tablet locked as a family screen), puts the session into
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

  const cookieStore = await cookies();
  const deviceId = parseDeviceId(cookieStore.get(SCREEN_DEVICE_COOKIE)?.value);
  let locked = false;
  if (deviceId) {
    const { data: isLocked } = await supabase.rpc("screen_device_locked", { p_id: deviceId });
    locked = isLocked === true;
  }
  const mode = effectiveMode(parseSignInMode(searchParams.get("mode")), locked);
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

  // Lock this tablet (unless it already is), so signing out and back in gives the screen again.
  let lockedId = locked ? deviceId : null;
  if (!lockedId) {
    const { data: newId, error: registerError } = await supabase.rpc("register_screen_device");
    if (registerError || typeof newId !== "string") {
      console.error("register_screen_device failed", registerError?.code);
      return refuse("screen-failed");
    }
    lockedId = newId;
  }
  cookieStore.set(SCREEN_DEVICE_COOKIE, lockedId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SCREEN_DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
  return NextResponse.redirect(`${origin}/skjerm`);
}
