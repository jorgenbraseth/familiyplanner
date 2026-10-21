"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Navigation link; the current section is shown as a green pill. */
export function NavLink({ href, children, badge = 0 }: { href: string; children: React.ReactNode; badge?: number }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${
        active ? "bg-primary text-on-primary" : "text-ink hover:bg-chip"
      }`}
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
