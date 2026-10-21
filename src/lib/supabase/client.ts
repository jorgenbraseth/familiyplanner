import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "./env";

// Supabase client for Client Components. Runs as the signed-in user (RLS applies).
export function createClient() {
  const { url, anonKey } = requireSupabasePublicEnv();
  return createBrowserClient(url, anonKey);
}
