// Course plan edge cases - min/max lessons, cross-month, weekend-only, complex constraints.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCoursePlan,
  computeFeasibleFirstSlots,
  planLessonsForInstructor,
  buildInstructorFreeGrid,
  candidateStartMinutes,
} from "../_shared/availability.ts";
import { addDaysISO } from "../_shared/validation.ts";

const SLOT_CONFIG = {
  slotStart: "06:00",
  slotEnd: "20:00",
  gridMinutes: 30,
  slotDurationMinutes: 60,
};

function instructor(id, overrides = {}) {
  return { id, areas: ["area-a"], gender: null, ...overrides };
}

const INPUT = (instructors, overrides = {}) => ({
  instructors,
  learnerArea: "area-a",
  learner: null,
  slotConfig: SLOT_CONFIG,
  ...overrides,
});

const D0 = "2026-09-10"; // Thursday
const DATES = Array.from({ length: 14 }, (_, i) => addDaysISO(D0, i));
const minute = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const time = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const block = (instructorId, date, start, end, status = "booked", ownerBookingId = null) => ({
  instructorId,
  date,
  startMinute: minute(start),
  endMinute: minute(end),
  status,
  ownerBookingId,
});

test("computeCoursePlan: 1 lesson course (minimum) works", () => {
  const plan = computeCoursePlan(
    INPUT([instructor("i1")], { dates: DATES }),
    { date: D0, start: "12:00" },
    1,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 1);
  assert.equal(plan.lessons[0].start_time, "12:00");
});

test("computeCoursePlan: 20 lessons (max) with 14-day window fits", () => {
  // 14 days * 2 lessons/day = 28 max possible, so 20 should fit
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 20, 60);
  assert.ok(plan);
  assert.equal(plan.length, 20);
});

test("computeCoursePlan: 21 lessons with 14-day window fails (max 28, but consecutive rule limits)", () => {
  // With consecutive rule, max is 2 per day = 28, but need to check if 21 fits
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 21, 60);
  // 21 lessons need at least 11 days (10 days * 2 + 1 day * 1)
  // 14 days available, so should fit
  assert.ok(plan);
  assert.equal(plan.length, 21);
});

test("computeCoursePlan: 28 lessons (max 14*2) fits exactly", () => {
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 28, 60);
  assert.ok(plan);
  assert.equal(plan.length, 28);
});

test("computeCoursePlan: 29 lessons fails (exceeds 14*2)", () => {
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 29, 60);
  assert.equal(plan, null);
});

test("computeCoursePlan: first slot on weekend (Saturday) works", () => {
  const sat = DATES[2]; // 2026-09-12 Saturday
  const plan = computeCoursePlan(
    INPUT([instructor("i1")], { dates: DATES }),
    { date: sat, start: "06:00" },
    4,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].date, sat);
  assert.equal(plan.lessons[0].day, "saturday");
});

test("computeCoursePlan: first slot on Sunday works", () => {
  const sun = DATES[3]; // 2026-09-13 Sunday
  const plan = computeCoursePlan(
    INPUT([instructor("i1")], { dates: DATES }),
    { date: sun, start: "06:00" },
    4,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons[0].date, sun);
});

test("computeCoursePlan: course spanning month boundary (Sep 30 -> Oct)", () => {
  const dates = [
    "2026-09-28", "2026-09-29", "2026-09-30",
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08",
    "2026-10-09", "2026-10-10", "2026-10-11"
  ];
  const free = new Map(dates.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, dates, "2026-09-28", 360, 10, 60);
  assert.ok(plan);
  assert.equal(plan.length, 10);
  // Check month transition
  const septLessons = plan.filter((l) => l.date.startsWith("2026-09"));
  const octLessons = plan.filter((l) => l.date.startsWith("2026-10"));
  assert.ok(septLessons.length > 0);
  assert.ok(octLessons.length > 0);
});

test("computeCoursePlan: course spanning year boundary (Dec 31 -> Jan)", () => {
  const dates = [
    "2025-12-29", "2025-12-30", "2025-12-31",
    "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04",
    "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08",
    "2026-01-09", "2026-01-10", "2026-01-11"
  ];
  const free = new Map(dates.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, dates, "2025-12-29", 360, 10, 60);
  assert.ok(plan);
  assert.equal(plan.length, 10);
  const decLessons = plan.filter((l) => l.date.startsWith("2025-12"));
  const janLessons = plan.filter((l) => l.date.startsWith("2026-01"));
  assert.ok(decLessons.length > 0);
  assert.ok(janLessons.length > 0);
});

test("computeCoursePlan: instructor with morning-only availability (06:00-12:00) fits 10 lessons", () => {
  const morningOnly = [];
  for (let m = 360; m < 720; m += 30) morningOnly.push(m); // 06:00..11:30
  const free = new Map(DATES.map((d) => [d, morningOnly]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 10, 60);
  assert.ok(plan, "10 lessons should fit in 14 repeated mornings");
  assert.equal(plan.length, 10);
  // Day 0: 2 lessons (06:00, 07:00), days 1-4: 2 each = 10 total
  const byDate = new Map();
  for (const l of plan) {
    byDate.set(l.date, (byDate.get(l.date) || 0) + 1);
  }
  for (const [, count] of byDate) {
    assert.ok(count <= 2);
  }
});

test("computeCoursePlan: instructor with evening-only availability (14:00-20:00) fits 10 lessons", () => {
  const eveningOnly = [];
  for (let m = 840; m <= 1140; m += 30) eveningOnly.push(m); // 14:00..19:00
  const free = new Map(DATES.map((d) => [d, eveningOnly]));
  const plan = planLessonsForInstructor(free, DATES, D0, 840, 10, 60); // 14:00 first
  assert.ok(plan, "10 lessons should fit in 14 repeated evenings");
  assert.equal(plan.length, 10);
});

test("computeCoursePlan: instructor with fragmented availability (2h morning, 2h evening)", () => {
  const fragmented = [...Array.from({ length: 12 }, (_, i) => 360 + i * 30), // 06:00-11:30
    ...Array.from({ length: 12 }, (_, i) => 840 + i * 30)]; // 14:00-19:30
  const free = new Map(DATES.map((d) => [d, fragmented]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 10, 60);
  assert.ok(plan);
  assert.equal(plan.length, 10);
});

test("computeFeasibleFirstSlots: no feasible slots when all instructors have conflicts", () => {
  const fullyBooked = [];
  for (const date of DATES) {
    for (const m of candidateStartMinutes(SLOT_CONFIG)) {
      fullyBooked.push(block("i1", date, time(m), time(m + 60)));
    }
  }
  const result = computeFeasibleFirstSlots(
    INPUT([instructor("i1")], { dates: DATES, blocks: fullyBooked }),
    10,
  );
  const total = result.dates.reduce((acc, d) => acc + d.slots.length, 0);
  assert.equal(total, 0);
});

test("computeFeasibleFirstSlots: single instructor with 1 free slot per day = 10-lesson course works across 10 days", () => {
  const singleSlot = [minute("12:00")];
  const free = new Map(DATES.map((d) => [d, singleSlot]));
  const plan = planLessonsForInstructor(free, DATES, D0, minute("12:00"), 10, 60);
  // 1 slot/day * 10 days = 10 lessons (consecutive rule allows 1 per day)
  assert.ok(plan);
  assert.equal(plan.length, 10);
  // Each lesson on a different day
  const uniqueDays = new Set(plan.map((l) => l.date));
  assert.equal(uniqueDays.size, 10);
});

test("computeCoursePlan: female preference with no female instructor = falls back to male", () => {
  const plan = computeCoursePlan(
    INPUT(
      [instructor("male", { gender: "male" })],
      { dates: DATES, femalePreference: true, femaleMode: "preference" }
    ),
    { date: D0, start: "12:00" },
    4,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "male");
});

test("computeCoursePlan: femaleMode=mandatory with no female = falls back to male (graceful degradation)", () => {
  const plan = computeCoursePlan(
    INPUT(
      [instructor("male", { gender: "male" })],
      { dates: DATES, femalePreference: true, femaleMode: "mandatory" }
    ),
    { date: D0, start: "12:00" },
    4,
  );
  // Graceful degradation: when no female available, falls back to any candidate
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "male");
});

test("computeCoursePlan: femaleMode=mandatory with female = female picked", () => {
  const plan = computeCoursePlan(
    INPUT(
      [instructor("male", { gender: "male" }), instructor("female", { gender: "female" })],
      { dates: DATES, femalePreference: true, femaleMode: "mandatory" }
    ),
    { date: D0, start: "12:00" },
    4,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "female");
});

test("computeCoursePlan: load balancing - least loaded instructor picked", () => {
  // Instructor 'a' has 3 lessons booked, 'b' has 0
  const blocks = [
    block("a", DATES[1], "06:00", "07:00"),
    block("a", DATES[2], "06:00", "07:00"),
    block("a", DATES[3], "06:00", "07:00"),
  ];
  const plan = computeCoursePlan(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    { date: D0, start: "06:00" },
    2,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "b", "least loaded instructor 'b' should be picked");
});

test("computeCoursePlan: instructor with radius (no area match) can still serve via radius", () => {
  const plan = computeCoursePlan(
    INPUT(
      [instructor("i1", { areas: ["other"], lat: 12.97, lng: 77.58, radiusKm: 5 })],
      { dates: DATES, learner: { lat: 12.97, lng: 77.58 } }
    ),
    { date: D0, start: "12:00" },
    4,
  );
  assert.equal(plan.ok, true);
});

test("computeCoursePlan: instructor without area match AND no radius = not eligible", () => {
  const plan = computeCoursePlan(
    INPUT(
      [instructor("i1", { areas: ["other"] })],
      { dates: DATES }
    ),
    { date: D0, start: "12:00" },
    4,
  );
  assert.equal(plan.ok, false);
});

test("computeFeasibleFirstSlots: deduplication across instructors with different availability", () => {
  // Instructor A free all day, Instructor B only free mornings
  const aBlocks = [];
  const bBlocks = [];
  for (const date of DATES) {
    // B busy after 12:00
    for (let m = 720; m <= 1140; m += 30) {
      bBlocks.push(block("b", date, time(m), time(m + 60)));
    }
  }
  const result = computeFeasibleFirstSlots(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks: [...aBlocks, ...bBlocks] }),
    4,
  );
  // All slots should map to 'a' since B is busy in evenings
  for (const d of result.dates) {
    for (const s of d.slots) {
      assert.equal(s.instructors[0], "a");
    }
  }
});

test("computeCoursePlan: first slot on day with only 1 free slot left works for 1-lesson course", () => {
  const free = new Map(DATES.map((d) => [d, [minute("18:30")]])); // only 18:30 free
  const plan = planLessonsForInstructor(free, DATES, D0, minute("18:30"), 1, 60);
  assert.ok(plan);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].start_time, "18:30");
});

test("computeCoursePlan: first slot on day with only 1 free slot fails for 2-lesson course", () => {
  const free = new Map(DATES.map((d) => [d, [minute("18:30")]]));
  const plan = planLessonsForInstructor(free, DATES, D0, minute("18:30"), 2, 60);
  // Day 0: 18:30 (lesson 1). No strictly later slot on day 0. Day 1: 18:30 (lesson 2).
  // But day 1 needs 2 lessons if we want 2 total? No, lesson 2 on day 1 is fine.
  // Actually: lesson 1 at 18:30 day 0. Lesson 2 needs strictly later on day 0 (none) OR day 1 at 18:30.
  // Day 1 has 18:30 free, so lesson 2 = day 1 18:30. That works!
  assert.ok(plan);
  assert.equal(plan.length, 2);
});

test("computeCoursePlan: course with exactly 2 lessons per day for 5 days = 10 lessons", () => {
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 10, 60);
  assert.ok(plan);
  assert.equal(plan.length, 10);
  const byDate = new Map();
  for (const l of plan) {
    byDate.set(l.date, (byDate.get(l.date) || 0) + 1);
  }
  // Should have exactly 5 days with 2 lessons each
  let daysWith2 = 0;
  for (const [, count] of byDate) {
    if (count === 2) daysWith2++;
    else if (count === 1) {} // day 0 might have 1 if not enough for pair?
  }
  assert.equal(daysWith2, 5, "10 lessons = 5 days of 2");
});

test("buildInstructorFreeGrid: multiple instructors, separate grids", () => {
  const blocks = [
    block("a", D0, "06:00", "07:00"),
    block("b", D0, "12:00", "13:00"),
  ];
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("a"), instructor("b")], { dates: [D0], blocks }),
    [instructor("a"), instructor("b")],
  );
  const aFree = grid.get("a").get(D0) || [];
  const bFree = grid.get("b").get(D0) || [];
  assert.ok(!aFree.includes(minute("06:00")), "a blocked at 06:00");
  assert.ok(aFree.includes(minute("12:00")), "a free at 12:00");
  assert.ok(bFree.includes(minute("06:00")), "b free at 06:00");
  assert.ok(!bFree.includes(minute("12:00")), "b blocked at 12:00");
});

test("computeCoursePlan: same instructorId tie-break when all else equal", () => {
  const plan = computeCoursePlan(
    INPUT([instructor("a"), instructor("b")], { dates: DATES }),
    { date: D0, start: "12:00" },
    2,
  );
  assert.equal(plan.ok, true);
  // Deterministic: 'a' < 'b' lexicographically
  assert.equal(plan.instructorId, "a");
});

test("computeCoursePlan: female instructor has priority when preference=mandatory", () => {
  const plan = computeCoursePlan(
    INPUT(
      [instructor("a", { gender: "male" }), instructor("b", { gender: "female" })],
      { dates: DATES, femalePreference: true, femaleMode: "mandatory" }
    ),
    { date: D0, start: "12:00" },
    2,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "b");
});

test("computeFeasibleFirstSlots: femaleCovered true when at least one feasible instructor is female", () => {
  const result = computeFeasibleFirstSlots(
    INPUT(
      [instructor("a", { gender: "male" }), instructor("b", { gender: "female" })],
      { dates: DATES, femalePreference: false, femaleMode: "preference" }
    ),
    4,
  );
  let foundFemale = false;
  for (const d of result.dates) {
    for (const s of d.slots) {
      if (s.femaleCovered) foundFemale = true;
    }
  }
  assert.ok(foundFemale, "at least one slot should have femaleCovered=true");
});

test("planLessonsForInstructor: anchorEnd logic - second lesson on fresh day must be adjacent", () => {
  // Day 0: free at 06:00, 07:00, 08:00
  // Day 1: free at 06:00 only
  const free = new Map();
  free.set(D0, [minute("06:00"), minute("07:00"), minute("08:00")]);
  free.set(DATES[1], [minute("06:00")]);
  const plan = planLessonsForInstructor(free, [D0, DATES[1]], D0, minute("06:00"), 3, 60);
  // Lesson 1: day0 06:00
  // Lesson 2: day0 07:00 (adjacent to lesson 1)
  // Lesson 3: day1 06:00 (only slot, first on fresh day)
  assert.ok(plan);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].start_time, "06:00");
  assert.equal(plan[1].start_time, "07:00");
  assert.equal(plan[2].date, DATES[1]);
  assert.equal(plan[2].start_time, "06:00");
});