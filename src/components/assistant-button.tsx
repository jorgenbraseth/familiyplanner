"use client";

import { useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { AssistantPanel } from "./assistant-panel";

/** Floating round mic button on every signed-in page; opens the assistant sheet. */
export function AssistantButton() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    // Give focus back to the button that opened the sheet.
    queueMicrotask(() => buttonRef.current?.focus());
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.assistant.open}
        aria-haspopup="dialog"
        className="fixed right-4 z-20 flex size-16 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg outline-offset-4 focus-visible:outline-4 focus-visible:outline-accent"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <MicIcon className="size-8" />
      </button>
      {open && <AssistantPanel onClose={close} />}
    </>
  );
}

export function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}
