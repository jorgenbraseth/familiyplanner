import { releaseScreenDevice } from "@/app/(app)/profil/screen-actions";
import { formatDayHeading, dateInTimeZone } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/** "Familieskjermer" on the profile page: tablets locked as a family screen, with a "Frigi" button. Parents in a normal session only. */
export async function ScreenDevices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("screen_devices")
    .select("id, created_at, created_by")
    .is("released_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not read screen devices");
  const devices = data ?? [];

  const creatorIds = [...new Set(devices.map((d) => d.created_by).filter((v): v is string => typeof v === "string"))];
  const names = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: members } = await supabase.from("members").select("id, name").in("id", creatorIds);
    for (const m of members ?? []) names.set(m.id as string, m.name as string);
  }

  return (
    <section className="space-y-3" aria-labelledby="profile-screens-title">
      <h2 id="profile-screens-title" className="text-2xl font-bold">{t.profile.screens.title}</h2>
      <p className="max-w-[75ch] text-sm text-muted">{t.profile.screens.intro}</p>
      {devices.length === 0 ? (
        <p>{t.profile.screens.none}</p>
      ) : (
        <ul className="space-y-1">
          {devices.map((d) => (
            <li key={d.id as string} className="flex items-center justify-between gap-4">
              <span className="min-w-0">
                {t.profile.screens.setUp(
                  formatDayHeading(dateInTimeZone(new Date(d.created_at as string))),
                  d.created_by ? (names.get(d.created_by as string) ?? null) : null,
                )}
              </span>
              <form action={releaseScreenDevice}>
                <input type="hidden" name="id" value={d.id as string} />
                <button type="submit" className="btn btn-text min-h-11">
                  {t.profile.screens.release}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
