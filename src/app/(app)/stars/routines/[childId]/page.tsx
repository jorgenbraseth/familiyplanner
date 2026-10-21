import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { parseViewAsId } from "@/lib/preview";
import type { RoutineItemRow, RoutineSettingsRow, RoutineSlot } from "@/lib/routines";
import { taskScopeFilter } from "@/lib/stars";
import { createClient } from "@/lib/supabase/server";
import { RoutineForm, type StarTaskOption } from "./routine-form";

const SLOTS: RoutineSlot[] = ["morning", "evening"];

export default async function ChildRoutinesPage({ params }: PageProps<"/stars/routines/[childId]">) {
  await requireParent();
  const childId = parseViewAsId((await params).childId);
  if (!childId) notFound();

  const supabase = await createClient();
  const { data: child } = await supabase.from("members").select("id, name").eq("id", childId).eq("role", "child").maybeSingle();
  if (!child) notFound();

  const [itemsResult, settingsResult, trackResult] = await Promise.all([
    supabase.from("routine_items").select("id, slot, name, sort, created_at").eq("member_id", childId).order("sort").order("created_at"),
    supabase.from("routine_settings").select("slot, star_task_id").eq("member_id", childId),
    supabase.from("star_tracks").select("id").eq("member_id", childId).eq("status", "active").maybeSingle(),
  ]);
  if (itemsResult.error) throw new Error("Could not read the routine items");
  if (settingsResult.error) throw new Error("Could not read the routine settings");
  const items = (itemsResult.data ?? []) as Pick<RoutineItemRow, "id" | "slot" | "name">[];
  const settings = (settingsResult.data ?? []) as Pick<RoutineSettingsRow, "slot" | "star_task_id">[];

  let starTasks: StarTaskOption[] | null = null;
  const trackId = (trackResult.data as { id: string } | null)?.id;
  if (trackId) {
    const { data, error } = await supabase
      .from("star_tasks")
      .select("id, name, stars")
      .or(taskScopeFilter(childId))
      .order("sort")
      .order("created_at");
    if (error) throw new Error("Could not read the star tasks");
    starTasks = (data ?? []) as StarTaskOption[];
  }

  const a = t.routines.admin;
  return (
    <>
      <h1 className="text-3xl font-extrabold">{a.title(child.name as string)}</h1>
      <p className="text-sm text-muted">{a.explain}</p>
      {!starTasks && (
        <p className="text-sm">
          <Link href={`/stars/new?child=${childId}`} className="font-bold text-primary-strong underline underline-offset-4">
            {a.newTrack}
          </Link>
        </p>
      )}
      {SLOTS.map((slot) => (
        <RoutineForm
          key={slot}
          childId={childId}
          slot={slot}
          items={items.filter((i) => i.slot === slot).map(({ id, name }) => ({ id, name }))}
          starTaskId={settings.find((s) => s.slot === slot)?.star_task_id ?? null}
          starTasks={starTasks}
        />
      ))}
      <Link href="/stars" className="btn btn-secondary">
        {a.back}
      </Link>
    </>
  );
}
