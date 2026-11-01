"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { callbackPath, effectiveMode, parseDeviceId, parseSignInMode, SCREEN_DEVICE_COOKIE } from "@/lib/screen-mode";
import { createClient } from "@/lib/supabase/server";

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
}

/**
 * Starts the Google sign-in. The form's `mode` field says whether the user chose "Logg inn" or
 * "Logg inn som familieskjerm"; it travels in the redirect URL. A tablet that is locked as a family
 * screen always asks for screen mode. The callback validates everything again.
 */
export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const deviceId = parseDeviceId((await cookies()).get(SCREEN_DEVICE_COOKIE)?.value);
  let locked = false;
  if (deviceId) {
    const { data } = await supabase.rpc("screen_device_locked", { p_id: deviceId });
    locked = data === true;
  }
  const mode = effectiveMode(parseSignInMode(formData.get("mode")), locked);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteOrigin()}${callbackPath(mode)}`,
      // Always show the account picker, so a family on a shared tablet can switch accounts.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=1");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  // Only this browser's session: a screen's "Logg ut" must not sign the parent out on their phone.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
