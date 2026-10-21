"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive } from "@/lib/nav-fit";

/** Navigation link; the current section is shown as a translucent white pill on the red bar. `block` is the large tap target of the menu panel. */
export function NavLink({
  href,
  children,
  badge = 0,
  block = false,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  badge?: number;
  block?: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`items-center rounded-full text-sm font-bold ${
        block ? "flex min-h-12 px-4 text-base" : "inline-flex min-h-11 shrink-0 whitespace-nowrap px-3 sm:px-4"
      } ${block
        ? active ? "bg-brand text-on-brand" : "text-ink hover:bg-chip"
        : active ? "bg-on-brand/25 text-on-brand" : "text-on-brand hover:bg-on-brand/15"}`}
    >
      {children}
      {badge > 0 && (
        <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-extrabold text-on-accent">
          {badge}
        </span>
      )}
    </Link>
  );
}
