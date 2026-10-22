"use client";

import { useEffect, useRef, useState } from "react";
import { RequestStarForm } from "@/components/request-star-form";
import { t } from "@/lib/i18n";
import type { StarTaskRow } from "@/lib/stars";

/** "Registrer stjerne": a button that opens a bottom sheet with the child's star tasks (and "Annet"). */
export function StartStarSheet({
  tasks,
  previewing,
}: {
  tasks: StarTaskRow[];
  previewing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    queueMicrotask(() => buttonRef.current?.focus());
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={previewing}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="btn btn-primary min-h-14 px-6 text-lg"
      >
        {t.start.registerStar}
      </button>
      {open && <Sheet onClose={close} tasks={tasks} previewing={previewing} />}
    </>
  );
}

function Sheet({
  onClose,
  tasks,
  previewing,
}: {
  onClose: () => void;
  tasks: StarTaskRow[];
  previewing: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.start.registerStarTitle}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-background"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <h2 className="text-xl font-bold">{t.start.registerStarTitle}</h2>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label={t.start.close}
            className="btn btn-secondary size-11 px-0 text-xl"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <RequestStarForm tasks={tasks} previewing={previewing} />
        </div>
      </div>
    </div>
  );
}
