import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInstructorFreeGrid,
  candidateStartMinutes,
  computeFeasibleFirstSlots,
  instructorBookingLoad,
  pickBestInstructor,
  planLessonsForInstructor,
  validateConsecutiveRule,
} from "../_shared/availability.ts";
import { addDaysISO } from "../_shared/validation.ts";

const SLOT_CONFIG = {
  slotStart: "06:00",
  slotEnd: "20:00",
  gridMinutes: 30,
  slotDurationMinutes: 60,
};

const minute = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const time = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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

function block(instructorId, date, start, end, status = "booked", ownerBookingId = null) {
  return { instructorId, date, startMinute: minute(start), endMinute: minute(end), status, ownerBookingId };
}

// ---------------------------------------------------------------------------
// Instructor travel gap (30 min between the same instructor's classes)
// ---------------------------------------------------------------------------

test("the 30-min instructor travel gap removes slots adjacent to another class", () => {
  const daily = DATES.map((d) => block("i1", d, "07:00", "08:00"));
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], { dates: DATES, gapMinutes: 30, blocks: daily }),
    [instructor("i1")],
  );
  const free = grid.get("i1").get(D0) || [];
  // Everything from 06:00 (ends exactly at the block's start) through 08:00
  // (starts exactly at the block's end) must be blocked by the 30-min buffer.
  for (const blocked of [360, 390, 420, 450, 480]) {
    assert.ok(!free.includes(blocked), `${time(blocked)} must be blocked`);
  }
  assert.ok(free.includes(510), "08:30 is the first free slot (30 min after the class)");
  assert.ok(free.includes(630), "10:30 is free");
});

test("a booked class at 12:00-13:00 leaves only 10:30 and 13:30 (gap=30)", () => {
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      gapMinutes: 30,
      blocks: [block("i1", D0, "12:00", "13:00")],
    }),
    [instructor("i1")],
  );
  const free = grid.get("i1").get(D0) || [];
  // [12:00,13:00] + 30 buffer => blocks everything up to and including 13:00.
  assert.ok(free.includes(630), "10:30 free (ends 30 min before the class)");
  assert.ok(!free.includes(660), "11:00 blocked (ends exactly at 12:00 => 0 gap)");
  assert.ok(!free.includes(720), "12:00 blocked");
  assert.ok(!free.includes(780), "13:00 blocked (starts exactly at 13:00 => 0 gap)");
  assert.ok(free.includes(810), "13:30 free (starts 30 min after the class)");
});

test("own booking's consecutive lessons are exempt from the travel gap", () => {
  const own = [
    { ...block("i1", D0, "12:00", "13:00", "pending_payment"), ownerBookingId: "b1" },
  ];
  const exempt = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      gapMinutes: 30,
      excludeBookingId: "b1",
      blocks: own,
    }),
    [instructor("i1")],
  );
  // Adjacent own lesson → no 30-min buffer, so 13:00 is a valid back-to-back slot.
  assert.ok((exempt.get("i1").get(D0) || []).includes(780), "adjacent own slot is free");

  const other = [{ ...block("i1", D0, "12:00", "13:00", "booked"), ownerBookingId: "b2" }];
  const gapped = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      gapMinutes: 30,
      excludeBookingId: "b1",
      blocks: other,
    }),
    [instructor("i1")],
  );
  assert.ok(!(gapped.get("i1").get(D0) || []).includes(780), "other booking needs the gap: 13:00 blocked");
  assert.ok((gapped.get("i1").get(D0) || []).includes(810), "13:30 offered instead");
});

test("with no travel gap configured the engine keeps pure-overlap behaviour", () => {
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      blocks: [block("i1", D0, "12:00", "13:00")],
    }),
    [instructor("i1")],
  );
  const free = grid.get("i1").get(D0) || [];
  assert.ok(free.includes(660), "11:00 free (pure-overlap mode, no gap)");
  assert.ok(free.includes(780), "13:00 free (pure-overlap mode, no gap)");
  assert.ok(!free.includes(720), "12:00 itself is still blocked");
});

// ---------------------------------------------------------------------------
// Load balancing (least-booked instructor first)
// ---------------------------------------------------------------------------

test("pickBestInstructor prefers the least-loaded instructor before distance/id", () => {
  const id = pickBestInstructor([instructor("a"), instructor("b")], {
    learnerArea: "area-a",
    loadById: { a: 3, b: 0 },
  });
  assert.equal(id, "b");
  const flip = pickBestInstructor([instructor("a"), instructor("b")], {
    learnerArea: "area-a",
    loadById: { a: 0, b: 3 },
  });
  assert.equal(flip, "a");
  // Without a load map everyone is equal -> deterministic id tiebreak.
  assert.equal(pickBestInstructor([instructor("b"), instructor("a")], { learnerArea: "area-a" }), "a");
});

test("instructorBookingLoad counts active rows and skips cancelled + expired holds", () => {
  const now = new Date("2026-09-10T12:40:00Z");
  const load = instructorBookingLoad(
    [
      block("i1", D0, "09:00", "10:00", "booked"),
      block("i1", D0, "11:00", "12:00", "cancelled"),
      { ...block("i2", D0, "13:00", "14:00", "pending_payment"), bookingCreatedAt: "2026-09-10T12:00:00Z" },
      block("i2", D0, "15:00", "16:00", "pending_payment"),
    ],
    30,
    now,
  );
  assert.equal(load.i1, 1);
  assert.equal(load.i2, 1); // expired hold (created >30 min ago) is not counted
});

test("identical date/time slots are assigned to the least-booked instructor (load balancing)", () => {
  const aLoad = [
    block("a", DATES[1], "06:00", "07:00"),
    block("a", DATES[2], "06:00", "07:00"),
    block("a", DATES[3], "06:00", "07:00"),
  ];
  const result = computeFeasibleFirstSlots(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks: aLoad }),
    10,
  );
  let checked = 0;
  for (const d of result.dates) {
    for (const s of d.slots) {
      checked++;
      assert.equal(s.instructors[0], "b", "every slot must map to the least-loaded instructor");
    }
  }
  assert.ok(checked > 0, "expected feasible slots");
});

// ---------------------------------------------------------------------------
// Consecutive-slot booking rule (max 2/day, back-to-back pair)
// ---------------------------------------------------------------------------

test("validateConsecutiveRule accepts a compliant plan and rejects violations", () => {
  const okPlan = [
    { date: D0, start_time: "12:00", end_time: "13:00" },
    { date: D0, start_time: "13:00", end_time: "14:00" },
    { date: DATES[1], start_time: "09:00", end_time: "10:00" },
    { date: DATES[1], start_time: "10:00", end_time: "11:00" },
  ];
  assert.equal(validateConsecutiveRule(okPlan), null);

  const tooMany = [...okPlan, { date: DATES[1], start_time: "12:00", end_time: "13:00" }];
  assert.ok(validateConsecutiveRule(tooMany), "3 lessons on one day rejected");

  const nonConsecutive = [
    { date: D0, start_time: "10:00", end_time: "11:00" },
    { date: D0, start_time: "12:00", end_time: "13:00" },
  ];
  assert.ok(validateConsecutiveRule(nonConsecutive), "same-day gap rejected");

  const overlap = [
    { date: D0, start_time: "10:00", end_time: "11:30" },
    { date: D0, start_time: "11:00", end_time: "12:00" },
  ];
  assert.ok(validateConsecutiveRule(overlap), "overlapping lessons rejected");

  // Single lessons on separate days are always fine.
  assert.equal(
    validateConsecutiveRule([
      { date: D0, start_time: "10:00", end_time: "11:00" },
      { date: DATES[1], start_time: "10:00", end_time: "11:00" },
    ]),
    null,
  );
});

test("planLessonsForInstructor lays a 10-lesson course out as five 2-hour back-to-back sessions", () => {
  const starts = candidateStartMinutes(SLOT_CONFIG);
  const free = new Map(DATES.map((d) => [d, starts]));
  const plan = planLessonsForInstructor(free, DATES, D0, minute("12:00"), 10, 60);
  assert.ok(plan, "expected a plan");
  assert.equal(plan.length, 10);
  const byDate = new Map();
  for (const l of plan) {
    byDate.set(l.date, (byDate.get(l.date) || []).concat(l.start_time));
  }
  for (const [date, times] of byDate) {
    times.sort();
    assert.ok(times.length <= 2, `at most 2 lessons on ${date}`);
    if (times.length === 2) {
      assert.equal(minute(times[1]) - minute(times[0]), 60, `pair on ${date} is back-to-back`);
    }
  }
  assert.equal(byDate.get(D0).length, 2, "day 1 holds the pick + its immediate pair");
});

test("a non-adjacent free slot never becomes a same-day second lesson (18:00 after 08:30)", () => {
  // Day 1 free grid = [08:30, 18:00] (no adjacent 09:30). The planner must NOT
  // place the 18:00 slot on the first day: the consecutive rule requires a
  // second same-day lesson to be back-to-back, and the DB backstop rejects
  // anything else.
  const starts = (from, to) => {
    const out = [];
    for (let m = from; m <= to; m += 30) out.push(m);
    return out;
  };
  const free = new Map();
  free.set(D0, [minute("08:30"), minute("18:00")]);
  for (const d of DATES.slice(1)) free.set(d, starts(minute("06:00"), minute("16:00")));
  const plan = planLessonsForInstructor(free, DATES, D0, minute("08:30"), 4, 60);
  assert.ok(plan, "expected a plan");
  assert.equal(plan.length, 4);
  const day0 = plan.filter((l) => l.date === D0);
  assert.equal(day0.length, 1, "only the pick is placed on day 1");
  assert.equal(day0[0].start_time, "08:30");
  assert.equal(validateConsecutiveRule(plan), null, "plan must satisfy the consecutive rule");
});