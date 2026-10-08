// Travel-time feasibility and geographic-efficiency scoring (§8, §9).
//
// Pure (no Deno imports) so the Node test harness can exercise it.
//
// ─────────────────────────────────────────────────────────────────────────────
// TRAVEL MODEL — WHY THERE IS NO EXTERNAL MAPS CALL
// ─────────────────────────────────────────────────────────────────────────────
// The production `Schedule` table carries NO location column at all (only
// `learner_id`), and there is no travel/distance table in the schema. A lesson's
// location is therefore derived from `Learner.address_lat` / `address_lng` via
// `Schedule.learner_id`.
//
// Travel time is computed as straight-line (haversine) distance divided by a
// CONFIGURED average city speed, plus a CONFIGURED safety buffer:
//
//     requiredTravelTime = distanceKm / speedKph * 60 + bufferMinutes
//
// No average speed is invented here: when `averageTravelSpeedKph` is null the
// travel hard constraint is simply not enforced (see `travelEnforced` in
// schedulerConfig.ts). That keeps the funnel on its current behaviour until
// operations supply a real figure.
//
// `haversineKm` is imported from availability.ts rather than reimplemented, so
// there is exactly ONE distance implementation in the repo.

import { haversineKm } from "./availability.ts";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TravelPolicy {
  /** null => travel feasibility is not enforced. */
  averageSpeedKph: number | null;
  bufferMinutes: number;
  /** Straight-line km below which travel is considered negligible. */
  negligibleKm: number;
}

export const DEFAULT_TRAVEL_POLICY: TravelPolicy = {
  averageSpeedKph: null,
  bufferMinutes: 0,
  negligibleKm: 0.5,
};

function coord(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Coerce a DB row (or anything else) into a usable point, or null when the
 * coordinates are absent/unparseable. Out-of-range coordinates are rejected
 * rather than clamped, mirroring serviceability.ts.
 *
 * Several column spellings are accepted because the coordinates come from three
 * different tables: `booking.latitude/longitude`, `Learner.address_lat/
 * address_lng`, and the plain `{lat,lng}` shape the serviceability code uses.
 * Keeping the aliases here means no call site has to reshape a DB row.
 */
export function toLatLng(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lat = coord(r.lat ?? r.latitude ?? r.address_lat);
  const lng = coord(r.lng ?? r.lon ?? r.longitude ?? r.address_lng ?? r.address_longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Symmetric travel-time cache.
 *
 * Keyed on the ROUNDED coordinate pair and the policy, so repeated lookups for
 * the same location pair are O(1) and never recomputed. This is what keeps the
 * scheduler from doing quadratic distance work while expanding a beam (§33) and
 * is the hook a future Distance Matrix provider would slot into.
 */
export class TravelCache {
  private readonly store = new Map<string, number | null>();
  private hits = 0;
  private misses = 0;

  static key(a: LatLng, b: LatLng, p: TravelPolicy): string {
    // 4dp ~= 11 m, far below the precision any travel model needs.
    const s = (p.averageSpeedKph ?? 0) + ":" + p.bufferMinutes;
    const lo = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}`;
    const hi = `${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
    return lo <= hi ? `${lo}|${hi}|${s}` : `${hi}|${lo}|${s}`;
  }

  get size(): number {
    return this.store.size;
  }

  get stats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }

  /** Minutes needed to travel a->b, or null when it cannot be determined. */
  minutes(a: LatLng | null, b: LatLng | null, policy: TravelPolicy): number | null {
    if (!a || !b) return null;
    if (policy.averageSpeedKph === null || policy.averageSpeedKph <= 0) return null;

    const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
    if (km <= policy.negligibleKm) return 0;

    const k = TravelCache.key(a, b, policy);
    if (this.store.has(k)) {
      this.hits += 1;
      return this.store.get(k) ?? null;
    }
    this.misses += 1;
    const minutes = Math.ceil((km / policy.averageSpeedKph) * 60) + policy.bufferMinutes;
    this.store.set(k, minutes);
    return minutes;
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

/**
 * §8 HARD constraint — the number of minutes of slack between the candidate start
 * and the earliest physically-possible start:
 *
 *   slack = candidateStart - previousEnd - requiredTravelTime
 *
 * `slack >= 0` means feasible. Returns null when travel cannot be evaluated (no
 * coordinates, or no configured speed); callers treat null as "no travel
 * opinion" and do NOT reject, so an unknown location can never silently cancel a
 * otherwise valid customer slot. The travel gate is a business feasibility rule,
 * not a data-integrity rule.
 */
export function travelSlackMinutes(
  previousEndMinute: number,
  candidateStartMinute: number,
  from: LatLng | null,
  to: LatLng | null,
  policy: TravelPolicy,
  cache: TravelCache,
): number | null {
  if (policy.averageSpeedKph === null) return null;
  const need = cache.minutes(from, to, policy);
  if (need === null) return null;
  return candidateStartMinute - previousEndMinute - need;
}

/**
 * §9 geographic efficiency. Lower is better.
 *
 * Total straight-line km the instructor drives across the generated lessons, plus
 * a penalty per change of location cluster. Purely a SCORE input — never a
 * rejection reason.
 */
export function geographicCost(
  points: Array<LatLng | null>,
  cache: TravelCache,
  policy: TravelPolicy,
): { totalKm: number; transitions: number } {
  let totalKm = 0;
  let transitions = 0;
  let previousKey: string | null = null;
  // The last point we actually KNOW. A lesson with no coordinates must not zero
  // the driving distance between the lessons around it — the instructor still
  // had to get from one to the other — so unknown points are skipped while the
  // chain stays anchored to the last known location.
  let lastKnown: LatLng | null = null;

  for (const p of points) {
    if (!p) continue;
    const key = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
    if (previousKey !== null && key !== previousKey) transitions += 1;
    if (lastKnown) totalKm += haversineKm(lastKnown.lat, lastKnown.lng, p.lat, p.lng);
    previousKey = key;
    lastKnown = p;
  }
  return { totalKm: round2(totalKm), transitions };
}

/** Normalised 0..1 travel-efficiency score (higher is better). */
export function travelEfficiencyScore(
  cost: { totalKm: number; transitions: number },
  worstKm: number,
  worstTransitions: number,
): number {
  if (worstKm <= 0 && worstTransitions <= 0) return 1;
  const kmScore = worstKm > 0 ? Math.max(0, 1 - cost.totalKm / worstKm) : 1;
  const trScore =
    worstTransitions > 0 ? Math.max(0, 1 - cost.transitions / worstTransitions) : 1;
  return round4((kmScore + trScore) / 2);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}