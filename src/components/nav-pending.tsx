"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useTransition, type ComponentProps, type MouseEvent, type ReactNode } from "react";

type Go = (href: string, scroll: boolean) => void;
const Ctx = createContext<{ pending: boolean; go: Go } | null>(null);

/** Whether a navigation started from this scope's links is still waiting for the server. */
export function useNavPending(): boolean {
  return useContext(Ctx)?.pending ?? false;
}

/**
 * Wraps a day/week switcher and the content it controls. Links inside (`NavLink`) navigate in a transition, so
 * `pending` is true from the click until the new page has arrived; `PendingContent` dims meanwhile.
 */
export function NavPendingScope({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = useCallback<Go>(
    (href, scroll) =>
      start(() => {
        router.push(href, { scroll });
      }),
    [router],
  );
  const value = useMemo(() => ({ pending, go }), [pending, go]);
  return (
    <Ctx.Provider value={value}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

/** The part of the page that changes with the switcher: dimmed and `aria-busy` while loading (reduced motion: no fade). */
export function PendingContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  const pending = useNavPending();
  return (
    <div
      aria-busy={pending}
      className={`${className} transition-opacity duration-150 motion-reduce:transition-none ${
        pending ? "pointer-events-none opacity-60 delay-150 motion-reduce:delay-0" : ""
      }`}
    >
      {children}
    </div>
  );
}

/** A `Link` that navigates through the surrounding `NavPendingScope` (plain `Link` behaviour outside one). */
export function NavLink({ scroll = true, onClick, ...props }: ComponentProps<typeof Link>) {
  const ctx = useContext(Ctx);
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (!ctx || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (typeof props.href !== "string" || props.target === "_blank") return;
    e.preventDefault();
    ctx.go(props.href, scroll);
  };
  return <Link {...props} scroll={scroll} onClick={handle} />;
}
