/** Whether the nav is the current section for this path ("/" only matches itself). */
export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Whether all nav items fit on one line. `needed` is the natural width of the items,
 * `available` the width of the space they get; a width that cannot be measured (0 or less) counts as fitting
 * so that a hidden or not yet laid out header never flips to the hamburger.
 */
export function navFits(needed: number, available: number): boolean {
  if (!(needed > 0) || !(available > 0)) return true;
  return needed <= available;
}

/**
 * The title for the header lane: the label of the nav item with the longest matching prefix of the path
 * (so /stars/tasks gets the "Stjerner" label), or `fallback` when no item matches.
 */
export function navTitle(pathname: string, items: { href: string; label: string }[], fallback: string): string {
  let best: { href: string; label: string } | null = null;
  for (const item of items) {
    if (!isNavActive(pathname, item.href)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best ? best.label : fallback;
}
