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
    <section className="space-y-4" aria-labelledby="homework-title">
      <h2 id="homework-title" className="flex min-h-11 items-center text-3xl font-bold">
        {tomorrow ? t.start.homeworkTomorrow : t.start.homeworkFor(weekday)}
      </h2>
      {items.length === 0 ? (
        <p className="text-xl font-extrabold">
          {tomorrow ? t.start.homeworkEmptyTomorrow : t.start.homeworkEmptyFor(weekday)}
        </p>
      ) : (
        <div className="space-y-4">
          {bySubject(items).map((group) => (
            <div key={group.subject ?? ""}>
              {group.subject && <h3 className="text-xl font-bold">{group.subject}</h3>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <SchoolDoneCheckbox id={item.id} done={item.done} label={item.text} readOnly={readOnly} large />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {weekItems.length > 0 && (
        <div className="pt-4">
          <h3 className="mb-1 text-xl font-bold">{t.start.homeworkThisWeek}</h3>
          <ul>
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

/** The items grouped by subject, in the order each subject first appears (items without a subject form one group). */
function bySubject(items: PlanItemRow[]): { subject: string | null; items: PlanItemRow[] }[] {
  const groups: { subject: string | null; items: PlanItemRow[] }[] = [];
  for (const item of items) {
    const subject = item.subject?.trim() || null;
    const group = groups.find((g) => g.subject === subject);
    if (group) group.items.push(item);
    else groups.push({ subject, items: [item] });
  }
  return groups;
}
