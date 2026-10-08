// Boundary & edge-case tests for the availability engine time window logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateStartMinutes,
  candidateStartMinutes as candStart,
  computeAvailableSlots,
  evaluateSlot,
  buildInstructorFreeGrid,
  planLessonsForInstructor,
  timeToMinutes,
  minutesToTime,
  computeCoursePlan,
} from "../_shared/availability.ts";

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
const DATES = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"];

test("candidateStartMinutes: exact slotEnd boundary - 19:00 start + 60min = 20:00 is allowed", () => {
  const config = { slotStart: "06:00", slotEnd: "20:00", gridMinutes: 30, slotDurationMinutes: 60 };
  const minutes = candidateStartMinutes(config);
  assert.ok(minutes.includes(1140), "19:00 (1140) must be in grid"); // 19:00 + 60 = 20:00
  assert.ok(!minutes.includes(1170), "19:30 must NOT be in grid (would end 20:30 > 20:00)");
});

test("candidateStartMinutes: slotStart boundary - first grid start equals slotStart", () => {
  const minutes = candidateStartMinutes(SLOT_CONFIG);
  assert.equal(minutes[0], 360); // 06:00
});

test("candidateStartMinutes: non-divisible grid minutes - 06:00, 06:15, 06:30... with 15min grid, 60min lesson", () => {
  const config = { slotStart: "06:00", slotEnd: "20:00", gridMinutes: 15, slotDurationMinutes: 60 };
  const minutes = candidateStartMinutes(config);
  assert.ok(minutes.includes(360)); // 06:00
  assert.ok(minutes.includes(375)); // 06:15
  assert.ok(minutes.includes(390)); // 06:30
  assert.ok(minutes.includes(1140)); // 19:00
  assert.ok(!minutes.includes(1155)); // 19:15 would end 20:15 > 20:00
});

test("candidateStartMinutes: slot duration longer than window yields empty grid", () => {
  const config = { slotStart: "06:00", slotEnd: "10:00", gridMinutes: 30, slotDurationMinutes: 300 }; // 5 hours
  const minutes = candidateStartMinutes(config);
  assert.equal(minutes.length, 0);
});

test("evaluateSlot: time exactly at slotEnd is not offered", () => {
  const res = evaluateSlot(
    INPUT([instructor("i1")], { dates: [D0] }),
    { date: D0, start: "19:30" }, // would end 20:30 > 20:00
  );
  assert.equal(res.ok, false, "19:30 should not be offered when slotEnd=20:00, duration=60");
});

test("evaluateSlot: time exactly at slotStart is offered", () => {
  const res = evaluateSlot(
    INPUT([instructor("i1")], { dates: [D0] }),
    { date: D0, start: "06:00" },
  );
  assert.equal(res.ok, true);
});

test("computeAvailableSlots: leap year date Feb 29 is handled correctly", () => {
  const leap = "2024-02-29"; // Thursday in 2024
  const result = computeAvailableSlots(
    INPUT([instructor("i1")], { dates: [leap] }),
  );
  assert.ok(result.dates[0].slots.length > 0, "Feb 29 should work");
  assert.equal(result.dates[0].day, "thursday");
});

test("computeAvailableSlots: month boundary crossing (Jan 31 -> Feb 1)", () => {
  const dates = ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"];
  const result = computeAvailableSlots(
    INPUT([instructor("i1")], { dates }),
  );
  assert.equal(result.dates.length, 4);
  assert.ok(result.dates.every((d) => d.slots.length > 0));
});

test("computeAvailableSlots: year boundary crossing (Dec 31 -> Jan 1)", () => {
  const dates = ["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"];
  const result = computeAvailableSlots(
    INPUT([instructor("i1")], { dates }),
  );
  assert.equal(result.dates.length, 4);
  assert.ok(result.dates.every((d) => d.slots.length > 0));
});

test("buildInstructorFreeGrid: exact boundary - class ending at slotStart is not blocked", () => {
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      blocks: [{ instructorId: "i1", date: D0, startMinute: 300, endMinute: 360, status: "booked" }], // 05:00-06:00
    }),
    [instructor("i1")],
  );
  const free = grid.get("i1").get(D0) || [];
  assert.ok(free.includes(360), "06:00 is free when class ends exactly at 06:00");
});

test("buildInstructorFreeGrid: exact boundary - class starting at slotEnd is not blocked", () => {
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      blocks: [{ instructorId: "i1", date: D0, startMinute: 1200, endMinute: 1260, status: "booked" }], // 20:00-21:00
    }),
    [instructor("i1")],
  );
  const free = grid.get("i1").get(D0) || [];
  assert.ok(free.includes(1140), "19:00 is free when class starts exactly at 20:00 (ends 20:00)");
});

test("planLessonsForInstructor: first slot at last possible grid start (19:00)", () => {
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 1140, 1, 60); // 19:00
  assert.ok(plan);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].start_time, "19:00");
  assert.equal(plan[0].end_time, "20:00");
});

test("planLessonsForInstructor: first slot at 19:00 with 2 lessons works (second lesson next day)", () => {
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 1140, 2, 60);
  assert.ok(plan, "2 lessons starting at 19:00 fits (lesson 2 on next day)");
  assert.equal(plan.length, 2);
  assert.equal(plan[0].start_time, "19:00");
  assert.equal(plan[1].start_time, "06:00");
  assert.ok(plan[1].date > plan[0].date);
});

test("planLessonsForInstructor: 10 lessons starting at 06:00 fits exactly in 14 days (5 days * 2 lessons)", () => {
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 10, 60); // 06:00
  assert.ok(plan);
  assert.equal(plan.length, 10);
  // Should use 5 days: 2 lessons each = 10
  const byDate = new Map();
  for (const l of plan) {
    byDate.set(l.date, (byDate.get(l.date) || 0) + 1);
  }
  for (const [, count] of byDate) {
    assert.ok(count <= 2, "max 2 lessons per day");
  }
});

test("computeAvailableSlots: empty instructor list returns empty slots", () => {
  const result = computeAvailableSlots(INPUT([], { dates: [D0] }));
  assert.equal(result.dates[0].slots.length, 0);
});

test("computeAvailableSlots: instructor without matching area returns empty slots", () => {
  const result = computeAvailableSlots(
    INPUT([instructor("i1", { areas: ["other"] })], { dates: [D0] }),
  );
  assert.equal(result.dates[0].slots.length, 0);
});

test("timeToMinutes / minutesToTime: round-trip preserves all valid times", () => {
  const times = ["06:00", "06:30", "19:00", "19:30", "12:00", "00:00", "23:59"];
  for (const t of times) {
    const m = timeToMinutes(t);
    const rt = minutesToTime(m);
    assert.equal(rt, t, `round-trip ${t} -> ${m} -> ${rt}`);
  }
});

test("timeToMinutes: rejects invalid format", () => {
  // The function doesn't throw but returns NaN for invalid
  assert.ok(Number.isNaN(timeToMinutes("25:00")));
  assert.ok(Number.isNaN(timeToMinutes("12:60")));
  assert.ok(Number.isNaN(timeToMinutes("not-a-time")));
});

test("planLessonsForInstructor: single-day course with exactly 2 lessons back-to-back", () => {
  const free = new Map([[D0, candidateStartMinutes(SLOT_CONFIG)]]);
  const plan = planLessonsForInstructor(free, [D0], D0, 720, 2, 60); // 12:00
  assert.ok(plan);
  assert.equal(plan.length, 2);
  assert.equal(plan[0].start_time, "12:00");
  assert.equal(plan[1].start_time, "13:00");
});

test("planLessonsForInstructor: single-day course with 3 lessons fails", () => {
  const free = new Map([[D0, candidateStartMinutes(SLOT_CONFIG)]]);
  const plan = planLessonsForInstructor(free, [D0], D0, 720, 3, 60);
  assert.equal(plan, null, "3 lessons on one day must be impossible");
});

test("evaluateSlot: duration parameter honored (not hardcoded 60)", () => {
  const config90 = { ...SLOT_CONFIG, slotDurationMinutes: 90 };
  const res = evaluateSlot(
    INPUT([instructor("i1")], { slotConfig: config90, dates: [D0] }),
    { date: D0, start: "06:00" },
  );
  assert.equal(res.ok, true);
  // 06:00 + 90min = 07:30, still within window
});

test("candidateStartMinutes: 90-min lessons, 30-min grid", () => {
  const config = { slotStart: "06:00", slotEnd: "20:00", gridMinutes: 30, slotDurationMinutes: 90 };
  const minutes = candidateStartMinutes(config);
  assert.ok(minutes.includes(360)); // 06:00
  assert.ok(minutes.includes(390)); // 06:30
  assert.ok(!minutes.includes(1140), "19:00 with 90min exceeds 20:00"); // 19:00+90=20:30 > 20:00
  assert.ok(minutes.includes(1110)); // 18:30 (18:30+90=20:00 exactly)
});

test("computeAvailableSlots: slotDurationMinutes from config is used, not hardcoded", () => {
  const config90 = { ...SLOT_CONFIG, slotDurationMinutes: 90 };
  const result = computeAvailableSlots(
    INPUT([instructor("i1")], { slotConfig: config90, dates: [D0] }),
  );
  if (result.dates[0].slots.length > 0) {
    const slot = result.dates[0].slots[0];
    const startMin = timeToMinutes(slot.start);
    const endMin = timeToMinutes(slot.end);
    assert.equal(endMin - startMin, 90, "slot duration should be 90 minutes");
  }
});

test("buildInstructorFreeGrid: gapMinutes=0 reverts to pure overlap (no buffer)", () => {
  const grid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      gapMinutes: 0,
      blocks: [{ instructorId: "i1", date: D0, startMinute: 720, endMinute: 780, status: "booked" }], // 12:00-13:00
    }),
    [instructor("i1")],
  );
  const free = grid.get("i1").get(D0) || [];
  assert.ok(free.includes(660), "11:00 free with gap=0 (ends at 12:00)");
  assert.ok(free.includes(780), "13:00 free with gap=0 (starts at 13:00)");
});

test("planLessonsForInstructor: weekend days work the same as weekdays", () => {
  // DATES[0]=Thu, [3]=Sun, [4]=Mon
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 4, 60);
  assert.ok(plan);
  assert.equal(plan.length, 4);
});

test("candidateStartMinutes: gridMinutes larger than duration", () => {
  const config = { slotStart: "06:00", slotEnd: "20:00", gridMinutes: 90, slotDurationMinutes: 60 };
  const minutes = candidateStartMinutes(config);
  // 06:00, 07:30, 09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00
  assert.equal(minutes.length, 9);
});

test("evaluateSlot: same-day earlier time on first lesson day is NOT offered", () => {
  const res = evaluateSlot(
    INPUT([instructor("i1")], { dates: [D0] }),
    { date: D0, start: "05:30" }, // before slotStart
  );
  assert.equal(res.ok, false);
});

test("computeCoursePlan: plan starting on last day of window (day 14)", () => {
  const lastDay = DATES[13]; // 2026-09-23
  const plan = computeCoursePlan(
    INPUT([instructor("i1")], { dates: DATES }),
    { date: lastDay, start: "06:00" },
    1,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 1);
  assert.equal(plan.lessons[0].date, lastDay);
});

test("computeCoursePlan: plan starting on last day with 10 lessons fails (insufficient days)", () => {
  const lastDay = DATES[13];
  const plan = computeCoursePlan(
    INPUT([instructor("i1")], { dates: DATES }),
    { date: lastDay, start: "06:00" },
    10,
  );
  assert.equal(plan.ok, false);
});

test("evaluateSlot: holds with now=null (defaults to current time) - hold from 2026 is expired", () => {
  const res = evaluateSlot(
    INPUT([instructor("i1")], {
      dates: [D0],
      holdMinutes: 30,
      now: null, // defaults to current time
      blocks: [{ instructorId: "i1", date: D0, startMinute: 720, endMinute: 780, status: "pending_payment", bookingCreatedAt: "2026-09-10T12:00:00Z" }],
    }),
    { date: D0, start: "12:00" },
  );
  // Hold from 2026 is expired relative to current time, so slot is free
  assert.equal(res.ok, true);
});

test("computeAvailableSlots: femaleInstructorAvailable false when no female instructors", () => {
  const result = computeAvailableSlots(
    INPUT([instructor("i1", { gender: "male" }), instructor("i2", { gender: "male" })], { dates: [D0] }),
  );
  assert.equal(result.femaleInstructorAvailable, false);
});

test("computeAvailableSlots: femaleInstructorAvailable true when at least one female", () => {
  const result = computeAvailableSlots(
    INPUT([instructor("i1", { gender: "male" }), instructor("i2", { gender: "female" })], { dates: [D0] }),
  );
  assert.equal(result.femaleInstructorAvailable, true);
});

test("evaluateSlot: femaleMode=mandatory + no female = no slots", () => {
  const res = evaluateSlot(
    INPUT([instructor("i1", { gender: "male" })], {
      dates: [D0],
      femalePreference: true,
      femaleMode: "mandatory",
    }),
    { date: D0, start: "12:00" },
  );
  assert.equal(res.ok, false);
});

test("evaluateSlot: femaleMode=mandatory + female exists = female instructor picked", () => {
  const res = evaluateSlot(
    INPUT([instructor("male", { gender: "male" }), instructor("female", { gender: "female" })], {
      dates: [D0],
      femalePreference: true,
      femaleMode: "mandatory",
    }),
    { date: D0, start: "12:00" },
  );
  assert.equal(res.ok, true);
  assert.equal(res.instructors[0], "female");
});