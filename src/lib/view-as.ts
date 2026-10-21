import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentMember } from "./auth";
import { MEMBER_COLUMNS, type Member } from "./members";
import { VIEW_AS_COOKIE, canPreview, parseViewAsId } from "./preview";
import { createClient } from "./supabase/server";

export type Viewer = {
  /** The signed-in member. */
  me: Member;
  /** Whose app is shown: the child being previewed, otherwise `me`. */
  viewing: Member;
  previewing: boolean;
};

/**
 * Who the app is shown for. The `view_as` cookie is only honoured for a parent and only when it
 * names an existing child (read with the user client); anything else falls back to the signed-in member.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  const me = await getCurrentMember();
  if (me.role !== "parent") return { me, viewing: me, previewing: false };

  const id = parseViewAsId((await cookies()).get(VIEW_AS_COOKIE)?.value);
  if (!id) return { me, viewing: me, previewing: false };

  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return { me, viewing: me, previewing: false };
  const target = data as Member;
  return canPreview(me, target) ? { me, viewing: target, previewing: true } : { me, viewing: me, previewing: false };
});
