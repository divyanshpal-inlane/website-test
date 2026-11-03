import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCoursePlanPreferred,
  planCoursePreferred,
  buildInstructorFreeGrid,
  candidateStartMinutes,
  areaEligibleInstructors,
  instructorBookingLoad,
  validateConsecutiveRule,
  validateLearnerWideConsecutive,
  timeToMinutes,
  minutesToTime,
} from "../_shared/availability.ts";
import { addDaysISO, istTodayISO } from "../_shared/validation.ts";

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
const DATES = Array.from({ length: 14 }, (_, i) => addDaysISO(D0, i));
const P1 = timeToMinutes("07:00");
const P2 = timeToMinutes("18:00");
const P3 = timeToMinutes("19:00");

/** Block a single grid slot for an instructor on a date. */
function blockAt(instructorId, date, start) {
  return { instructorId, date, startMinute: start, endMinute: start + 60, status: "booked" };
}

/** Block a full day for an instructor. */
function blockWholeDay(instructorId, date) {
  return candidateStartMinutes(SLOT_CONFIG).map((s) => blockAt(instructorId, date, s));
}

/** Create a pending_payment hold with a specific created_at. */
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

// ---------------------------------------------------------------------------
// SPEC REQUIREMENT TESTS
// ---------------------------------------------------------------------------

// Spec §4: Check three preferred times in order against actual instructor
// availability, existing bookings, leave, unavailability, calendar events,
// and active holds.
test("preferred flow: existing booked lessons block preferred times", () => {
  const blocks = [blockAt("a", DATES[0], P1)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  const day0Lesson = plan.lessons.find((l) => l.date === DATES[0]);
  assert.equal(day0Lesson.start_time, "18:00"); // falls to P2
});

// Spec §4: unavailability blocks
test("preferred flow: instructor unavailability blocks preferred times", () => {
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
  const day0Lesson = plan.lessons.find((l) => l.date === DATES[0]);
  assert.equal(day0Lesson.start_time, "18:00"); // P1 blocked by unavailability, falls to P2
});

// Spec §4: active holds (pending_payment within hold window) block
test("preferred flow: active pending_payment hold blocks preferred time", () => {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString(); // 10 min ago
  const blocks = [holdAt("a", DATES[0], P1, createdAt)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks, holdMinutes: 15, now }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  const day0Lesson = plan.lessons.find((l) => l.date === DATES[0]);
  assert.equal(day0Lesson.start_time, "18:00"); // P1 blocked by live hold, falls to P2
});

// Spec §4: expired holds do NOT block
test("preferred flow: expired pending_payment hold does NOT block preferred time", () => {
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
  const day0Lesson = plan.lessons.find((l) => l.date === DATES[0]);
  assert.equal(day0Lesson.start_time, "07:00"); // P1 FREE because hold expired
});

// Spec §5: If all three times unavailable, move lesson to next calendar day
// and retry same three times with same instructor. Do NOT auto-select nearby time.
test("preferred flow: none of 3 prefs free -> skip day entirely, no nearby fallback", () => {
  const day = DATES[1];
  // Block P1, P2, P3 but leave other times (e.g., 08:00, 09:00) FREE
  const blocks = [
    blockAt("a", day, P1),
    blockAt("a", day, P2),
    blockAt("a", day, P3),
    // Intentionally NOT blocking 08:00, 09:00, etc.
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  // Day 1 should be SKIPPED entirely, not filled with 08:00
  assert.ok(!plan.lessons.some((l) => l.date === day));
  // Lessons should land on days 0, 2, 3, 4, 5
  const expectedDates = [DATES[0], DATES[2], DATES[3], DATES[4], DATES[5]];
  plan.lessons.forEach((l, i) => assert.equal(l.date, expectedDates[i]));
});

// Spec §5: At most one lesson per calendar day (no same-day doubling)
test("preferred flow: never more than one lesson per calendar day", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  const dates = plan.lessons.map((l) => l.date);
  assert.equal(new Set(dates).size, dates.length, "no calendar date repeats");
  assert.equal(plan.lessons.length, 10);
});

// Spec §6: Prevent overlapping lessons
test("preferred flow: lessons never overlap", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  // Check no two lessons have same date + overlapping time
  for (let i = 0; i < plan.lessons.length; i++) {
    for (let j = i + 1; j < plan.lessons.length; j++) {
      const a = plan.lessons[i];
      const b = plan.lessons[j];
      if (a.date === b.date) {
        const aStart = timeToMinutes(a.start_time);
        const aEnd = timeToMinutes(a.end_time);
        const bStart = timeToMinutes(b.start_time);
        const bEnd = timeToMinutes(b.end_time);
        assert.ok(!(aStart < bEnd && bStart < aEnd), `Overlap on ${a.date}: ${a.start_time}-${a.end_time} vs ${b.start_time}-${b.end_time}`);
      }
    }
  }
});

// Spec §7: Evaluate eligible instructors and prefer complete schedule with
// fewest date shifts and highest-ranked time preferences.
test("preferred flow: instructor with fewer date shifts preferred", () => {
  // Instructor a: P1 free every day (0 shifts)
  // Instructor b: P1 blocked on day 1 (1 shift)
  const blocks = [blockAt("b", DATES[1], P1)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "a"); // a has fewer shifts
});

// Spec §8: If no instructor can provide complete schedule within horizon,
// show clear message (plan.ok=false). Never silently confirm partial schedule.
test("preferred flow: infeasible returns ok=false with zero lessons", () => {
  const shortWindow = DATES.slice(0, 3); // Only 3 days
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: shortWindow }),
    shortWindow[0],
    [P1, P2, P3],
    5, // Need 5 lessons but only 3 days (max 1/day) = impossible
  );
  assert.equal(plan.ok, false);
  assert.ok(!plan.lessons || plan.lessons.length === 0);
});

test("preferred flow: all instructors blocked -> infeasible", () => {
  // Block ALL preferences for ALL instructors on ALL days
  const blocks = [];
  for (const date of DATES) {
    blocks.push(blockAt("a", date, P1), blockAt("a", date, P2), blockAt("a", date, P3));
    blocks.push(blockAt("b", date, P1), blockAt("b", date, P2), blockAt("b", date, P3));
  }
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, false);
});

// Spec §11: Use expiring holds
test("preferred flow: holdMinutes config respected in free grid", () => {
  const now = new Date();
  const freshHold = holdAt("a", DATES[0], P1, new Date(now.getTime() - 5 * 60 * 1000).toISOString());
  const expiredHold = holdAt("a", DATES[1], P1, new Date(now.getTime() - 30 * 60 * 1000).toISOString());
  
  const blocks = [freshHold, expiredHold];
  const input = INPUT([instructor("a")], { dates: DATES, blocks, holdMinutes: 15, now });
  
  const free = buildInstructorFreeGrid(input, [instructor("a")]);
  const day0Free = free.get("a")?.get(DATES[0]) || [];
  const day1Free = free.get("a")?.get(DATES[1]) || [];
  
  assert.ok(!day0Free.includes(P1), "Fresh hold blocks P1 on day 0");
  assert.ok(day1Free.includes(P1), "Expired hold does NOT block P1 on day 1");
});

// ---------------------------------------------------------------------------
// EDGE CASES & REGRESSION TESTS
// ---------------------------------------------------------------------------

test("preferred flow: 8-lesson course (Brush Up) works with same logic", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    8, // Brush Up = 8 lessons
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 8);
  plan.lessons.forEach((l, i) => {
    assert.equal(l.date, DATES[i]);
    assert.equal(l.start_time, "07:00");
  });
});

test("preferred flow: 10-lesson course (Masterclass) works", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10, // Masterclass = 10 lessons
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  // 10 lessons over 14 days with 1/day = fits with 4 days to spare
  const dates = plan.lessons.map((l) => l.date);
  assert.equal(new Set(dates).size, 10);
});

test("preferred flow: start date on weekend works", () => {
  const sat = "2026-11-07"; // Saturday
  const dates = Array.from({ length: 14 }, (_, i) => addDaysISO(sat, i));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates }),
    sat,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].date, sat);
  assert.equal(plan.lessons[0].day, "saturday");
});

test("preferred flow: course spanning month boundary", () => {
  const sep30 = "2026-09-30";
  const dates = Array.from({ length: 14 }, (_, i) => addDaysISO(sep30, i));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates }),
    sep30,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.ok(plan.lessons.some((l) => l.date.startsWith("2026-09")));
  assert.ok(plan.lessons.some((l) => l.date.startsWith("2026-10")));
});

test("preferred flow: course spanning year boundary", () => {
  const dec31 = "2026-12-31";
  const dates = Array.from({ length: 14 }, (_, i) => addDaysISO(dec31, i));
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates }),
    dec31,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.ok(plan.lessons.some((l) => l.date.startsWith("2026-12")));
  assert.ok(plan.lessons.some((l) => l.date.startsWith("2027-01")));
});

test("preferred flow: morning-only instructor fits course", () => {
  const instr = instructor("a");
  instr.unavailability = [
    { day_of_week: "monday", booked_start_time: "12:00", booked_end_time: "20:00", all_day: false },
    { day_of_week: "tuesday", booked_start_time: "12:00", booked_end_time: "20:00", all_day: false },
    { day_of_week: "wednesday", booked_start_time: "12:00", booked_end_time: "20:00", all_day: false },
    { day_of_week: "thursday", booked_start_time: "12:00", booked_end_time: "20:00", all_day: false },
    { day_of_week: "friday", booked_start_time: "12:00", booked_end_time: "20:00", all_day: false },
    { day_of_week: "saturday", booked_start_time: "12:00", booked_end_time: "20:00", all_day: false },
    { day_of_week: "sunday", booked_start_time: "12:00", booked_end_time: "20:00", all_day: false },
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P1], // Only 07:00 (morning)
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  plan.lessons.forEach((l) => assert.equal(l.start_time, "07:00"));
});

test("preferred flow: evening-only instructor fits course with evening pref", () => {
  const instr = instructor("a");
  instr.unavailability = [
    { day_of_week: "monday", booked_start_time: "06:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "tuesday", booked_start_time: "06:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "wednesday", booked_start_time: "06:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "thursday", booked_start_time: "06:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "friday", booked_start_time: "06:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "saturday", booked_start_time: "06:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "sunday", booked_start_time: "06:00", booked_end_time: "16:00", all_day: false },
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P2], // Only 18:00 (evening)
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  plan.lessons.forEach((l) => assert.equal(l.start_time, "18:00"));
});

test("preferred flow: fragmented availability (2h morning, 2h evening) works", () => {
  const instr = instructor("a");
  instr.unavailability = [
    { day_of_week: "monday", booked_start_time: "08:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "tuesday", booked_start_time: "08:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "wednesday", booked_start_time: "08:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "thursday", booked_start_time: "08:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "friday", booked_start_time: "08:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "saturday", booked_start_time: "08:00", booked_end_time: "16:00", all_day: false },
    { day_of_week: "sunday", booked_start_time: "08:00", booked_end_time: "16:00", all_day: false },
  ];
  const plan = computeCoursePlanPreferred(
    INPUT([instr], { dates: DATES }),
    D0,
    [P1, P2, P3], // Can use 07:00 (before block) or 18:00/19:00 (after block)
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
});

// ---------------------------------------------------------------------------
// LEARNER-WIDE CONSECUTIVE RULE (mirrors confirm_booking_slots v2)
// ---------------------------------------------------------------------------

test("preferred flow: validateLearnerWideConsecutive detects same-day non-adjacent conflict", () => {
  const existing = [
    { date: DATES[0], start_time: "12:00", end_time: "13:00" }, // Existing tentative
  ];
  const proposed = [
    { date: DATES[0], start_time: "06:30", end_time: "07:30" }, // Proposed demo
  ];
  const error = validateLearnerWideConsecutive(existing, proposed);
  assert.ok(error !== null);
  assert.ok(error.includes("not consecutive"));
});

test("preferred flow: validateLearnerWideConsecutive allows adjacent same-day", () => {
  const existing = [
    { date: DATES[0], start_time: "12:00", end_time: "13:00" },
  ];
  const proposed = [
    { date: DATES[0], start_time: "13:00", end_time: "14:00" }, // Adjacent
  ];
  const error = validateLearnerWideConsecutive(existing, proposed);
  assert.equal(error, null);
});

test("preferred flow: validateLearnerWideConsecutive allows different days", () => {
  const existing = [
    { date: DATES[0], start_time: "12:00", end_time: "13:00" },
  ];
  const proposed = [
    { date: DATES[1], start_time: "06:30", end_time: "07:30" },
  ];
  const error = validateLearnerWideConsecutive(existing, proposed);
  assert.equal(error, null);
});

// ---------------------------------------------------------------------------
// CONCURRENCY SCENARIOS
// ---------------------------------------------------------------------------

test("preferred flow: two learners same prefs, different instructors -> both succeed", () => {
  const plan1 = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
  );
  const plan2 = computeCoursePlanPreferred(
    INPUT([instructor("b")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan1.ok, true);
  assert.equal(plan2.ok, true);
  assert.equal(plan1.instructorId, "a");
  assert.equal(plan2.instructorId, "b");
});

test("preferred flow: two learners same prefs, same instructor -> second gets alternative or fails", () => {
  // This is tested at the RPC level in concurrency tests
  // Here we verify the free grid reflects the first booking
  const firstPlan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(firstPlan.ok, true);
  // First plan uses P1 on days 0-4
  
  // Build blocks from first plan's lessons (simulating existing booking)
  const firstBlocks = firstPlan.lessons.map((l) => ({
    instructorId: "a",
    date: l.date,
    startMinute: timeToMinutes(l.start_time),
    endMinute: timeToMinutes(l.end_time),
    status: "pending_payment",
    ownerBookingId: "booking-1",
  }));
  
  // Second learner with SAME prefs on SAME instructor
  // Should fall back to P2 on each day (since P1 is taken)
  const secondPlan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks: firstBlocks, excludeBookingId: null }),
    D0,
    [P1, P2, P3],
    5,
  );
  // Second learner gets a feasible plan using P2 (fallback)
  assert.equal(secondPlan.ok, true);
  assert.equal(secondPlan.lessons.length, 5);
  // All lessons should be at P2 (18:00) since P1 is taken
  secondPlan.lessons.forEach((l) => assert.equal(l.start_time, "18:00"));
});

// ---------------------------------------------------------------------------
// FEMALE INSTRUCTOR PREFERENCE
// ---------------------------------------------------------------------------

test("preferred flow: femalePreference with femaleMode=preference picks female when available", () => {
  const femaleInstr = instructor("female-1");
  femaleInstr.gender = "female";
  const maleInstr = instructor("male-1");
  
  const plan = computeCoursePlanPreferred(
    INPUT([maleInstr, femaleInstr], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
    { femalePreference: true, femaleMode: "preference" },
  );
  
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "female-1");
});

test("preferred flow: femaleMode=mandatory with no female -> falls back gracefully", () => {
  const maleInstr = instructor("male-1");
  
  const plan = computeCoursePlanPreferred(
    INPUT([maleInstr], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
    { femalePreference: true, femaleMode: "mandatory" },
  );
  
  // Current behavior: graceful degradation (falls back to male)
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "male-1");
});

// ---------------------------------------------------------------------------
// TRAVEL GAP (instructor gap between OTHER bookings)
// ---------------------------------------------------------------------------

test("preferred flow: instructor gapMinutes respected for other bookings", () => {
  const gapMinutes = 30;
  const blocks = [
    // Other booking at 12:00-13:00 on day 0
    { instructorId: "a", date: DATES[0], startMinute: timeToMinutes("12:00"), endMinute: timeToMinutes("13:00"), status: "booked" },
  ];
  
  const input = INPUT([instructor("a")], { dates: DATES, blocks, gapMinutes });
  const free = buildInstructorFreeGrid(input, [instructor("a")]);
  const day0Free = free.get("a")?.get(DATES[0]) || [];
  
  // With 30-min gap, other booking at 12:00-13:00 blocks [11:30, 13:30)
  // Grid slots are 30-min: 06:00, 06:30, ..., 19:30
  // 60-min lesson at 11:00-12:00 overlaps 11:30-12:00 -> BLOCKED
  // 60-min lesson at 10:30-11:30 ends exactly at 11:30 -> FREE
  // 60-min lesson at 13:30-14:30 starts exactly at 13:30 -> FREE
  assert.ok(!day0Free.includes(timeToMinutes("11:00")), "11:00 blocked by gap before 12:00");
  assert.ok(!day0Free.includes(timeToMinutes("13:00")), "13:00 blocked by gap after 13:00");
  // 10:30 (ends at 11:30) and 13:30 (starts at 13:30) should be free
  assert.ok(day0Free.includes(timeToMinutes("10:30")), "10:30 free (ends at gap start)");
  assert.ok(day0Free.includes(timeToMinutes("13:30")), "13:30 free (starts at gap end)");
});

test("preferred flow: own booking lessons exempt from travel gap", () => {
  const gapMinutes = 30;
  // Own booking at 12:00-13:00 on day 0 (ownerBookingId = bookingId)
  const blocks = [
    { 
      instructorId: "a", 
      date: DATES[0], 
      startMinute: timeToMinutes("12:00"), 
      endMinute: timeToMinutes("13:00"), 
      status: "pending_payment",
      ownerBookingId: "booking-123",
    },
  ];
  
  const input = INPUT([instructor("a")], { dates: DATES, blocks, gapMinutes, excludeBookingId: "booking-123" });
  const free = buildInstructorFreeGrid(input, [instructor("a")]);
  const day0Free = free.get("a")?.get(DATES[0]) || [];
  
  // Own booking: no gap, so 13:00 should be free (back-to-back allowed)
  assert.ok(day0Free.includes(timeToMinutes("13:00")), "13:00 free for own booking (no gap)");
});

// ---------------------------------------------------------------------------
// VALIDATION HELPERS
// ---------------------------------------------------------------------------

test("preferred flow: validateConsecutiveRule passes for preferred plan", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  
  assert.equal(plan.ok, true);
  const error = validateConsecutiveRule(plan.lessons);
  assert.equal(error, null, "Preferred plan should pass consecutive rule (1 lesson/day)");
});

test("preferred flow: validateConsecutiveRule passes for 1-lesson course", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    1,
  );
  
  assert.equal(plan.ok, true);
  const error = validateConsecutiveRule(plan.lessons);
  assert.equal(error, null);
});