"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { t } from "@/lib/i18n";

/**
 * A modal dialog: bottom sheet on phones, centred card on wider screens. Focus moves into it, Escape, the X
 * button and a click on the backdrop close it, and the page behind doesn't scroll while it is open.
 */
export function ModalSheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

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
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl border-2 border-b-0 border-line bg-background shadow-2xl sm:rounded-3xl sm:border-b-2"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <h2 id={titleId} className="min-w-0 text-xl font-extrabold">{title}</h2>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label={t.parentHome.close}
            className="btn btn-secondary size-11 shrink-0 px-0 text-xl"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </div>
  );
}
