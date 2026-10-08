// Optional scheduler configuration, read from the SAME `booking_flow` app_settings
// row that `_shared/config.ts` parses. Pure (no Deno imports) so the Node test
// harness can exercise it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A SEPARATE, FAIL-OPEN READER
// ─────────────────────────────────────────────────────────────────────────────
// `_shared/config.ts` is deliberately FAIL-CLOSED: if ANY required key is
// missing it reports `enabled:false` so booking refuses to run on values that do
// not exist in the DB. That is correct for the core flow and must not change.
//
// If the scheduler keys were added to that required list, the production
// `booking_flow` row (which does not have them) would flip the WHOLE funnel to
// `booking_disabled`. So this module is intentionally fail-OPEN and independent:
// it can never disable booking, and every unset key falls back to a default that
// reproduces the engine's EXISTING behaviour.
//
// The practical effect: until a key is present in the DB, the scheduler is off
// and `computeCoursePlan` behaves exactly as it did before. Turning the
// scheduler on is therefore a deliberate, reversible DB change.
//
// Business values are NOT invented here. A key that gates a behaviour defaults to
// the "off" value (null / 0 / false) unless the field is purely structural.
// `MAX_COURSES_PER_DAY_FALLBACK` mirrors the rule the engine already enforced
// (2 lessons per learner per day), so defaulting to it is not a new business
// decision — it is the status quo.

export const ALGORITHM_VERSION = "beam-1";

export interface SchedulerWeights {
  customerConvenience: number;
  instructorBalance: number;
  travelEfficiency: number;
  scheduleDistribution: number;
  completionEfficiency: number;
}

export interface SchedulerConfig {
  /** Master switch. Absent / false => scheduler off, legacy greedy engine runs. */
  enabled: boolean;
  algorithmVersion: string;

  // --- customer daily load (§10) ---
  /** Hard cap per learner per day. 2 == the rule already hardcoded in the engine. */
  maxCustomerClassesPerDay: number;
  /** Soft target; exceeding it costs score but never rejects. */
  preferredCustomerClassesPerDay: number;

  // --- spacing & cadence (§12, §13, §14) ---
  /** Soft minimum gap between consecutive customer classes, in minutes (cross-day). */
  minimumCustomerGapMinutes: number;
  /** Soft preferred number of days between lessons. */
  preferredMinGapDays: number;
  preferredMaxGapDays: number;
  /** Soft target for finishing the course. 0 = no preference. */
  maximumCompletionDays: number;

  // --- travel (§8, §9) ---
  /**
   * Average city driving speed (km/h) used to convert straight-line distance into
   * travel time. Null disables the travel HARD constraint entirely, because
   * without a speed there is no defensible travel time (we will not guess one).
   */
  averageTravelSpeedKph: number | null;
  /** Safety margin added on top of the computed travel time. */
  instructorTravelBufferMinutes: number;

  // --- workload & fairness (§5, §6, §21-23) ---
  /** Rolling window for workload measurement. 0 = whole booking window (status quo). */
  workloadHorizonDays: number;
  /** Workload differences below this ratio are treated as equivalent. */
  fairnessThreshold: number;
  /** Extra score pressure applied to a starved, under-utilised instructor. */
  starvationReliefFactor: number;

  // --- search (§16, §17) ---
  beamWidth: number;
  /** Max instructors carried into the expensive scoring stage. */
  maxCandidateInstructors: number;
  /** Max candidate slots considered per lesson during beam expansion. */
  maxCandidatesPerLesson: number;

  // --- fallback (§26) ---
  /** How many relaxation levels to attempt before declaring infeasibility. */
  maxFallbackLevels: number;

  // --- customer preferences (all optional) ---
  /** Preferred start minutes (from midnight) — rewarded, never required. */
  preferredStartMinutes: number[];
  /** ISO weekdays (lowercase) the learner prefers — rewarded, never required. */
  preferredWeekdays: string[];

  weights: SchedulerWeights;
}

// Defaults reproduce TODAY'S behaviour exactly.
const DISABLED: SchedulerConfig = {
  enabled: false,
  algorithmVersion: ALGORITHM_VERSION,
  maxCustomerClassesPerDay: 2,
  preferredCustomerClassesPerDay: 2,
  minimumCustomerGapMinutes: 0,
  preferredMinGapDays: 0,
  preferredMaxGapDays: 0,
  maximumCompletionDays: 0,
  averageTravelSpeedKph: null,
  instructorTravelBufferMinutes: 0,
  workloadHorizonDays: 0,
  fairnessThreshold: 0,
  starvationReliefFactor: 0,
  beamWidth: 0,
  maxCandidateInstructors: 0,
  maxCandidatesPerLesson: 0,
  maxFallbackLevels: 0,
  preferredStartMinutes: [],
  preferredWeekdays: [],
  weights: {
    customerConvenience: 0,
    instructorBalance: 0,
    travelEfficiency: 0,
    scheduleDistribution: 0,
    completionEfficiency: 0,
  },
};

const WEEKDAY_RE = /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/;

function num(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function pickNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = num(value, min, max);
  return n === null ? fallback : n;
}

function pickNumberOrNull(
  value: unknown,
  min: number,
  max: number,
): number | null {
  return num(value, min, max);
}

/**
 * Weights are read SCALE-INVARIANTLY and normalised to sum to 1.
 *
 * The requirement quotes them as percentages (35 / 25 / 20 / 15 / 5) but a DB
 * author may equally store fractions (0.35 / 0.25 / …). Rejecting one of those
 * scales would silently zero the scorer, so both are accepted: any non-negative
 * values are read, then normalised by their total. An all-zero block means "no
 * scoring configured", which is a legitimate state (the search still runs and
 * ranks deterministically without a business trade-off).
 */
function readWeights(raw: Record<string, unknown>): SchedulerWeights {
  const w = (raw.weights ?? {}) as Record<string, unknown>;
  const wn = (v: unknown): number => {
    const n = num(v, 0, 100);
    return n === null ? 0 : n;
  };
  const weights = {
    customerConvenience: wn(w.customer_convenience),
    instructorBalance: wn(w.instructor_balance),
    travelEfficiency: wn(w.travel_efficiency),
    scheduleDistribution: wn(w.schedule_distribution),
    completionEfficiency: wn(w.completion_efficiency),
  };
  const total =
    weights.customerConvenience +
    weights.instructorBalance +
    weights.travelEfficiency +
    weights.scheduleDistribution +
    weights.completionEfficiency;

  if (total <= 0) {
    return {
      customerConvenience: 0,
      instructorBalance: 0,
      travelEfficiency: 0,
      scheduleDistribution: 0,
      completionEfficiency: 0,
    };
  }
  return {
    customerConvenience: weights.customerConvenience / total,
    instructorBalance: weights.instructorBalance / total,
    travelEfficiency: weights.travelEfficiency / total,
    scheduleDistribution: weights.scheduleDistribution / total,
    completionEfficiency: weights.completionEfficiency / total,
  };
}

/**
 * Read the optional `scheduler` sub-object of the `booking_flow` value.
 *
 * NEVER throws and NEVER reports the funnel as disabled — it only decides whether
 * the advanced scheduler runs in place of the legacy greedy pass.
 */
export function readSchedulerConfig(raw: unknown): SchedulerConfig {
  try {
    if (!raw || typeof raw !== "object") return DISABLED;
    const value = (raw as Record<string, unknown>).scheduler;
    if (!value || typeof value !== "object") return DISABLED;

    const v = value as Record<string, unknown>;

    // Absent or explicitly false => off. We never infer "on".
    const enabled = v.enabled === true;
    if (!enabled) return DISABLED;

    const maxPerDay = pickNumber(v.max_customer_classes_per_day, 1, 8, DISABLED.maxCustomerClassesPerDay);

    const preferredMinutes = Array.isArray(v.preferred_start_minutes)
      ? (v.preferred_start_minutes as unknown[])
          .map((m) => num(m, 0, 24 * 60 - 1))
          .filter((m): m is number => m !== null)
      : DISABLED.preferredStartMinutes;

    const preferredWeekdays = Array.isArray(v.preferred_weekdays)
      ? (v.preferred_weekdays as unknown[])
          .map((d) => String(d).trim().toLowerCase())
          .filter((d) => WEEKDAY_RE.test(d))
      : DISABLED.preferredWeekdays;

    return {
      enabled: true,
      algorithmVersion:
        typeof v.algorithm_version === "string" && v.algorithm_version.trim()
          ? v.algorithm_version.trim()
          : ALGORITHM_VERSION,

      maxCustomerClassesPerDay: maxPerDay,
      // Never let the soft preference exceed the hard cap.
      preferredCustomerClassesPerDay: Math.min(
        pickNumber(v.preferred_customer_classes_per_day, 1, 8, maxPerDay),
        maxPerDay,
      ),

      minimumCustomerGapMinutes: pickNumber(
        v.minimum_customer_gap_minutes, 0, 240, DISABLED.minimumCustomerGapMinutes,
      ),
      preferredMinGapDays: pickNumber(v.preferred_min_gap_days, 0, 30, DISABLED.preferredMinGapDays),
      preferredMaxGapDays: pickNumber(v.preferred_max_gap_days, 0, 90, DISABLED.preferredMaxGapDays),
      maximumCompletionDays: pickNumber(v.maximum_completion_days, 0, 365, DISABLED.maximumCompletionDays),

      averageTravelSpeedKph: pickNumberOrNull(v.average_travel_speed_kph, 5, 200),
      instructorTravelBufferMinutes: pickNumber(
        v.instructor_travel_buffer_minutes, 0, 240, DISABLED.instructorTravelBufferMinutes,
      ),

      workloadHorizonDays: pickNumber(v.workload_horizon_days, 0, 90, DISABLED.workloadHorizonDays),
      fairnessThreshold: num(v.fairness_threshold, 0, 1) ?? DISABLED.fairnessThreshold,
      starvationReliefFactor: pickNumber(
        v.starvation_relief_factor, 0, 10, DISABLED.starvationReliefFactor,
      ),

      beamWidth: pickNumber(v.beam_width, 0, 500, DISABLED.beamWidth),
      maxCandidateInstructors: pickNumber(
        v.max_candidate_instructors, 0, 200, DISABLED.maxCandidateInstructors,
      ),
      maxCandidatesPerLesson: pickNumber(
        v.max_candidates_per_lesson, 0, 200, DISABLED.maxCandidatesPerLesson,
      ),

      maxFallbackLevels: pickNumber(v.max_fallback_levels, 0, 6, DISABLED.maxFallbackLevels),

      preferredStartMinutes: preferredMinutes,
      preferredWeekdays: preferredWeekdays,

      weights: readWeights(v),
    };
  } catch {
    // Fail OPEN to the legacy engine — a malformed scheduler block must never
    // take the booking funnel down.
    return DISABLED;
  }
}

/**
 * True when the advanced scheduler has everything it needs to run. Speed-gated
 * travel and weights are reported separately so the caller can degrade
 * individual features instead of all-or-nothing.
 */
export function schedulerCapabilities(cfg: SchedulerConfig): {
  canSearch: boolean;
  travelEnforced: boolean;
  workloadScored: boolean;
  scoringEnabled: boolean;
} {
  const wsum =
    cfg.weights.customerConvenience +
    cfg.weights.instructorBalance +
    cfg.weights.travelEfficiency +
    cfg.weights.scheduleDistribution +
    cfg.weights.completionEfficiency;
  return {
    canSearch: cfg.beamWidth > 0,
    travelEnforced: cfg.averageTravelSpeedKph !== null,
    workloadScored: cfg.workloadHorizonDays > 0 || cfg.beamWidth > 0,
    scoringEnabled: wsum > 0,
  };
}

export const SCHEDULER_DISABLED = DISABLED;