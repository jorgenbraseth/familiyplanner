"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NavLink } from "@/components/nav-link";
import { navFits, navTitle } from "@/lib/nav-fit";
import { t } from "@/lib/i18n";

export type TopNavItem = { href: string; label: string; badge?: number };

const signOutClass =
  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-on-brand hover:bg-on-brand/15"

const panelSignOutClass =
  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted hover:bg-chip";

function NavLinks({ items, block, onNavigate }: { items: TopNavItem[]; block?: boolean; onNavigate?: () => void }) {
  return items.map((item) => (
    <NavLink key={item.href} href={item.href} badge={item.badge} block={block} onClick={onNavigate}>
      {item.label}
    </NavLink>
  ));
}

/**
 * The top menu. All items sit on one line while they fit; when they don't (measured against a hidden copy,
 * not a fixed breakpoint) they collapse into a hamburger button with a dropdown panel.
 * The row never wraps and clips instead, so the server render and the moments before the first measure
 * cannot show a second line; the first measure runs before the browser paints after hydration.
 */
export function TopNav({ items, signOutAction }: { items: TopNavItem[]; signOutAction: () => void | Promise<void> }) {
  const pathname = usePathname();
  const panelId = useId();
  const [collapsed, setCollapsed] = useState(false);
  // The panel is open for the page it was opened on, so any route change closes it without an effect.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = collapsed && openPath === pathname;

  const spaceRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refocusRef = useRef(false);

  useLayoutEffect(() => {
    const space = spaceRef.current;
    const measure = measureRef.current;
    if (!space || !measure) return;
    const update = () => setCollapsed(!navFits(measure.offsetWidth, space.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(space);
    observer.observe(measure);
    return () => observer.disconnect();
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    refocusRef.current = returnFocus;
    setOpenPath(null);
  }, []);

  // Focus moves into the panel on open and back to the button on close (not after a click outside).
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    else if (refocusRef.current) {
      refocusRef.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  const signOutIn = (cls: string) => (
    <form action={signOutAction}>
      <button type="submit" className={cls}>
        {t.nav.signOut}
      </button>
    </form>
  );
  const icon = (
    <Image src="/icons/icon-192.png" alt="" width={28} height={28} className="size-7 shrink-0" />
  );

  return (
    <div ref={rootRef}>
      <nav aria-label={t.nav.main} className="mx-auto max-w-2xl px-3 py-1.5">
        <div ref={spaceRef} className="relative">
          {collapsed ? (
            <div className="flex min-h-11 items-center gap-2">
              <button
                ref={buttonRef}
                type="button"
                aria-label={t.nav.menu}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => (open ? close(true) : setOpenPath(pathname))}
                className="inline-flex size-11 items-center justify-center rounded-full text-2xl leading-none text-on-brand hover:bg-on-brand/15"
              >
                <span aria-hidden="true">{open ? "✕" : "☰"}</span>
              </button>
              {icon}
              <p className="min-w-0 flex-1 truncate font-display text-lg font-extrabold text-on-brand">
                {navTitle(pathname, items, t.appName)}
              </p>
            </div>
          ) : (
            <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
              {icon}
              <NavLinks items={items} />
              <div className="ml-auto shrink-0">{signOutIn(signOutClass)}</div>
            </div>
          )}
          {/* Hidden copy with the natural width of the row, so the fit does not depend on what is visible.
              The clipping wrapper keeps this w-max copy from ever widening the page (it would push the
              layout viewport wider on phones and carry the fixed assistant button off screen). */}
          <div aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 h-0 w-full overflow-hidden">
            <div ref={measureRef} inert className="flex w-max flex-nowrap items-center gap-1">
              {icon}
              <NavLinks items={items} />
              <div className="ml-3 shrink-0">
                <span className={signOutClass}>{t.nav.signOut}</span>
              </div>
            </div>
          </div>
        </div>
      </nav>
      {open && (
        <div className="absolute inset-x-0 top-full border-b-2 border-line bg-surface shadow-lg">
          <div
            ref={panelRef}
            id={panelId}
            className="mx-auto flex max-h-[calc(100dvh-8rem)] max-w-2xl flex-col gap-1 overflow-y-auto px-3 py-2"
          >
            <NavLinks items={items} block onNavigate={() => close(true)} />
            <div className="mt-1 border-t-2 border-line pt-2">{signOutIn(panelSignOutClass)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
