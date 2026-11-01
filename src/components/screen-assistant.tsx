"use client";

import { useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { MicIcon } from "./assistant-button";
import { AssistantPanel, type AskAs } from "./assistant-panel";

/**
 * The big "Spør meg" button of the family screen: a large pill fixed at the bottom right of the screen, always
 * visible and reachable at the counter. One tap opens the assistant and starts listening, asking as the person
 * selected in the rail. The page renders this with `key={person.id}`, so switching person remounts it: the panel
 * is closed and a question can never go out as the wrong person.
 */
export function ScreenAssistant({ person }: { person: AskAs }) {
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
        onClick={() => setOpen(true)}
        aria-label={t.screen.askLabel(person.name)}
        aria-haspopup="dialog"
        className="fixed bottom-6 right-6 z-20 flex min-h-24 max-w-[calc(100vw-3rem)] items-center gap-5 rounded-full bg-primary py-3 pl-4 pr-9 text-left text-on-primary outline-offset-4 focus-visible:outline-4 focus-visible:outline-accent active:scale-95"
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <span aria-hidden className="flex size-[4.5rem] shrink-0 items-center justify-center rounded-full bg-on-primary/20">
          <MicIcon className="size-11" />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-4xl font-bold leading-none">{t.screen.askButton}</span>
          <span className="mt-1.5 block text-lg font-semibold leading-tight">{t.screen.askContext(person.name)}</span>
        </span>
      </button>
      {open && <AssistantPanel onClose={close} askAs={person} autoListen />}
    </>
  );
}
