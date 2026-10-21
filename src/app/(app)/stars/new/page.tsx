import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { parseViewAsId } from "@/lib/preview";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { TrackForm } from "../track-form";

export default async function NewTrackPage({ searchParams }: PageProps<"/stars/new">) {
  await requireParent();
  const raw = (await searchParams).child;
  const childId = parseViewAsId(Array.isArray(raw) ? raw[0] : raw);

  const supabase = await createClient();
  const [childResult, activeResult] = childId
    ? await Promise.all([
        supabase.from("members").select("id, name").eq("id", childId).eq("role", "child").maybeSingle(),
        supabase.from("star_tracks").select("id").eq("member_id", childId).eq("status", "active").maybeSingle(),
      ])
    : [null, null];
  const child = childResult?.data as { id: string; name: string } | null | undefined;

  if (!child) return <Back message={t.stars.form.notFound} />;
  if (activeResult?.data) return <Back message={t.stars.form.alreadyActive} />;
  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.stars.form.newTitle(child.name)}</h1>
      <TrackForm childId={child.id} />
    </>
  );
}

function Back({ message }: { message: string }) {
  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.stars.title}</h1>
      <p>{message}</p>
      <Link href="/stars" className="btn btn-secondary">
        {t.stars.form.cancel}
      </Link>
    </>
  );
}
