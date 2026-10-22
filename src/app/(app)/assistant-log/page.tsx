import { requireParent } from "@/lib/auth";
import { dateInTimeZone, dayKey, formatDayHeading, formatTime, parseDayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { clearAssistantLog } from "./actions";

type LogRow = {
  id: string;
  member_id: string;
  question: string;
  answer: string;
  tools_used: string[] | null;
  created_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssistantLogPage({ searchParams }: PageProps<"/assistant-log">) {
  await requireParent();
  const supabase = await createClient();

  const raw = (await searchParams).member;
  const memberParam = typeof raw === "string" && UUID.test(raw) ? raw : "";

  const { data: memberData, error: memberError } = await supabase.from("members").select("id, name, colour").order("created_at");
  if (memberError) throw new Error("Could not read members");
  const members = memberData as { id: string; name: string; colour: string }[];
  const byId = new Map(members.map((m) => [m.id, m]));

  let query = supabase
    .from("assistant_log")
    .select("id, member_id, question, answer, tools_used, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (memberParam) query = query.eq("member_id", memberParam);
  const { data, error } = await query;
  if (error) throw new Error("Could not read the assistant log");
  const rows = data as LogRow[];

  // Newest first, so days appear newest first too (Map keeps insertion order).
  const days = new Map<string, LogRow[]>();
  for (const row of rows) {
    const key = dayKey(dateInTimeZone(new Date(row.created_at)));
    days.set(key, [...(days.get(key) ?? []), row]);
  }

  const l = t.assistant.log;
  return (
    <>
      <div>
        <h1 className="text-4xl font-bold leading-tight">{l.title}</h1>
        <p className="mt-1 max-w-[75ch] text-muted">{l.intro}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form method="get" className="flex items-end gap-2">
          <label className="block text-sm font-bold">
            {l.filterLabel}
            <select name="member" defaultValue={memberParam} className="field mt-1 block min-w-40">
              <option value="">{l.filterAll}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-secondary">
            {l.filterApply}
          </button>
        </form>

        <details className="ml-auto">
          <summary className="btn btn-danger list-none">{l.clear}</summary>
          <form action={clearAssistantLog} className="panel mt-2 space-y-3 p-4">
            <p className="font-bold">{l.clearConfirm}</p>
            <button type="submit" className="btn btn-danger">
              {l.clearYes}
            </button>
          </form>
        </details>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">{l.empty}</p>
      ) : (
        [...days.entries()].map(([key, dayRows]) => (
          <section key={key} className="space-y-4">
            <h2 className="text-xl font-extrabold capitalize">{formatDayHeading(parseDayKey(key))}</h2>
            <ul className="grid gap-4 lg:grid-cols-2 lg:items-start 2xl:grid-cols-3">
              {dayRows.map((row) => {
                const member = byId.get(row.member_id);
                return (
                  <li key={row.id} className="space-y-2 rounded-3xl bg-chip p-4">
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: member?.colour ?? "#999999" }} />
                      <span className="font-bold text-ink">{member?.name ?? l.unknownMember}</span>
                      <span>{formatTime(new Date(row.created_at))}</span>
                    </p>
                    <p className="font-bold">
                      <span className="sr-only">{l.questionLabel}: </span>
                      {row.question}
                    </p>
                    <p className="max-w-[75ch] whitespace-pre-wrap">
                      <span className="sr-only">{l.answerLabel}: </span>
                      {row.answer}
                    </p>
                    {row.tools_used && row.tools_used.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5" aria-label={l.tools}>
                        {row.tools_used.map((tool, i) => (
                          <li key={`${tool}-${i}`} className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold text-chip-ink">
                            {tool}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
