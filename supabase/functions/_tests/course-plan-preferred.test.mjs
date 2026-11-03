import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateStartMinutes,
  computeCoursePlanPreferred,
  planCoursePreferred,
  timeToMinutes,
} from "../_shared/availability.ts";
import { addDaysISO } from "../_shared/validation.ts";

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

/** Blocks a single instructor out of `start` on `date` (one grid slot). */
function blockAt(instructorId, date, start) {
  return { instructorId, date, startMinute: start, endMinute: start + 60, status: "booked" };
}

/** Blocks a single instructor out of EVERY grid slot on `date` (full day). */
function blockWholeDay(instructorId, date) {
  return candidateStartMinutes(SLOT_CONFIG).map((s) => blockAt(instructorId, date, s));
}

test("ideal case: every day has preference #1 free -> same time every day", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 5);
  plan.lessons.forEach((l, i) => {
    assert.equal(l.date, DATES[i]);
    assert.equal(l.start_time, "07:00");
  });
});

test("full day unavailable -> same preferred time pushed to the next day", () => {
  const blockedDay = DATES[1];
  const blocks = blockWholeDay("a", blockedDay);
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 5);
  // Day index 1 (blockedDay) is skipped entirely; the 5 lessons land on
  // DATES[0,2,3,4,5], all at the first preference.
  const expectedDates = [DATES[0], DATES[2], DATES[3], DATES[4], DATES[5]];
  plan.lessons.forEach((l, i) => {
    assert.equal(l.date, expectedDates[i]);
    assert.equal(l.start_time, "07:00");
  });
  assert.ok(!plan.lessons.some((l) => l.date === blockedDay));
});

test("preference #1 taken but day otherwise open -> falls to preference #2", () => {
  const day = DATES[2];
  const blocks = [blockAt("a", day, P1)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  const lessonOnDay = plan.lessons.find((l) => l.date === day);
  assert.ok(lessonOnDay);
  assert.equal(lessonOnDay.start_time, "18:00");
  // every other day still uses preference #1
  for (const l of plan.lessons) {
    if (l.date !== day) assert.equal(l.start_time, "07:00");
  }
});

test("preference #1 and #2 taken, #3 open -> falls to preference #3", () => {
  const day = DATES[2];
  const blocks = [blockAt("a", day, P1), blockAt("a", day, P2)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  const lessonOnDay = plan.lessons.find((l) => l.date === day);
  assert.equal(lessonOnDay.start_time, "19:00");
});

test("none of the 3 preferences free that day (but day has other open times) -> day is skipped, not a random time", () => {
  const day = DATES[1];
  // Block exactly the 3 preferred times on this day; leave every other grid
  // start on this day free, to prove the engine doesn't fall back to one of
  // those OTHER open times.
  const blocks = [blockAt("a", day, P1), blockAt("a", day, P2), blockAt("a", day, P3)];
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.ok(!plan.lessons.some((l) => l.date === day));
  // The displaced lesson lands on the next day instead, same first preference.
  const expectedDates = [DATES[0], DATES[2], DATES[3], DATES[4], DATES[5]];
  plan.lessons.forEach((l, i) => assert.equal(l.date, expectedDates[i]));
});

test("at most one lesson lands on any single calendar day", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1, P2, P3],
    10,
  );
  assert.equal(plan.ok, true);
  const dates = plan.lessons.map((l) => l.date);
  assert.equal(new Set(dates).size, dates.length, "no calendar date repeats");
});

test("works with a single preferred time (no 2nd/3rd choice given)", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [P1],
    3,
  );
  assert.equal(plan.ok, true);
  assert.deepEqual(
    plan.lessons.map((l) => l.start_time),
    ["07:00", "07:00", "07:00"],
  );
});

test("infeasible: not enough days left in the window to fit totalLessons", () => {
  const shortWindow = DATES.slice(0, 3); // only 3 days available
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: shortWindow }),
    shortWindow[0],
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, false);
});

test("startDate outside the date window -> infeasible", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    "2099-01-01",
    [P1, P2, P3],
    3,
  );
  assert.equal(plan.ok, false);
});

test("no preferred times given -> infeasible", () => {
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a")], { dates: DATES }),
    D0,
    [],
    3,
  );
  assert.equal(plan.ok, false);
});

test("picks the deterministically best instructor among those who can complete the plan", () => {
  // Instructor b is blocked on day 0 entirely, so only instructor a can serve
  // the FIRST lesson on the exact start date; both can serve the rest.
  const blocks = blockWholeDay("b", D0);
  const plan = computeCoursePlanPreferred(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    D0,
    [P1, P2, P3],
    5,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "a");
});

test("planCoursePreferred: raw plan without instructor selection (single instructor free-grid)", () => {
  const starts = candidateStartMinutes(SLOT_CONFIG);
  const freeByDate = new Map(DATES.map((d) => [d, starts]));
  const lessons = planCoursePreferred(freeByDate, DATES, D0, [P1, P2, P3], 4, 60);
  assert.ok(lessons);
  assert.equal(lessons.length, 4);
  lessons.forEach((l, i) => {
    assert.equal(l.lesson, i + 1);
    assert.equal(l.date, DATES[i]);
    assert.equal(l.start_time, "07:00");
  });
});

test("planCoursePreferred returns null when the instructor's free grid can't fit the course", () => {
  const starts = candidateStartMinutes(SLOT_CONFIG);
  // Only the start date has any free time at all.
  const freeByDate = new Map(DATES.map((d, i) => [d, i === 0 ? starts : []]));
  const lessons = planCoursePreferred(freeByDate, DATES, D0, [P1, P2, P3], 3, 60);
  assert.equal(lessons, null);
});
