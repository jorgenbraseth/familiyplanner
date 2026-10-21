import { SchoolDoneCheckbox } from "@/components/school-done-checkbox";
import { t } from "@/lib/i18n";
import type { PlanItemRow } from "@/lib/plan";

/**
 * "Lekser": homework due on the next school day with big tick boxes (read-only in preview), plus a compact
 * "Denne uken" list of whole-week homework that is not done yet.
 */
export function StartHomework({
  items,
  weekItems,
  tomorrow,
  weekday,
  readOnly,
}: {
  items: PlanItemRow[];
  /** Whole-week homework that is not done. */
  weekItems: PlanItemRow[];
  tomorrow: boolean;
  /** Lower-case weekday of the next school day, e.g. "mandag". */
  weekday: string;
  readOnly: boolean;
}) {
  return (
    <section className="card space-y-3 p-4" aria-labelledby="homework-title">
      <h2 id="homework-title" className="text-2xl font-extrabold">
        {tomorrow ? t.start.homeworkTomorrow : t.start.homeworkFor(weekday)}
      </h2>
      {items.length === 0 ? (
        <p className="text-xl font-extrabold">
          {tomorrow ? t.start.homeworkEmptyTomorrow : t.start.homeworkEmptyFor(weekday)}
        </p>
      ) : (
        <ul className="divide-y-2 divide-line">
          {items.map((item) => (
            <li key={item.id}>
              <SchoolDoneCheckbox id={item.id} done={item.done} label={item.text} detail={item.subject} readOnly={readOnly} large />
            </li>
          ))}
        </ul>
      )}
      {weekItems.length > 0 && (
        <div className="border-t-2 border-line pt-3">
          <h3 className="mb-1 text-lg font-extrabold">{t.start.homeworkThisWeek}</h3>
          <ul className="divide-y-2 divide-line">
            {weekItems.map((item) => (
              <li key={item.id}>
                <SchoolDoneCheckbox id={item.id} done={item.done} label={item.text} detail={item.subject} readOnly={readOnly} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
