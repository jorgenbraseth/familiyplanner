"use client";

import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { giveStar } from "@/app/(app)/stars/actions";
import { ModalSheet } from "@/components/modal-sheet";
import { GiveStarForm } from "@/app/(app)/stars/give-star-form";
import { t } from "@/lib/i18n";
import type { StarTaskRow } from "@/lib/stars";

/**
 * One child in the parents' "Gi stjerne" card: progress, one tap button per star task (gives the task's stars,
 * approved straight away) and "Noe annet …" for a custom reason and amount.
 */
export function ParentGiveStars({
  child,
  track,
}: {
  child: { id: string; name: string; colour: string };
  /** The child's active track, or null when there is none. */
  track: { id: string; approved: number; goal: number; tasks: StarTaskRow[] } | null;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  // The count jumps at once; once the server action has refreshed the page the real number replaces it.
  const [approved, addApproved] = useOptimistic(track?.approved ?? 0, (current: number, add: number) =>
    track ? Math.min(track.goal, current + add) : current,
  );

  function close() {
    setOpen(false);
    queueMicrotask(() => buttonRef.current?.focus());
  }

  function give(task: StarTaskRow) {
    if (pending) return;
    const form = new FormData();
    form.set("child", child.id);
    form.set("task", task.id);
    setMessage({ text: t.parentHome.gave(child.name, task.stars), ok: true });
    startTransition(async () => {
      addApproved(task.stars);
      const result = await giveStar({ ok: false }, form);
      if (!result.ok) setMessage({ text: result.error ?? t.parentHome.gaveFailed, ok: false });
    });
  }

  return (
    <li className="space-y-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-lg font-extrabold">
          <span aria-hidden className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: child.colour }} />
          <span className="truncate">{child.name}</span>
        </h3>
        {track && <span className="shrink-0 text-sm font-bold text-muted">{t.stars.starCount(approved, track.goal)}</span>}
      </div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="btn btn-primary min-h-12 px-4 text-base"
      >
        <span aria-hidden className="mr-2">★</span>
        {t.parentHome.giveButton}
      </button>
      {open && (
        <ModalSheet title={t.parentHome.giveDialogTitle(child.name)} onClose={close}>
          <div className="space-y-3">
            {track ? (
              <>
                {track.tasks.length === 0 ? (
                  <p className="text-sm text-muted">{t.parentHome.noTasks}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {track.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        disabled={pending}
                        onClick={() => give(task)}
                        className="btn btn-primary min-h-12 px-4 text-base"
                      >
                        {task.name} {t.stars.amount(task.stars)}
                      </button>
                    ))}
                  </div>
                )}
                {message && (
                  <p role={message.ok ? "status" : "alert"} className={`text-sm font-bold ${message.ok ? "text-primary-strong" : "text-danger"}`}>
                    {message.text}
                  </p>
                )}
                <details>
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-base font-bold text-primary-strong">
                    {t.parentHome.other}
                  </summary>
                  <div className="pt-1">
                    <GiveStarForm childId={child.id} tasks={[]} />
                  </div>
                </details>
              </>
            ) : (
              <Link href={`/stars/new?child=${child.id}`} className="inline-flex min-h-11 items-center text-base font-bold text-primary-strong underline underline-offset-4">
                {t.parentHome.newTrack}
              </Link>
            )}
          </div>
        </ModalSheet>
      )}
    </li>
  );
}
