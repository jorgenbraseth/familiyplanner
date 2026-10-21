import Link from "next/link";
import { t } from "@/lib/i18n";

/** Previous / this / next week links, using ?week=<offset>. */
export function WeekNav({ path, offset, isoWeek }: { path: string; offset: number; isoWeek: number }) {
  const href = (o: number) => (o === 0 ? path : `${path}?week=${o}`);
  const link = "rounded-lg px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-zinc-800";
  return (
    <nav className="flex items-center justify-between gap-2">
      <Link href={href(offset - 1)} className={link} aria-label={t.calendar.previousWeek}>
        ←
      </Link>
      <span className="text-sm font-semibold">
        {t.home.week(isoWeek)}
        {offset !== 0 && (
          <Link href={path} className="ml-2 font-normal text-blue-600 hover:underline">
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
