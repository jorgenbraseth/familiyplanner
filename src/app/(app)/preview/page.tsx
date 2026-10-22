import { redirect } from "next/navigation";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/view-as";
import { startPreview } from "../preview-actions";

export default async function PreviewPage() {
  await requireParent();
  if ((await getViewer()).previewing) redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).eq("role", "child").order("created_at");
  if (error) throw new Error("Could not read members");
  const children = data as Member[];

  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.preview.title}</h1>
      <p className="max-w-[75ch] text-muted">{t.preview.intro}</p>
      {children.length === 0 ? (
        <p>{t.preview.noChildren}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {children.map((child) => (
            <li key={child.id}>
              <form action={startPreview}>
                <input type="hidden" name="child" value={child.id} />
                <button type="submit" className="btn btn-primary min-h-16 w-full gap-3 text-lg">
                  <span aria-hidden className="size-4 shrink-0 rounded-full border-2 border-on-primary" style={{ backgroundColor: child.colour }} />
                  {t.preview.start(child.name)}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
