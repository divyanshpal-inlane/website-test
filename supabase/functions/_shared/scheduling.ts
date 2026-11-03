// Mandatory multi-instructor / complete-course / fallback engine.
//
// Pure (no Deno imports) so the Node test harness can exercise it directly.
//
// This module does NOT replace `availability.ts` — it sits on top of it and adds
// the parts of the scheduling contract the greedy pass never had:
//
//   * A  one instructor per complete course, evaluated instructor-by-instructor
//        without ever combining two instructors' availability.
//   * B  the mandatory fallback ladder F1..F6 (evaluate every eligible
//        instructor, shift a lesson to the next eligible date, extend the
//        horizon, search alternative start dates, then REQUEST new preferences
//        and, failing that, route the demand to a human / supply-gap workflow).
//   * C  a single COMPLETE-schedule acceptance rule with explicit violations.
//   * D  per-instructor rejection reason codes, and a hard distinction between
//        a PROVEN absence of a complete schedule and an INCOMPLETE SEARCH
//        (budget / time limit reached).
//   * E  batch-level guards: one instructor across the reservation batch, exact
//        lesson count, no partial proposals promoted to primary.
//   * G  the invariants are asserted in `_tests/slot-formation-fallbacks.test.mjs`.
//
// The engine never invents business data. Everything it cannot know
// (course/vehicle eligibility, learner personal commitments, calendar
// freshness) is supplied by the caller through the optional hooks below, and
// defaults to "nothing known", which reproduces today's behaviour.

import {
  areaEligibleInstructors,
  buildInstructorFreeGrid,
  instructorBookingLoad,
  isInstructorActive,
  planCoursePreferred,
  timeToMinutes,
  validateConsecutiveRule,
  validateLearnerWideConsecutive,
  type AvailabilityInput,
  type CoursePlanLesson,
  type InstructorLike,
  type LearnerDayLesson,
} from "./availability.ts";
import { addDaysISO } from "./validation.ts";

// ---------------------------------------------------------------------------
// D. Candidate rejection reason codes
// ---------------------------------------------------------------------------

export const INSTRUCTOR_REJECTION = {
  INSTRUCTOR_NOT_ELIGIBLE: "INSTRUCTOR_NOT_ELIGIBLE",
  AREA_NOT_SUPPORTED: "AREA_NOT_SUPPORTED",
  COURSE_NOT_SUPPORTED: "COURSE_NOT_SUPPORTED",
  VEHICLE_NOT_AVAILABLE: "VEHICLE_NOT_AVAILABLE",
  NO_AVAILABLE_PREFERRED_TIME: "NO_AVAILABLE_PREFERRED_TIME",
  INSUFFICIENT_COURSE_CAPACITY: "INSUFFICIENT_COURSE_CAPACITY",
  LEARNER_CONFLICT: "LEARNER_CONFLICT",
  INSTRUCTOR_CONFLICT: "INSTRUCTOR_CONFLICT",
  MAX_HORIZON_EXCEEDED: "MAX_HORIZON_EXCEEDED",
  CALENDAR_DATA_STALE: "CALENDAR_DATA_STALE",
  SEARCH_LIMIT_REACHED: "SEARCH_LIMIT_REACHED",
} as const;

export type InstructorRejectionCode =
  (typeof INSTRUCTOR_REJECTION)[keyof typeof INSTRUCTOR_REJECTION];

export const INSTRUCTOR_REJECTION_TEXT: Record<InstructorRejectionCode, string> = {
  INSTRUCTOR_NOT_ELIGIBLE: "Instructor is not active, so no calendar can be trusted for them.",
  AREA_NOT_SUPPORTED: "Instructor does not serve this learner's area.",
  COURSE_NOT_SUPPORTED: "Instructor is not certified for this course.",
  VEHICLE_NOT_AVAILABLE: "Instructor has no vehicle available for this course.",
  NO_AVAILABLE_PREFERRED_TIME: "None of the exact preferred times is free anywhere in the search window.",
  INSUFFICIENT_COURSE_CAPACITY: "Preferred times are free on too few days to fit the whole course.",
  LEARNER_CONFLICT: "The learner already has a conflicting commitment on one of the lesson dates.",
  INSTRUCTOR_CONFLICT: "The generated schedule conflicts with an existing lesson.",
  MAX_HORIZON_EXCEEDED: "The course cannot finish inside the allowed scheduling horizon.",
  CALENDAR_DATA_STALE: "No usable calendar days were supplied for the search.",
  SEARCH_LIMIT_REACHED: "The search was stopped by a configured limit before it could prove anything.",
};

// ---------------------------------------------------------------------------
// Supply-gap classification (B/F6)
// ---------------------------------------------------------------------------

export const SUPPLY_GAP = {
  /** Nobody can serve the area at all. */
  NO_INSTRUCTOR_SUPPLY: "no_instructor_supply",
  /** Instructors exist but cannot host a complete course. */
  INSUFFICIENT_CAPACITY: "insufficient_capacity",
  /** The search was cut short — absence is NOT proven. */
  SEARCH_INCOMPLETE: "search_incomplete",
} as const;

export type SupplyGapKind = (typeof SUPPLY_GAP)[keyof typeof SUPPLY_GAP];

/** The actionable next step a caller must show the customer (F5 / F6). */
export const NEXT_STEP = {
  REVISE_PREFERENCES: "revise_preferences",
  ALTERNATIVE_START_DATE: "alternative_start_date",
  REQUEST_HUMAN_ASSISTANCE: "request_human_assistance",
  RETRY_LATER: "retry_later",
} as const;

export type NextStep = (typeof NEXT_STEP)[keyof typeof NEXT_STEP];

// ---------------------------------------------------------------------------
// C. Complete-schedule acceptance rule
// ---------------------------------------------------------------------------

export const COMPLETE_VIOLATION = {
  NO_LESSONS: "NO_LESSONS",
  LESSON_COUNT_MISMATCH: "LESSON_COUNT_MISMATCH",
  MISSING_INSTRUCTOR: "MISSING_INSTRUCTOR",
  MULTIPLE_INSTRUCTORS: "MULTIPLE_INSTRUCTORS",
  PREFERRED_TIME_NOT_EXACT: "PREFERRED_TIME_NOT_EXACT",
  DURATION_MISMATCH: "DURATION_MISMATCH",
  CONSECUTIVE_RULE_VIOLATION: "CONSECUTIVE_RULE_VIOLATION",
  OUTSIDE_HORIZON: "OUTSIDE_HORIZON",
  SLOT_NOT_AVAILABLE: "SLOT_NOT_AVAILABLE",
  LEARNER_CONFLICT: "LEARNER_CONFLICT",
} as const;

export type CompleteViolation =
  (typeof COMPLETE_VIOLATION)[keyof typeof COMPLETE_VIOLATION];

export interface CompleteScheduleCheck {
  complete: boolean;
  violations: CompleteViolation[];
  /** Every distinct instructor id seen in the batch (never more than one when complete). */
  instructorIds: string[];
  lessonCount: number;
}

export interface CompleteScheduleArgs {
  lessons?: CoursePlanLesson[] | null;
  totalLessons: number;
  /** The one instructor the plan is supposed to use. */
  instructorId?: string | null;
  /**
   * Optional per-lesson instructor ids. When supplied, EVERY entry must be the
   * same non-empty id — this is the explicit "no combining instructors" check.
   */
  lessonInstructorIds?: Array<string | null | undefined> | null;
  /** Exact learner-approved start minutes. When supplied, every lesson must match one. */
  preferredStartMinutes?: number[] | null;
  /** Slot duration from config; when supplied, end - start must equal it. */
  durationMinutes?: number | null;
  /** Dates the search was allowed to use. When supplied, every lesson must be inside. */
  windowDates?: string[] | null;
  /** The instructor's free-grid starts per date, straight from `buildInstructorFreeGrid`. */
  availableStartsByDate?: Map<string, number[] | Set<number>> | null;
  /** Enforce the max-2-per-day / back-to-back rule (defaults to true). */
  enforceConsecutiveRule?: boolean;
  /** The learner's already-active lessons, for the learner-wide conflict check. */
  learnerExisting?: LearnerDayLesson[] | null;
  /** Where this plan comes from. Defaults to the supplied lessons. */
  proposedLessons?: LearnerDayLesson[] | null;
}

function toMinuteSet(value: number[] | Set<number> | undefined): Set<number> | null {
  if (!value) return null;
  return value instanceof Set ? value : new Set(value);
}

/**
 * The single source of truth for "may this be presented as a complete, bookable
 * course?". A schedule is COMPLETE only when every condition holds. Anything
 * else — including a plan that merely *looks* full — is rejected.
 */
export function validateCompleteSchedule(args: CompleteScheduleArgs): CompleteScheduleCheck {
  const violations: CompleteViolation[] = [];
  const lessons = Array.isArray(args.lessons) ? args.lessons : [];
  const lessonCount = lessons.length;

  if (lessonCount === 0) {
    return { complete: false, violations: [COMPLETE_VIOLATION.NO_LESSONS], instructorIds: [], lessonCount: 0 };
  }
  if (lessonCount !== args.totalLessons) {
    violations.push(COMPLETE_VIOLATION.LESSON_COUNT_MISMATCH);
  }

  // --- one instructor, never several -------------------------------------
  const ids = Array.isArray(args.lessonInstructorIds)
    ? args.lessonInstructorIds.map((v) => (v == null ? "" : String(v).trim()))
    : [];
  if (args.lessonInstructorIds) {
    if (ids.some((id) => !id)) violations.push(COMPLETE_VIOLATION.MISSING_INSTRUCTOR);
    if (new Set(ids.filter(Boolean)).size > 1) violations.push(COMPLETE_VIOLATION.MULTIPLE_INSTRUCTORS);
  }
  const distinct = new Set<string>();
  if (args.instructorId) distinct.add(String(args.instructorId));
  for (const id of ids) if (id) distinct.add(id);
  // A complete course must resolve to exactly one instructor — if nothing in
  // the payload identifies one, the schedule cannot be confirmed.
  if (distinct.size === 0) violations.push(COMPLETE_VIOLATION.MISSING_INSTRUCTOR);

  // --- exact preferred start times ---------------------------------------
  if (Array.isArray(args.preferredStartMinutes) && args.preferredStartMinutes.length > 0) {
    const allowed = new Set(args.preferredStartMinutes);
    for (const lesson of lessons) {
      if (!allowed.has(timeToMinutes(String(lesson.start_time ?? "")))) {
        violations.push(COMPLETE_VIOLATION.PREFERRED_TIME_NOT_EXACT);
        break;
      }
    }
  }

  // --- duration + buffer --------------------------------------------------
  if (typeof args.durationMinutes === "number" && args.durationMinutes > 0) {
    for (const lesson of lessons) {
      const start = timeToMinutes(String(lesson.start_time ?? ""));
      const end = timeToMinutes(String(lesson.end_time ?? ""));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== args.durationMinutes) {
        violations.push(COMPLETE_VIOLATION.DURATION_MISMATCH);
        break;
      }
    }
  }

  // --- booking policy -----------------------------------------------------
  if (args.enforceConsecutiveRule !== false) {
    const ruleError = validateConsecutiveRule(
      lessons.map((l) => ({ date: l.date, start_time: l.start_time, end_time: l.end_time })),
    );
    if (ruleError) violations.push(COMPLETE_VIOLATION.CONSECUTIVE_RULE_VIOLATION);
  }

  // --- horizon ------------------------------------------------------------
  if (Array.isArray(args.windowDates) && args.windowDates.length > 0) {
    const allowed = new Set(args.windowDates);
    if (lessons.some((l) => !allowed.has(String(l.date)))) violations.push(COMPLETE_VIOLATION.OUTSIDE_HORIZON);
  }

  // --- live availability (instructor / vehicle conflicts) ------------------
  if (args.availableStartsByDate) {
    for (const lesson of lessons) {
      const free = toMinuteSet(args.availableStartsByDate.get(String(lesson.date)));
      const start = timeToMinutes(String(lesson.start_time ?? ""));
      if (!free || !free.has(start)) {
        violations.push(COMPLETE_VIOLATION.SLOT_NOT_AVAILABLE);
        break;
      }
    }
  }

  // --- learner-wide conflicts --------------------------------------------
  if (Array.isArray(args.learnerExisting) && args.learnerExisting.length > 0) {
    const proposed = args.proposedLessons ??
      lessons.map((l) => ({ date: l.date, start_time: String(l.start_time), end_time: String(l.end_time) }));
    if (validateLearnerWideConsecutive(args.learnerExisting, proposed) !== null) {
      violations.push(COMPLETE_VIOLATION.LEARNER_CONFLICT);
    }
  }

  return { complete: violations.length === 0, violations, instructorIds: [...distinct], lessonCount };
}

// ---------------------------------------------------------------------------
// E. Reservation-batch guard (one instructor, exact count)
// ---------------------------------------------------------------------------

export interface BatchCheck {
  ok: boolean;
  instructorId: string | null;
  violations: string[];
  slotCount: number;
}

/**
 * Guard the ACTUAL payload handed to the reservation RPC. A complete course is
 * reserved atomically with exactly one instructor; a batch that mixes
 * instructors, carries a blank id or has the wrong lesson count is refused
 * before any write happens.
 */
export function validateReservationBatch(
  slots: Array<{ instructor_id?: string | null }>,
  totalLessons: number,
): BatchCheck {
  const list = Array.isArray(slots) ? slots : [];
  const violations: string[] = [];
  if (list.length !== totalLessons) violations.push("LESSON_COUNT_MISMATCH");
  const ids = list.map((s) => (s?.instructor_id == null ? "" : String(s.instructor_id).trim()));
  if (ids.some((id) => !id)) violations.push("MISSING_INSTRUCTOR");
  const distinct = [...new Set(ids.filter(Boolean))];
  if (distinct.length > 1) violations.push("MULTIPLE_INSTRUCTORS");
  return {
    ok: violations.length === 0,
    instructorId: distinct.length === 1 ? distinct[0] : null,
    violations,
    slotCount: list.length,
  };
}

// ---------------------------------------------------------------------------
// F1..F4 — the search itself
// ---------------------------------------------------------------------------

export interface PreferredFallbackOptions {
  /**
   * F3 — total calendar days the search may span, counted from the requested
   * start date. Defaults to the supplied window length (no extension).
   */
  maxHorizonDays?: number;
  /** F4 — how many later candidate start dates to try. Defaults to 0. */
  maxStartDateShiftDays?: number;
  /** Bound the number of instructors evaluated. 0 / undefined = all of them. */
  maxCandidateInstructors?: number;
  /** F2 — revalidate every later lesson after a date shift (default true). */
  revalidateAfterShift?: boolean;
  /** Budget: max instructor attempts. 0 / undefined = unbounded. */
  maxEvaluations?: number;
  /** Budget: wall-clock milliseconds. 0 / undefined = unbounded. */
  maxMillis?: number;
  /**
   * D — how many days past the searched horizon to inspect when explaining a
   * failure. Defaults to 30. This never widens what may be BOOKED; it only
   * distinguishes "no capacity at all" from "would fit just outside the
   * horizon".
   */
  diagnosticLookaheadDays?: number;
  /** Injected clock so the time budget is testable. */
  clock?: () => number;
  /**
   * Extra per-instructor eligibility (course certification, vehicle, leave,
   * calendar staleness). Return `{code, reason}` to reject that instructor.
   */
  instructorSupport?: (
    instructor: InstructorLike,
  ) => { code: InstructorRejectionCode; reason?: string } | null;
  /** The learner's already-active lessons (used for LEARNER_CONFLICT + ranking). */
  learnerExisting?: LearnerDayLesson[] | null;
}

export interface InstructorAttempt {
  instructorId: string;
  instructorName?: string | null;
  status: "complete" | "rejected";
  /** Present when status === "rejected". */
  code?: InstructorRejectionCode;
  reason?: string;
  lessons?: CoursePlanLesson[];
  /** The start date the proposal actually uses. */
  startDate?: string;
  completionDate?: string;
  /** True when the ladder had to move the requested start date (F4). */
  startDateShifted?: boolean;
  /** True when the ladder had to extend the horizon (F3). */
  horizonExtended?: boolean;
  /** True when a lesson had to shift to a later date (F2). */
  lessonsShifted?: boolean;
  /** 1-based rank among complete proposals. */
  rank?: number;
  spanDays?: number;
  load?: number;
}

export interface PreferredOutcome {
  ok: boolean;
  totalLessons: number;
  requestedStartDate: string;
  /** Only COMPLETE proposals, best first. Never contains a partial plan. */
  proposals: InstructorAttempt[];
  /** The best complete proposal, or null. */
  best: InstructorAttempt | null;
  /** Every instructor that was looked at, complete or rejected. */
  attempts: InstructorAttempt[];
  eligibleInstructorCount: number;
  consideredInstructorCount: number;
  /** Instructors excluded before the search, with a code. */
  excluded: Array<{ instructorId: string; code: InstructorRejectionCode }>;
  /**
   * True only when the search finished within its limits. When false, absence of
   * a schedule is NOT proven (D — never confuse the two).
   */
  searchExhaustive: boolean;
  /** Why the search stopped, when it did not complete. */
  failureCode?:
    | "INSUFFICIENT_COURSE_CAPACITY"
    | "MAX_HORIZON_EXCEEDED"
    | "NO_INSTRUCTOR_SUPPLY"
    | "CALENDAR_DATA_STALE"
    | "SEARCH_LIMIT_REACHED"
    | "INVALID_REQUEST";
  supplyGap?: {
    kind: SupplyGapKind;
    failureReason: string;
    eligibleInstructorCount: number;
    consideredInstructorCount: number;
    searchExhaustive: boolean;
  };
  /** F5/F6 — what the caller must offer the customer next. */
  nextSteps: NextStep[];
  /** F4 — alternative start dates that DO produce a complete course. */
  alternativeStartDates: Array<{ startDate: string; completionDate: string; rank: number }>;
  fallback: {
    f1AllInstructorsEvaluated: boolean;
    f2LessonsShifted: boolean;
    f3HorizonExtended: boolean;
    f4AlternativeStartDate: boolean;
    levelsReached: number;
  };
  /** Aggregated rejection codes (no instructor identity). */
  rejectionSummary: Partial<Record<InstructorRejectionCode, number>>;
  /** Dates the engine was allowed to search. */
  searchedDates: string[];
  /** Diag lines, safe to log. */
  diagnostics: string[];
  /** Total instructor-attempt evaluations performed. */
  evaluations: number;
}

const DEFAULT_CLOCK = () => Date.now();

function uniqueSortedDates(dates: string[] | undefined | null): string[] {
  if (!Array.isArray(dates)) return [];
  return [...new Set(dates.filter((d) => typeof d === "string" && d.length > 0))].sort();
}

function spanDays(lessons: CoursePlanLesson[]): number {
  if (lessons.length === 0) return 0;
  const first = lessons[0].date;
  const last = lessons[lessons.length - 1].date;
  const a = Date.parse(`${first}T00:00:00Z`);
  const b = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * How many days in `dates` (from `startDate` onward) offer at least one of the
 * exact preferred times. This is what separates "your times are never free"
 * from "your times are free, just not often enough".
 */
function qualifyingDays(
  freeByDate: Map<string, number[]> | undefined,
  dates: string[],
  startDate: string,
  preferredStartMinutes: number[],
): number {
  if (!freeByDate) return 0;
  const prefs = new Set(preferredStartMinutes);
  let count = 0;
  for (const date of dates) {
    if (date < startDate) continue;
    const starts = freeByDate.get(date);
    if (!starts) continue;
    if (starts.some((m) => prefs.has(m))) count += 1;
  }
  return count;
}

/**
 * B — the mandatory fallback hierarchy, in order, for the "3 preferred times"
 * booking model.
 *
 * F1  every eligible instructor is evaluated independently.
 * F2  a lesson whose preferred times are taken that day is placed on the next
 *     eligible date, retrying the SAME exact preferences, and every later
 *     assignment is revalidated (that is what the day-walking planner does).
 * F3  the horizon is extended up to `maxHorizonDays`.
 * F4  later candidate start dates are searched; the proposal reports the real
 *     start/completion dates and flags that it moved.
 *
 * Never combines instructors. Never returns a partial plan as bookable.
 */
export function planPreferredCourseWithFallbacks(args: {
  input: AvailabilityInput;
  startDate: string;
  preferredStartMinutes: number[];
  totalLessons: number;
  options?: PreferredFallbackOptions;
}): PreferredOutcome {
  const { input, startDate, preferredStartMinutes, totalLessons } = args;
  const options = args.options ?? {};
  const clock = options.clock ?? DEFAULT_CLOCK;
  const startedAt = clock();
  const maxEvaluations = Math.max(0, Math.floor(options.maxEvaluations ?? 0));
  const maxMillis = Math.max(0, Math.floor(options.maxMillis ?? 0));

  const diagnostics: string[] = [];
  const attempts: InstructorAttempt[] = [];
  const proposals: InstructorAttempt[] = [];
  const rejectionSummary: Partial<Record<InstructorRejectionCode, number>> = {};

  const reject = (
    instructor: InstructorLike | null,
    code: InstructorRejectionCode,
    reason?: string,
    extra: Partial<InstructorAttempt> = {},
  ): InstructorAttempt => {
    const attempt: InstructorAttempt = {
      instructorId: instructor?.id ?? "",
      instructorName: instructor?.name ?? null,
      status: "rejected",
      code,
      reason: reason ?? INSTRUCTOR_REJECTION_TEXT[code],
      ...extra,
    };
    attempts.push(attempt);
    rejectionSummary[code] = (rejectionSummary[code] ?? 0) + 1;
    return attempt;
  };

  const baseDates = uniqueSortedDates(input.dates);
  const duration = Math.floor(input.slotConfig.slotDurationMinutes);

  const fail = (
    failureCode: PreferredOutcome["failureCode"],
    kind: SupplyGapKind,
    nextSteps: NextStep[],
    extra: Partial<PreferredOutcome> = {},
    exhaustive = true,
  ): PreferredOutcome => ({
    ok: false,
    totalLessons,
    requestedStartDate: startDate,
    proposals: [],
    best: null,
    attempts,
    eligibleInstructorCount: 0,
    consideredInstructorCount: 0,
    excluded: [],
    searchExhaustive: exhaustive,
    failureCode,
    supplyGap: {
      kind,
      failureReason: failureCode ?? "NO_SCHEDULE",
      eligibleInstructorCount: 0,
      consideredInstructorCount: 0,
      searchExhaustive: exhaustive,
    },
    nextSteps,
    alternativeStartDates: [],
    fallback: {
      f1AllInstructorsEvaluated: true,
      f2LessonsShifted: false,
      f3HorizonExtended: false,
      f4AlternativeStartDate: false,
      levelsReached: 1,
    },
    rejectionSummary,
    searchedDates: baseDates,
    diagnostics,
    evaluations: 0,
    ...extra,
  });

  // --- request sanity -----------------------------------------------------
  if (!Number.isInteger(totalLessons) || totalLessons < 1) {
    diagnostics.push("invalid totalLessons");
    return fail("INVALID_REQUEST", SUPPLY_GAP.SEARCH_INCOMPLETE, [NEXT_STEP.RETRY_LATER], {}, false);
  }
  if (!Array.isArray(preferredStartMinutes) || preferredStartMinutes.length === 0) {
    diagnostics.push("no preferred start times supplied");
    return fail("INVALID_REQUEST", SUPPLY_GAP.SEARCH_INCOMPLETE, [NEXT_STEP.REVISE_PREFERENCES], {}, false);
  }
  if (baseDates.length === 0) {
    // D — CALENDAR_DATA_STALE, not "no supply". Nothing was proven, so the
    // search must not claim to be exhaustive.
    diagnostics.push("no calendar days supplied");
    return fail("CALENDAR_DATA_STALE", SUPPLY_GAP.SEARCH_INCOMPLETE, [NEXT_STEP.RETRY_LATER], {}, false);
  }

  // --- eligible set -------------------------------------------------------
  const eligibleAll = areaEligibleInstructors(input);
  const excluded: Array<{ instructorId: string; code: InstructorRejectionCode }> = [];

  // Account for every instructor the caller gave us that did NOT make the
  // eligible set, so "INSTRUCTOR_NOT_ELIGIBLE" / "AREA_NOT_SUPPORTED" are never
  // silently ignored.
  const eligibleIds = new Set(eligibleAll.map((i) => i.id));
  for (const instr of input.instructors ?? []) {
    if (eligibleIds.has(instr.id)) continue;
    if (!isInstructorActive(instr)) {
      excluded.push({ instructorId: instr.id, code: INSTRUCTOR_REJECTION.INSTRUCTOR_NOT_ELIGIBLE });
    } else {
      excluded.push({ instructorId: instr.id, code: INSTRUCTOR_REJECTION.AREA_NOT_SUPPORTED });
    }
  }

  const femaleMode = input.femaleMode ?? "off";
  const femaleMandatory = femaleMode === "mandatory" && Boolean(input.femalePreference);
  let eligible = femaleMandatory ? eligibleAll.filter((i) => i.gender && i.gender.toLowerCase() === "female") : eligibleAll;

  // Caller-supplied eligibility (course / vehicle / leave / staleness).
  if (typeof options.instructorSupport === "function") {
    const supported: InstructorLike[] = [];
    for (const instr of eligible) {
      let rejection: { code: InstructorRejectionCode; reason?: string } | null = null;
      try {
        rejection = options.instructorSupport(instr);
      } catch {
        rejection = null; // a broken hook must never break the search
      }
      if (rejection) {
        excluded.push({ instructorId: instr.id, code: rejection.code });
        reject(instr, rejection.code, rejection.reason);
      } else {
        supported.push(instr);
      }
    }
    eligible = supported;
  }

  const eligibleInstructorCount = eligibleAll.length;

  if (eligible.length === 0) {
    const supplyExists = eligibleAll.length > 0;
    diagnostics.push(
      supplyExists
        ? "instructors serve the area but none passed course/vehicle/availability eligibility"
        : "no eligible instructor serves this area",
    );
    const out = fail(
      supplyExists ? "INSUFFICIENT_COURSE_CAPACITY" : "NO_INSTRUCTOR_SUPPLY",
      supplyExists ? SUPPLY_GAP.INSUFFICIENT_CAPACITY : SUPPLY_GAP.NO_INSTRUCTOR_SUPPLY,
      [NEXT_STEP.REQUEST_HUMAN_ASSISTANCE],
      { attempts, excluded, eligibleInstructorCount, rejectionSummary },
    );
    out.supplyGap = {
      kind: supplyExists ? SUPPLY_GAP.INSUFFICIENT_CAPACITY : SUPPLY_GAP.NO_INSTRUCTOR_SUPPLY,
      failureReason: supplyExists ? "INSUFFICIENT_COURSE_CAPACITY" : "NO_INSTRUCTOR_SUPPLY",
      eligibleInstructorCount,
      consideredInstructorCount: 0,
      searchExhaustive: true,
    };
    return out;
  }

  const capped = (options.maxCandidateInstructors ?? 0) > 0
    ? eligible.slice(0, Math.floor(options.maxCandidateInstructors!))
    : eligible;
  const consideredInstructorCount = capped.length;

  // --- search space -------------------------------------------------------
  const lastBaseDate = baseDates[baseDates.length - 1];
  const maxHorizonDays = Math.max(
    0,
    Math.floor(options.maxHorizonDays ?? baseDates.length),
  );
  const horizonLastDate = addDaysISO(startDate, Math.max(1, maxHorizonDays) - 1);
  const targetLastDate = horizonLastDate > lastBaseDate ? horizonLastDate : lastBaseDate;
  const extendedDates = [...baseDates];
  {
    let cursor = lastBaseDate;
    while (cursor < targetLastDate) {
      cursor = addDaysISO(cursor, 1);
      extendedDates.push(cursor);
    }
  }
  const horizonExtendedPossible = extendedDates.length > baseDates.length;

  // One grid over the union of the base window and the extension, so deeper
  // fallback levels have data to search without repeating the expensive pass.
  const free = buildInstructorFreeGrid(
    extendedDates.length === baseDates.length ? input : { ...input, dates: extendedDates },
    capped,
  );

  // F4 candidate start dates.
  const shiftDays = Math.max(0, Math.floor(options.maxStartDateShiftDays ?? 0));
  const candidateStartDates: string[] = [startDate];
  for (let k = 1; k <= shiftDays; k++) {
    const candidate = addDaysISO(startDate, k);
    if (candidate > targetLastDate) break;
    candidateStartDates.push(candidate);
  }

  let evaluations = 0;
  let budgetExhausted = false;

  // D — a look-ahead used ONLY to explain a failure. "Your times are free, just
  // not inside the allowed window" is a different answer from "there is not
  // enough capacity", and the customer needs the right one. Built lazily so a
  // successful search never pays for it.
  const lookaheadDays = Math.max(0, Math.floor(options.diagnosticLookaheadDays ?? 30));
  const diagnosticDates = (): string[] => {
    const last = extendedDates[extendedDates.length - 1];
    const out = [...extendedDates];
    for (let k = 1; k <= lookaheadDays; k++) out.push(addDaysISO(last, k));
    return out;
  };
  let diagnosticFree: Map<string, Map<string, number[]>> | null = null;
  const diagnosticGrid = (): Map<string, Map<string, number[]>> => {
    if (!diagnosticFree) {
      diagnosticFree = buildInstructorFreeGrid({ ...input, dates: diagnosticDates() }, capped);
    }
    return diagnosticFree;
  };

  const budgetLeft = (): boolean => {
    if (maxEvaluations > 0 && evaluations >= maxEvaluations) return false;
    if (maxMillis > 0 && clock() - startedAt >= maxMillis) return false;
    return true;
  };

  let f2Shifted = false;
  let f3Extended = false;
  let f4Used = false;

  instructorLoop:
  for (const instructor of capped) {
    if (!budgetLeft()) {
      budgetExhausted = true;
      break instructorLoop;
    }

    const freeByDate = free.get(instructor.id);

    type Found = { lessons: CoursePlanLesson[]; startDate: string; horizonExtended: boolean; shifted: boolean };
    let found: Found | null = null;

    const tryPlan = (
      dates: string[],
      candidateStart: string,
      horizonExtended: boolean,
    ): CoursePlanLesson[] | null => {
      evaluations += 1;
      return planCoursePreferred(
        freeByDate ?? new Map(),
        dates,
        candidateStart,
        preferredStartMinutes,
        totalLessons,
        duration,
      );
    };

    // F1 + F2 — base window, every preferred time retried on each next day.
    const basePlan = tryPlan(baseDates, startDate, false);
    if (basePlan) {
      const shifted = basePlan[0].date !== startDate;
      if (shifted) f2Shifted = true;
      found = { lessons: basePlan, startDate: basePlan[0].date, horizonExtended: false, shifted };
    }

    // F3 — extend the horizon.
    if (!found && horizonExtendedPossible && budgetLeft()) {
      const extendedPlan = tryPlan(extendedDates, startDate, true);
      if (extendedPlan) {
        f3Extended = true;
        f2Shifted = true; // lessons did shift to later dates to complete
        found = {
          lessons: extendedPlan,
          startDate: extendedPlan[0].date,
          horizonExtended: true,
          shifted: extendedPlan[0].date !== startDate,
        };
      }
    }

    // F4 — later candidate start dates.
    if (!found && candidateStartDates.length > 1) {
      for (let i = 1; i < candidateStartDates.length; i++) {
        if (!budgetLeft()) {
          budgetExhausted = true;
          break;
        }
        const candidateStart = candidateStartDates[i];
        const plan = tryPlan(extendedDates, candidateStart, horizonExtendedPossible);
        if (plan) {
          f4Used = true;
          found = {
            lessons: plan,
            startDate: plan[0].date,
            horizonExtended: horizonExtendedPossible,
            shifted: plan[0].date !== startDate,
          };
          break;
        }
      }
    }

    if (budgetExhausted && !found) {
      reject(instructor, INSTRUCTOR_REJECTION.SEARCH_LIMIT_REACHED);
      break instructorLoop;
    }

    if (!found) {
      // D — classify exactly why this instructor cannot host the course. Never
      // guess: the code must reflect what the data proves.
      const qSearched = qualifyingDays(freeByDate, extendedDates, startDate, preferredStartMinutes);
      let code: InstructorRejectionCode;
      if (qSearched >= totalLessons) {
        // Enough qualifying days inside the horizon, yet no layout: a real
        // conflict, not a supply problem.
        code = INSTRUCTOR_REJECTION.INSTRUCTOR_CONFLICT;
      } else {
        const diag = diagnosticGrid().get(instructor.id);
        const qLookahead = qualifyingDays(diag, diagnosticDates(), startDate, preferredStartMinutes);
        if (qLookahead === 0) {
          code = INSTRUCTOR_REJECTION.NO_AVAILABLE_PREFERRED_TIME;
        } else if (qLookahead >= totalLessons) {
          // It WOULD fit — only outside the allowed horizon.
          code = INSTRUCTOR_REJECTION.MAX_HORIZON_EXCEEDED;
        } else {
          code = INSTRUCTOR_REJECTION.INSUFFICIENT_COURSE_CAPACITY;
        }
      }
      reject(instructor, code);
      continue;
    }

    // C — the complete-schedule acceptance rule. A planner result is only a
    // proposal if it passes; otherwise it is a rejection, never a booking.
    const check = validateCompleteSchedule({
      lessons: found.lessons,
      totalLessons,
      instructorId: instructor.id,
      preferredStartMinutes,
      durationMinutes: duration,
      windowDates: extendedDates,
      availableStartsByDate: freeByDate,
      learnerExisting: options.learnerExisting ?? null,
    });
    if (!check.complete) {
      reject(
        instructor,
        check.violations.includes(COMPLETE_VIOLATION.LEARNER_CONFLICT)
          ? INSTRUCTOR_REJECTION.LEARNER_CONFLICT
          : INSTRUCTOR_REJECTION.INSTRUCTOR_CONFLICT,
        `complete-schedule check failed: ${check.violations.join(", ")}`,
        { lessons: found.lessons },
      );
      continue;
    }

    // A and C.2 — exactly one instructor across every lesson.
    if (check.instructorIds.length !== 1 || check.instructorIds[0] !== instructor.id) {
      reject(instructor, INSTRUCTOR_REJECTION.INSTRUCTOR_CONFLICT, "plan did not resolve to one instructor");
      continue;
    }

    const load = instructorBookingLoad(input.blocks, input.holdMinutes, input.now ?? new Date())[instructor.id] ?? 0;
    const attempt: InstructorAttempt = {
      instructorId: instructor.id,
      instructorName: instructor.name ?? null,
      status: "complete",
      lessons: found.lessons,
      startDate: found.lessons[0].date,
      completionDate: found.lessons[found.lessons.length - 1].date,
      startDateShifted: found.shifted,
      horizonExtended: found.horizonExtended,
      lessonsShifted: found.shifted,
      spanDays: spanDays(found.lessons),
      load,
    };
    attempts.push(attempt);
    proposals.push(attempt);
  }

  // --- ranking ------------------------------------------------------------
  // The learner's requested start date always wins over a shifted one; then the
  // earliest completion, the tightest spread, the least-loaded instructor and
  // finally the id, so the choice is deterministic.
  proposals.sort((a, b) => {
    const shift = Number(Boolean(a.startDateShifted)) - Number(Boolean(b.startDateShifted));
    if (shift !== 0) return shift;
    const completion = String(a.completionDate).localeCompare(String(b.completionDate));
    if (completion !== 0) return completion;
    const span = (a.spanDays ?? 0) - (b.spanDays ?? 0);
    if (span !== 0) return span;
    const load = (a.load ?? 0) - (b.load ?? 0);
    if (load !== 0) return load;
    return a.instructorId.localeCompare(b.instructorId);
  });
  proposals.forEach((p, i) => {
    p.rank = i + 1;
  });

  const alternativeStartDates = proposals
    .filter((p) => p.startDateShifted && p.startDate && p.completionDate)
    .map((p) => ({ startDate: p.startDate!, completionDate: p.completionDate!, rank: p.rank ?? 0 }))
    .filter((v, i, all) => all.findIndex((o) => o.startDate === v.startDate) === i)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const searchedDates = extendedDates;
  const searchExhaustive = !budgetExhausted;

  const baseFallback = {
    f1AllInstructorsEvaluated: !budgetExhausted,
    f2LessonsShifted: f2Shifted,
    f3HorizonExtended: f3Extended,
    f4AlternativeStartDate: f4Used,
    levelsReached: f4Used ? 4 : f3Extended ? 3 : f2Shifted ? 2 : 1,
  };

  if (proposals.length > 0) {
    const best = proposals[0];
    return {
      ok: true,
      totalLessons,
      requestedStartDate: startDate,
      proposals,
      best,
      attempts,
      eligibleInstructorCount,
      consideredInstructorCount,
      excluded,
      searchExhaustive,
      nextSteps: best.startDateShifted ? [NEXT_STEP.ALTERNATIVE_START_DATE] : [],
      alternativeStartDates,
      fallback: baseFallback,
      rejectionSummary,
      searchedDates,
      diagnostics,
      evaluations,
    };
  }

  // --- no complete schedule ----------------------------------------------
  // Only claim a supply problem when the search actually finished. A budget
  // stop proves nothing (D).
  const allHorizonBound = attempts.length > 0 &&
    attempts.every((a) => a.code === INSTRUCTOR_REJECTION.MAX_HORIZON_EXCEEDED);

  const kind: SupplyGapKind = budgetExhausted
    ? SUPPLY_GAP.SEARCH_INCOMPLETE
    : eligibleInstructorCount === 0
    ? SUPPLY_GAP.NO_INSTRUCTOR_SUPPLY
    : SUPPLY_GAP.INSUFFICIENT_CAPACITY;

  const failureCode: PreferredOutcome["failureCode"] = budgetExhausted
    ? "SEARCH_LIMIT_REACHED"
    : eligibleInstructorCount === 0
    ? "NO_INSTRUCTOR_SUPPLY"
    : allHorizonBound
    ? "MAX_HORIZON_EXCEEDED"
    : "INSUFFICIENT_COURSE_CAPACITY";

  // F5 then F6: revised preferences first, human assistance always available.
  // When the search was cut short we must NOT claim the course is impossible —
  // the only honest options are "try again" and "talk to a human".
  const nextSteps: NextStep[] = kind === SUPPLY_GAP.SEARCH_INCOMPLETE
    ? [NEXT_STEP.RETRY_LATER, NEXT_STEP.REQUEST_HUMAN_ASSISTANCE]
    : [NEXT_STEP.REVISE_PREFERENCES, NEXT_STEP.REQUEST_HUMAN_ASSISTANCE];

  diagnostics.push(
    `no complete schedule: ${consideredInstructorCount}/${eligibleInstructorCount} eligible instructor(s) tried, ` +
      `${evaluations} evaluation(s), fallback levels ${baseFallback.levelsReached}, exhaustive=${searchExhaustive}`,
  );

  return {
    ok: false,
    totalLessons,
    requestedStartDate: startDate,
    proposals: [],
    best: null,
    attempts,
    eligibleInstructorCount,
    consideredInstructorCount,
    excluded,
    searchExhaustive,
    failureCode,
    supplyGap: {
      kind,
      failureReason: failureCode,
      eligibleInstructorCount,
      consideredInstructorCount,
      searchExhaustive,
    },
    nextSteps,
    alternativeStartDates,
    fallback: baseFallback,
    rejectionSummary,
    searchedDates,
    diagnostics,
    evaluations,
  };
}

// ---------------------------------------------------------------------------
// Public, privacy-safe view of an outcome.
//
// Customer-facing responses must never carry an instructor_id. This projection
// strips identity and returns only what the site needs to explain the situation
// and offer the next step (F5 / F6).
// ---------------------------------------------------------------------------

export interface PublicSchedulingSummary {
  complete: boolean;
  requestedStartDate: string;
  proposedStartDate?: string;
  proposedCompletionDate?: string;
  startDateShifted: boolean;
  alternativeStartDates: Array<{ startDate: string; completionDate: string; rank: number }>;
  eligibleInstructorCount: number;
  consideredInstructorCount: number;
  instructorCountThatCouldComplete: number;
  searchExhaustive: boolean;
  failureCode?: PreferredOutcome["failureCode"];
  supplyGap?: { kind: SupplyGapKind; failureReason: string };
  nextSteps: NextStep[];
  /** Aggregated per-instructor rejection codes — counts only, never identity. */
  rejectionSummary: Partial<Record<InstructorRejectionCode, number>>;
  fallback: PreferredOutcome["fallback"];
}

export function toPublicSchedulingSummary(outcome: PreferredOutcome): PublicSchedulingSummary {
  const best = outcome.best;
  return {
    complete: outcome.ok,
    requestedStartDate: outcome.requestedStartDate,
    proposedStartDate: best?.startDate,
    proposedCompletionDate: best?.completionDate,
    startDateShifted: Boolean(best?.startDateShifted),
    alternativeStartDates: outcome.alternativeStartDates,
    eligibleInstructorCount: outcome.eligibleInstructorCount,
    consideredInstructorCount: outcome.consideredInstructorCount,
    instructorCountThatCouldComplete: outcome.proposals.length,
    searchExhaustive: outcome.searchExhaustive,
    failureCode: outcome.failureCode,
    supplyGap: outcome.supplyGap
      ? { kind: outcome.supplyGap.kind, failureReason: outcome.supplyGap.failureReason }
      : undefined,
    nextSteps: outcome.nextSteps,
    rejectionSummary: outcome.rejectionSummary,
    fallback: outcome.fallback,
  };
}

/** The properties persisted when a supply gap is logged (F6). */
export function supplyGapEventProperties(args: {
  outcome: PreferredOutcome;
  courseId?: string | null;
  courseCode?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  locationName?: string | null;
  dlStatus?: string | null;
  preferredTimes: string[];
  requestedDate: string;
}): Record<string, string | number | boolean> {
  const gap = args.outcome.supplyGap;
  return {
    area_id: String(args.areaId ?? args.areaName ?? "unknown"),
    course_id: String(args.courseId ?? "unknown"),
    cause: String(gap?.failureReason ?? args.outcome.failureCode ?? "INSUFFICIENT_COURSE_CAPACITY"),
    supply_kind: String(gap?.kind ?? SUPPLY_GAP.INSUFFICIENT_CAPACITY),
    requested_date: args.requestedDate,
    requested_window: `${args.outcome.searchedDates[0] ?? ""}..${args.outcome.searchedDates[args.outcome.searchedDates.length - 1] ?? ""}`,
    preferred_times: args.preferredTimes.join(","),
    dl_status: String(args.dlStatus ?? "unknown"),
    eligible_instructor_count: args.outcome.eligibleInstructorCount,
    considered_instructor_count: args.outcome.consideredInstructorCount,
    search_exhaustive: args.outcome.searchExhaustive,
    failure_reason: args.outcome.diagnostics[args.outcome.diagnostics.length - 1] ?? String(gap?.failureReason ?? ""),
  };
}
