import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { loadAllTasks } from "@/lib/star-data";
import { createClient } from "@/lib/supabase/server";
import { TaskForm, type TaskChild } from "./task-form";
import { deleteTask, moveTask } from "../task-actions";

const a = t.stars.tasksAdmin;
const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-chip text-lg font-bold text-chip-ink disabled:opacity-40";

/** Parents: the star tasks, for all children and for each child. They apply to the child's active track. */
export default async function StarTasksPage() {
  await requireParent();
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).eq("role", "child").order("created_at");
  if (error) throw new Error("Could not read members");
  const children: TaskChild[] = (data as Member[]).map((c) => ({ id: c.id, name: c.name }));
  const tasks = await loadAllTasks();

  const groups = [
    { key: "all", title: a.groupAll, rows: tasks.filter((task) => task.member_id === null) },
    ...children.map((c) => ({ key: c.id, title: a.groupChild(c.name), rows: tasks.filter((task) => task.member_id === c.id) })),
  ];

  return (
    <>
      <h1 className="text-4xl font-bold leading-tight">{a.title}</h1>
      <p className="max-w-[75ch] text-sm text-muted">{a.intro}</p>

      <section className="max-w-2xl space-y-3">
        <h2 className="text-2xl font-bold">{a.addTitle}</h2>
        <TaskForm kids={children} />
      </section>

      <div className="grid gap-12 lg:grid-cols-2 lg:items-start 2xl:grid-cols-3">
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-2xl font-bold break-words">{group.title}</h2>
          {group.rows.length === 0 ? (
            <p className="text-sm text-muted">{a.empty}</p>
          ) : (
            <ul className="space-y-3">
              {group.rows.map((task, index) => (
                <li key={task.id} className="space-y-2 rounded-2xl bg-chip p-3">
                  <TaskForm kids={children} task={task} />
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={moveTask}>
                      <input type="hidden" name="id" value={task.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" className={iconButton} aria-label={a.moveUp} disabled={index === 0}>
                        <span aria-hidden>↑</span>
                      </button>
                    </form>
                    <form action={moveTask}>
                      <input type="hidden" name="id" value={task.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button type="submit" className={iconButton} aria-label={a.moveDown} disabled={index === group.rows.length - 1}>
                        <span aria-hidden>↓</span>
                      </button>
                    </form>
                    <details className="ml-auto">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center text-base font-bold text-danger">{a.remove}</summary>
                      <form action={deleteTask} className="space-y-2 pt-1">
                        <input type="hidden" name="id" value={task.id} />
                        <p className="text-sm">{a.removeConfirm}</p>
                        <button type="submit" className="btn btn-danger">
                          {a.remove}
                        </button>
                      </form>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      </div>

      <Link href="/stars" className="btn btn-secondary">
        {a.back}
      </Link>
    </>
  );
}
