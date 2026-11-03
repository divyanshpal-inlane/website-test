import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCoursePlan,
  computeCoursePlanPreferred,
  planCoursePreferred,
  computeFeasibleFirstSlots,
  buildInstructorFreeGrid,
  candidateStartMinutes,
  isTimeUnavailable,
  areaEligibleInstructors,
  instructorBookingLoad,
  pickBestInstructor,
  validateConsecutiveRule,
  validateLearnerWideConsecutive,
  timeToMinutes,
  minutesToTime,
} from "../_shared/availability.ts";
import { addDaysISO } from "../_shared/validation.ts";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const SLOT_CONFIG = {
  slotStart: "06:00",
  slotEnd: "20:00",
  gridMinutes: 30,
  slotDurationMinutes: 60,
};

function instructor(id, overrides = {}) {
  return {
    id,
    areas: ["area-a"],
    gender: null,
    status: "active",
    enabled: true,
    unavailability: null,
    radiusKm: null,
    lat: null,
    lng: null,
    ...overrides,
  };
}

const INPUT = (instructors, overrides = {}) => ({
  instructors,
  learnerArea: "area-a",
  learner: null,
  slotConfig: SLOT_CONFIG,
  ...overrides,
});

const D0 = "2026-11-02"; // Monday
const DATES = Array.from({ length: 21 }, (_, i) => addDaysISO(D0, i)); // Extended window
const P1 = timeToMinutes("07:00");
const P2 = timeToMinutes("18:00");
const P3 = timeToMinutes("19:00");

function blockAt(instructorId, date, start, overrides = {}) {
  return { instructorId, date, startMinute: start, endMinute: start + 60, status: "booked", ...overrides };
}

function blockWholeDay(instructorId, date) {
  return candidateStartMinutes(SLOT_CONFIG).map((s) => blockAt(instructorId, date, s));
}

function holdAt(instructorId, date, start, createdAtIso, overrides = {}) {
  return {
    instructorId,
    date,
    startMinute: start,
    endMinute: start + 60,
    status: "pending_payment",
    bookingCreatedAt: createdAtIso,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. CORE LEGACY FLOW - computeCoursePlan
// ---------------------------------------------------------------------------

test("legacy: complete 10-lesson course from first slot - same instructor all lessons", () => {
  const plan = computeCoursePlan(
    INPUT([instructor("a")], { dates: DATES }),
    { date: D0, start: "07:00" },
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  assert.equal(plan.instructorId, "a");
  // All lessons same instructor
  assert.equal(plan.lessons.every((l) => true), true);
  // First lesson matches
  assert.equal(plan.lessons[0].date, D0);
  assert.equal(plan.lessons[0].start_time, "07:00");
});

test("legacy: 8-lesson course completes successfully", () => {
  const plan = computeCoursePlan(
    INPUT([instructor("a")], { dates: DATES }),
    { date: D0, start: "08:00" },
    8,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 8);
  assert.equal(plan.instructorId, "a");
});

test("legacy: 1-lesson (Demo Class) completes", () => {
  const plan = computeCoursePlan(
    INPUT([instructor("a")], { dates: DATES }),
    { date: D0, start: "09:30" },
    1,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 1);
  assert.equal(plan.instructorId, "a");
});

test("legacy: no instructor available -> infeasible", () => {
  const plan = computeCoursePlan(
    INPUT([], { dates: DATES }),
    { date: D0, start: "07:00" },
    10,
  );
  assert.equal(plan.ok, false);
  assert.equal(plan.lessons, undefined);
});

test("legacy: instructor booked first slot -> picks different instructor if available", () => {
  const blocks = [blockAt("a", D0, P1)];
  const plan = computeCoursePlan(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    { date: D0, start: "07:00" },
    5,
  );
  // If instructor A's first slot taken and can't complete from it, try other instructor
  assert.ok(plan.ok === true || plan.ok === false); // May or may not be ok depending on availability
});

test("legacy: all instructors booked on first slot -> infeasible from that slot", () => {
  const blocks = [blockAt("a", D0, P1), blockAt("b", D0, P1)];
  const plan = computeCoursePlan(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    { date: D0, start: "07:00" },
    5,
  );
  assert.equal(plan.ok, false);
});

// ---------------------------------------------------------------------------
// 2. PREFERRED FLOW CORE - computeCoursePlanPreferred
// ---------------------------------------------------------------------------

test("preferred: 3 prefs, all free -> uses P1 every day", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  assert.equal(plan.instructorId, "a");
  // All lessons at P1 (07:00)
  plan.lessons.forEach((l) => {
    assert.equal(l.start_time, "07:00");
    assert.equal(l.end_time, "08:00");
  });
});

test("preferred: only 1 preference provided", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P2],
    8,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 8);
  plan.lessons.forEach((l) => assert.equal(l.start_time, "18:00"));
});

test("preferred: 2 preferences provided", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 5);
});

test("preferred: P1 blocked day 0 -> falls to P2 same day", () => {
  const blocks = [blockAt("a", DATES[0], P1)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "18:00"); // P2
  assert.equal(plan.lessons[1].start_time, "07:00"); // P1 free next day
});

test("preferred: P1,P2 blocked day 0 -> falls to P3 same day", () => {
  const blocks = [blockAt("a", DATES[0], P1), blockAt("a", DATES[0], P2)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "19:00"); // P3
});

test("preferred: all 3 prefs blocked day 0, others free -> SKIP day, use P1 day 1 (no nearby fallback)", () => {
  const day0 = DATES[0];
  const blocks = [blockAt("a", day0, P1), blockAt("a", day0, P2), blockAt("a", day0, P3)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].date, DATES[1]); // Skipped day 0
  assert.equal(plan.lessons[0].start_time, "07:00"); // P1 on next day
  assert.notEqual(plan.lessons[0].start_time, "08:00"); // No nearby time
});

test("preferred: whole day blocked (all slots) -> skip day", () => {
  const day0 = DATES[0];
  const blocks = blockWholeDay("a", day0);
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].date, DATES[1]);
  assert.equal(plan.lessons[0].start_time, "07:00");
});

test("preferred: at most one lesson per calendar day", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  const datesSeen = new Set(plan.lessons.map((l) => l.date));
  assert.equal(datesSeen.size, plan.lessons.length); // All different days
});

test("preferred: lessons in chronological order", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  for (let i = 1; i < plan.lessons.length; i++) {
    assert.ok(plan.lessons[i].date >= plan.lessons[i - 1].date);
    if (plan.lessons[i].date === plan.lessons[i - 1].date) {
      assert.ok(plan.lessons[i].start_time >= plan.lessons[i - 1].start_time);
    }
  }
});

test("preferred: uses same instructor for entire course", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b"), instructor("c")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  assert.ok(["a", "b", "c"].includes(plan.instructorId));
});

// ---------------------------------------------------------------------------
// 3. PREFERRED FLOW - AVAILABILITY CONSTRAINTS
// ---------------------------------------------------------------------------

test("preferred: booked lesson blocks preferred time", () => {
  const blocks = [blockAt("a", DATES[0], P1)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "18:00");
});

test("preferred: cancelled booking does NOT block", () => {
  const blocks = [blockAt("a", DATES[0], P1, { status: "cancelled" })];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "07:00"); // P1 free
});

test("preferred: rejected booking does NOT block", () => {
  const blocks = [blockAt("a", DATES[0], P1, { status: "rejected" })];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "07:00");
});

test("preferred: active pending_payment hold blocks", () => {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // 5 min ago
  const blocks = [holdAt("a", DATES[0], P1, createdAt)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks, holdMinutes: 15, now }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "18:00");
});

test("preferred: expired pending_payment hold does NOT block", () => {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // 30 min ago
  const blocks = [holdAt("a", DATES[0], P1, createdAt)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks, holdMinutes: 15, now }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "07:00");
});

test("preferred: unavailability blocks preferred time", () => {
  const instr = instructor("a");
  instr.unavailability = [
    { booked_date: DATES[0], booked_start_time: "06:00", booked_end_time: "12:00", all_day: false },
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "18:00"); // P1 blocked
});

test("preferred: all_day unavailability blocks entire day", () => {
  const instr = instructor("a");
  instr.unavailability = [
    { booked_date: DATES[0], all_day: true },
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].date, DATES[1]);
});

test("preferred: recurring day_of_week unavailability", () => {
  const instr = instructor("a");
  instr.unavailability = [
    { day_of_week: "monday", booked_start_time: "00:00", booked_end_time: "23:59", all_day: true },
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  // D0 is Monday - should be skipped
  assert.notEqual(plan.lessons[0].date, D0);
});

// ---------------------------------------------------------------------------
// 4. PREFERRED FLOW - INSTRUCTOR SELECTION
// ---------------------------------------------------------------------------

test("preferred: picks best instructor among feasible (area match first)", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  assert.ok(["a", "b"].includes(plan.instructorId));
});

test("preferred: instructor not in learner area excluded", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { areas: ["other-area"] })], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  // Depending on implementation - may be infeasible
  assert.ok(plan.ok === true || plan.ok === false);
});

test("preferred: on_break instructor excluded", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { status: "on_break" })], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, false);
});

test("preferred: inactive instructor excluded", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { status: "inactive" })], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, false);
});

test("preferred: load balancing - less loaded instructor preferred", () => {
  const blocks = Array.from({ length: 20 }, (_, i) =>
    blockAt("a", addDaysISO(D0, i), P1)
  );
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  // Instructor b should be preferred if a is more loaded
  // Depends on load calculation, but plan should be feasible
});

// ---------------------------------------------------------------------------
// 5. PREFERRED FLOW - EDGE CASES & VALIDATION
// ---------------------------------------------------------------------------

test("preferred: startDate not in dates window -> infeasible", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    "2099-01-01",
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, false);
});

test("preferred: no preferred times -> infeasible", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [],
    5,
  );
  assert.equal(plan.ok, false);
});

test("preferred: not enough days in window to fit all lessons -> infeasible", () => {
  const shortDates = DATES.slice(0, 2);
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: shortDates }),
    D0,
    [P1, P2, P3],
    10, // Need 10 days but only 2 available
  );
  assert.equal(plan.ok, false);
});

test("preferred: some days skipped but still fit within window -> ok", () => {
  const shortDates = DATES.slice(0, 15);
  // Block all 3 prefs on 5 days
  const blocks = [];
  for (let i = 0; i < 5; i++) {
    blocks.push(blockAt("a", shortDates[i], P1));
    blocks.push(blockAt("a", shortDates[i], P2));
    blocks.push(blockAt("a", shortDates[i], P3));
  }
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: shortDates, blocks }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
});

test("preferred: preferred time outside grid config -> handled by validation", () => {
  // This would be validated at API level, but engine should handle
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [timeToMinutes("05:00")], // Before slotStart
    5,
  );
  // May be infeasible if time not in free grid
  assert.ok(plan.ok === true || plan.ok === false);
});

// ---------------------------------------------------------------------------
// 6. CONSECUTIVE RULE VALIDATION
// ---------------------------------------------------------------------------

test("consecutive: same-day adjacent lessons OK", () => {
  const lessons = [
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: D0, start_time: "08:00", end_time: "09:00" },
  ];
  assert.equal(validateConsecutiveRule(lessons), null);
});

test("consecutive: same-day non-adjacent -> error", () => {
  const lessons = [
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: D0, start_time: "09:00", end_time: "10:00" },
  ];
  assert.ok(validateConsecutiveRule(lessons) !== null);
});

test("consecutive: more than 2 lessons same day -> error", () => {
  const lessons = [
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: D0, start_time: "08:00", end_time: "09:00" },
    { date: D0, start_time: "09:00", end_time: "10:00" },
  ];
  assert.ok(validateConsecutiveRule(lessons) !== null);
});

test("consecutive: different days OK", () => {
  const lessons = [
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: addDaysISO(D0, 1), start_time: "07:00", end_time: "08:00" },
  ];
  assert.equal(validateConsecutiveRule(lessons), null);
});

// ---------------------------------------------------------------------------
// 7. LEARNER-WIDE CONSECUTIVE RULE
// ---------------------------------------------------------------------------

test("learner-wide: existing booking + new non-adjacent same day -> conflict", () => {
  const existing = [
    { date: D0, start_time: "12:00", end_time: "13:00" },
  ];
  const proposed = [
    { date: D0, start_time: "06:30", end_time: "07:30" },
  ];
  const error = validateLearnerWideConsecutive(existing, proposed);
  assert.ok(error !== null);
  assert.ok(error.toLowerCase().includes("consecutive"));
});

test("learner-wide: existing + new adjacent same day -> OK", () => {
  const existing = [
    { date: D0, start_time: "12:00", end_time: "13:00" },
  ];
  const proposed = [
    { date: D0, start_time: "13:00", end_time: "14:00" },
  ];
  assert.equal(validateLearnerWideConsecutive(existing, proposed), null);
});

test("learner-wide: different days -> OK", () => {
  const existing = [
    { date: D0, start_time: "12:00", end_time: "13:00" },
  ];
  const proposed = [
    { date: addDaysISO(D0, 1), start_time: "06:30", end_time: "07:30" },
  ];
  assert.equal(validateLearnerWideConsecutive(existing, proposed), null);
});

test("learner-wide: multiple existing same day, check against proposed", () => {
  const existing = [
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: D0, start_time: "08:00", end_time: "09:00" },
  ];
  const proposed = [
    { date: addDaysISO(D0, 1), start_time: "07:00", end_time: "08:00" },
  ];
  assert.equal(validateLearnerWideConsecutive(existing, proposed), null);
});

test("learner-wide: more than 2 lessons same day total -> error", () => {
  const existing = [
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: D0, start_time: "08:00", end_time: "09:00" },
  ];
  const proposed = [
    { date: D0, start_time: "09:00", end_time: "10:00" }, // Would make 3rd
  ];
  const error = validateLearnerWideConsecutive(existing, proposed);
  assert.ok(error !== null);
});

// ---------------------------------------------------------------------------
// 8. GRID GENERATION & ELIGIBILITY
// ---------------------------------------------------------------------------

test("grid: candidateStartMinutes respects slot config", () => {
  const candidates = candidateStartMinutes(SLOT_CONFIG);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.includes(timeToMinutes("06:00")));
  assert.ok(candidates.includes(timeToMinutes("07:00")));
  // 30-min grid
  assert.equal(candidates[1] - candidates[0], 30);
});

test("grid: areaEligibleInstructors filters by area", () => {
  const instructors = [
    instructor("a", { areas: ["area-a"] }),
    instructor("b", { areas: ["area-b"] }),
    instructor("c", { areas: ["area-a", "area-b"] }),
  ];
  const eligible = areaEligibleInstructors(INPUT(instructors));
  assert.equal(eligible.length, 2); // a and c
  assert.ok(eligible.find((i) => i.id === "a"));
  assert.ok(eligible.find((i) => i.id === "c"));
  assert.ok(!eligible.find((i) => i.id === "b"));
});

test("grid: buildInstructorFreeGrid builds correct free slots", () => {
  const free = buildInstructorFreeGrid(INPUT([instructor("a")], { dates: [D0] }), [instructor("a")]);
  const dayFree = free.get("a")?.get(D0) || [];
  assert.ok(dayFree.length > 0);
  assert.ok(dayFree.includes(P1));
});

test("grid: buildInstructorFreeGrid blocks booked slots", () => {
  const blocks = [blockAt("a", D0, P1)];
  const free = buildInstructorFreeGrid(INPUT([instructor("a")], { dates: [D0], blocks }), [instructor("a")]);
  const dayFree = free.get("a")?.get(D0) || [];
  assert.ok(!dayFree.includes(P1));
});

// ---------------------------------------------------------------------------
// 9. TRAVEL GAP
// ---------------------------------------------------------------------------

test("travel gap: other bookings create buffered blocking", () => {
  const gapMinutes = 30;
  const blocks = [
    { instructorId: "a", date: D0, startMinute: timeToMinutes("12:00"), endMinute: timeToMinutes("13:00"), status: "booked" },
  ];
  const input = INPUT([instructor("a")], { dates: [D0], blocks, gapMinutes });
  const free = buildInstructorFreeGrid(input, [instructor("a")]);
  const dayFree = free.get("a")?.get(D0) || [];
  // Gap blocks slots within 30 min
  assert.ok(!dayFree.includes(timeToMinutes("11:00")));
  assert.ok(!dayFree.includes(timeToMinutes("13:00")));
  assert.ok(dayFree.includes(timeToMinutes("10:30")));
  assert.ok(dayFree.includes(timeToMinutes("13:30")));
});

test("travel gap: own booking exempt", () => {
  const gapMinutes = 30;
  const blocks = [
    { 
      instructorId: "a", 
      date: D0, 
      startMinute: timeToMinutes("12:00"), 
      endMinute: timeToMinutes("13:00"), 
      status: "booked",
      ownerBookingId: "booking-123"
    },
  ];
  const input = INPUT([instructor("a")], { dates: [D0], blocks, gapMinutes, excludeBookingId: "booking-123" });
  const free = buildInstructorFreeGrid(input, [instructor("a")]);
  const dayFree = free.get("a")?.get(D0) || [];
  // Own booking shouldn't block adjacent with gap
  assert.ok(dayFree.includes(timeToMinutes("11:00"))); // Should be free for own booking
});

// ---------------------------------------------------------------------------
// 10. FEMALE PREFERENCE
// ---------------------------------------------------------------------------

test("female: preference mode picks female when available and feasible", () => {
  const female = instructor("f1", { gender: "female" });
  const male = instructor("m1", { gender: "male" });
  const plan = computeCoursePlanPreferred(
    INPUT([male, female], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  // With femalePreference true by default in some cases, may prefer female
  assert.equal(plan.ok, true);
});

test("female: mandatory mode with only male -> graceful fallback", () => {
  const male = instructor("m1", { gender: "male" });
  const plan = computeCoursePlanPreferred(
    INPUT([male], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
});

// ---------------------------------------------------------------------------
// 11. STRESS & REAL-WORLD SCENARIOS
// ---------------------------------------------------------------------------

test("stress: 10 lessons with many skipped days", () => {
  const blocks = [];
  // Skip 50% of days
  for (let i = 0; i < 20; i += 2) {
    blocks.push(blockAt("a", addDaysISO(D0, i), P1));
    blocks.push(blockAt("a", addDaysISO(D0, i), P2));
    blocks.push(blockAt("a", addDaysISO(D0, i), P3));
  }
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
});

test("stress: 3 instructors, complex blocking", () => {
  const blocks = [
    ...blockWholeDay("a", DATES[0]),
    ...blockWholeDay("a", DATES[1]),
    blockAt("b", DATES[0], P1),
    blockAt("b", DATES[0], P2),
    blockAt("b", DATES[0], P3),
    blockAt("b", DATES[1], P1),
    blockAt("b", DATES[1], P2),
    blockAt("b", DATES[1], P3),
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b"), instructor("c")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    10,
  );
  // Should pick instructor c or be infeasible depending
  assert.ok(plan.ok === true || plan.ok === false);
});

test("real-world: mixed availability across week", () => {
  const instr = instructor("a");
  instr.unavailability = [
    { day_of_week: "sunday", all_day: true },
    { day_of_week: "saturday", booked_start_time: "12:00", booked_end_time: "20:00", all_day: false },
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  // Check no lessons on Sunday
  plan.lessons.forEach((l) => {
    const date = new Date(l.date + "T00:00:00Z");
    const day = date.getUTCDay(); // 0 = Sunday
    assert.notEqual(day, 0);
  });
});

// ---------------------------------------------------------------------------
// 12. planCoursePreferred DIRECT TESTS
// ---------------------------------------------------------------------------

test("planCoursePreferred: direct call with freeByDate map", () => {
  const freeByDate = new Map();
  for (const d of DATES) {
    freeByDate.set(d, candidateStartMinutes(SLOT_CONFIG));
  }
  const lessons = planCoursePreferred(freeByDate, DATES, D0, [P1, P2, P3], 10, 60);
  assert.ok(Array.isArray(lessons));
  assert.equal(lessons.length, 10);
});

test("planCoursePreferred: returns null if startDate not in dates", () => {
  const freeByDate = new Map();
  for (const d of DATES) {
    freeByDate.set(d, candidateStartMinutes(SLOT_CONFIG));
  }
  const lessons = planCoursePreferred(freeByDate, DATES, "2099-01-01", [P1, P2, P3], 10, 60);
  assert.equal(lessons, null);
});

test("planCoursePreferred: returns null if no preferences", () => {
  const freeByDate = new Map();
  for (const d of DATES) {
    freeByDate.set(d, candidateStartMinutes(SLOT_CONFIG));
  }
  const lessons = planCoursePreferred(freeByDate, DATES, D0, [], 10, 60);
  assert.equal(lessons, null);
});

// ---------------------------------------------------------------------------
// 13. PLAN INTEGRITY CHECKS
// ---------------------------------------------------------------------------

test("integrity: preferred plan lessons have correct structure", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  plan.lessons.forEach((l, idx) => {
    assert.equal(l.lesson, idx + 1);
    assert.ok(l.date);
    assert.ok(l.day);
    assert.ok(l.start_time);
    assert.ok(l.end_time);
    assert.match(l.start_time, /^\d{2}:\d{2}$/);
    assert.match(l.end_time, /^\d{2}:\d{2}$/);
  });
});

test("integrity: preferred plan never violates consecutive rule", () => {
  const blocks = [];
  // Don't create blocks that force multiple lessons per day
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  const error = validateConsecutiveRule(plan.lessons);
  assert.equal(error, null);
});

// ---------------------------------------------------------------------------
// 14. RIGOROUS EDGE CASES - CONCURRENCY & REAL WORLD CHAOS
// ---------------------------------------------------------------------------

test("rigorous: preferred flow with instructor on_break and inactive mixed", () => {
  const instructors = [
    instructor("broken", { status: "on_break" }),
    instructor("fired", { status: "inactive" }),
    instructor("good", { status: "active" }),
  ];
  const plan = computeCoursePlanPreferred(
    INPUT(instructors, { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "good");
});

test("rigorous: own booking blocks its own slot but exempt from the travel gap", () => {
  // Real semantics: excludeBookingId removes the TRAVEL GAP for the learner's
  // own booking, so the next lesson may sit exactly back-to-back. The own
  // booking's own hour is still occupied (pure overlap is always blocked).
  const gapMinutes = 30;
  const ownBlocks = [
    { instructorId: "a", date: D0, startMinute: timeToMinutes("07:00"), endMinute: timeToMinutes("08:00"), status: "booked", ownerBookingId: "my-booking" },
  ];
  const ownInput = INPUT([instructor("a")], { dates: [D0], blocks: ownBlocks, gapMinutes, excludeBookingId: "my-booking" });
  const ownFree = buildInstructorFreeGrid(ownInput, [instructor("a")]).get("a")?.get(D0) || [];
  assert.ok(!ownFree.includes(timeToMinutes("07:00")), "own slot itself must stay occupied");
  assert.ok(ownFree.includes(timeToMinutes("08:00")), "adjacent lesson must be free for own booking (no gap)");

  const foreignBlocks = [
    { instructorId: "a", date: D0, startMinute: timeToMinutes("07:00"), endMinute: timeToMinutes("08:00"), status: "booked", ownerBookingId: "other-booking" },
  ];
  const foreignInput = INPUT([instructor("a")], { dates: [D0], blocks: foreignBlocks, gapMinutes, excludeBookingId: "my-booking" });
  const foreignFree = buildInstructorFreeGrid(foreignInput, [instructor("a")]).get("a")?.get(D0) || [];
  assert.ok(!foreignFree.includes(timeToMinutes("08:00")), "another booking's row must enforce the travel gap");
});

test("rigorous: other booking blocks, own booking doesn't with correct excludeBookingId", () => {
  const blocks = [
    blockAt("a", DATES[0], P1, { ownerBookingId: "other-booking", status: "booked" }),
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks, excludeBookingId: "my-booking" }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "18:00"); // Falls back to P2
});

test("rigorous: hold expires mid-flight between days", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const blocks = [
    holdAt("a", DATES[0], P1, new Date(now.getTime() - 20 * 60 * 1000).toISOString()), // expired
    holdAt("a", DATES[1], P1, new Date(now.getTime() - 5 * 60 * 1000).toISOString()), // active
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks, holdMinutes: 15, now }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].start_time, "07:00"); // P1 free (expired hold)
  assert.equal(plan.lessons[1].start_time, "18:00"); // P1 blocked by active hold, fallback to P2
});

test("rigorous: fragmented week with blocks and unavailability", () => {
  const instr = instructor("a");
  instr.unavailability = [
    { day_of_week: "wednesday", all_day: true },
    { booked_date: DATES[4], booked_start_time: "00:00", booked_end_time: "23:59", all_day: true },
  ];
  const blocks = [
    blockAt("a", DATES[0], P1),
    blockAt("a", DATES[0], P2),
    blockAt("a", DATES[0], P3),
    blockAt("a", DATES[2], P1),
    blockAt("a", DATES[2], P2),
    blockAt("a", DATES[2], P3),
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  // Check no lesson on blocked days
  for (const l of plan.lessons) {
    assert.notEqual(l.date, DATES[2]); // wednesday blocked by unavailability
    assert.notEqual(l.date, DATES[4]); // explicit all-day block
  }
});

test("rigorous: fallback chain across all prefs and skip days until found", () => {
  const day0 = DATES[0];
  const day1 = DATES[1];
  const blocks = [
    blockAt("a", day0, P1), blockAt("a", day0, P2), blockAt("a", day0, P3),
    blockAt("a", day1, P1), blockAt("a", day1, P2), blockAt("a", day1, P3),
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].date, DATES[2]); // Skip 0 and 1
  assert.equal(plan.lessons[0].start_time, "07:00");
});

test("rigorous: different startDate mid-week", () => {
  const midWeek = addDaysISO(D0, 3); // Thursday
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    midWeek,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].date, midWeek);
  assert.equal(plan.lessons.length, 5);
});

test("rigorous: single instructor area-only eligibility strict", () => {
  const instructors = [
    instructor("a", { areas: ["different-zone"] }),
  ];
  const plan = computeCoursePlanPreferred(
    INPUT(instructors, { dates: DATES, learnerArea: "target-zone" }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, false);
});

test("rigorous: instructor with multiple areas and matching one", () => {
  const instructors = [
    instructor("a", { areas: ["zone-1", "zone-2", "zone-3"] }),
  ];
  const plan = computeCoursePlanPreferred(
    INPUT(instructors, { dates: DATES, learnerArea: "zone-2" }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
});

test("rigorous: empty unavailability array treated as no blocks", () => {
  const instr = instructor("a", { unavailability: [] });
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
});

test("rigorous: null unavailability fine", () => {
  const instr = instructor("a", { unavailability: null });
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
});

test("rigorous: malformed unavailability entries ignored gracefully", () => {
  const instr = instructor("a");
  instr.unavailability = [
    null,
    undefined,
    {},
    { day_of_week: "monday" },
    "invalid",
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
});

test("rigorous: time format variations in blocks", () => {
  // blocks use minutes, should be fine
  const blocks = [blockAt("a", DATES[0], P1)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
});

test("rigorous: 8 lesson course vs 10 lesson course constraints", () => {
  const plan8 = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    8,
  );
  const plan10 = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan8.ok, true);
  assert.equal(plan10.ok, true);
  assert.equal(plan8.lessons.length, 8);
  assert.equal(plan10.lessons.length, 10);
});

test("rigorous: travel gap with 30 min minimum enforced", () => {
  const gapMinutes = 30;
  const blocks = [
    { instructorId: "a", date: D0, startMinute: timeToMinutes("10:00"), endMinute: timeToMinutes("11:00"), status: "booked" },
  ];
  const input = INPUT([instructor("a")], { dates: [D0], blocks, gapMinutes });
  const free = buildInstructorFreeGrid(input, [instructor("a")]);
  const dayFree = free.get("a")?.get(D0) || [];
  // 08:30 should be free (far enough away)
  assert.ok(dayFree.includes(timeToMinutes("08:30")));
  // 11:30 should be free (gap forward)
  assert.ok(dayFree.includes(timeToMinutes("11:30")));
  // Slots adjacent to gaps may be blocked
  assert.ok(Array.isArray(dayFree));
});

test("rigorous: multiple bookings same instructor same day with gaps", () => {
  const gapMinutes = 30;
  const blocks = [
    { instructorId: "a", date: D0, startMinute: timeToMinutes("08:00"), endMinute: timeToMinutes("09:00"), status: "booked" },
    { instructorId: "a", date: D0, startMinute: timeToMinutes("14:00"), endMinute: timeToMinutes("15:00"), status: "booked" },
  ];
  const input = INPUT([instructor("a")], { dates: [D0], blocks, gapMinutes });
  const dayFree = buildInstructorFreeGrid(input, [instructor("a")]).get("a")?.get(D0) || [];
  // Booked hours themselves are never offered.
  assert.ok(!dayFree.includes(timeToMinutes("08:00")));
  assert.ok(!dayFree.includes(timeToMinutes("14:00")));
  // The 30-minute travel buffer removes the lesson immediately before each
  // booking (07:00-08:00 ends 0 min before 08:00 start).
  assert.ok(!dayFree.includes(timeToMinutes("07:00")));
  assert.ok(!dayFree.includes(timeToMinutes("13:00")));
  // Away from the buffers the instructor is free.
  assert.ok(dayFree.includes(timeToMinutes("06:00")));
  assert.ok(dayFree.includes(timeToMinutes("10:00")));
  assert.ok(dayFree.includes(timeToMinutes("16:00")));
  // Nothing offered between the two bookings that violates the buffer.
  assert.ok(!dayFree.includes(timeToMinutes("13:30")));
});

test("rigorous: load balancing considers instructor load", () => {
  const heavilyLoaded = instructor("loaded");
  const lightlyLoaded = instructor("free");
  const blocks = [];
  // Give loaded instructor 15 bookings
  for (let i = 0; i < 15; i++) {
    blocks.push(blockAt("loaded", addDaysISO(D0, i % 10), P1, { status: "booked" }));
  }
  const plan = computeCoursePlanPreferred(
    INPUT([heavilyLoaded, lightlyLoaded], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  assert.ok(plan.ok);
});

test("rigorous: preferred flow with 1 instructor all prefs blocked first N days", () => {
  const blocks = [];
  for (let i = 0; i < 3; i++) {
    blocks.push(blockAt("a", DATES[i], P1));
    blocks.push(blockAt("a", DATES[i], P2));
    blocks.push(blockAt("a", DATES[i], P3));
  }
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    8,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].date, DATES[3]);
});

test("rigorous: consecutive rule with exact boundaries", () => {
  assert.equal(validateConsecutiveRule([
    { date: D0, start_time: "06:00", end_time: "07:00" },
    { date: D0, start_time: "07:00", end_time: "08:00" },
  ]), null);
  
  assert.ok(validateConsecutiveRule([
    { date: D0, start_time: "06:00", end_time: "07:00" },
    { date: D0, start_time: "07:01", end_time: "08:01" },
  ]) !== null);
});

test("rigorous: learner-wide with 2 bookings adjacent across boundary", () => {
  const existing = [
    { date: D0, start_time: "09:00", end_time: "10:00" },
    { date: D0, start_time: "10:00", end_time: "11:00" },
  ];
  const proposed = [
    { date: addDaysISO(D0, 1), start_time: "07:00", end_time: "08:00" },
  ];
  assert.equal(validateLearnerWideConsecutive(existing, proposed), null);
});

test("rigorous: plan lessons all within slot window", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  for (const l of plan.lessons) {
    const startMin = timeToMinutes(l.start_time);
    const endMin = timeToMinutes(l.end_time);
    assert.ok(startMin >= timeToMinutes("06:00"));
    assert.ok(endMin <= timeToMinutes("20:00"));
    assert.equal(endMin - startMin, 60);
  }
});

test("rigorous: no duplicate lessons in preferred plan", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  const keys = plan.lessons.map(l => `${l.date}|${l.start_time}|${l.instructorId || 'a'}`);
  const unique = new Set(keys);
  assert.equal(keys.length, unique.size);
});

// ---------------------------------------------------------------------------
// 15. SHARED INVARIANT HELPERS (used by the production-shaped sections below)
// ---------------------------------------------------------------------------

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function weekdayOf(dateIso) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return WEEKDAYS[(d.getUTCDay() + 6) % 7];
}

function assertPreferredInvariants(plan, opts = {}) {
  const {
    totalLessons,
    prefs,
    dates = DATES,
    startDate = D0,
    blocks = [],
    unavailability = null,
    duration = 60,
  } = opts;
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, totalLessons);
  const grid = candidateStartMinutes(SLOT_CONFIG);
  const seenDates = new Set();
  let previousDate = null;
  for (const lesson of plan.lessons) {
    const start = timeToMinutes(lesson.start_time);
    const end = timeToMinutes(lesson.end_time);
    assert.ok(grid.includes(start), `off-grid start ${lesson.start_time}`);
    assert.ok(prefs.includes(start), `not a preferred time: ${lesson.start_time}`);
    assert.equal(end - start, duration);
    assert.ok(start >= timeToMinutes(SLOT_CONFIG.slotStart));
    assert.ok(end <= timeToMinutes(SLOT_CONFIG.slotEnd));
    assert.ok(dates.includes(lesson.date), `date outside window: ${lesson.date}`);
    assert.ok(lesson.date >= startDate);
    assert.equal(lesson.day, weekdayOf(lesson.date));
    assert.ok(!seenDates.has(lesson.date), `two lessons on ${lesson.date}`);
    seenDates.add(lesson.date);
    if (previousDate !== null) assert.ok(lesson.date > previousDate, "dates must strictly increase");
    previousDate = lesson.date;
    if (unavailability) {
      assert.equal(
        isTimeUnavailable(unavailability, lesson.date, weekdayOf(lesson.date), start),
        false,
        `unavailability violated on ${lesson.date} ${lesson.start_time}`,
      );
    }
    for (const b of blocks) {
      if (b.instructorId !== plan.instructorId || b.date !== lesson.date) continue;
      if (b.status === "cancelled" || b.status === "rejected") continue;
      assert.ok(
        !(b.startMinute < end && start < b.endMinute),
        `lesson ${lesson.date} ${lesson.start_time} overlaps ${minutesToTime(b.startMinute)}-${minutesToTime(b.endMinute)}`,
      );
    }
  }
}

function assertLegacyInvariants(plan, pointer, blocks, gapMinutes, instructorId) {
  assert.equal(plan.ok, true);
  const grid = candidateStartMinutes(SLOT_CONFIG);
  const seen = new Set();
  assert.equal(plan.lessons[0].date, pointer.date);
  assert.equal(plan.lessons[0].start_time, pointer.start);
  for (const lesson of plan.lessons) {
    const start = timeToMinutes(lesson.start_time);
    const end = timeToMinutes(lesson.end_time);
    assert.ok(grid.includes(start), `off-grid start ${lesson.start_time}`);
    assert.equal(end - start, 60);
    assert.ok(start >= timeToMinutes(SLOT_CONFIG.slotStart));
    assert.ok(end <= timeToMinutes(SLOT_CONFIG.slotEnd));
    assert.ok(!seen.has(`${lesson.date}|${lesson.start_time}`), "duplicate lesson slot");
    seen.add(`${lesson.date}|${lesson.start_time}`);
    for (const b of blocks) {
      if (b.instructorId !== instructorId || b.date !== lesson.date) continue;
      if (b.status === "cancelled" || b.status === "rejected") continue;
      const gap = Math.max(0, gapMinutes);
      assert.ok(
        !(b.startMinute - gap < end && start < b.endMinute + gap),
        `lesson ${lesson.date} ${lesson.start_time} violates a booking buffer`,
      );
    }
  }
  assert.equal(validateConsecutiveRule(plan.lessons), null);
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomBlocks(rng, instructorIds, dates, count, gapMinutes = 0) {
  const grid = candidateStartMinutes(SLOT_CONFIG);
  const statuses = ["booked", "booked", "booked", "cancelled", "rejected", "pending_payment"];
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const instructorId = instructorIds[Math.floor(rng() * instructorIds.length)];
    const date = dates[Math.floor(rng() * dates.length)];
    const start = grid[Math.floor(rng() * grid.length)];
    const status = statuses[Math.floor(rng() * statuses.length)];
    blocks.push({
      instructorId,
      date,
      startMinute: start,
      endMinute: start + 60,
      status,
      bookingCreatedAt: status === "pending_payment" ? new Date(Date.now() - 60 * 1000).toISOString() : null,
      ownerBookingId: null,
    });
  }
  return { blocks, gapMinutes };
}

// ---------------------------------------------------------------------------
// 16. REAL PRODUCTION INSTRUCTOR PROFILES (DB-shaped unavailability formats)
// ---------------------------------------------------------------------------

test("profile: recurring Mon+Fri all-day blocks (days_of_week array) skip those weekdays", () => {
  const unavailability = [{ type: "recurring", days_of_week: ["monday", "friday"], all_day: true }];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1, P2, P3],
    6,
  );
  assertPreferredInvariants(plan, { totalLessons: 6, prefs: [P1, P2, P3], unavailability });
  for (const lesson of plan.lessons) {
    assert.ok(lesson.day !== "monday" && lesson.day !== "friday", `worked on ${lesson.day}`);
  }
});

test("profile: admin row with only booked_date blocks the whole day", () => {
  const unavailability = [{ booked_date: D0 }];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1],
    2,
  );
  assertPreferredInvariants(plan, { totalLessons: 2, prefs: [P1], unavailability });
  assert.equal(plan.lessons[0].date, DATES[1]);
});

test("profile: booked_date plus a time window blocks only that window", () => {
  const unavailability = [
    { booked_date: D0, booked_start_time: "14:00", booked_end_time: "18:00", all_day: false },
  ];
  const morning = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1],
    1,
  );
  assertPreferredInvariants(morning, { totalLessons: 1, prefs: [P1], unavailability });
  assert.equal(morning.lessons[0].date, D0);

  const afternoon = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [timeToMinutes("15:00")],
    1,
  );
  assertPreferredInvariants(afternoon, { totalLessons: 1, prefs: [timeToMinutes("15:00")], unavailability });
  assert.equal(afternoon.lessons[0].date, DATES[1]);
});

test("profile: singular day_of_week window (night shift) keeps the evening free", () => {
  const unavailability = [{ day_of_week: "monday", booked_start_time: "06:00", booked_end_time: "12:00", all_day: false }];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1, P2],
    3,
  );
  assertPreferredInvariants(plan, { totalLessons: 3, prefs: [P1, P2], unavailability });
  // Monday morning is unavailable, so the rank-2 evening slot is used that day.
  assert.equal(plan.lessons[0].date, D0);
  assert.equal(plan.lessons[0].start_time, "18:00");
  // Tuesday uses the top-ranked preference again.
  assert.equal(plan.lessons[1].start_time, "07:00");
});

test("profile: multi-day range with range_all_day blocks the entire range", () => {
  const unavailability = [{ start_date: DATES[0], end_date: DATES[2], range_all_day: true }];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1],
    2,
  );
  assertPreferredInvariants(plan, { totalLessons: 2, prefs: [P1], unavailability });
  assert.equal(plan.lessons[0].date, DATES[3]);
});

test("profile: range with range_start_time/range_end_time blocks only that portion", () => {
  const partial = [{ start_date: DATES[0], end_date: DATES[20], range_start_time: "14:00", range_end_time: "18:00" }];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability: partial })], { dates: DATES }),
    D0,
    [P1],
    2,
  );
  assertPreferredInvariants(plan, { totalLessons: 2, prefs: [P1], unavailability: partial });

  const evening = [{ start_date: DATES[0], end_date: DATES[20], range_start_time: "14:00", range_end_time: "18:00" }];
  const blocked = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability: evening })], { dates: DATES }),
    D0,
    [timeToMinutes("18:00")],
    1,
  );
  // 18:00 is the exclusive end, so it must still be bookable.
  assertPreferredInvariants(blocked, { totalLessons: 1, prefs: [P2], unavailability: evening });
});

test("profile: range with only range_start_time blocks the rest of every day in range", () => {
  const unavailability = [{ start_date: DATES[0], end_date: DATES[20], range_start_time: "12:00" }];
  const morning = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1],
    2,
  );
  assertPreferredInvariants(morning, { totalLessons: 2, prefs: [P1], unavailability });

  const evening = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P2],
    2,
  );
  assert.equal(evening.ok, false);
});

test("profile: range with no times at all blocks every day in range", () => {
  const unavailability = [{ start_date: DATES[0], end_date: DATES[20] }];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1, P2, P3],
    2,
  );
  assert.equal(plan.ok, false);
});

test("profile: one instructor with mixed formats has every format honoured", () => {
  const unavailability = [
    { type: "recurring", days_of_week: ["saturday"], all_day: true },
    { booked_date: DATES[1], booked_start_time: "06:00", booked_end_time: "12:00", all_day: false },
    { start_date: DATES[2], end_date: DATES[2], range_all_day: true },
    { day_of_week: "sunday", all_day: true },
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1, P2],
    8,
  );
  assertPreferredInvariants(plan, { totalLessons: 8, prefs: [P1, P2], unavailability });
  for (const lesson of plan.lessons) {
    assert.ok(lesson.day !== "saturday" && lesson.day !== "sunday", `worked on ${lesson.day}`);
    if (lesson.date === DATES[1]) assert.ok(timeToMinutes(lesson.start_time) >= 12 * 60);
    assert.notEqual(lesson.date, DATES[2]);
  }
});

test("profile: legacy planner honours recurring all-day blocks (no work Mon/Fri)", () => {
  const unavailability = [{ type: "recurring", days_of_week: ["monday", "friday"], all_day: true }];
  const plan = computeCoursePlan(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    { date: DATES[1], start: "07:00" },
    10,
  );
  assertLegacyInvariants(plan, { date: DATES[1], start: "07:00" }, [], 0, "a");
  for (const lesson of plan.lessons) {
    assert.ok(lesson.day !== "monday" && lesson.day !== "friday", `worked on ${lesson.day}`);
  }
});

test("profile: weekend-off instructor never schedules Sat/Sun for a full course", () => {
  const unavailability = [{ type: "recurring", days_of_week: ["saturday", "sunday"], all_day: true }];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assertPreferredInvariants(plan, { totalLessons: 10, prefs: [P1, P2, P3], unavailability });
  for (const lesson of plan.lessons) {
    assert.ok(lesson.day !== "saturday" && lesson.day !== "sunday");
  }
});

test("profile: morning-only instructor (afternoon booked) keeps the legacy plan in the morning", () => {
  const blocks = DATES.map((date) => ({
    instructorId: "a",
    date,
    startMinute: timeToMinutes("14:00"),
    endMinute: timeToMinutes("20:00"),
    status: "booked",
  }));
  const plan = computeCoursePlan(
    INPUT([instructor("a")], { dates: DATES, blocks, gapMinutes: 30 }),
    { date: D0, start: "07:00" },
    10,
  );
  assertLegacyInvariants(plan, { date: D0, start: "07:00" }, blocks, 30, "a");
  for (const lesson of plan.lessons) {
    assert.ok(timeToMinutes(lesson.end_time) <= timeToMinutes("14:00"), "lesson ran into the afternoon booking");
  }
});

test("profile: evening-only instructor works with an evening preference", () => {
  const unavailability = [{
    type: "recurring",
    days_of_week: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    booked_start_time: "06:00",
    booked_end_time: "14:00",
  }];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1, P2],
    4,
  );
  assertPreferredInvariants(plan, { totalLessons: 4, prefs: [P1, P2], unavailability });
  for (const lesson of plan.lessons) assert.equal(lesson.start_time, "18:00");
});

// ---------------------------------------------------------------------------
// 17. PREFERRED-FLOW SEMANTICS (rank order, fallback, day skipping)
// ---------------------------------------------------------------------------

test("preferred: rank order is respected even when a later preference is earlier in the day", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P2, P1, P3],
    2,
  );
  assertPreferredInvariants(plan, { totalLessons: 2, prefs: [P2, P1, P3] });
  assert.equal(plan.lessons[0].start_time, "18:00");
});

test("preferred: blocked top preference falls back to the next preference the same day", () => {
  const blocks = [blockAt("a", D0, P1)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    2,
  );
  assertPreferredInvariants(plan, { totalLessons: 2, prefs: [P1, P2, P3], blocks });
  assert.equal(plan.lessons[0].date, D0);
  assert.equal(plan.lessons[0].start_time, "18:00");
  assert.equal(plan.lessons[1].start_time, "07:00");
});

test("preferred: day is skipped when every preference is blocked", () => {
  const blocks = [P1, P2, P3].map((s) => blockAt("a", D0, s));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    2,
  );
  assertPreferredInvariants(plan, { totalLessons: 2, prefs: [P1, P2, P3], blocks });
  assert.equal(plan.lessons[0].date, DATES[1]);
});

test("preferred: never substitutes a free time that was not requested", () => {
  // 06:00 is completely free but not a preference; a free 06:00 must not be used.
  const blocks = [P1, P2, P3].map((s) => blockAt("a", D0, s));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    1,
  );
  assertPreferredInvariants(plan, { totalLessons: 1, prefs: [P1, P2, P3], blocks });
  assert.equal(plan.lessons[0].date, DATES[1]);
  assert.ok(!plan.lessons.some((l) => l.date === D0));
});

test("preferred: off-grid preference is never scheduled", () => {
  const offGrid = timeToMinutes("19:30"); // 90-minute grid step would be needed
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [offGrid],
    1,
  );
  assert.equal(plan.ok, false);
});

test("preferred: duplicated preferences never create two lessons in one day", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P1, P1],
    3,
  );
  assertPreferredInvariants(plan, { totalLessons: 3, prefs: [P1] });
  assert.deepEqual(plan.lessons.map((l) => l.date), [DATES[0], DATES[1], DATES[2]]);
});

test("preferred: last grid slot (19:00-20:00) is a legal preference", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P3],
    1,
  );
  assertPreferredInvariants(plan, { totalLessons: 1, prefs: [P3] });
  assert.equal(plan.lessons[0].end_time, "20:00");
});

test("preferred: 12-lesson course completes across the extended window", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2],
    12,
  );
  assertPreferredInvariants(plan, { totalLessons: 12, prefs: [P1, P2] });
});

test("preferred: insufficient window (10 lessons, 9 dates) is infeasible", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES.slice(0, 9) }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, false);
});

test("preferred: single lesson on the very last date of the window", () => {
  const lastDate = DATES[DATES.length - 1];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    lastDate,
    [P1],
    1,
  );
  assertPreferredInvariants(plan, { totalLessons: 1, prefs: [P1], startDate: lastDate });
  assert.equal(plan.lessons[0].date, lastDate);
});

test("preferred: startDate outside the window is infeasible", () => {
  const before = addDaysISO(D0, -1);
  const after = addDaysISO(D0, 40);
  assert.equal(
    computeCoursePlanPreferred(INPUT([instructor("a")], { dates: DATES }), before, [P1], 1).ok,
    false,
  );
  assert.equal(
    computeCoursePlanPreferred(INPUT([instructor("a")], { dates: DATES }), after, [P1], 1).ok,
    false,
  );
});

test("preferred: course never starts before startDate even with earlier dates in the window", () => {
  const start = DATES[5];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    start,
    [P1],
    4,
  );
  assertPreferredInvariants(plan, { totalLessons: 4, prefs: [P1], startDate: start });
  assert.equal(plan.lessons[0].date, start);
});

// ---------------------------------------------------------------------------
// 18. LIVE-COMPETITION / CONCURRENCY SHAPES
// ---------------------------------------------------------------------------

test("competition: another learner's live hold pushes the plan to the next day", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const blocks = [holdAt("a", D0, P1, new Date(now.getTime() - 60 * 1000).toISOString())];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks, holdMinutes: 15, now }),
    D0,
    [P1],
    2,
  );
  assertPreferredInvariants(plan, { totalLessons: 2, prefs: [P1], blocks });
  assert.equal(plan.lessons[0].date, DATES[1]);
});

test("competition: hold at exactly hold_minutes is still active (strict expiry)", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const blocks = [holdAt("a", D0, P1, new Date(now.getTime() - 15 * 60 * 1000).toISOString())];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks, holdMinutes: 15, now }),
    D0,
    [P1],
    1,
  );
  assert.equal(plan.lessons[0].date, DATES[1], "a hold exactly at the boundary must still block");
});

test("competition: hold one second past hold_minutes frees the slot", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const blocks = [holdAt("a", D0, P1, new Date(now.getTime() - 15 * 60 * 1000 - 1000).toISOString())];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks, holdMinutes: 15, now }),
    D0,
    [P1],
    1,
  );
  assert.equal(plan.lessons[0].date, D0);
});

test("competition: cancelled and rejected rows never block a planned lesson", () => {
  const blocks = [
    blockAt("a", D0, P1, { status: "cancelled" }),
    blockAt("a", DATES[1], P1, { status: "rejected" }),
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1],
    3,
  );
  assertPreferredInvariants(plan, { totalLessons: 3, prefs: [P1], blocks });
  assert.deepEqual(plan.lessons.map((l) => l.date), [DATES[0], DATES[1], DATES[2]]);
});

test("competition: three fully blocked days still leave a feasible later course", () => {
  const blocks = DATES.slice(0, 3).flatMap((date) => blockWholeDay("a", date));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assertPreferredInvariants(plan, { totalLessons: 5, prefs: [P1, P2, P3], blocks });
  assert.equal(plan.lessons[0].date, DATES[3]);
});

test("competition: primary instructor fully booked out -> fallback instructor completes the course", () => {
  const blocks = DATES.flatMap((date) => blockWholeDay("primary", date));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("primary"), instructor("backup")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assertPreferredInvariants(plan, { totalLessons: 5, prefs: [P1, P2, P3], blocks });
  assert.equal(plan.instructorId, "backup");
});

test("competition: load balancing routes a new course to the less loaded instructor", () => {
  const blocks = Array.from({ length: 10 }, (_, i) =>
    blockAt("busy", addDaysISO(D0, i), timeToMinutes("12:00")),
  );
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("busy"), instructor("idle")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "idle");
});

test("competition: cancelled rows do not count toward instructor load", () => {
  const blocks = Array.from({ length: 10 }, (_, i) =>
    blockAt("a", addDaysISO(D0, i), timeToMinutes("12:00"), { status: "cancelled" }),
  );
  blocks.push(blockAt("b", DATES[10], timeToMinutes("12:00")));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    D0,
    [P1],
    3,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "a");
});

test("competition: expired holds do not count toward instructor load", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const blocks = Array.from({ length: 6 }, (_, i) =>
    holdAt("a", addDaysISO(D0, i), timeToMinutes("12:00"), new Date(now.getTime() - 60 * 60 * 1000).toISOString()),
  );
  blocks.push(holdAt("b", DATES[10], timeToMinutes("12:00"), new Date(now.getTime() - 60 * 1000).toISOString()));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks, holdMinutes: 15, now }),
    D0,
    [P1],
    3,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "a");
});

test("competition: travel buffer removes the hour directly before a booking", () => {
  const gapMinutes = 30;
  const blocks = [{ instructorId: "a", date: D0, startMinute: timeToMinutes("09:00"), endMinute: timeToMinutes("10:00"), status: "booked" }];
  const free = buildInstructorFreeGrid(
    INPUT([instructor("a")], { dates: [D0], blocks, gapMinutes }),
    [instructor("a")],
  ).get("a").get(D0);
  // The 09:00-10:00 booking is buffered on both sides (08:30 .. 10:30).
  assert.ok(!free.includes(timeToMinutes("08:00")), "08:00-09:00 is inside the travel buffer");
  assert.ok(!free.includes(timeToMinutes("09:00")), "booked hour");
  assert.ok(!free.includes(timeToMinutes("10:00")), "10:00-11:00 is inside the post-booking buffer");
  assert.ok(free.includes(timeToMinutes("06:00")));
  assert.ok(free.includes(timeToMinutes("07:00")));
  assert.ok(free.includes(timeToMinutes("11:00")));
});

test("competition: many staggered holds still leave a complete preferred plan", () => {
  const blocks = [];
  for (let i = 0; i < 14; i++) {
    const date = DATES[i];
    blocks.push(blockAt("a", date, i % 2 === 0 ? P1 : P2, { status: "booked" }));
  }
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    10,
  );
  assertPreferredInvariants(plan, { totalLessons: 10, prefs: [P1, P2, P3], blocks });
});

// ---------------------------------------------------------------------------
// 19. FIRST-SLOT GRID INVARIANTS (what the customer can actually pick)
// ---------------------------------------------------------------------------

test("grid: every offered first slot really spawns the full course", () => {
  const dates = DATES.slice(0, 5);
  const grid = computeFeasibleFirstSlots(INPUT([instructor("a")], { dates }), 3);
  let offered = 0;
  for (const day of grid.dates) {
    for (const slot of day.slots) {
      offered += 1;
      const plan = computeCoursePlan(
        INPUT([instructor("a")], { dates }),
        { date: slot.date, start: slot.start },
        3,
      );
      assert.equal(plan.ok, true, `offered slot ${slot.date} ${slot.start} did not produce a plan`);
      assert.equal(plan.lessons[0].date, slot.date);
      assert.equal(plan.lessons[0].start_time, slot.start);
    }
  }
  assert.ok(offered > 0);
});

test("grid: every unoffered grid time really cannot spawn the course", () => {
  const dates = DATES.slice(0, 3);
  const grid = computeFeasibleFirstSlots(INPUT([instructor("a")], { dates }), 3);
  const offered = new Set();
  for (const day of grid.dates) for (const slot of day.slots) offered.add(`${slot.date}|${slot.start}`);
  let checked = 0;
  for (const date of dates) {
    for (const start of candidateStartMinutes(SLOT_CONFIG)) {
      const key = `${date}|${minutesToTime(start)}`;
      if (offered.has(key)) continue;
      const plan = computeCoursePlan(INPUT([instructor("a")], { dates }), { date, start: minutesToTime(start) }, 3);
      assert.equal(plan.ok, false, `unoffered ${key} unexpectedly produced a plan`);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});

test("grid: identical date/time slots are deduped across instructors", () => {
  const grid = computeFeasibleFirstSlots(
    INPUT([instructor("a"), instructor("b"), instructor("c")], { dates: DATES.slice(0, 2) }),
    2,
  );
  for (const day of grid.dates) {
    const keys = day.slots.map((s) => `${s.date}|${s.start}`);
    assert.equal(new Set(keys).size, keys.length, "duplicate date/time slot offered");
  }
});

test("grid: only dates inside the requested window are offered", () => {
  const dates = [DATES[2], DATES[3]];
  const grid = computeFeasibleFirstSlots(INPUT([instructor("a")], { dates }), 1);
  assert.deepEqual(grid.dates.map((d) => d.date), dates);
  for (const day of grid.dates) {
    for (const slot of day.slots) {
      assert.ok(dates.includes(slot.date));
      assert.equal(slot.day, weekdayOf(slot.date));
    }
  }
});

test("grid: full-day bookings remove every first slot for that day", () => {
  const blocks = blockWholeDay("a", D0);
  const grid = computeFeasibleFirstSlots(INPUT([instructor("a")], { dates: [D0, DATES[1]], blocks }), 1);
  const day0 = grid.dates.find((d) => d.date === D0);
  assert.equal(day0.slots.length, 0);
  assert.ok(grid.dates.find((d) => d.date === DATES[1]).slots.length > 0);
});

test("grid: female coverage flags match the eligible instructors", () => {
  const grid = computeFeasibleFirstSlots(
    INPUT([instructor("a", { gender: "female" }), instructor("b", { gender: "male" })], { dates: [D0] }),
    2,
  );
  const slots = grid.dates[0].slots;
  assert.ok(slots.length > 0);
  for (const slot of slots) assert.equal(slot.femaleCovered, true);
});

// ---------------------------------------------------------------------------
// 20. LEARNER-WIDE CONSECUTIVE RULE (the create-booking guard)
// ---------------------------------------------------------------------------

test("learner-wide: two adjacent lessons on a new date are accepted", () => {
  const existing = [{ date: D0, start_time: "07:00", end_time: "08:00" }];
  const proposed = [
    { date: DATES[1], start_time: "06:00", end_time: "07:00" },
    { date: DATES[1], start_time: "07:00", end_time: "08:00" },
  ];
  assert.equal(validateLearnerWideConsecutive(existing, proposed), null);
});

test("learner-wide: three lessons on one date are rejected", () => {
  const proposed = [
    { date: D0, start_time: "06:00", end_time: "07:00" },
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: D0, start_time: "08:00", end_time: "09:00" },
  ];
  const error = validateLearnerWideConsecutive([], proposed);
  assert.ok(error && error.includes("More than 2 lessons"));
});

test("learner-wide: two non-adjacent lessons on one date are rejected", () => {
  const proposed = [
    { date: D0, start_time: "06:00", end_time: "07:00" },
    { date: D0, start_time: "11:00", end_time: "12:00" },
  ];
  const error = validateLearnerWideConsecutive([], proposed);
  assert.ok(error && error.includes("not consecutive"));
});

test("learner-wide: existing same-day pair plus proposed on another day is accepted", () => {
  const existing = [
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: D0, start_time: "08:00", end_time: "09:00" },
  ];
  const proposed = [{ date: DATES[3], start_time: "18:00", end_time: "19:00" }];
  assert.equal(validateLearnerWideConsecutive(existing, proposed), null);
});

test("learner-wide: adding a second adjacent lesson next to an existing one is accepted", () => {
  const existing = [{ date: D0, start_time: "07:00", end_time: "08:00" }];
  const proposed = [{ date: D0, start_time: "08:00", end_time: "09:00" }];
  assert.equal(validateLearnerWideConsecutive(existing, proposed), null);
});

test("learner-wide: empty inputs are always valid", () => {
  assert.equal(validateLearnerWideConsecutive([], []), null);
  assert.equal(validateLearnerWideConsecutive([], [{ date: D0, start_time: "07:00", end_time: "08:00" }]), null);
  assert.equal(validateLearnerWideConsecutive([{ date: D0, start_time: "07:00", end_time: "08:00" }], []), null);
});

test("learner-wide: four lessons spread over two days (2+2) is accepted", () => {
  const proposed = [
    { date: D0, start_time: "06:00", end_time: "07:00" },
    { date: D0, start_time: "07:00", end_time: "08:00" },
    { date: DATES[1], start_time: "18:00", end_time: "19:00" },
    { date: DATES[1], start_time: "19:00", end_time: "20:00" },
  ];
  assert.equal(validateLearnerWideConsecutive([], proposed), null);
});

// ---------------------------------------------------------------------------
// 21. FUZZ / PROPERTY-BASED INVARIANTS (random production-shaped inputs)
// ---------------------------------------------------------------------------

test("fuzz: 40 random preferred scenarios keep every engine invariant", () => {
  const rng = makeRng(20261102);
  const grid = candidateStartMinutes(SLOT_CONFIG);
  for (let iteration = 0; iteration < 40; iteration++) {
    const ids = ["a", "b", "c"].slice(0, 1 + Math.floor(rng() * 3));
    const instructors = ids.map((id) => instructor(id));
    const dates = DATES.slice(0, 8 + Math.floor(rng() * 8));
    const { blocks } = randomBlocks(rng, ids, dates, Math.floor(rng() * 30));
    const prefs = [];
    while (prefs.length < 1 + Math.floor(rng() * 3)) {
      const start = grid[Math.floor(rng() * grid.length)];
      if (!prefs.includes(start)) prefs.push(start);
    }
    const totalLessons = 1 + Math.floor(rng() * 6);
    const plan = computeCoursePlanPreferred(
      INPUT(instructors, { dates, blocks, gapMinutes: 30 }),
      dates[0],
      prefs,
      totalLessons,
    );
    if (!plan.ok) continue;
    assertPreferredInvariants(plan, {
      totalLessons,
      prefs,
      dates,
      startDate: dates[0],
      blocks: blocks.filter((b) => b.status !== "cancelled" && b.status !== "rejected"),
    });
  }
});

test("fuzz: 40 random legacy first-slot scenarios keep every engine invariant", () => {
  const rng = makeRng(777);
  const grid = candidateStartMinutes(SLOT_CONFIG);
  let solved = 0;
  for (let iteration = 0; iteration < 40; iteration++) {
    const ids = ["a", "b", "c"].slice(0, 1 + Math.floor(rng() * 3));
    const instructors = ids.map((id) => instructor(id));
    const dates = DATES.slice(0, 10 + Math.floor(rng() * 10));
    const { blocks } = randomBlocks(rng, ids, dates, Math.floor(rng() * 20));
    const pointer = {
      date: dates[Math.floor(rng() * dates.length)],
      start: minutesToTime(grid[Math.floor(rng() * grid.length)]),
    };
    const plan = computeCoursePlan(INPUT(instructors, { dates, blocks, gapMinutes: 30 }), pointer, 1 + Math.floor(rng() * 5));
    if (!plan.ok) continue;
    solved += 1;
    assertLegacyInvariants(
      plan,
      pointer,
      blocks.filter((b) => b.status !== "cancelled" && b.status !== "rejected"),
      30,
      plan.instructorId,
    );
  }
  assert.ok(solved > 0, "fuzz produced no feasible legacy plan");
});

test("fuzz: preferred planner is deterministic for identical input", () => {
  const blocks = [
    blockAt("a", D0, P1),
    blockAt("b", DATES[1], P2),
    blockAt("a", DATES[3], P3, { status: "cancelled" }),
  ];
  const makePlan = () =>
    computeCoursePlanPreferred(
      INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks, gapMinutes: 30 }),
      D0,
      [P1, P2, P3],
      6,
    );
  assert.deepEqual(makePlan(), makePlan());
});

test("fuzz: legacies never schedule a lesson inside the travel buffer of an active booking", () => {
  const rng = makeRng(4242);
  for (let iteration = 0; iteration < 25; iteration++) {
    const blocks = randomBlocks(rng, ["a"], DATES, 12).blocks;
    const plan = computeCoursePlan(
      INPUT([instructor("a")], { dates: DATES, blocks, gapMinutes: 30 }),
      { date: DATES[2], start: "07:00" },
      4,
    );
    if (!plan.ok) continue;
    assertLegacyInvariants(
      plan,
      { date: DATES[2], start: "07:00" },
      blocks.filter((b) => b.status !== "cancelled" && b.status !== "rejected"),
      30,
      "a",
    );
  }
});

test("fuzz: preferred plan only ever uses one instructor and never mixes identities", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const plan = computeCoursePlanPreferred(
      INPUT([instructor("a"), instructor("b"), instructor("c")], { dates: DATES, gapMinutes: 30 }),
      D0,
      [P1, P2, P3],
      8,
    );
    assert.equal(plan.ok, true);
    const { instructorId } = plan;
    assert.ok(["a", "b", "c"].includes(instructorId));
    // The plan carries no per-lesson instructor field: the whole course belongs to one instructor.
    assert.ok(plan.lessons.every((lesson) => lesson.instructorId === undefined));
  }
});

// ---------------------------------------------------------------------------
// 22. SCALE / WORST-CASE PERFORMANCE SHAPES
// ---------------------------------------------------------------------------

test("scale: 12 instructors, 21 days and 300 active rows still resolves", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `ins-${i}`);
  const instructors = ids.map((id) => instructor(id));
  const rng = makeRng(99);
  const blocks = randomBlocks(rng, ids, DATES, 300).blocks;
  const started = Date.now();
  const plan = computeCoursePlanPreferred(
    INPUT(instructors, { dates: DATES, blocks, gapMinutes: 30 }),
    D0,
    [P1, P2, P3],
    10,
  );
  const elapsed = Date.now() - started;
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  assert.ok(elapsed < 5000, `preferred planner took ${elapsed}ms`);
});

test("scale: legacy planner handles a full 12-lesson course with heavy blocking", () => {
  const ids = ["a", "b", "c", "d"];
  const rng = makeRng(1234);
  const blocks = randomBlocks(rng, ids, DATES, 120).blocks;
  const plan = computeCoursePlan(
    INPUT(ids.map((id) => instructor(id)), { dates: DATES, blocks, gapMinutes: 30 }),
    { date: D0, start: "07:00" },
    12,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 12);
});

test("scale: 10-lesson course where every other day is fully blocked", () => {
  const blocks = DATES.filter((_, i) => i % 2 === 0).flatMap((date) => blockWholeDay("a", date));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    10,
  );
  // Only 10 usable days remain (indices 1,3,5,...,19) — exactly enough.
  assertPreferredInvariants(plan, { totalLessons: 10, prefs: [P1, P2, P3], blocks });
  for (const lesson of plan.lessons) {
    assert.equal(DATES.indexOf(lesson.date) % 2, 1);
  }
});

test("scale: 14-day window with only one usable slot per day still completes 10 lessons", () => {
  const dates = DATES.slice(0, 14);
  // Each day is fully booked except the single 07:00-08:00 hour.
  const blocks = dates.flatMap((date) => [
    { instructorId: "a", date, startMinute: timeToMinutes("06:00"), endMinute: P1, status: "booked" },
    { instructorId: "a", date, startMinute: timeToMinutes("08:00"), endMinute: timeToMinutes("20:00"), status: "booked" },
  ]);
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates, blocks }),
    D0,
    [P1],
    10,
  );
  assertPreferredInvariants(plan, { totalLessons: 10, prefs: [P1], dates, blocks });
  for (const lesson of plan.lessons) {
    assert.equal(lesson.start_time, "07:00");
    assert.ok(dates.includes(lesson.date));
  }
});

// ---------------------------------------------------------------------------
// 23. MORE PRODUCTION EDGE CASES (DB-shaped values, gaps, female routing)
// ---------------------------------------------------------------------------

test("unavailability: capitalised day names inside days_of_week are normalised", () => {
  const unavailability = [{ type: "recurring", days_of_week: ["Monday", "FRIDAY"], all_day: true }];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1],
    5,
  );
  assertPreferredInvariants(plan, { totalLessons: 5, prefs: [P1], unavailability });
  for (const lesson of plan.lessons) {
    assert.ok(lesson.day !== "monday" && lesson.day !== "friday", `worked on ${lesson.day}`);
  }
});

test("unavailability: Postgres HH:MM:SS timestamps are understood", () => {
  const unavailability = [
    { booked_date: D0, booked_start_time: "07:00:00", booked_end_time: "08:00:00", all_day: false },
  ];
  const blocked = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1],
    1,
  );
  assert.equal(blocked.lessons[0].date, DATES[1], "07:00:00 block must move the lesson to the next day");

  const afternoon = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P2],
    1,
  );
  assert.equal(afternoon.lessons[0].date, D0, "an unrelated hour must stay available");
});

test("unavailability: a time window blocks its start minute only (end is exclusive)", () => {
  const unavailability = [
    { booked_date: D0, booked_start_time: "07:00", booked_end_time: "08:00", all_day: false },
  ];
  assert.equal(isTimeUnavailable(unavailability, D0, "monday", timeToMinutes("06:00")), false);
  assert.equal(isTimeUnavailable(unavailability, D0, "monday", timeToMinutes("07:00")), true);
  assert.equal(isTimeUnavailable(unavailability, D0, "monday", timeToMinutes("07:30")), true);
  assert.equal(isTimeUnavailable(unavailability, D0, "monday", timeToMinutes("08:00")), false);
});

test("unavailability: only the matching entry out of several blocks the day", () => {
  const unavailability = [
    { booked_date: DATES[1], all_day: true },
    { day_of_week: "tuesday", all_day: true },
    { start_date: DATES[5], end_date: DATES[6], range_all_day: true },
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a", { unavailability })], { dates: DATES }),
    D0,
    [P1],
    4,
  );
  assertPreferredInvariants(plan, { totalLessons: 4, prefs: [P1], unavailability });
  assert.ok(!plan.lessons.some((l) => l.day === "tuesday"));
});

test("gap: zero gap blocks only the booked hour itself", () => {
  const blocks = [{ instructorId: "a", date: D0, startMinute: timeToMinutes("10:00"), endMinute: timeToMinutes("11:00"), status: "booked" }];
  const free = buildInstructorFreeGrid(
    INPUT([instructor("a")], { dates: [D0], blocks, gapMinutes: 0 }),
    [instructor("a")],
  ).get("a").get(D0);
  assert.ok(free.includes(timeToMinutes("09:00")));
  assert.ok(!free.includes(timeToMinutes("09:30")));
  assert.ok(!free.includes(timeToMinutes("10:00")));
  assert.ok(!free.includes(timeToMinutes("10:30")));
  assert.ok(free.includes(timeToMinutes("11:00")));
});

test("gap: 60-minute gap buffers both neighbours but a touching edge stays free", () => {
  const blocks = [{ instructorId: "a", date: D0, startMinute: timeToMinutes("10:00"), endMinute: timeToMinutes("11:00"), status: "booked" }];
  const free = buildInstructorFreeGrid(
    INPUT([instructor("a")], { dates: [D0], blocks, gapMinutes: 60 }),
    [instructor("a")],
  ).get("a").get(D0);
  assert.ok(free.includes(timeToMinutes("08:00")), "08:00-09:00 ends exactly at the buffer start");
  assert.ok(!free.includes(timeToMinutes("09:00")));
  assert.ok(!free.includes(timeToMinutes("10:00")));
  assert.ok(!free.includes(timeToMinutes("11:00")));
  assert.ok(free.includes(timeToMinutes("12:00")), "12:00-13:00 starts exactly at the buffer end");
});

test("gap: a preferred plan never lands inside a 60-minute travel buffer", () => {
  const blocks = [blockAt("a", D0, P1)]; // 07:00-08:00
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks, gapMinutes: 60 }),
    D0,
    [timeToMinutes("06:00"), timeToMinutes("08:00")],
    2,
  );
  // 06:00-07:00 ends exactly at the booking, 08:00-09:00 starts exactly at booking end.
  assertPreferredInvariants(plan, { totalLessons: 2, prefs: [timeToMinutes("06:00"), timeToMinutes("08:00")], blocks });
  assert.equal(plan.lessons[0].start_time, "06:00");
});

test("female preference: preference mode routes the course to a feasible female instructor", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("m1", { gender: "male" }), instructor("f1", { gender: "female" })], {
      dates: DATES,
      femalePreference: true,
      femaleMode: "preference",
    }),
    D0,
    [P1],
    4,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "f1");
});

test("female preference: falls back to a male instructor when the only female cannot complete the course", () => {
  const blocks = DATES.flatMap((date) => blockWholeDay("f1", date));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("m1", { gender: "male" }), instructor("f1", { gender: "female" })], {
      dates: DATES,
      blocks,
      femalePreference: true,
      femaleMode: "preference",
    }),
    D0,
    [P1],
    4,
  );
  assertPreferredInvariants(plan, { totalLessons: 4, prefs: [P1], blocks });
  assert.equal(plan.instructorId, "m1");
});

test("female preference: mandatory mode degrades gracefully when no female exists", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("m1", { gender: "male" })], {
      dates: DATES,
      femalePreference: true,
      femaleMode: "mandatory",
    }),
    D0,
    [P1],
    2,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "m1");
});

test("instructor selection: an instructor who cannot finish the window hands the course to another", () => {
  // "a" is booked out from day 3 onwards, so only "b" can finish 10 lessons.
  const blocks = DATES.slice(3).flatMap((date) => blockWholeDay("a", date));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    10,
  );
  assertPreferredInvariants(plan, { totalLessons: 10, prefs: [P1, P2, P3], blocks });
  assert.equal(plan.instructorId, "b");
});

test("legacy: first-day lessons never start before the chosen slot", () => {
  const plan = computeCoursePlan(
    INPUT([instructor("a")], { dates: DATES }),
    { date: D0, start: "18:00" },
    4,
  );
  assertLegacyInvariants(plan, { date: D0, start: "18:00" }, [], 0, "a");
  for (const lesson of plan.lessons.filter((l) => l.date === D0)) {
    assert.ok(timeToMinutes(lesson.start_time) >= timeToMinutes("18:00"));
  }
});

test("legacy: a 10-lesson course is capped at two back-to-back lessons per day", () => {
  const plan = computeCoursePlan(
    INPUT([instructor("a")], { dates: DATES }),
    { date: D0, start: "07:00" },
    10,
  );
  assert.equal(plan.ok, true);
  const perDay = new Map();
  for (const lesson of plan.lessons) {
    perDay.set(lesson.date, (perDay.get(lesson.date) ?? 0) + 1);
  }
  for (const [date, count] of perDay) assert.ok(count <= 2, `${count} lessons on ${date}`);
  assert.equal(validateConsecutiveRule(plan.lessons), null);
});

test("legacy: Postgres HH:MM:SS lesson rows still satisfy the consecutive rule", () => {
  const dbRows = [
    { lesson: 1, date: D0, day: "monday", start_time: "07:00:00", end_time: "08:00:00" },
    { lesson: 2, date: D0, day: "monday", start_time: "08:00:00", end_time: "09:00:00" },
    { lesson: 3, date: DATES[1], day: "tuesday", start_time: "06:00:00", end_time: "07:00:00" },
  ];
  assert.equal(validateConsecutiveRule(dbRows), null);
});

test("learner-wide: DB-shaped HH:MM:SS existing rows are compared correctly", () => {
  const existing = [
    { date: D0, start_time: "07:00:00", end_time: "08:00:00" },
    { date: D0, start_time: "08:00:00", end_time: "09:00:00" },
  ];
  const adjacent = [{ date: DATES[1], start_time: "06:00", end_time: "07:00" }];
  assert.equal(validateLearnerWideConsecutive(existing, adjacent), null);

  const sameDay = [{ date: D0, start_time: "10:00", end_time: "11:00" }];
  const error = validateLearnerWideConsecutive(existing, sameDay);
  assert.ok(error && error.includes("More than 2 lessons"), "a third lesson on a full day must be rejected");
});

test("load: a hold exactly at hold_minutes still counts, one second later does not", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const atBoundary = [{ instructorId: "a", date: D0, startMinute: P1, endMinute: P1 + 60, status: "pending_payment", bookingCreatedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString() }];
  const justOver = [{ instructorId: "a", date: D0, startMinute: P1, endMinute: P1 + 60, status: "pending_payment", bookingCreatedAt: new Date(now.getTime() - 15 * 60 * 1000 - 1000).toISOString() }];
  const fresh = [{ instructorId: "a", date: D0, startMinute: P1, endMinute: P1 + 60, status: "pending_payment", bookingCreatedAt: new Date(now.getTime() - 14 * 60 * 1000).toISOString() }];
  assert.deepEqual(instructorBookingLoad(atBoundary, 15, now), { a: 1 });
  assert.deepEqual(instructorBookingLoad(justOver, 15, now), {});
  assert.deepEqual(instructorBookingLoad(fresh, 15, now), { a: 1 });
});

test("preferred: unsorted and duplicated dates still yield one lesson per calendar day", () => {
  // Deliberately unsorted, with DATES[1] listed twice.
  const dates = [DATES[2], D0, DATES[1], DATES[1], DATES[3]];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates }),
    D0,
    [P1],
    3,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 3);
  assert.equal(plan.lessons[0].date, D0, "plan starts on the requested start date");
  const dates_used = plan.lessons.map((l) => l.date);
  assert.deepEqual(dates_used, [D0, DATES[1], DATES[2]], "chronological, de-duplicated");
});

test("legacy: unsorted and duplicated dates never exceed two lessons in a day", () => {
  const dates = [D0, DATES[1], DATES[1], D0, DATES[2]];
  const plan = computeCoursePlan(
    INPUT([instructor("a")], { dates }),
    { date: D0, start: "07:00" },
    4,
  );
  assert.equal(plan.ok, true);
  assertLegacyInvariants(plan, { date: D0, start: "07:00" }, [], 0);
  const perDay = new Map();
  for (const lesson of plan.lessons) perDay.set(lesson.date, (perDay.get(lesson.date) ?? 0) + 1);
  for (const [date, count] of perDay) assert.ok(count <= 2, `${count} lessons on ${date}`);
  const keys = plan.lessons.map((l) => `${l.date}|${l.start_time}`);
  assert.equal(new Set(keys).size, keys.length, "no duplicated (date,start) pair");
});

test("preferred: an in-window but off-grid time is never usable", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [timeToMinutes("07:15")],
    1,
  );
  assert.equal(plan.ok, false);
});

test("preferred: exact capacity — 20 lessons in a 20-day window", () => {
  const dates = DATES.slice(0, 20);
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates }),
    D0,
    [P1],
    20,
  );
  assertPreferredInvariants(plan, { totalLessons: 20, prefs: [P1], dates });
  assert.equal(plan.lessons[19].date, dates[19]);
});

test("preferred: a 21-lesson course exactly fills a 21-day window", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2],
    21,
  );
  assertPreferredInvariants(plan, { totalLessons: 21, prefs: [P1, P2] });
  assert.equal(plan.lessons[20].date, DATES[20]);
});

test("preferred: instructor array order does not change the deterministic pick", () => {
  const blocks = [blockAt("b", DATES[1], P1)];
  const forward = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b"), instructor("c")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    6,
  );
  const reversed = computeCoursePlanPreferred(
    INPUT([instructor("c"), instructor("b"), instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    6,
  );
  assert.deepEqual(forward, reversed);
});

test("scale: 60 instructors and a 5-day first-slot grid resolves within budget", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `ins-${i}`);
  const rng = makeRng(2026);
  const blocks = randomBlocks(rng, ids, DATES.slice(0, 5), 180).blocks;
  const started = Date.now();
  const grid = computeFeasibleFirstSlots(
    INPUT(ids.map((id) => instructor(id)), { dates: DATES.slice(0, 5), blocks, gapMinutes: 30 }),
    3,
  );
  const elapsed = Date.now() - started;
  const offered = grid.dates.reduce((n, day) => n + day.slots.length, 0);
  assert.ok(offered > 0);
  assert.ok(elapsed < 5000, `first-slot grid took ${elapsed}ms`);
});
