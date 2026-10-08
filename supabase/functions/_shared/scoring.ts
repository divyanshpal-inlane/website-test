// Schedule scoring (§18, §19, §20, §21, §22).
//
// Pure (no Deno imports) so the Node test harness can exercise it.
//
// Every component is normalised to 0..1 where 1 is BEST, then combined with the
// DB-configured weights. Weights are read from `scheduler.weights`; when all
// weights are zero the scorer degrades to "no opinion" (0.5 everywhere) so the
// scheduler can still rank schedules deterministically without inventing a
// business trade-off.

import type { SchedulerWeights } from "./schedulerConfig.ts";
import type { WorkloadPolicy } from "./workload.ts";
import { balanceScore, starvationRelief, type Workload } from "./workload.ts";

export interface LessonLike {
  date: string;
  start_time: string;
  end_time: string;
}

export interface ScoreComponents {
  customerConvenience: number;
  instructorBalance: number;
  travelEfficiency: number;
  scheduleDistribution: number;
  completionEfficiency: number;
}

export interface ScoredSchedule {
  /** Weighted 0..1 total. */
  total: number;
  components: ScoreComponents;
  /** Raw (un-normalised) facts, persisted for auditability (§29). */
  facts: {
    distinctDays: number;
    maxClassesInADay: number;
    completionDays: number;
    averageGapDays: number;
    preferredTimingHits: number;
    totalTravelKm: number;
    areaTransitions: number;
    instructorRelativeLoad: number;
    starvationRelief: number;
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function scoreWeightsPresent(w: SchedulerWeights): boolean {
  return (
    w.customerConvenience +
      w.instructorBalance +
      w.travelEfficiency +
      w.scheduleDistribution +
      w.completionEfficiency >
    0
  );
}

/**
 * §20 customer convenience: preferred timings/days, balanced classes per day,
 * sensible spacing, and a reasonably quick completion.
 */
export function customerConvenienceScore(
  lessons: LessonLike[],
  opts: {
    preferredStartMinutes: number[];
    preferredWeekdays: string[];
    preferredClassesPerDay: number;
    maxClassesPerDay: number;
    minGapDays: number;
    maxGapDays: number;
  },
): { score: number; facts: ScoredSchedule["facts"] } {
  const n = lessons.length;
  if (n === 0) return { score: 0.5, facts: emptyFacts() };

  const perDay = new Map<string, number>();
  for (const l of lessons) perDay.set(l.date, (perDay.get(l.date) ?? 0) + 1);

  const days = [...perDay.keys()].sort();
  let maxInDay = 0;
  for (const c of perDay.values()) if (c > maxInDay) maxInDay = c;

  // Timing preference: reward lessons starting at a preferred minute.
  let timingHits = 0;
  if (opts.preferredStartMinutes.length > 0) {
    for (const l of lessons) {
      const m = minutesOf(l.start_time);
      const near = opts.preferredStartMinutes.some((p) => Math.abs(p - m) <= 60);
      if (near) timingHits += 1;
    }
  }
  const timingScore =
    opts.preferredStartMinutes.length > 0 ? timingHits / n : 0.5;

  // Day preference.
  let dayScore = 0.5;
  if (opts.preferredWeekdays.length > 0) {
    let hits = 0;
    for (const l of lessons) {
      if (opts.preferredWeekdays.includes(weekdayOf(l.date))) hits += 1;
    }
    dayScore = hits / n;
  }

  // Daily balance: penalise exceeding the PREFERRED count; the HARD cap is
  // enforced separately as a rejection, never here.
  let dayBalance: number;
  if (maxInDay <= opts.preferredClassesPerDay) {
    dayBalance = 1;
  } else {
    dayBalance = Math.max(
      0,
      1 - (maxInDay - opts.preferredClassesPerDay) / Math.max(1, opts.maxClassesPerDay),
    );
  }

  // Spacing: reward a gap between the preferred bounds (only when configured).
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push(dayDiff(days[i - 1], days[i]));
  let spacing = 0.5;
  let avgGap = 0;
  if (gaps.length > 0) {
    avgGap = r4(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    if (opts.minGapDays > 0 || opts.maxGapDays > 0) {
      const lo = opts.minGapDays > 0 ? opts.minGapDays : 0;
      const hi = opts.maxGapDays > 0 ? opts.maxGapDays : Number.MAX_SAFE_INTEGER;
      const inside = gaps.filter((g) => g >= lo && g <= hi).length;
      spacing = inside / gaps.length;
    }
  }

  // Prefer spreading over fewer distinct days for the same lesson count.
  const idealDays = Math.max(1, Math.ceil(n / Math.max(1, opts.preferredClassesPerDay)));
  const compression = days.length <= idealDays ? 1 : idealDays / days.length;

  const score =
    0.3 * timingScore + 0.2 * dayScore + 0.3 * dayBalance + 0.1 * spacing + 0.1 * compression;

  return {
    score: r4(clamp01(score)),
    facts: {
      distinctDays: days.length,
      maxClassesInADay: maxInDay,
      completionDays: completionSpan(lessons),
      averageGapDays: avgGap,
      preferredTimingHits: timingHits,
      totalTravelKm: 0,
      areaTransitions: 0,
      instructorRelativeLoad: 0,
      starvationRelief: 0,
    },
  };
}

/** §21 instructor balance for a complete schedule. */
export function instructorBalanceScore(
  instructorId: string,
  workloads: Record<string, Workload>,
  policy: WorkloadPolicy,
): { score: number; relative: number; relief: number } {
  const bal = balanceScore(instructorId, workloads, policy);
  const relief = starvationRelief(instructorId, workloads, policy);
  return { score: r4(clamp01(bal.score + relief)), relative: bal.relative, relief: r4(relief) };
}

/**
 * §11 distribution: how evenly classes are spread across the days used. 1 = a
 * perfectly even spread, lower as one day absorbs the load.
 */
export function scheduleDistributionScore(lessons: LessonLike[]): number {
  const perDay = new Map<string, number>();
  for (const l of lessons) perDay.set(l.date, (perDay.get(l.date) ?? 0) + 1);
  if (perDay.size <= 1) return lessons.length <= 2 ? 1 : 0.6;

  const counts = [...perDay.values()].sort((a, b) => a - b);
  const max = counts[counts.length - 1];
  const min = counts[0];
  if (max === min) return 1;
  // 1.0 when min/max == 1, decaying as the ratio worsens.
  return r4(clamp01(min / max));
}

/**
 * §14 completion efficiency: finishing sooner scores higher.
 *
 * The score ramps across the whole configured window — 1 day spans 1, and the
 * maximum allowed span scores 0. An earlier version computed
 * `maximumCompletionDays / span`, which clamps to 1 for EVERY plan that finishes
 * inside the window and therefore never influenced a decision.
 */
export function completionEfficiencyScore(
  lessons: LessonLike[],
  maximumCompletionDays: number,
): number {
  if (maximumCompletionDays <= 0) return 0.5; // not configured => no opinion
  const span = completionSpan(lessons);
  if (span <= 1) return 1;
  const range = Math.max(1, maximumCompletionDays - 1);
  return r4(clamp01(1 - (span - 1) / range));
}

/** §19 combine the five components with the configured weights. */
export function combine(
  components: ScoreComponents,
  weights: SchedulerWeights,
): number {
  if (!scoreWeightsPresent(weights)) return 0.5;
  const total =
    components.customerConvenience * weights.customerConvenience +
    components.instructorBalance * weights.instructorBalance +
    components.travelEfficiency * weights.travelEfficiency +
    components.scheduleDistribution * weights.scheduleDistribution +
    components.completionEfficiency * weights.completionEfficiency;

  const wsum =
    weights.customerConvenience +
    weights.instructorBalance +
    weights.travelEfficiency +
    weights.scheduleDistribution +
    weights.completionEfficiency;

  if (wsum <= 0) return 0.5;
  // Weights are expected as fractions (0..1); normalise so any total works.
  return r4(clamp01(total / wsum));
}

export function emptyComponents(): ScoreComponents {
  return {
    customerConvenience: 0.5,
    instructorBalance: 0.5,
    travelEfficiency: 0.5,
    scheduleDistribution: 0.5,
    completionEfficiency: 0.5,
  };
}

function emptyFacts(): ScoredSchedule["facts"] {
  return {
    distinctDays: 0,
    maxClassesInADay: 0,
    completionDays: 0,
    averageGapDays: 0,
    preferredTimingHits: 0,
    totalTravelKm: 0,
    areaTransitions: 0,
    instructorRelativeLoad: 0,
    starvationRelief: 0,
  };
}

function minutesOf(hhmm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(String(hhmm ?? ""));
  if (!m) return Number.NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function weekdayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS[d.getUTCDay()];
}

function dayDiff(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round((db - da) / 86_400_000);
}

function completionSpan(lessons: LessonLike[]): number {
  const dates = lessons.map((l) => l.date).sort();
  if (dates.length < 2) return 0;
  return dayDiff(dates[0], dates[dates.length - 1]);
}

export const __internal = { minutesOf, weekdayOf, dayDiff, completionSpan };