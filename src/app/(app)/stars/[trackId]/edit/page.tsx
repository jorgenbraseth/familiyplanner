import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { parseViewAsId } from "@/lib/preview";
import { TASK_COLUMNS, TRACK_COLUMNS } from "@/lib/star-data";
import type { StarTaskRow, StarTrackRow } from "@/lib/stars";
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
  const { data: tasks, error: tasksError } = await supabase
    .from("star_tasks")
    .select(TASK_COLUMNS)
    .eq("track_id", trackId)
    .order("sort")
    .order("created_at");
  if (tasksError) throw new Error("Could not read the star tasks");
  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.stars.form.editTitle}</h1>
      <TrackForm track={data as StarTrackRow} tasks={(tasks ?? []) as StarTaskRow[]} />
    </>
  );
}
