import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInstructorFreeGrid,
  candidateStartMinutes,
  computeCoursePlan,
  computeFeasibleFirstSlots,
  planLessonsForInstructor,
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

const D0 = "2026-09-10"; // Thursday
const DATES = Array.from({ length: 14 }, (_, i) => addDaysISO(D0, i));

test("computeCoursePlan builds a full 10-lesson plan (Masterclass) with lesson 1 = first slot", () => {
  const plan = computeCoursePlan(
    INPUT([instructor("i1"), instructor("i2")], { dates: DATES }),
    { date: D0, start: "12:00" },
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.totalLessons, 10);
  assert.equal(plan.lessons.length, 10);
  // Lesson 1 is exactly the customer's pick.
  assert.deepEqual(
    { lesson: plan.lessons[0].lesson, date: plan.lessons[0].date, start: plan.lessons[0].start_time },
    { lesson: 1, date: D0, start: "12:00" },
  );
  // Every lesson is one hour, numbered 1..10 in chronological order.
  plan.lessons.forEach((l, i) => {
    assert.equal(l.lesson, i + 1);
    assert.equal(l.end_time, addMinute(l.start_time));
  });
  const times = plan.lessons.map((l) => l.date + l.start_time);
  assert.deepEqual(times, [...times].sort());
  // No two lessons overlap.
  for (let i = 0; i < plan.lessons.length; i++) {
    for (let j = i + 1; j < plan.lessons.length; j++) {
      const a = plan.lessons[i];
      const b = plan.lessons[j];
      if (a.date !== b.date) continue;
      const a0 = minute(a.start_time);
      const a1 = a0 + 60;
      const b0 = minute(b.start_time);
      const b1 = b0 + 60;
      assert.ok(!(a0 < b1 && b0 < a1), `overlapping lessons ${i} and ${j}`);
    }
  }
});

test("computeCoursePlan builds an 8-lesson plan (Brush Up) from the same window", () => {
  const plan = computeCoursePlan(
    INPUT([instructor("i1")], { dates: DATES }),
    { date: D0, start: "10:00" },
    8,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 8);
  assert.equal(plan.lessons[0].start_time, "10:00");
});

test("a first slot is only feasible when the same instructor can complete the whole course", () => {
  // Instructor a is free everywhere. Instructor b only has an 8-slot run free
  // on one single day (06:00–09:30), i.e. 4 non-overlapping one-hour lessons.
  const runDate = DATES[1];
  const bBlocks = sparseBlocks("b", runDate, 8);
  const feasible = computeFeasibleFirstSlots(
    INPUT(
      [instructor("a"), instructor("b")],
      { dates: DATES, blocks: bBlocks },
    ),
    10,
  );
  // Every offered slot is feasible via instructor a.
  assert.ok(feasible.dates[0].slots.length > 0);
  for (const d of feasible.dates) {
    for (const s of d.slots) assert.deepEqual(s.instructors, ["a"]);
  }
  // Instructor b alone cannot form a 10-lesson course…
  const planB = computeCoursePlan(
    INPUT([instructor("b")], { dates: DATES, blocks: bBlocks }),
    { date: runDate, start: "06:00" },
    10,
  );
  assert.equal(planB.ok, false);
  // …but a 2-lesson course starting at 06:00 works with b (a single free day
  // can hold at most 2 lessons, and only consecutively).
  const planB2 = computeCoursePlan(
    INPUT([instructor("b")], { dates: DATES, blocks: bBlocks }),
    { date: runDate, start: "06:00" },
    2,
  );
  assert.equal(planB2.ok, true);
  assert.equal(planB2.lessons.length, 2);
  assert.equal(planB2.lessons[1].start_time, "07:00");
});

/**
 * Blocks every grid slot for `instructorId` on every date except a single
 * `freeDate`, where only the first `runLength` grid starts are left free
 * (a contiguous run => no half-hour neighbor blocks them).
 */
function sparseBlocks(instructorId, freeDate, runLength) {
  const starts = candidateStartMinutes(SLOT_CONFIG);
  const keep = new Set(starts.slice(0, runLength));
  const blocks = [];
  for (const date of DATES) {
    for (const s of starts) {
      if (date === freeDate && keep.has(s)) continue;
      blocks.push({ instructorId, date, startMinute: s, endMinute: s + 60, status: "booked" });
    }
  }
  return blocks;
}

test("identical date/time slots are deduplicated across instructors", () => {
  const result = computeFeasibleFirstSlots(
    INPUT([instructor("x"), instructor("y", { areas: ["area-a"] })], { dates: DATES }),
    10,
  );
  const keys = [];
  for (const d of result.dates) {
    for (const s of d.slots) {
      keys.push(`${s.date}|${s.start}`);
      assert.equal(s.instructors.length, 1);
    }
  }
  assert.equal(new Set(keys).size, keys.length);
});

test("expired pending_payment holds free the slot, live holds block it", () => {
  const heldAt = {
    instructorId: "i1",
    date: D0,
    startMinute: 720,
    endMinute: 780,
    status: "pending_payment",
  };
  const expired = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      holdMinutes: 30,
      now: new Date("2026-09-10T12:40:00Z"),
      blocks: [{ ...heldAt, bookingCreatedAt: "2026-09-10T12:00:00Z" }],
    }),
    [instructor("i1")],
  );
  assert.ok((expired.get("i1").get(D0) || []).includes(720));

  const live = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      holdMinutes: 30,
      now: new Date("2026-09-10T12:05:00Z"),
      blocks: [{ ...heldAt, bookingCreatedAt: "2026-09-10T12:00:00Z" }],
    }),
    [instructor("i1")],
  );
  assert.ok(!(live.get("i1").get(D0) || []).includes(720));
});

test("female preference picks a female instructor among feasible candidates", () => {
  const plan = computeCoursePlan(
    INPUT(
      [
        instructor("male", { gender: "male" }),
        instructor("female", { gender: "female" }),
      ],
      {
        dates: DATES,
        femalePreference: true,
        femaleMode: "preference",
      },
    ),
    { date: D0, start: "12:00" },
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "female");
  // Without the preference the deterministic pick still resolves (male id lower).
  const plan2 = computeCoursePlan(
    INPUT(
      [
        instructor("male", { gender: "male" }),
        instructor("female", { gender: "female" }),
      ],
      { dates: DATES, femalePreference: false, femaleMode: "preference" },
    ),
    { date: D0, start: "12:00" },
    10,
  );
  assert.equal(plan2.ok, true);
  assert.ok(["male", "female"].includes(plan2.instructorId));
});

test("an instructor with too few slots yields an empty feasible grid", () => {
  const result = computeFeasibleFirstSlots(
    INPUT([instructor("i1")], { dates: DATES, blocks: sparseBlocks("i1", DATES[1], 5) }),
    10,
  );
  assert.equal(result.dates.reduce((acc, d) => acc + d.slots.length, 0), 0);
});

test("planLessonsForInstructor never lets a same-day earlier lesson displace the first slot", () => {
  const starts = candidateStartMinutes(SLOT_CONFIG);
  const free = new Map([[D0, starts]]);
  const plan = planLessonsForInstructor(free, [D0], D0, 720, 2, 60);
  assert.equal(plan[0].start_time, "12:00");
  assert.equal(plan.length, 2);
  // The second lesson is the next grid start after the pick (back-to-back pair).
  assert.deepEqual(
    plan.map((l) => l.start_time),
    ["12:00", "13:00"],
  );
});

test("a single day can hold at most 2 lessons, and they must be back-to-back", () => {
  const starts = candidateStartMinutes(SLOT_CONFIG);
  const free = new Map([[D0, starts]]);
  // 3 lessons can never fit on one day.
  const plan = planLessonsForInstructor(free, [D0], D0, 720, 3, 60);
  assert.equal(plan, null, "3 same-day lessons must be impossible");
  // 2 lessons on one day are only consecutive when the second starts right
  // where the first ends.
  const pair = planLessonsForInstructor(free, [D0], D0, 720, 2, 60);
  assert.equal(minute(pair[1].start_time) - minute(pair[0].end_time), 0);
  assert.ok(minute(pair[1].start_time) >= minute("12:00"));
});

test("a 2+ day plan never puts more than 2 lessons on any day and keeps pairs consecutive", () => {
  const starts = candidateStartMinutes(SLOT_CONFIG);
  const free = new Map(DATES.map((d) => [d, starts]));
  const plan = planLessonsForInstructor(free, DATES, D0, 720, 10, 60);
  assert.ok(plan, "expected a full 10-lesson plan");
  assert.equal(plan.length, 10);
  for (const date of DATES) {
    const sameDay = plan.filter((l) => l.date === date).sort((a, b) => a.start_time.localeCompare(b.start_time));
    assert.ok(sameDay.length <= 2, `at most 2 lessons per day (${date})`);
    if (sameDay.length === 2) {
      assert.equal(minute(sameDay[1].start_time) - minute(sameDay[0].end_time), 0, `consecutive pair on ${date}`);
    }
  }
});

test("same time-of-day on later dates does NOT count as overlap (regular morning-only grid fits a full course)", () => {
  // A daily free window repeated for 14 days (e.g. an instructor who is only
  // free 06:00-12:00 daily) must still fit 10 lessons. Day 0 can only hold 2
  // lessons (06:00 + the back-to-back 07:00; max 2/day), so the plan MUST use
  // identical times on LATER dates — previously these were treated as
  // "overlapping" and the whole course was deemed unschedulable.
  const morningOnly = [];
  for (let m = 360; m < 720; m += 30) morningOnly.push(m); // 06:00..11:30
  assert.equal(morningOnly.length, 12);
  const free = new Map(DATES.map((d) => [d, morningOnly]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 10, 60);
  assert.ok(plan, "expected a full 10-lesson plan across 14 repeated mornings");
  assert.equal(plan.length, 10);
  assert.ok(plan[0].date === D0 && plan[0].start_time === "06:00");
  // Every day holds at most 2 consecutive lessons; the ones that can't share
  // day 0 are spread across later dates (identical start times reused).
  const lastSix = plan.slice(6);
  assert.ok(lastSix.every((l) => l.date > D0), "later lessons must fall on later dates");
  assert.ok(new Set(lastSix.map((l) => l.date)).size > 0);
});

function minute(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function addMinute(time) {
  const total = (minute(time) + 60) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}