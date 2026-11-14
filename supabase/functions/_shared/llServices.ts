// Funnel add-on code -> LL board service keys.
//
// The LL -> DL pipeline board (inlane-web-app `LL_SERVICES`, stored in
// ll_applications.services) ticks services by its own keys. The funnel stores
// the purchased add-on codes (rto_*), which the board cannot display. The
// funnel writes BOTH: the raw code (kept for audit/analytics) plus the matching
// board keys, so Ops see the purchased service on the existing board.
//
// Ops decisions (2026-11-06, Q7): the board should carry vehicle-specific ticks
// (2W LL, 2W DL, 4W LL, 4W DL) as well as the generic LL/DL ticks, and "Classes"
// is ticked when the customer bought a course together with an RTO service.
// Which address-change tick applies depends on the application type; the funnel
// only sells the "other state -> KA" DL address change.

export const FUNNEL_CODE_TO_LL_KEYS: Record<string, string[]> = {
  rto_2w_ll_dl: ["ll", "dl", "ll_2w", "dl_2w"],
  rto_2w_dl: ["dl", "dl_2w"],
  rto_4w_ll_dl: ["ll", "dl", "ll_4w", "dl_4w"],
  // Funnel copy: licence NOT from Karnataka -> address change + migration charges.
  rto_dl_address_change: ["dl_address_change_other_state"],
};

/** Board key ticked when a course (classes) was bought together with an RTO service. */
export const LL_CLASSES_KEY = "classes";

/**
 * Raw codes first (unchanged behaviour), then any mapped board keys,
 * de-duplicated. `includeClasses` adds the board's "Classes" tick (course +
 * RTO purchase). Existing services are always kept and never reordered.
 */
export function llServicesFor(
  codes: string[],
  existing: string[] = [],
  options: { includeClasses?: boolean } = {},
): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  for (const s of existing) add(s);
  for (const c of codes) add(c);
  for (const c of codes) for (const k of FUNNEL_CODE_TO_LL_KEYS[c] ?? []) add(k);
  if (options.includeClasses && codes.length > 0) add(LL_CLASSES_KEY);
  return out;
}

/** Services in `next` that were not already in `current` (for the "service added" note). */
export function addedServices(current: string[], next: string[]): string[] {
  return next.filter((s) => !current.includes(s));
}
