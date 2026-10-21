import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();

/** Redirects to a short-lived signed URL of the original file. RLS decides who may see the document. */
export async function GET(_request: Request, ctx: RouteContext<"/documents/[id]/file">) {
  await getCurrentMember();
  const parsed = idSchema.safeParse((await ctx.params).id);
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!parsed.success) return notFound();

  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("file_path").eq("id", parsed.data).maybeSingle();
  if (!doc) return notFound();

  const { data: signed, error } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, 60);
  if (error || !signed) return notFound();

  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
