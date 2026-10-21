import { NextResponse, type NextRequest } from "next/server";
import { normalizeEmail } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";

// Google → Supabase → here. Exchanges the code for a session, then applies the allowlist.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=1`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data.user?.email;
  if (error || !email) return NextResponse.redirect(`${origin}/login?error=1`);

  // User-scoped read: RLS only returns the row if this email is allowlisted.
  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (!member) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/not-invited?email=${encodeURIComponent(normalizeEmail(email))}`);
  }
  return NextResponse.redirect(`${origin}/`);
}
