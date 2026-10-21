import "server-only";
import { AVATAR_BUCKET } from "./avatar";
import { createClient } from "./supabase/server";

export type AvatarUrls = Record<string, string>;

/**
 * Signed URLs (1 hour) for the members' pictures, one storage call for the whole page. Keyed by member id.
 * Members without a picture, and any failure, are simply left out: the UI falls back to the colour dot.
 */
export async function loadAvatarUrls(
  members: readonly { id: string; avatar_path?: string | null }[],
): Promise<AvatarUrls> {
  const withPath = members.filter((m): m is { id: string; avatar_path: string } => !!m.avatar_path);
  if (withPath.length === 0) return {};
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(withPath.map((m) => m.avatar_path), 3600);
    if (error || !data) return {};
    const urls: AvatarUrls = {};
    data.forEach((entry, i) => {
      if (entry.signedUrl && !entry.error) urls[withPath[i].id] = entry.signedUrl;
    });
    return urls;
  } catch {
    console.error("Avatar URLs failed");
    return {};
  }
}
