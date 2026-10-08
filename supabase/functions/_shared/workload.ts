// Time-aware instructor workload (§5, §6, §21, §22, §23).
//
// Pure (no Deno imports) so the Node test harness can exercise it.
//
// The pre-existing engine balances on `instructorBookingLoad`, a RAW CLASS COUNT
// over the whole booking window. This module adds what the spec asks for:
// scheduled HOURS and utilisation measured over a CONFIGURABLE ROLLING HORIZON
// (today, next 7 days, next 14 days), plus fairness and starvation pressure.
//
// Workload is deliberately NOT learner-count-only: §6's example is the whole
// point — an instructor with fewer learners but 35 booked hours next week is
// worse than one with more learners and 15 hours.

import type { ScheduleBlock } from "./availability.ts";

export interface WorkloadPolicy {
  /** 0 = measure over the whole supplied window (the legacy behaviour). */
  horizonDays: number;
  /** Ratios closer than this are treated as equivalent. */
  fairnessThreshold: number;
  /** Extra score credit for a starved instructor (0 disables). */
  starvationReliefFactor: number;
  /** Reference point for "full" utilisation when no capacity figure exists. */
  referenceDailyHours: number;
}

export const DEFAULT_WORKLOAD_POLICY: WorkloadPolicy = {
  horizonDays: 0,
  fairnessThreshold: 0,
  starvationReliefFactor: 0,
  referenceDailyHours: 8,
};

export interface Workload {
  instructorId: string;
  /** Distinct learners with at least one active lesson in the horizon. */
  activeLearners: number;
  /** Booked lesson MINUTES in the horizon (the spec's primary measure). */
  bookedMinutes: number;
  /** Active lessons (rows) in the horizon. */
  lessons: number;
  /** bookedHours / (horizonDays * referenceDailyHours), clamped to [0, 1.5]. */
  utilisation: number;
  /** Earliest / latest lesson date in the horizon — upcoming-workload shape. */
  firstDate: string | null;
  lastDate: string | null;
}

function isActive(b: ScheduleBlock, now: Date, holdMinutes: number | null | undefined): boolean {
  if (b.status === "cancelled" || b.status === "rejected") return false;
  if (b.status === "pending_payment") {
    if (!holdMinutes || holdMinutes <= 0 || !b.bookingCreatedAt) return true;
    const created = new Date(b.bookingCreatedAt).getTime();
    if (Number.isNaN(created)) return true;
    return now.getTime() - created <= holdMinutes * 60 * 1000;
  }
  return true;
}

function durationOf(b: ScheduleBlock): number {
  const d = b.endMinute - b.startMinute;
  // A row whose times could not be parsed still occupies the slot; charge it one
  // nominal hour rather than zero so it cannot make an instructor look free.
  return Number.isFinite(d) && d > 0 ? d : 60;
}

function windowBounds(now: Date, horizonDays: number): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(now);
  if (horizonDays <= 0) return { from, to: "9999-12-31" };
  const to = new Date(now.getTime() + horizonDays * 86_400_000);
  return { from, to: iso(to) };
}

/**
 * §6 rolling-horizon workload for every instructor appearing in `blocks`.
 * Instructors with no lessons are intentionally absent — the scheduler only ever
 * ranks instructors it is already considering.
 */
export function computeWorkloads(
  blocks: ScheduleBlock[] | null | undefined,
  policy: WorkloadPolicy,
  now: Date,
  holdMinutes: number | null | undefined,
): Record<string, Workload> {
  const { from, to } = windowBounds(now, policy.horizonDays);
  const out: Record<string, Workload> = {};

  for (const b of blocks || []) {
    if (!b.instructorId) continue;
    if (!isActive(b, now, holdMinutes)) continue;
    if (b.date < from || b.date > to) continue;

    const existing = out[b.instructorId];
    if (!existing) {
      out[b.instructorId] = {
        instructorId: b.instructorId,
        activeLearners: 0,
        bookedMinutes: durationOf(b),
        lessons: 1,
        utilisation: 0,
        firstDate: b.date,
        lastDate: b.date,
      };
      continue;
    }
    existing.bookedMinutes += durationOf(b);
    existing.lessons += 1;
    if (b.date < existing.firstDate!) existing.firstDate = b.date;
    if (b.date > existing.lastDate!) existing.lastDate = b.date;
  }

  // Distinct learners per instructor (a learner with 3 lessons counts once).
  const learners = new Map<string, Set<string>>();
  for (const b of blocks || []) {
    if (!b.instructorId) continue;
    if (!isActive(b, now, holdMinutes)) continue;
    if (b.date < from || b.date > to) continue;
    const key = (b as ScheduleBlock & { learnerId?: string | null }).learnerId;
    if (!key) continue;
    const set = learners.get(b.instructorId) ?? new Set<string>();
    set.add(key);
    learners.set(b.instructorId, set);
  }

  const capacityMinutes = Math.max(
    1,
    policy.horizonDays > 0 ? policy.horizonDays * policy.referenceDailyHours * 60 : 0,
  );

  for (const [id, w] of Object.entries(out)) {
    w.activeLearners = learners.get(id)?.size ?? 0;
    w.utilisation = capacityMinutes > 0
      ? Math.min(1.5, w.bookedMinutes / capacityMinutes)
      : 0;
    out[id] = w;
  }

  return out;
}

/** The busiest instructor in the set, used to normalise scores. */
export function peakUtilisation(workloads: Record<string, Workload>): number {
  let peak = 0;
  for (const w of Object.values(workloads)) {
    if (w.utilisation > peak) peak = w.utilisation;
  }
  return peak;
}

/** The most booked hours in the set, used to normalise scores. */
export function peakBookedMinutes(workloads: Record<string, Workload>): number {
  let peak = 0;
  for (const w of Object.values(workloads)) {
    if (w.bookedMinutes > peak) peak = w.bookedMinutes;
  }
  return peak;
}

export interface BalanceScoreResult {
  /** 1 = least loaded of the feasible set, 0 = most loaded. */
  score: number;
  /** Relative load against the busiest feasible instructor. */
  relative: number;
  /** True when the gap to the least-loaded feasible instructor is inside the fairness threshold. */
  equivalentToBest: boolean;
}

/**
 * Sub-criteria mix inside the balance component. These are NOT business values
 * (they are not customer-visible or configurable per booking) — they only decide
 * how the §6 workload signals are combined into the single §21 balance component.
 * Exposed on the policy so they can be tuned/tested without touching the logic.
 */
export interface BalanceMix {
  bookedMinutes: number;
  utilisation: number;
  activeLearners: number;
  waitingLearners: number;
}

export const DEFAULT_BALANCE_MIX: BalanceMix = {
  bookedMinutes: 0.4,
  utilisation: 0.3,
  activeLearners: 0.2,
  waitingLearners: 0.1,
};

/**
 * §21 instructor balance. Returns 1 for the least loaded instructor in `pool`
 * and 0 for the most loaded, so the number is always comparable and always
 * discriminates whenever the pool actually differs.
 *
 * Each sub-criterion is normalised against the POOL MAXIMUM (not against the
 * best member), which keeps the units separate — booked minutes are compared to
 * booked minutes and utilisation to utilisation. The earlier attempt mixed the
 * two scales and collapsed to a tie whenever the least-loaded instructor had
 * zero load, which let the busiest instructor win the tie-break.
 *
 * `fairnessThreshold` (§22): when the score gap to the best is inside the
 * threshold the instructors are treated as equivalent, so the customer-quality
 * component is allowed to decide instead of the load.
 */
export function balanceScore(
  instructorId: string,
  pool: Record<string, Workload>,
  policy: WorkloadPolicy,
  waiting: Record<string, number> = {},
  mix: BalanceMix = DEFAULT_BALANCE_MIX,
): BalanceScoreResult {
  const me = pool[instructorId];
  const entries = Object.values(pool);
  if (!me || entries.length === 0) return { score: 0.5, relative: 0, equivalentToBest: true };

  let maxMinutes = 0;
  let maxUtil = 0;
  let maxLearners = 0;
  let maxWaiting = 0;
  for (const w of entries) {
    if (w.bookedMinutes > maxMinutes) maxMinutes = w.bookedMinutes;
    if (w.utilisation > maxUtil) maxUtil = w.utilisation;
    if (w.activeLearners > maxLearners) maxLearners = w.activeLearners;
    const waitingCount = waiting[w.instructorId] ?? 0;
    if (waitingCount > maxWaiting) maxWaiting = waitingCount;
  }

  // 1 = nothing booked, 0 = the most loaded member of the pool.
  const lowerIsBetter = (value: number, max: number): number =>
    max > 0 ? Math.max(0, Math.min(1, 1 - value / max)) : 1;
  // 1 = has the longest queue. When nobody in the pool is waiting there is no
  // queue to reward, so the component is NEUTRAL (1) rather than a flat penalty
  // on every instructor — otherwise the busiest instructor could never reach 1.
  const higherIsBetter = (value: number, max: number): number =>
    max > 0 ? Math.max(0, Math.min(1, value / max)) : 1;

  const parts = {
    bookedMinutes: lowerIsBetter(me.bookedMinutes, maxMinutes),
    utilisation: lowerIsBetter(me.utilisation, maxUtil),
    activeLearners: lowerIsBetter(me.activeLearners, maxLearners),
    waitingLearners: higherIsBetter(waiting[me.instructorId] ?? 0, maxWaiting),
  };

  const mixTotal =
    mix.bookedMinutes + mix.utilisation + mix.activeLearners + mix.waitingLearners || 1;
  let score =
    (parts.bookedMinutes * mix.bookedMinutes +
      parts.utilisation * mix.utilisation +
      parts.activeLearners * mix.activeLearners +
      parts.waitingLearners * mix.waitingLearners) /
    mixTotal;

  // Best member of the pool, for the fairness comparison.
  let bestScore = 0;
  for (const w of entries) {
    const b = lowerIsBetter(w.bookedMinutes, maxMinutes) * mix.bookedMinutes +
      lowerIsBetter(w.utilisation, maxUtil) * mix.utilisation +
      lowerIsBetter(w.activeLearners, maxLearners) * mix.activeLearners +
      higherIsBetter(waiting[w.instructorId] ?? 0, maxWaiting) * mix.waitingLearners;
    if (b / mixTotal > bestScore) bestScore = b / mixTotal;
  }

  score = Math.max(0, Math.min(1, score));

  const relative = maxMinutes > 0 ? me.bookedMinutes / maxMinutes : 0;
  const equivalentToBest =
    policy.fairnessThreshold > 0 ? bestScore - score <= policy.fairnessThreshold : false;

  return {
    score: Math.round(score * 10000) / 10000,
    relative: Math.round(relative * 10000) / 10000,
    equivalentToBest,
  };
}

/**
 * §23 starvation prevention. An eligible instructor who is materially
 * UNDER-utilised relative to the busiest feasible peer gets an additive score
 * bonus, so future assignments drift back toward them without ever moving an
 * already-confirmed learner (that is Ops' decision, not the algorithm's).
 */
export function starvationRelief(
  instructorId: string,
  workloads: Record<string, Workload>,
  policy: WorkloadPolicy,
): number {
  if (policy.starvationReliefFactor <= 0) return 0;
  const me = workloads[instructorId];
  if (!me) return 0;
  const { relative, equivalentToBest } = balanceScore(instructorId, workloads, policy);
  if (relative >= 1) return 0;
  const deficit = 1 - relative;
  // Only relieve genuine starvation, not a rounding-level difference.
  if (policy.fairnessThreshold > 0 && equivalentToBest) return 0;
  return Math.min(1, deficit) * policy.starvationReliefFactor;
}