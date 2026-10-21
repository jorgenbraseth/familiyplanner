import Link from "next/link";
import { t } from "@/lib/i18n";

/** Previous / this / next week links, using ?week=<offset>. */
export function WeekNav({ path, offset, isoWeek }: { path: string; offset: number; isoWeek: number }) {
  const href = (o: number) => (o === 0 ? path : `${path}?week=${o}`);
  const link = "btn btn-secondary min-w-11 px-3 text-primary-strong";
  return (
    <nav className="flex items-center justify-between gap-2">
      <Link href={href(offset - 1)} className={link} aria-label={t.calendar.previousWeek}>
        ←
      </Link>
      <span className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="rounded-full bg-accent px-4 py-1 font-display text-base font-extrabold text-on-accent">{t.home.week(isoWeek)}</span>
        {offset !== 0 && (
          <Link href={path} className="inline-flex min-h-11 items-center font-bold text-primary-strong underline-offset-4 hover:underline">
            {t.calendar.thisWeek}
          </Link>
        )}
      </span>
      <Link href={href(offset + 1)} className={link} aria-label={t.calendar.nextWeek}>
        →
      </Link>
    </nav>
  );
}
