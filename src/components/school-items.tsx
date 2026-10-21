import { t } from "@/lib/i18n";
import type { PlanItemRow } from "@/lib/plan";
import { SchoolDoneCheckbox } from "./school-done-checkbox";

export function SchoolHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1 text-base font-semibold">{children}</h4>;
}

const listClass =
  "divide-y divide-zinc-100 rounded-xl border border-zinc-200 px-3 dark:divide-zinc-800 dark:border-zinc-800";

/** Lessons, bring items or notes: plain lines, subject first. */
export function SchoolLines({ items }: { items: PlanItemRow[] }) {
  return (
    <ul className={listClass}>
      {items.map((item) => (
        <li key={item.id} className="py-2 text-lg break-words">
          {item.subject && <span className="font-semibold">{item.subject}</span>}
          {item.subject && " – "}
          {item.text}
        </li>
      ))}
    </ul>
  );
}

/** Homework with tick boxes. */
export function SchoolHomework({ items }: { items: PlanItemRow[] }) {
  return (
    <ul className={listClass}>
      {items.map((item) => (
        <li key={item.id}>
          <SchoolDoneCheckbox id={item.id} done={item.done} label={item.text} detail={item.subject} />
        </li>
      ))}
    </ul>
  );
}

export function SchoolNotes({ items }: { items: PlanItemRow[] }) {
  return (
    <div>
      <SchoolHeading>{t.school.notes}</SchoolHeading>
      <SchoolLines items={items} />
    </div>
  );
}
