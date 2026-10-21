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
