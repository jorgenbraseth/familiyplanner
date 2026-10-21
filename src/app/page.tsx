import { connection } from "next/server";
import { isoWeekNow } from "@/lib/dates";
import { t } from "@/lib/i18n";

export default async function Home() {
  await connection(); // render per request so the week number stays current
  const { isoWeek } = isoWeekNow();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 p-6">
      <p className="text-sm font-medium text-blue-600">{t.home.week(isoWeek)}</p>
      <h1 className="text-3xl font-semibold">{t.home.title}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t.home.comingSoon}</p>
    </main>
  );
}
