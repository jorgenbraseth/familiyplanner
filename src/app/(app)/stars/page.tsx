import { StarChildView } from "@/components/star-child-view";
import { getCurrentMember } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { loadAllChildStars, loadChildStars, loadRequestsLeftToday } from "@/lib/star-data";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/view-as";
import { StarParentView } from "./parent-view";

export default async function StarsPage() {
  await getCurrentMember();
  const { viewing, previewing } = await getViewer();

  if (viewing.role === "child") {
    const [data, left] = await Promise.all([loadChildStars(viewing.id), loadRequestsLeftToday(viewing.id)]);
    return (
      <>
        <h1 className="text-3xl font-extrabold">{t.stars.title}</h1>
        <StarChildView data={data} left={left} previewing={previewing} />
      </>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).eq("role", "child").order("created_at");
  if (error) throw new Error("Could not read members");
  const rows = await loadAllChildStars(data as Member[]);
  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.stars.title}</h1>
      <StarParentView rows={rows} />
    </>
  );
}
