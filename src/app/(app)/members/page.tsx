import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { DeleteButton } from "./delete-button";
import { MemberForm } from "./member-form";

export default async function MembersPage() {
  const me = await requireParent();
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).order("created_at");
  if (error) throw new Error("Could not read members");
  const members = data as Member[];

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.members.title}</h1>
      <ul className="space-y-3">
        {members.map((member) => (
          <li key={member.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-full"
                style={{ backgroundColor: member.colour }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {member.name}
                  {member.id === me.id && (
                    <span className="font-normal text-zinc-500 dark:text-zinc-400"> ({t.members.you})</span>
                  )}
                </p>
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  {member.email} · {t.members.roles[member.role]}
                </p>
              </div>
            </div>
            <details className="mt-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-blue-700 dark:text-blue-400">
                {t.members.edit}
              </summary>
              <div className="space-y-3 pt-2">
                <MemberForm member={member} />
                {member.id !== me.id && <DeleteButton id={member.id} name={member.name} />}
              </div>
            </details>
          </li>
        ))}
      </ul>
      <section className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">{t.members.add}</h2>
        <MemberForm />
      </section>
    </>
  );
}
