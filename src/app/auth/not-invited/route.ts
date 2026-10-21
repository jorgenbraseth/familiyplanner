import { NextResponse, type NextRequest } from "next/server";
import { getSessionEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// A signed-in user who isn't (or is no longer) in members: sign them out, then explain.
// Server Components can't clear cookies, so getCurrentMember() redirects here.
export async function GET(request: NextRequest) {
  const email = await getSessionEmail();
  const supabase = await createClient();
  await supabase.auth.signOut();
  const target = new URL("/not-invited", request.nextUrl.origin);
  if (email) target.searchParams.set("email", email);
  return NextResponse.redirect(target);
}
