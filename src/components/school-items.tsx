import { t } from "@/lib/i18n";
import type { PlanItemRow } from "@/lib/plan";
import { SchoolDoneCheckbox } from "./school-done-checkbox";

export function SchoolHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1 text-lg font-extrabold">{children}</h4>;
}

const listClass =
  "card divide-y-2 divide-line px-3";

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
export function SchoolHomework({ items, readOnly = false }: { items: PlanItemRow[]; readOnly?: boolean }) {
  return (
    <ul className={listClass}>
      {items.map((item) => (
        <li key={item.id}>
          <SchoolDoneCheckbox id={item.id} done={item.done} label={item.text} detail={item.subject} readOnly={readOnly} />
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
