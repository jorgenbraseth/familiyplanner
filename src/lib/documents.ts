// Pure helpers for the parent document screens.

import { addDays, dayKey, mondayOfIsoWeek } from "./dates";

/** Plan items may sit in the document's week or the week after (homework due next week). */
export const ITEM_DAY_COUNT = 14;

/** "YYYY-MM-DD" keys of the days an item of this document may use: Monday of the week + 13 days. */
export function allowedItemDays(isoYear: number, isoWeek: number): string[] {
  const monday = mondayOfIsoWeek(isoYear, isoWeek);
  return Array.from({ length: ITEM_DAY_COUNT }, (_, i) => dayKey(addDays(monday, i)));
}
