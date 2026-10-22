import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { parseViewAsId } from "@/lib/preview";
import { TRACK_COLUMNS } from "@/lib/star-data";
import type { StarTrackRow } from "@/lib/stars";
import { createClient } from "@/lib/supabase/server";
import { TrackForm } from "../../track-form";

export default async function EditTrackPage({ params }: PageProps<"/stars/[trackId]/edit">) {
  await requireParent();
  const trackId = parseViewAsId((await params).trackId);
  if (!trackId) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.from("star_tracks").select(TRACK_COLUMNS).eq("id", trackId).maybeSingle();
  if (error) throw new Error("Could not read the star track");
  if (!data) notFound();
  return (
    <>
      <h1 className="text-4xl font-bold leading-tight">{t.stars.form.editTitle}</h1>
      <TrackForm track={data as StarTrackRow} />
    </>
  );
}
