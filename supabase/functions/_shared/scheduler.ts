// Constraint-first, instructor-balanced, travel-aware schedule formation
// (§15, §16, §17, §18, §26, §28, §29).
//
// Pure (no Deno imports) so the Node test harness can exercise it.
//
// This module sits ON TOP of `_shared/availability.ts` — it does NOT replace it.
// `availability.ts` remains the single source of truth for who is eligible, which
// slots are free (schedule overlap, unavailability, expired holds) and the
// mandatory same-day back-to-back rule. The scheduler consumes that free grid and
// adds what the legacy greedy pass never had:
//
//   * bounded beam search instead of a single greedy earliest-fill pass (§17)
//   * partial-schedule scoring so bad prefixes die early (§18)
//   * a hard travel-feasibility gate (§8)
//   * time-aware instructor workload over a rolling horizon (§6, §21)
//   * progressive relaxation before declaring infeasibility (§26)
//   * a full audit trail explaining every rejection (§29)
//
// HARD vs SOFT (§15) is enforced structurally: `hardRejection()` kills a
// candidate outright, while every preference only ever moves a score.

import {
  areaEligibleInstructors,
  buildInstructorFreeGrid,
  candidateStartMinutes,
  isFemale,
  type AvailabilityInput,
  type CoursePlanLesson,
  type InstructorLike,
  type ScheduleBlock,
  type SlotPointer,
} from "./availability.ts";
import { dateToWeekdayLower, minutesToTime, timeToMinutes } from "./validation.ts";
import {
  DEFAULT_TRAVEL_POLICY,
  TravelCache,
  geographicCost,
  travelEfficiencyScore,
  travelSlackMinutes,
  type LatLng,
  type TravelPolicy,
} from "./travel.ts";
import {
  DEFAULT_WORKLOAD_POLICY,
  computeWorkloads,
  type Workload,
  type WorkloadPolicy,
} from "./workload.ts";
import {
  combine,
  completionEfficiencyScore,
  customerConvenienceScore,
  emptyComponents,
  instructorBalanceScore,
  scheduleDistributionScore,
  type ScoreComponents,
} from "./scoring.ts";
import type { SchedulerConfig } from "./schedulerConfig.ts";

export const SCHEDULER_ERROR = {
  NO_ELIGIBLE_INSTRUCTOR: "no_eligible_instructor",
  FIRST_SLOT_UNAVAILABLE: "first_slot_unavailable",
  NO_FEASIBLE_SCHEDULE: "no_feasible_schedule",
  TRAVEL_CONFLICT: "travel_conflict",
  CUSTOMER_AVAILABILITY_CONFLICT: "customer_availability_conflict",
  DAILY_LIMIT_EXCEEDED: "daily_limit_exceeded",
  COURSE_SCHEDULE_INCOMPLETE: "course_schedule_incomplete",
  FEMALE_INSTRUCTOR_UNAVAILABLE: "female_instructor_unavailable",
  SLOT_CONFLICT: "slot_conflict",
  SCHEDULE_REVALIDATION_FAILED: "schedule_revalidation_failed",
} as const;

export type SchedulerErrorCode =
  (typeof SCHEDULER_ERROR)[keyof typeof SCHEDULER_ERROR];

/**
 * §26 progressive relaxation ladder. Index 0 is strictest.
 *
 * A level may only relax SOFT preferences, or widen the SEARCH SPACE along
 * dimensions the spec lists as expandable (customer time window, scheduling
 * window). It must NEVER relax a hard constraint — travel, daily cap, first-class
 * lock, eligibility and lesson count are enforced identically at every level.
 *
 * `useExtraDates` is what makes the ladder meaningful rather than cosmetic:
 * without widening the day set, relaxing a scoring preference cannot turn an
 * infeasible search into a feasible one.
 */
export interface FallbackLevel {
  level: number;
  label: string;
  /** Ignore preferred timings/days when scoring. */
  ignoreTimingPreferences: boolean;
  /** Allow finishing outside the preferred completion window. */
  ignoreCompletionWindow: boolean;
  /** Allow lesson spacing outside the preferred bounds. */
  ignoreSpacing: boolean;
  /** §26 L3/L4 — also search dates beyond the booking window. */
  useExtraDates: boolean;
}

const FALLBACK_LADDER: FallbackLevel[] = [
  { level: 1, label: "preferred constraints", ignoreTimingPreferences: false, ignoreCompletionWindow: false, ignoreSpacing: false, useExtraDates: false },
  { level: 2, label: "relax soft customer preferences", ignoreTimingPreferences: true, ignoreCompletionWindow: false, ignoreSpacing: false, useExtraDates: false },
  { level: 3, label: "expand scheduling window", ignoreTimingPreferences: true, ignoreCompletionWindow: false, ignoreSpacing: true, useExtraDates: true },
  { level: 4, label: "expand window and all soft preferences", ignoreTimingPreferences: true, ignoreCompletionWindow: true, ignoreSpacing: true, useExtraDates: true },
];

export interface NeighbouringLesson {
  startMinute: number;
  endMinute: number;
  point: LatLng | null;
}

/**
 * Extra, OPTIONAL context the scheduler cannot derive itself. Everything is
 * optional so callers that have no location data (today's setup) still work and
 * simply skip the travel gate.
 */
export interface SchedulerContext {
  now?: Date;
  /** instructorId -> date -> that instructor's lessons and where they happen. */
  blockLocations?: Map<string, Map<string, NeighbouringLesson[]>>;
  /**
   * §26 L3/L4 — dates BEYOND the booking window, together with any
   * `Schedule` rows on those dates in `input.blocks`. The caller fetches them
   * (they are outside its normal window), so widening the search is a deliberate
   * extra query rather than an unbounded one.
   */
  extraDates?: string[];
  /** Where this learner's lessons happen (normally the booking's coordinates). */
  learnerPoint?: LatLng | null;
  /** §29 audit sink. */
  onAudit?: (entry: AuditEntry) => void;
}

export interface AuditEntry {
  instructorId: string;
  instructorName?: string | null;
  outcome: "selected" | "rejected" | "feasible_not_selected";
  reason: string;
  score?: number;
  components?: ScoreComponents;
}

export interface SchedulerCandidate {
  instructorId: string;
  lessons: CoursePlanLesson[];
  score: number;
  components: ScoreComponents;
  facts: {
    completionDays: number;
    maxClassesInADay: number;
    distinctDays: number;
    totalTravelKm: number;
    areaTransitions: number;
    workloadRelative: number;
  };
}

export interface SchedulerOutcome {
  ok: boolean;
  /** Only present on success — internal, never returned to a customer client. */
  instructorId?: string;
  totalLessons: number;
  lessons?: CoursePlanLesson[];
  score?: number;
  components?: ScoreComponents;
  facts?: SchedulerCandidate["facts"];
  /** §27 escalation state — no UI this pass, but the flag exists. */
  requiresExecutiveReview?: boolean;
  fallbackLevel?: number;
  error?: SchedulerErrorCode;
  /** Human-readable, safe to log; never surfaced to a customer. */
  diagnostics?: string[];
}

interface Node {
  lessons: Array<{ date: string; start: number; end: number }>;
  partial: number;
}

function isoDayDiff(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round((db - da) / 86_400_000);
}

/**
 * §8 hard travel gate for one candidate lesson against the instructor's
 * surrounding lessons that day. Returns a reason string when the candidate is
 * physically impossible, else null.
 */
function travelRejection(
  instructorId: string,
  date: string,
  startMinute: number,
  endMinute: number,
  learnerPoint: LatLng | null,
  context: SchedulerContext,
  policy: TravelPolicy,
  cache: TravelCache,
): string | null {
  if (policy.averageSpeedKph === null) return null;
  if (!learnerPoint) return null;
  const perDate = context.blockLocations?.get(instructorId)?.get(date);
  if (!perDate || perDate.length === 0) return null;

  const sorted = [...perDate].sort((a, b) => a.startMinute - b.startMinute);
  const point: LatLng = { lat: learnerPoint.lat, lng: learnerPoint.lng };

  for (const n of sorted) {
    // Only same-day neighbours can constrain travel.
    if (n.endMinute <= startMinute) {
      const slack = travelSlackMinutes(n.endMinute, startMinute, n.point, point, policy, cache);
      if (slack !== null && slack < 0) {
        return `travel_conflict: ${Math.abs(slack)}min short travelling from an earlier lesson on ${date}`;
      }
    } else if (n.startMinute >= endMinute) {
      const slack = travelSlackMinutes(endMinute, n.startMinute, point, n.point, policy, cache);
      if (slack !== null && slack < 0) {
        return `travel_conflict: ${Math.abs(slack)}min short travelling to a later lesson on ${date}`;
      }
    }
  }
  return null;
}

/**
 * §17 beam search for ONE instructor. Lesson 1 is the customer's fixed pick and
 * is never moved (§2). Returns null when no complete schedule exists.
 */
function beamSearch(
  args: {
    instructor: InstructorLike;
    free: Map<string, Map<string, number[]>>;
    dates: string[];
    pointer: SlotPointer;
    totalLessons: number;
    duration: number;
    config: SchedulerConfig;
    context: SchedulerContext;
    travelPolicy: TravelPolicy;
    cache: TravelCache;
    level: FallbackLevel;
  },
): { lessons: CoursePlanLesson[] | null; score: number; travelKm: number; transitions: number } {
  const { instructor, free, dates, pointer, totalLessons, duration, config, context, travelPolicy, cache, level } = args;

  const sortedDates = [...dates].sort();
  const firstStart = timeToMinutes(pointer.start);
  if (!Number.isFinite(firstStart)) return { lessons: null, score: 0, travelKm: 0, transitions: 0 };
  const firstDayIndex = sortedDates.indexOf(pointer.date);
  if (firstDayIndex < 0) return { lessons: null, score: 0, travelKm: 0, transitions: 0 };

  const firstFree = free.get(instructor.id)?.get(pointer.date) ?? [];
  if (!firstFree.includes(firstStart)) {
    return { lessons: null, score: 0, travelKm: 0, transitions: 0 };
  }

  const learnerPoint = context.learnerPoint ?? null;

  const start: Node = {
    lessons: [
      { date: pointer.date, start: firstStart, end: firstStart + duration },
    ],
    partial: 0,
  };

  const beamWidth = Math.max(1, config.beamWidth);
  let beam: Node[] = [start];

  for (let placed = 1; placed < totalLessons; placed++) {
    const next: Node[] = [];

    for (const node of beam) {
      const perDayCount = new Map<string, number>();
      const anchorEnd = new Map<string, number>();
      for (const l of node.lessons) {
        perDayCount.set(l.date, (perDayCount.get(l.date) ?? 0) + 1);
        const cur = anchorEnd.get(l.date);
        anchorEnd.set(l.date, cur === undefined ? l.end : Math.max(cur, l.end));
      }

      for (let di = firstDayIndex; di < sortedDates.length; di++) {
        const date = sortedDates[di];
        const used = perDayCount.get(date) ?? 0;

        // §10 HARD: daily class limit.
        if (used >= config.maxCustomerClassesPerDay) continue;
        // Nothing to gain from looking at days we cannot use.
        if (used === 0 && sortedDates[di] < node.lessons[node.lessons.length - 1].date) continue;

        const starts = free.get(instructor.id)?.get(date) ?? [];
        for (const m of starts) {
          const end = m + duration;

          // Never overlap our own placements.
          const clashes = node.lessons.some(
            (l) => l.date === date && l.start < end && m < l.end,
          );
          if (clashes) continue;

          // §10 HARD + the existing mandatory rule: a second lesson on the same
          // day must be immediately back-to-back with the day's first lesson.
          if (used >= 1) {
            if (m !== anchorEnd.get(date)) continue;
          } else if (date === pointer.date) {
            // Lesson 1 is fixed; only strictly-later times on its own day.
            if (m <= firstStart) continue;
          }

          // §8 HARD: physical travel feasibility.
          const tRej = travelRejection(
            instructor.id, date, m, end, learnerPoint, context, travelPolicy, cache,
          );
          if (tRej) continue;

          next.push({
            lessons: [...node.lessons, { date, start: m, end }],
            partial: node.partial + partialIncrement(node.lessons, date, m, config, level),
          });
        }

        if (next.length >= beamWidth * 8) break; // enough to rank; stop widening
      }
    }

    if (next.length === 0) return { lessons: null, score: 0, travelKm: 0, transitions: 0 };

    // §18 rank partial schedules and keep only the best `beamWidth`.
    next.sort((a, b) => b.partial - a.partial);
    beam = next.slice(0, beamWidth);
  }

  // §19 score every surviving complete schedule and return the best.
  let best: { lessons: CoursePlanLesson[]; partial: number; travelKm: number; transitions: number } | null = null;
  const pointsFor = (n: Node): Array<LatLng | null> => {
    if (!learnerPoint) return n.lessons.map(() => null);
    return n.lessons.map(() => ({ lat: learnerPoint.lat, lng: learnerPoint.lng }));
  };

  for (const node of beam) {
    if (node.lessons.length < totalLessons) continue;
    const geo = geographicCost(pointsFor(node), cache, travelPolicy);
    if (!best || node.partial - geo.totalKm * 0.001 > best.partial - best.travelKm * 0.001) {
      best = {
        lessons: toLessons(node.lessons),
        partial: node.partial,
        travelKm: geo.totalKm,
        transitions: geo.transitions,
      };
    }
  }

  if (!best) return { lessons: null, score: 0, travelKm: 0, transitions: 0 };
  return { lessons: best.lessons, score: best.partial, travelKm: best.travelKm, transitions: best.transitions };
}

/** Cheap partial-score increment so bad prefixes are pruned early. */
function partialIncrement(
  lessons: Array<{ date: string; start: number; end: number }>,
  date: string,
  start: number,
  config: SchedulerConfig,
  level: FallbackLevel,
): number {
  let inc = 1;
  const sameDay = lessons.filter((l) => l.date === date).length + 1;
  // Reward keeping within the preferred classes-per-day.
  if (sameDay > config.preferredCustomerClassesPerDay) inc -= 0.5;

  if (!level.ignoreSpacing) {
    const last = lessons[lessons.length - 1];
    const gap = isoDayDiff(last.date, date);
    if (config.preferredMaxGapDays > 0 && gap > config.preferredMaxGapDays) inc -= 0.4;
    if (config.preferredMinGapDays > 0 && gap < config.preferredMinGapDays && gap > 0) inc -= 0.2;
  }
  if (!level.ignoreTimingPreferences && config.preferredStartMinutes.length > 0) {
    if (config.preferredStartMinutes.some((p) => Math.abs(p - start) <= 60)) inc += 0.3;
  }
  return inc;
}

function toLessons(rows: Array<{ date: string; start: number; end: number }>): CoursePlanLesson[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    .map((r, i) => ({
      lesson: i + 1,
      date: r.date,
      day: dateToWeekdayLower(r.date),
      start_time: minutesToTime(r.start),
      end_time: minutesToTime(r.end),
    }));
}

/**
 * §26 + §17 top-level entry point: try each eligible instructor under each
 * fallback level, score everything, and return the best complete schedule with
 * an audit trail.
 */
export function scheduleCourse(args: {
  input: AvailabilityInput;
  pointer: SlotPointer;
  totalLessons: number;
  config: SchedulerConfig;
  context?: SchedulerContext;
}): SchedulerOutcome {
  const { input, pointer, totalLessons, config, context = {} } = args;

  const diagnostics: string[] = [];
  const now = context.now ?? input.now ?? new Date();
  const duration = Math.floor(input.slotConfig.slotDurationMinutes);
  const dates = input.dates || [];

  const eligibleAll = areaEligibleInstructors(input);
  if (eligibleAll.length === 0) {
    return {
      ok: false, totalLessons,
      error: SCHEDULER_ERROR.NO_ELIGIBLE_INSTRUCTOR,
      diagnostics: ["no active instructor serves this point"],
    };
  }

  const femaleMode = input.femaleMode ?? "off";
  const femaleWanted = femaleMode === "mandatory" && Boolean(input.femalePreference);
  const eligible = femaleWanted ? eligibleAll.filter((i) => isFemale(i.gender)) : eligibleAll;

  if (femaleWanted && eligible.length === 0) {
    return {
      ok: false, totalLessons,
      error: SCHEDULER_ERROR.FEMALE_INSTRUCTOR_UNAVAILABLE,
      diagnostics: ["female instructor required but none serves this point"],
    };
  }

  // §33 bound the expensive work.
  const capped =
    config.maxCandidateInstructors > 0
      ? eligible.slice(0, config.maxCandidateInstructors)
      : eligible;

  // The free grid is built ONCE over the union of the booking window and any
  // §26 extra dates, so deeper fallback levels have a grid to search even though
  // level 1 only ever looks at the booking window. Building it per level would
  // repeat the most expensive part of the pass.
  const allDates = context.extraDates?.length ? [...dates, ...context.extraDates] : dates;
  const free = buildInstructorFreeGrid(
    allDates.length === dates.length ? input : { ...input, dates: allDates },
    eligible,
  );
  const travelPolicy: TravelPolicy = {
    averageSpeedKph: config.averageTravelSpeedKph,
    bufferMinutes: config.instructorTravelBufferMinutes,
    negligibleKm: DEFAULT_TRAVEL_POLICY.negligibleKm,
  };
  const cache = new TravelCache();

  const workloadPolicy: WorkloadPolicy = {
    horizonDays: config.workloadHorizonDays,
    fairnessThreshold: config.fairnessThreshold,
    starvationReliefFactor: config.starvationReliefFactor,
    referenceDailyHours: DEFAULT_WORKLOAD_POLICY.referenceDailyHours,
  };
  const workloads: Record<string, Workload> = computeWorkloads(
    input.blocks, workloadPolicy, now, input.holdMinutes,
  );

  // Lesson 1 is the customer's fixed pick, so beamSearch cannot reject it — which
  // means the travel gate must be applied to it HERE, otherwise the very first
  // class of the course could be physically impossible to reach. Every
  // rejection is audited (§29), including the instructors that never reach the
  // search at all.
  const learnerPoint = context.learnerPoint ?? null;
  const pointerMinute = timeToMinutes(pointer.start);
  const firstFreeByInstructor: InstructorLike[] = [];
  let sawTravelRejection = false;

  for (const i of capped) {
    if (!(free.get(i.id)?.get(pointer.date) ?? []).includes(pointerMinute)) {
      context.onAudit?.({
        instructorId: i.id,
        instructorName: i.name ?? null,
        outcome: "rejected",
        reason: "the customer's first slot conflicts with an existing lesson or unavailability",
      });
      continue;
    }
    const travelReason = travelRejection(
      i.id,
      pointer.date,
      pointerMinute,
      pointerMinute + duration,
      learnerPoint,
      context,
      travelPolicy,
      cache,
    );
    if (travelReason) {
      sawTravelRejection = true;
      context.onAudit?.({
        instructorId: i.id,
        instructorName: i.name ?? null,
        outcome: "rejected",
        reason: travelReason,
      });
      continue;
    }
    firstFreeByInstructor.push(i);
  }

  if (firstFreeByInstructor.length === 0) {
    return {
      ok: false,
      totalLessons,
      error: sawTravelRejection
        ? SCHEDULER_ERROR.TRAVEL_CONFLICT
        : SCHEDULER_ERROR.FIRST_SLOT_UNAVAILABLE,
      diagnostics: [`no eligible instructor is free at ${pointer.date} ${pointer.start}`],
      requiresExecutiveReview: false,
    };
  }

  const levels = config.maxFallbackLevels > 0
    ? FALLBACK_LADDER.slice(0, Math.max(1, config.maxFallbackLevels))
    : FALLBACK_LADDER.slice(0, 1);

  let bestCandidate: (SchedulerCandidate & { level: number }) | null = null;
  let deepestTried = 0;

  for (const level of levels) {
    deepestTried = level.level;
    // §26: deeper levels may search beyond the booking window.
    const searchDates = level.useExtraDates && context.extraDates?.length
      ? [...dates, ...context.extraDates]
      : dates;

    for (const instructor of firstFreeByInstructor) {
      const searched = beamSearch({
        instructor,
        free,
        dates: searchDates,
        pointer,
        totalLessons,
        duration,
        config,
        context,
        travelPolicy,
        cache,
        level,
      });

      if (!searched.lessons) {
        context.onAudit?.({
          instructorId: instructor.id,
          instructorName: instructor.name ?? null,
          outcome: "rejected",
          reason: "no complete schedule satisfies the hard constraints",
        });
        continue;
      }

      const lessons = searched.lessons;
      const conv = customerConvenienceScore(lessons, {
        preferredStartMinutes: level.ignoreTimingPreferences ? [] : config.preferredStartMinutes,
        preferredWeekdays: level.ignoreTimingPreferences ? [] : config.preferredWeekdays,
        preferredClassesPerDay: config.preferredCustomerClassesPerDay,
        maxClassesPerDay: config.maxCustomerClassesPerDay,
        minGapDays: level.ignoreSpacing ? 0 : config.preferredMinGapDays,
        maxGapDays: level.ignoreSpacing ? 0 : config.preferredMaxGapDays,
      });
      const bal = instructorBalanceScore(instructor.id, workloads, workloadPolicy);

      // §9 normalise travel against the worst plan seen in this pass.
      const components: ScoreComponents = {
        ...emptyComponents(),
        customerConvenience: conv.score,
        instructorBalance: bal.score,
        travelEfficiency: travelEfficiencyScore(
          { totalKm: searched.travelKm, transitions: searched.transitions },
          Math.max(searched.travelKm, 1),
          Math.max(searched.transitions, 1),
        ),
        scheduleDistribution: scheduleDistributionScore(lessons),
        completionEfficiency: completionEfficiencyScore(
          lessons,
          level.ignoreCompletionWindow ? 0 : config.maximumCompletionDays,
        ),
      };
      const total = combine(components, config.weights);

      const candidate: SchedulerCandidate & { level: number } = {
        instructorId: instructor.id,
        lessons,
        score: total,
        components,
        facts: {
          completionDays: conv.facts.completionDays,
          maxClassesInADay: conv.facts.maxClassesInADay,
          distinctDays: conv.facts.distinctDays,
          totalTravelKm: searched.travelKm,
          areaTransitions: searched.transitions,
          workloadRelative: bal.relative,
        },
        level: level.level,
      };

      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = candidate;
      }
    }

    // A feasible schedule at a relaxed level is good enough — do not relax more.
    if (bestCandidate) break;
  }

  if (!bestCandidate) {
    return {
      ok: false, totalLessons,
      error: SCHEDULER_ERROR.NO_FEASIBLE_SCHEDULE,
      requiresExecutiveReview: true,
      diagnostics: diagnostics.concat(
        `tried ${firstFreeByInstructor.length} instructor(s) across ${deepestTried} fallback level(s)`,
      ),
    };
  }

  context.onAudit?.({
    instructorId: bestCandidate.instructorId,
    instructorName:
      eligible.find((i) => i.id === bestCandidate!.instructorId)?.name ?? null,
    outcome: "selected",
    reason: `feasible schedule, score ${bestCandidate.score}`,
    score: bestCandidate.score,
    components: bestCandidate.components,
  });

  return {
    ok: true,
    instructorId: bestCandidate.instructorId,
    totalLessons,
    lessons: bestCandidate.lessons,
    score: bestCandidate.score,
    components: bestCandidate.components,
    facts: bestCandidate.facts,
    fallbackLevel: bestCandidate.level,
  };
}

/** §28 schedule-version payload for persisting a proposed plan. */
export interface PlanVersion {
  version: number;
  algorithmVersion: string;
  generatedAt: string;
  generatedBy: string;
  changedBy: string | null;
  changeReason: string | null;
  score: number;
}

export function buildPlanVersion(args: {
  version: number;
  config: SchedulerConfig;
  score: number;
  generatedBy: string;
  generatedAt: Date;
  changedBy?: string | null;
  changeReason?: string | null;
}): PlanVersion {
  return {
    version: args.version,
    algorithmVersion: args.config.algorithmVersion,
    generatedAt: args.generatedAt.toISOString(),
    generatedBy: args.generatedBy,
    changedBy: args.changedBy ?? null,
    changeReason: args.changeReason ?? null,
    score: args.score,
  };
}