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
  return { id, areas: ["area-a"], gender: null, ...overrides };
}

const INPUT = (instructors, overrides = {}) => ({
  instructors,
  learnerArea: "area-a",
  learner: null,
  slotConfig: SLOT_CONFIG,
  ...overrides,
});

// Thursday
const D0 = "2026-09-10";
const DATES = Array.from({ length: 14 }, (_, i) => addDaysISO(D0, i));

const minute = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const time = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function block(instructorId, date, start, end, status = "booked", bookingCreatedAt = null) {
  return { instructorId, date, startMinute: minute(start), endMinute: minute(end), status, bookingCreatedAt };
}

const allStarts = () => candidateStartMinutes(SLOT_CONFIG);

// ---------------------------------------------------------------------------
// 1. Remaining slots = Schedule window minus occupied rows
// ---------------------------------------------------------------------------

test("every occupied Schedule status blocks its slot; the grid shows the remaining free time", () => {
  const occupancies = [
    ["booked", "05:00"],
    ["ongoing", "12:00"],
    ["paused", "13:00"],
  ];
  const freeDate = D0;
  const blocks = occupancies.map(([status, start]) =>
    block("i1", freeDate, start, time(minute(start) + 60), status),
  );
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], { dates: [freeDate], blocks }),
    [instructor("i1")],
  );
  const free = grid.get("i1").get(freeDate) || [];
  for (const [status, start] of occupancies) {
    assert.ok(!free.includes(minute(start)), `${status} @ ${start} must NOT be free`);
  }
  const dayStart = minute("06:00");
  assert.ok(free.includes(dayStart), "a slot before the block is still free");
});

test("cancelled and rejected schedule rows do NOT occupy their slot", () => {
  const blocks = [
    block("i1", D0, "12:00", "13:00", "cancelled"),
    block("i1", D0, "14:00", "15:00", "rejected"),
  ];
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], { dates: [D0], blocks }),
    [instructor("i1")],
  );
  const free = grid.get("i1").get(D0) || [];
  assert.ok(free.includes(minute("12:00")), "cancelled row is free again");
  assert.ok(free.includes(minute("14:00")), "rejected row is free again");
});

test("one instructor's occupancy never suppresses another instructor's slot", () => {
  const busy = allStarts().map((m) => block("i2", D0, time(m), time(m + 60)));
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1"), instructor("i2")], { dates: [D0], blocks: busy }),
    [instructor("i1"), instructor("i2")],
  );
  assert.equal((grid.get("i2").get(D0) || []).length, 0);
  assert.ok((grid.get("i1").get(D0) || []).length > 0);
});

test("expired pending_payment hold frees the slot end-to-end; a live hold removes it", () => {
  const hold = block("i1", D0, "12:00", "13:00", "pending_payment");
  const heldAt = "2026-09-10T12:00:00Z";
  const expiredConfig = { holdMinutes: 30, now: new Date("2026-09-10T12:40:00Z") };
  const liveConfig = { holdMinutes: 30, now: new Date("2026-09-10T12:05:00Z") };
  const inputExpired = INPUT([instructor("i1")], {
    dates: DATES.slice(0, 2),
    blocks: [{ ...hold, bookingCreatedAt: heldAt }],
    ...expiredConfig,
  });
  const gridExpired = computeFeasibleFirstSlots(inputExpired, 2);
  const day0 = gridExpired.dates.find((d) => d.date === D0);
  assert.ok(day0.slots.some((s) => s.start === "12:00"), "expired hold is free again");

  const liveInput = INPUT([instructor("i1")], {
    dates: DATES.slice(0, 2),
    blocks: [{ ...hold, bookingCreatedAt: heldAt }],
    ...liveConfig,
  });
  const gridLive = computeFeasibleFirstSlots(liveInput, 2);
  const day0Live = gridLive.dates.find((d) => d.date === D0);
  assert.ok(!day0Live.slots.some((s) => s.start === "12:00"), "live hold blocks the slot");
});

// ---------------------------------------------------------------------------
// 2. Same-instructor invariant (whole-course lock)
// ---------------------------------------------------------------------------

test("every feasible first slot maps to ONE instructor whose full plan stays with that instructor", () => {
  const blocks = [
    block("a", DATES[3], "10:00", "11:00"),
    block("a", DATES[5], "14:00", "15:00"),
    block("b", DATES[2], "10:00", "11:00"),
    block("b", DATES[7], "09:00", "10:00"),
  ];
  const input = INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks });
  const grid = computeFeasibleFirstSlots(input, 10);

  let checked = 0;
  for (const d of grid.dates) {
    for (const s of d.slots) {
      checked++;
      assert.equal(s.instructors.length, 1, "exactly one hidden instructor per slot");
      const plan = computeCoursePlan(input, { date: s.date, start: s.start }, 10);
      assert.equal(plan.ok, true, `plan from ${s.date} ${s.start} must build`);
      assert.equal(plan.instructorId, s.instructors[0], "plan instructor === slot instructor");
      assert.equal(plan.lessons.length, 10);
      assert.equal(plan.lessons[0].date, s.date, "lesson 1 is the picked first slot");
      assert.equal(plan.lessons[0].start_time, s.start);
      for (let i = 0; i < plan.lessons.length; i++) {
        const l = plan.lessons[i];
        assert.equal(minute(l.end_time) - minute(l.start_time), 60, "1-hour lesson");
        for (let j = i + 1; j < plan.lessons.length; j++) {
          const o = plan.lessons[j];
          if (l.date !== o.date) continue;
          assert.ok(
            !(minute(l.start_time) < minute(o.end_time) && minute(o.start_time) < minute(l.end_time)),
            `lessons ${i + 1} and ${j + 1} overlap`,
          );
        }
      }
    }
  }
  assert.ok(checked >= 10, `checked ${checked} grid slots`);
});

test("on the first-lesson day only strictly-later times are used (pick stays lesson 1)", () => {
  const free = new Map([[D0, allStarts()]]);
  const plan = planLessonsForInstructor(free, [D0], D0, minute("12:00"), 2, 60);
  assert.equal(plan.length, 2);
  assert.deepEqual(
    plan.map((l) => l.start_time),
    ["12:00", "13:00"],
  );
  assert.ok(plan.every((l) => minute(l.start_time) >= minute("12:00")));
});

test("a time is never offered if NO single instructor can complete the whole course there", () => {
  // Only i1 exists; on day1 it has just 9 contiguous free slots -> a 10-lesson
  // course can never start from day1, so the grid must be completely empty
  // even though day1 times are technically "free".
  const runDate = DATES[0];
  const keep = new Set(allStarts().slice(0, 9));
  const blocks = [];
  for (const date of DATES) {
    for (const m of allStarts()) {
      if (date === runDate && keep.has(m)) continue;
      blocks.push(block("i1", date, time(m), time(m + 60)));
    }
  }
  const grid = computeFeasibleFirstSlots(
    INPUT([instructor("i1")], { dates: DATES, blocks }),
    10,
  );
  const total = grid.dates.reduce((acc, d) => acc + d.slots.length, 0);
  assert.equal(total, 0);
});

// ---------------------------------------------------------------------------
// 3. Change-candidate correctness for the hidden instructor only
// ---------------------------------------------------------------------------

test("change candidates = hidden instructor's free grid minus own held lessons and other occupancy", () => {
  const now = new Date("2026-09-10T12:40:00Z");
  const ownHeldCreatedAt = "2026-09-10T12:30:00Z";
  const ownHeld = [
    block("i1", DATES[1], "12:00", "13:00", "pending_payment", ownHeldCreatedAt),
    block("i1", DATES[2], "12:00", "13:00", "pending_payment", ownHeldCreatedAt),
  ];
  const otherOccupancy = block("i1", DATES[3], "12:00", "13:00", "booked");
  const otherInstructorBlock = block("i2", DATES[4], "12:00", "13:00", "booked");
  const blocks = [...ownHeld, otherOccupancy, otherInstructorBlock];

  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], { dates: DATES, blocks, holdMinutes: 30, now }),
    [instructor("i1")],
  );

  const candidates = [];
  for (const d of DATES) {
    for (const m of grid.get("i1").get(d) || []) candidates.push(`${d}|${time(m)}`);
  }

  assert.ok(!candidates.includes(`${DATES[1]}|12:00`), "own held lesson 1 excluded");
  assert.ok(!candidates.includes(`${DATES[2]}|12:00`), "own held lesson 2 excluded");
  assert.ok(!candidates.includes(`${DATES[3]}|12:00`), "other booking's occupancy excluded");
  assert.ok(candidates.includes(`${DATES[4]}|12:00`), "another instructor's busy time is fine for i1");
  assert.ok(candidates.includes(`${DATES[0]}|12:00`), "i1's genuinely free time is offered");
  assert.ok(candidates.length > 10);
});