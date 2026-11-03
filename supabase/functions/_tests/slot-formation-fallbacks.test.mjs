// Spec A–G: mandatory multi-instructor / complete-course / fallback engine.
//
// Every assertion below is derived from the PURE scheduling algorithm — no
// database, no network, no real booking rows. The fixtures are shaped exactly
// like live prod rows (HH:MM:SS-tolerant times, mixed statuses, pending holds
// with created_at) so the algorithm is exercised the way production does.
//
// Mapping to the spec sections:
//   A  one instructor per complete course, every eligible instructor evaluated
//   B  the F1..F6 fallback ladder
//   C  the COMPLETE-schedule acceptance rule
//   D  rejection reason codes + proven-absence vs incomplete-search
//   E  reservation-batch guards (pre-write, atomicity)
//   F  the edge cases the product team listed
//   G  invariants asserted over the whole engine

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildInstructorFreeGrid,
  candidateStartMinutes,
  minutesToTime,
  timeToMinutes,
} from "../_shared/availability.ts";
import {
  COMPLETE_VIOLATION,
  INSTRUCTOR_REJECTION,
  NEXT_STEP,
  SUPPLY_GAP,
  planPreferredCourseWithFallbacks,
  supplyGapEventProperties,
  toPublicSchedulingSummary,
  validateCompleteSchedule,
  validateReservationBatch,
} from "../_shared/scheduling.ts";
import { addDaysISO } from "../_shared/validation.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SLOT_CONFIG = {
  slotStart: "06:00",
  slotEnd: "20:00",
  gridMinutes: 30,
  slotDurationMinutes: 60,
};

/** A fixed "now" so hold expiry is deterministic. */
const NOW = new Date("2026-11-01T00:00:00Z");
const D0 = "2026-11-02"; // Monday
const DATES_60 = Array.from({ length: 60 }, (_, i) => addDaysISO(D0, i));

const M0700 = timeToMinutes("07:00");
const M1100 = timeToMinutes("11:00");
const M1800 = timeToMinutes("18:00");
const PREFS = [M0700, M1100, M1800];

function instructor(id, overrides = {}) {
  return {
    id,
    name: `Instructor ${id}`,
    areas: ["area-a"],
    gender: null,
    status: "active",
    ...overrides,
  };
}

function INPUT(instructors, blocks = [], overrides = {}) {
  return {
    instructors,
    learnerArea: "area-a",
    learner: null,
    blocks,
    dates: DATES_60,
    slotConfig: SLOT_CONFIG,
    gapMinutes: 30,
    holdMinutes: 30,
    now: NOW,
    ...overrides,
  };
}

function blockAt(instructorId, date, start, overrides = {}) {
  return {
    instructorId,
    date,
    startMinute: start,
    endMinute: start + 60,
    status: "booked",
    ...overrides,
  };
}

function blockWholeDay(instructorId, date) {
  return candidateStartMinutes(SLOT_CONFIG).map((s) => blockAt(instructorId, date, s));
}

/** Blocks every grid slot on each of the supplied dates. */
function blockDays(instructorId, dates) {
  return dates.flatMap((date) => blockWholeDay(instructorId, date));
}

function holdAt(instructorId, date, start, createdAtIso) {
  return {
    instructorId,
    date,
    startMinute: start,
    endMinute: start + 60,
    status: "pending_payment",
    bookingCreatedAt: createdAtIso,
  };
}

function run({
  instructors,
  blocked = [],
  dates = DATES_60,
  startDate = D0,
  preferredStartMinutes = PREFS,
  totalLessons = 5,
  options = {},
  inputOverrides = {},
}) {
  const input = INPUT(instructors, blocked, { dates, ...inputOverrides });
  return planPreferredCourseWithFallbacks({
    input,
    startDate,
    preferredStartMinutes,
    totalLessons,
    options,
  });
}

/** One lesson row shaped like CoursePlanLesson. */
function lesson(date, start, duration = 60) {
  const from = timeToMinutes(start);
  return {
    lesson: 1,
    date,
    day: "mon",
    start_time: minutesToTime(from),
    end_time: minutesToTime(from + duration),
  };
}

function plannedDates(outcome) {
  return outcome.best.lessons.map((l) => l.date);
}

function gridFor(input, eligible) {
  return buildInstructorFreeGrid(input, eligible);
}

// ---------------------------------------------------------------------------
// A. One instructor per complete course
// ---------------------------------------------------------------------------

test("A.1 a complete course is planned for exactly one instructor", () => {
  const out = run({ instructors: [instructor("a")], totalLessons: 5 });
  assert.equal(out.ok, true);
  assert.equal(out.best.instructorId, "a");
  assert.equal(out.best.lessons.length, 5);
  assert.deepEqual(plannedDates(out), DATES_60.slice(0, 5));
  assert.deepEqual(out.proposals.map((p) => p.instructorId), ["a"]);
});

test("A.2 availability that only adds up across two instructors is NEVER combined", () => {
  // 5 lessons needed. "a" is free on 3 sample days, "b" on the other 2 — the
  // union would fit, but no single instructor can host the course.
  const dates = DATES_60.slice(0, 5);
  const out = run({
    instructors: [instructor("a"), instructor("b")],
    blocked: [...blockDays("a", dates.slice(3)), ...blockDays("b", dates.slice(0, 3))],
    dates,
    totalLessons: 5,
    options: { diagnosticLookaheadDays: 0 },
  });
  assert.equal(out.ok, false);
  assert.deepEqual(out.proposals, []);
  assert.equal(out.best, null);
  assert.equal(out.attempts.length, 2);
  for (const attempt of out.attempts) {
    assert.equal(attempt.status, "rejected");
    assert.equal(attempt.code, INSTRUCTOR_REJECTION.INSUFFICIENT_COURSE_CAPACITY);
  }
});

test("A.3 every eligible instructor is evaluated — a later one can win", () => {
  const dates = DATES_60.slice(0, 5);
  const out = run({
    instructors: [instructor("a"), instructor("b"), instructor("c")],
    blocked: [
      ...blockDays("a", dates.slice(2)),
      ...blockDays("b", [dates[0], dates[1], dates[4]]),
    ],
    dates,
    totalLessons: 5,
    options: { diagnosticLookaheadDays: 0 },
  });
  assert.equal(out.ok, true);
  assert.equal(out.best.instructorId, "c");
  assert.equal(out.consideredInstructorCount, 3);
  assert.equal(out.attempts.length, 3);
  assert.equal(out.fallback.f1AllInstructorsEvaluated, true);
});

test("A.4 ranking: requested start date, then earliest completion, then load", () => {
  const dates = DATES_60.slice(0, 10);
  // "b" is equally available but already carries 5 live lessons.
  const busy = DATES_60.slice(0, 5).map((d) => blockAt("b", d, timeToMinutes("12:00")));
  // "c" cannot start on the requested date, so it completes later.
  const out = run({
    instructors: [instructor("a"), instructor("b"), instructor("c")],
    blocked: [...busy, ...blockDays("c", [dates[0]])],
    dates,
    totalLessons: 4,
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.proposals.map((p) => p.instructorId), ["a", "b", "c"]);
  assert.deepEqual(out.proposals.map((p) => p.rank), [1, 2, 3]);
  assert.equal(out.proposals[0].load, 0);
  assert.equal(out.proposals[1].load, 5);
  assert.equal(out.proposals[2].startDateShifted, true);
});

test("A.5 ranking is deterministic across runs", () => {
  const dates = DATES_60.slice(0, 10);
  const args = {
    instructors: [instructor("z"), instructor("y"), instructor("x")],
    dates,
    totalLessons: 4,
  };
  const first = run(args);
  const second = run(args);
  assert.deepEqual(
    first.proposals.map((p) => p.instructorId),
    second.proposals.map((p) => p.instructorId),
  );
  assert.deepEqual(first.proposals.map((p) => p.rank), [1, 2, 3]);
});

// ---------------------------------------------------------------------------
// B. F1..F6 fallback ladder
// ---------------------------------------------------------------------------

test("B.F2 a blocked requested day shifts the course and keeps the EXACT times", () => {
  const dates = DATES_60.slice(0, 10);
  const out = run({
    instructors: [instructor("a")],
    blocked: blockDays("a", [dates[0], dates[1]]),
    dates,
    totalLessons: 3,
    preferredStartMinutes: [M0700],
  });
  assert.equal(out.ok, true);
  assert.deepEqual(plannedDates(out), dates.slice(2, 5));
  assert.deepEqual([...new Set(out.best.lessons.map((l) => l.start_time))], ["07:00"]);
  assert.equal(out.best.startDateShifted, true);
  assert.equal(out.best.lessonsShifted, true);
  assert.equal(out.fallback.f2LessonsShifted, true);
  assert.equal(out.fallback.levelsReached, 2);
  assert.deepEqual(out.nextSteps, [NEXT_STEP.ALTERNATIVE_START_DATE]);
});

test("B.F2 a blocked day is skipped, never filled with a nearby time", () => {
  const dates = DATES_60.slice(0, 4);
  const out = run({
    instructors: [instructor("a")],
    blocked: [blockAt("a", dates[1], M0700)],
    dates,
    totalLessons: 3,
    preferredStartMinutes: [M0700],
  });
  assert.equal(out.ok, true);
  assert.deepEqual(plannedDates(out), [dates[0], dates[2], dates[3]]);
  // 06:30 / 07:30 were free on the blocked day but must not be used.
  assert.deepEqual([...new Set(out.best.lessons.map((l) => l.start_time))], ["07:00"]);
});

test("B.F3 the horizon is extended when the short window cannot fit the course", () => {
  const dates = DATES_60.slice(0, 5);
  const out = run({
    instructors: [instructor("a")],
    dates,
    totalLessons: 6,
    options: { maxHorizonDays: 10 },
  });
  assert.equal(out.ok, true);
  assert.equal(out.best.lessons.length, 6);
  assert.equal(out.best.lessons[5].date, DATES_60[5]);
  assert.equal(out.fallback.f3HorizonExtended, true);
  assert.equal(out.fallback.levelsReached, 3);
  assert.equal(out.best.horizonExtended, true);
  assert.equal(out.searchedDates.length, 10);
});

test("B.F3 without room to extend, MAX_HORIZON_EXCEEDED is reported honestly", () => {
  const dates = DATES_60.slice(0, 5);
  const out = run({ instructors: [instructor("a")], dates, totalLessons: 6 });
  assert.equal(out.ok, false);
  assert.equal(out.attempts[0].code, INSTRUCTOR_REJECTION.MAX_HORIZON_EXCEEDED);
  assert.equal(out.failureCode, "MAX_HORIZON_EXCEEDED");
  assert.equal(out.searchExhaustive, true);
  assert.deepEqual(out.nextSteps, [
    NEXT_STEP.REVISE_PREFERENCES,
    NEXT_STEP.REQUEST_HUMAN_ASSISTANCE,
  ]);
});

test("B.F4 a later start date is proposed explicitly, never silently used", () => {
  // The allowed window starts AFTER the requested start date, so only an
  // alternative-start-date search can find the course.
  const dates = DATES_60.slice(2, 11);
  const out = run({
    instructors: [instructor("a")],
    dates,
    startDate: D0,
    totalLessons: 3,
    options: { maxStartDateShiftDays: 5 },
  });
  assert.equal(out.ok, true);
  assert.equal(out.requestedStartDate, D0);
  assert.equal(out.best.startDate, DATES_60[2]);
  assert.equal(out.best.startDateShifted, true);
  assert.equal(out.fallback.f4AlternativeStartDate, true);
  assert.equal(out.fallback.levelsReached, 4);
  assert.deepEqual(out.alternativeStartDates, [
    { startDate: DATES_60[2], completionDate: DATES_60[4], rank: 1 },
  ]);
  assert.deepEqual(out.nextSteps, [NEXT_STEP.ALTERNATIVE_START_DATE]);
});

test("B.F5 a genuine capacity dead-end asks the learner to revise preferences", () => {
  const dates = DATES_60.slice(0, 5);
  const out = run({
    instructors: [instructor("a")],
    blocked: blockDays("a", dates),
    dates,
    totalLessons: 5,
    options: { diagnosticLookaheadDays: 0 },
  });
  assert.equal(out.ok, false);
  assert.equal(out.attempts[0].code, INSTRUCTOR_REJECTION.NO_AVAILABLE_PREFERRED_TIME);
  assert.deepEqual(out.nextSteps, [
    NEXT_STEP.REVISE_PREFERENCES,
    NEXT_STEP.REQUEST_HUMAN_ASSISTANCE,
  ]);
});

test("B.F6 no supply is classified apart from capacity and yields an actionable event", () => {
  const out = run({ instructors: [], totalLessons: 5 });
  assert.equal(out.ok, false);
  assert.equal(out.failureCode, "NO_INSTRUCTOR_SUPPLY");
  assert.equal(out.supplyGap.kind, SUPPLY_GAP.NO_INSTRUCTOR_SUPPLY);
  assert.equal(out.searchExhaustive, true);
  assert.deepEqual(out.nextSteps, [NEXT_STEP.REQUEST_HUMAN_ASSISTANCE]);

  const props = supplyGapEventProperties({
    outcome: out,
    courseId: "course-1",
    areaId: "area-1",
    dlStatus: "has_dl",
    preferredTimes: ["07:00", "11:00", "18:00"],
    requestedDate: D0,
  });
  assert.equal(props.cause, "NO_INSTRUCTOR_SUPPLY");
  assert.equal(props.supply_kind, SUPPLY_GAP.NO_INSTRUCTOR_SUPPLY);
  assert.equal(props.course_id, "course-1");
  assert.equal(props.area_id, "area-1");
  assert.equal(props.dl_status, "has_dl");
  assert.equal(props.preferred_times, "07:00,11:00,18:00");
  assert.equal(props.requested_date, D0);
  assert.equal(props.search_exhaustive, true);
  const keys = Object.keys(props);
  assert.ok(keys.length <= 12, `event property budget exceeded: ${keys.join(",")}`);
  for (const [key, value] of Object.entries(props)) {
    assert.ok(
      ["string", "number", "boolean"].includes(typeof value),
      `${key} must be a primitive (got ${typeof value})`,
    );
  }
});

// ---------------------------------------------------------------------------
// D. Rejection reason codes
// ---------------------------------------------------------------------------

test("D.1 an inactive instructor is INSTRUCTOR_NOT_ELIGIBLE and never searched", () => {
  const out = run({
    instructors: [instructor("off", { status: "on_break" }), instructor("a")],
    totalLessons: 2,
  });
  assert.equal(out.ok, true);
  assert.equal(out.best.instructorId, "a");
  assert.deepEqual(out.excluded, [
    { instructorId: "off", code: INSTRUCTOR_REJECTION.INSTRUCTOR_NOT_ELIGIBLE },
  ]);
});

test("D.2 an instructor serving another area is AREA_NOT_SUPPORTED", () => {
  const out = run({
    instructors: [instructor("far", { areas: ["elsewhere"] }), instructor("a")],
    totalLessons: 2,
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.excluded, [
    { instructorId: "far", code: INSTRUCTOR_REJECTION.AREA_NOT_SUPPORTED },
  ]);
});

test("D.3 course / vehicle eligibility comes from the caller-supplied support hook", () => {
  const out = run({
    instructors: [instructor("a"), instructor("b")],
    totalLessons: 2,
    options: {
      instructorSupport: (instr) =>
        instr.id === "a"
          ? { code: INSTRUCTOR_REJECTION.COURSE_NOT_SUPPORTED, reason: "no certification" }
          : { code: INSTRUCTOR_REJECTION.VEHICLE_NOT_AVAILABLE, reason: "no car" },
    },
  });
  assert.equal(out.ok, false);
  assert.equal(
    out.rejectionSummary[INSTRUCTOR_REJECTION.COURSE_NOT_SUPPORTED],
    1,
  );
  assert.equal(
    out.rejectionSummary[INSTRUCTOR_REJECTION.VEHICLE_NOT_AVAILABLE],
    1,
  );
  assert.equal(out.failureCode, "INSUFFICIENT_COURSE_CAPACITY");
  assert.equal(out.supplyGap.kind, SUPPLY_GAP.INSUFFICIENT_CAPACITY);
  assert.deepEqual(out.nextSteps, [NEXT_STEP.REQUEST_HUMAN_ASSISTANCE]);
});

test("D.4 a missing calendar is CALENDAR_DATA_STALE and is NOT proven absence", () => {
  const out = run({ instructors: [instructor("a")], dates: [], totalLessons: 2 });
  assert.equal(out.ok, false);
  assert.equal(out.failureCode, "CALENDAR_DATA_STALE");
  assert.equal(out.searchExhaustive, false);
  assert.equal(out.supplyGap.kind, SUPPLY_GAP.SEARCH_INCOMPLETE);
  assert.deepEqual(out.nextSteps, [NEXT_STEP.RETRY_LATER]);
});

test("D.5 an unusable request is INVALID_REQUEST with a retry/revise step", () => {
  const noLessons = run({ instructors: [instructor("a")], totalLessons: 0 });
  assert.equal(noLessons.failureCode, "INVALID_REQUEST");
  assert.equal(noLessons.searchExhaustive, false);

  const noPrefs = run({ instructors: [instructor("a")], preferredStartMinutes: [] });
  assert.equal(noPrefs.failureCode, "INVALID_REQUEST");
  assert.equal(noPrefs.searchExhaustive, false);
  assert.deepEqual(noPrefs.nextSteps, [NEXT_STEP.REVISE_PREFERENCES]);
});

test("D.6 an exhausted budget is SEARCH_LIMIT_REACHED, not 'no capacity'", () => {
  const dates = DATES_60.slice(0, 5);
  const out = run({
    instructors: [instructor("a"), instructor("b")],
    blocked: blockDays("a", dates),
    dates,
    totalLessons: 5,
    options: { maxEvaluations: 1, diagnosticLookaheadDays: 0 },
  });
  assert.equal(out.ok, false);
  assert.equal(out.searchExhaustive, false);
  assert.equal(out.failureCode, "SEARCH_LIMIT_REACHED");
  assert.equal(out.supplyGap.kind, SUPPLY_GAP.SEARCH_INCOMPLETE);
  // The budget stopped the search after ONE instructor, so the second was never
  // examined and the absence of a schedule is not proven.
  assert.equal(out.consideredInstructorCount, 2);
  assert.equal(out.attempts.length, 1);
  assert.equal(out.attempts[0].instructorId, "a");
  assert.equal(out.fallback.f1AllInstructorsEvaluated, false);
  assert.deepEqual(out.nextSteps, [
    NEXT_STEP.RETRY_LATER,
    NEXT_STEP.REQUEST_HUMAN_ASSISTANCE,
  ]);
  assert.ok(!out.nextSteps.includes(NEXT_STEP.REVISE_PREFERENCES));
});

test("D.7 a wall-clock budget is honoured and also reports SEARCH_LIMIT_REACHED", () => {
  // A clock that jumps past the budget after the first instructor attempt.
  let tick = 0;
  const out = run({
    instructors: [instructor("a"), instructor("b")],
    totalLessons: 5,
    options: {
      maxMillis: 10,
      diagnosticLookaheadDays: 0,
      // First call seeds startedAt, the budget check then always fails.
      clock: () => (tick += 1000),
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.searchExhaustive, false);
  assert.equal(out.failureCode, "SEARCH_LIMIT_REACHED");
});

test("D.8 the exact preferred times are never free → NO_AVAILABLE_PREFERRED_TIME", () => {
  const dates = DATES_60.slice(0, 5);
  const out = run({
    instructors: [instructor("a")],
    // Only the three preferred starts are blocked; every other start is free.
    blocked: dates.map((d) => blockAt("a", d, M0700)),
    dates,
    totalLessons: 5,
    preferredStartMinutes: [M0700],
    options: { diagnosticLookaheadDays: 0 },
  });
  assert.equal(out.ok, false);
  assert.equal(out.attempts[0].code, INSTRUCTOR_REJECTION.NO_AVAILABLE_PREFERRED_TIME);
  assert.equal(out.failureCode, "INSUFFICIENT_COURSE_CAPACITY");
});

test("D.9 too few qualifying days → INSUFFICIENT_COURSE_CAPACITY", () => {
  const dates = DATES_60.slice(0, 10);
  const out = run({
    instructors: [instructor("a")],
    blocked: blockDays("a", dates.slice(3)),
    dates,
    totalLessons: 5,
    options: { diagnosticLookaheadDays: 0 },
  });
  assert.equal(out.ok, false);
  assert.equal(out.attempts[0].code, INSTRUCTOR_REJECTION.INSUFFICIENT_COURSE_CAPACITY);
  assert.equal(out.failureCode, "INSUFFICIENT_COURSE_CAPACITY");
  assert.equal(out.searchExhaustive, true);
});

test("D.10 a learner-wide clash on a lesson date is LEARNER_CONFLICT", () => {
  const existing = [
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: D0, start_time: "08:00", end_time: "09:00" },
  ];
  const out = run({
    instructors: [instructor("a")],
    totalLessons: 2,
    options: { learnerExisting: existing },
  });
  assert.equal(out.ok, false);
  assert.equal(out.attempts[0].code, INSTRUCTOR_REJECTION.LEARNER_CONFLICT);
  assert.match(out.attempts[0].reason, /complete-schedule check failed/);
});

test("D.11 a learner clash on an unrelated date does not block the course", () => {
  const out = run({
    instructors: [instructor("a")],
    totalLessons: 2,
    options: {
      learnerExisting: [{ date: DATES_60[20], start_time: "09:00", end_time: "10:00" }],
    },
  });
  assert.equal(out.ok, true);
});

// ---------------------------------------------------------------------------
// C. COMPLETE-schedule acceptance rule
// ---------------------------------------------------------------------------

const VALID_LESSONS = [lesson(D0, "07:00"), lesson(DATES_60[1], "11:00")];

test("C.1 a genuinely complete plan passes every condition", () => {
  const check = validateCompleteSchedule({
    lessons: VALID_LESSONS,
    totalLessons: 2,
    instructorId: "a",
    lessonInstructorIds: ["a", "a"],
    preferredStartMinutes: PREFS,
    durationMinutes: 60,
    windowDates: [D0, DATES_60[1]],
    availableStartsByDate: new Map([
      [D0, new Set([M0700])],
      [DATES_60[1], new Set([M1100])],
    ]),
  });
  assert.equal(check.complete, true);
  assert.deepEqual(check.violations, []);
  assert.deepEqual(check.instructorIds, ["a"]);
  assert.equal(check.lessonCount, 2);
});

test("C.2 an empty or short plan is not complete", () => {
  assert.deepEqual(validateCompleteSchedule({ lessons: [], totalLessons: 2 }).violations, [
    COMPLETE_VIOLATION.NO_LESSONS,
  ]);
  const short = validateCompleteSchedule({ lessons: VALID_LESSONS, totalLessons: 5, instructorId: "a" });
  assert.equal(short.complete, false);
  assert.ok(short.violations.includes(COMPLETE_VIOLATION.LESSON_COUNT_MISMATCH));
});

test("C.3 mixed or missing instructor ids fail the one-instructor rule", () => {
  const mixed = validateCompleteSchedule({
    lessons: VALID_LESSONS,
    totalLessons: 2,
    lessonInstructorIds: ["a", "b"],
  });
  assert.ok(mixed.violations.includes(COMPLETE_VIOLATION.MULTIPLE_INSTRUCTORS));
  assert.deepEqual(mixed.instructorIds.sort(), ["a", "b"]);

  const missing = validateCompleteSchedule({
    lessons: VALID_LESSONS,
    totalLessons: 2,
    lessonInstructorIds: ["a", null],
  });
  assert.ok(missing.violations.includes(COMPLETE_VIOLATION.MISSING_INSTRUCTOR));

  const none = validateCompleteSchedule({ lessons: VALID_LESSONS, totalLessons: 2 });
  assert.ok(none.violations.includes(COMPLETE_VIOLATION.MISSING_INSTRUCTOR));
});

test("C.4 a substituted time is rejected", () => {
  const check = validateCompleteSchedule({
    lessons: VALID_LESSONS,
    totalLessons: 2,
    instructorId: "a",
    preferredStartMinutes: [M0700, M1800],
  });
  // lesson 2 is 11:00, which the learner never approved
  assert.ok(check.violations.includes(COMPLETE_VIOLATION.PREFERRED_TIME_NOT_EXACT));
});

test("C.5 a wrong lesson duration is rejected", () => {
  const check = validateCompleteSchedule({
    lessons: VALID_LESSONS,
    totalLessons: 2,
    instructorId: "a",
    durationMinutes: 45,
  });
  assert.ok(check.violations.includes(COMPLETE_VIOLATION.DURATION_MISMATCH));
});

test("C.6 the booking policy and the horizon are enforced", () => {
  const threeSameDay = [lesson(D0, "07:00"), lesson(D0, "08:00"), lesson(D0, "09:00")];
  const policy = validateCompleteSchedule({
    lessons: threeSameDay,
    totalLessons: 3,
    instructorId: "a",
  });
  assert.ok(policy.violations.includes(COMPLETE_VIOLATION.CONSECUTIVE_RULE_VIOLATION));

  const horizon = validateCompleteSchedule({
    lessons: VALID_LESSONS,
    totalLessons: 2,
    instructorId: "a",
    windowDates: [D0],
  });
  assert.ok(horizon.violations.includes(COMPLETE_VIOLATION.OUTSIDE_HORIZON));
});

test("C.7 a lesson the instructor is not actually free for is rejected", () => {
  const check = validateCompleteSchedule({
    lessons: VALID_LESSONS,
    totalLessons: 2,
    instructorId: "a",
    availableStartsByDate: new Map([[D0, new Set([M0700])]]),
  });
  assert.ok(check.violations.includes(COMPLETE_VIOLATION.SLOT_NOT_AVAILABLE));
});

test("C.8 a learner-wide conflict is rejected", () => {
  const check = validateCompleteSchedule({
    lessons: VALID_LESSONS,
    totalLessons: 2,
    instructorId: "a",
    learnerExisting: [
      { date: D0, start_time: "07:00", end_time: "08:00" },
      { date: D0, start_time: "08:00", end_time: "09:00" },
    ],
  });
  assert.ok(check.violations.includes(COMPLETE_VIOLATION.LEARNER_CONFLICT));
});

// ---------------------------------------------------------------------------
// E. Reservation-batch guards
// ---------------------------------------------------------------------------

test("E.1 a single-instructor batch of the exact size is accepted", () => {
  const check = validateReservationBatch(
    [{ instructor_id: "a" }, { instructor_id: "a" }, { instructor_id: "a" }],
    3,
  );
  assert.equal(check.ok, true);
  assert.equal(check.instructorId, "a");
  assert.deepEqual(check.violations, []);
  assert.equal(check.slotCount, 3);
});

test("E.2 a mixed batch is refused and reports no single instructor", () => {
  const check = validateReservationBatch([{ instructor_id: "a" }, { instructor_id: "b" }], 2);
  assert.equal(check.ok, false);
  assert.equal(check.instructorId, null);
  assert.ok(check.violations.includes("MULTIPLE_INSTRUCTORS"));
});

test("E.3 a short batch or a blank instructor id is refused", () => {
  const short = validateReservationBatch([{ instructor_id: "a" }], 3);
  assert.equal(short.ok, false);
  assert.ok(short.violations.includes("LESSON_COUNT_MISMATCH"));

  const blank = validateReservationBatch([{ instructor_id: "a" }, { instructor_id: "  " }], 2);
  assert.equal(blank.ok, false);
  assert.ok(blank.violations.includes("MISSING_INSTRUCTOR"));
});

// ---------------------------------------------------------------------------
// G. Invariants over the whole engine
// ---------------------------------------------------------------------------

test("G.1 every proposal passes the complete-schedule rule against live data", () => {
  const dates = DATES_60.slice(0, 10);
  const blocked = [
    blockAt("b", dates[3], timeToMinutes("12:00")),
    blockAt("b", dates[4], timeToMinutes("12:00")),
  ];
  const instructors = [instructor("a"), instructor("b"), instructor("c")];
  const input = INPUT(instructors, blocked, { dates });
  const out = planPreferredCourseWithFallbacks({
    input,
    startDate: D0,
    preferredStartMinutes: PREFS,
    totalLessons: 4,
  });
  assert.equal(out.ok, true);
  const grid = gridFor(input, instructors);
  for (const proposal of out.proposals) {
    const check = validateCompleteSchedule({
      lessons: proposal.lessons,
      totalLessons: 4,
      instructorId: proposal.instructorId,
      preferredStartMinutes: PREFS,
      durationMinutes: SLOT_CONFIG.slotDurationMinutes,
      windowDates: out.searchedDates,
      availableStartsByDate: grid.get(proposal.instructorId),
    });
    assert.equal(check.complete, true, `${proposal.instructorId}: ${check.violations.join(",")}`);
    assert.deepEqual(check.instructorIds, [proposal.instructorId]);
  }
});

test("G.2 no lesson ever collides with an existing booking", () => {
  const dates = DATES_60.slice(0, 6);
  const blocked = [blockAt("a", dates[2], M0700), blockAt("a", dates[4], M0700)];
  const out = run({
    instructors: [instructor("a")],
    blocked,
    dates,
    totalLessons: 4,
    preferredStartMinutes: [M0700],
  });
  const taken = new Set(blocked.map((b) => `${b.date}:${b.startMinute}`));
  for (const l of out.best.lessons) {
    const key = `${l.date}:${timeToMinutes(l.start_time)}`;
    assert.equal(taken.has(key), false, `planned a blocked slot ${key}`);
  }
});

test("G.3 the 30-minute travel buffer blocks an otherwise-free start", () => {
  const dates = DATES_60.slice(0, 4);
  // A booked lesson at 07:30 elsewhere hides 07:00 through the travel gap.
  const blocked = [blockAt("a", dates[1], timeToMinutes("07:30"))];
  const input = INPUT([instructor("a")], blocked, { dates });
  const grid = gridFor(input, [instructor("a")]);
  assert.equal(grid.get("a").get(dates[1]).includes(M0700), false);

  const out = run({
    instructors: [instructor("a")],
    blocked,
    dates,
    totalLessons: 3,
    preferredStartMinutes: [M0700],
  });
  assert.equal(out.ok, true);
  assert.deepEqual(plannedDates(out), [dates[0], dates[2], dates[3]]);
});

test("G.4 an expired hold frees the slot, a live hold keeps it taken", () => {
  const dates = [D0];
  const expired = run({
    instructors: [instructor("a")],
    blocked: [holdAt("a", D0, M0700, new Date(NOW.getTime() - 60 * 60_000).toISOString())],
    dates,
    totalLessons: 1,
    preferredStartMinutes: [M0700],
  });
  assert.equal(expired.ok, true);

  const live = run({
    instructors: [instructor("a")],
    blocked: [holdAt("a", D0, M0700, NOW.toISOString())],
    dates,
    totalLessons: 1,
    preferredStartMinutes: [M0700],
    options: { diagnosticLookaheadDays: 0 },
  });
  assert.equal(live.ok, false);
  assert.equal(live.attempts[0].code, INSTRUCTOR_REJECTION.NO_AVAILABLE_PREFERRED_TIME);
});

test("G.5 mandatory female preference narrows the search to female instructors", () => {
  const out = run({
    instructors: [instructor("m", { gender: "male" }), instructor("f", { gender: "female" })],
    totalLessons: 2,
    inputOverrides: { femaleMode: "mandatory", femalePreference: true },
  });
  assert.equal(out.ok, true);
  assert.equal(out.best.instructorId, "f");
  assert.equal(out.eligibleInstructorCount, 2);
  assert.equal(out.consideredInstructorCount, 1);
});

test("G.6 the public summary exposes no instructor identity", () => {
  const out = run({ instructors: [instructor("i-secret")], totalLessons: 2 });
  const summary = toPublicSchedulingSummary(out);
  const json = JSON.stringify(summary);
  assert.equal(/instructorId|instructorName|i-secret/.test(json), false);
  assert.equal(summary.complete, true);
  assert.equal(summary.instructorCountThatCouldComplete, 1);
  assert.deepEqual(Object.keys(summary).sort(), [
    "alternativeStartDates",
    "complete",
    "consideredInstructorCount",
    "eligibleInstructorCount",
    "failureCode",
    "fallback",
    "instructorCountThatCouldComplete",
    "nextSteps",
    "proposedCompletionDate",
    "proposedStartDate",
    "rejectionSummary",
    "requestedStartDate",
    "searchExhaustive",
    "startDateShifted",
    "supplyGap",
  ]);
});

test("G.7 a failed search never offers a partial course or an empty next step", () => {
  const dates = DATES_60.slice(0, 4);
  const failures = [
    run({ instructors: [], totalLessons: 3 }),
    run({ instructors: [instructor("a")], dates, totalLessons: 9 }),
    run({ instructors: [instructor("a")], dates: [], totalLessons: 3 }),
    run({ instructors: [instructor("a")], totalLessons: 0 }),
    run({
      instructors: [instructor("a")],
      blocked: blockDays("a", dates),
      dates,
      totalLessons: 2,
      options: { diagnosticLookaheadDays: 0 },
    }),
  ];
  for (const out of failures) {
    assert.equal(out.ok, false);
    assert.deepEqual(out.proposals, []);
    assert.equal(out.best, null);
    assert.ok(out.nextSteps.length > 0, "every failed journey needs a next step");
    assert.ok(typeof out.supplyGap.kind === "string");
  }
});

test("G.8 ok:true always means exactly totalLessons lessons, one instructor, exact prefs", () => {
  const scenarios = [
    { totalLessons: 1 },
    { totalLessons: 3 },
    { totalLessons: 6, dates: DATES_60.slice(0, 6) },
    { totalLessons: 4, preferredStartMinutes: [M1100, M1800] },
    { totalLessons: 5, options: { maxHorizonDays: 12 }, dates: DATES_60.slice(0, 5) },
  ];
  for (const scenario of scenarios) {
    const prefs = scenario.preferredStartMinutes ?? PREFS;
    const out = run({ instructors: [instructor("a")], ...scenario });
    assert.equal(out.ok, true, JSON.stringify(scenario));
    assert.equal(out.best.lessons.length, scenario.totalLessons);
    assert.equal(new Set(out.proposals.map((p) => p.instructorId)).size, 1);
    const allowed = new Set(prefs.map((m) => minutesToTime(m)));
    for (const l of out.best.lessons) assert.ok(allowed.has(l.start_time), `${l.start_time} not approved`);
  }
});
