import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCoursePlan } from "../_shared/availability.ts";
import {
  applyPlanEdit,
  computePlanEditCandidates,
  singleInstructorForSlots,
} from "../_shared/planEdit.ts";
import { addDaysISO } from "../_shared/validation.ts";

const SLOT_CONFIG = {
  slotStart: "06:00",
  slotEnd: "20:00",
  gridMinutes: 30,
  slotDurationMinutes: 60,
};
const GAP = 30;
const HOLD = 30;

const D0 = "2026-09-10"; // Thursday
const DATES = Array.from({ length: 14 }, (_, i) => addDaysISO(D0, i));

function instructor(id, overrides = {}) {
  return { id, areas: ["area-a"], gender: null, ...overrides };
}

const INPUT = (instructors, overrides = {}) => ({
  instructors,
  learnerArea: "area-a",
  learner: null,
  dates: DATES,
  slotConfig: SLOT_CONFIG,
  holdMinutes: HOLD,
  gapMinutes: GAP,
  ...overrides,
});

function block(instructorId, date, start, end, overrides = {}) {
  return {
    instructorId,
    date,
    startMinute: start,
    endMinute: end,
    status: "booked",
    bookingCreatedAt: null,
    ownerBookingId: null,
    ...overrides,
  };
}

function minute(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Plan starting 08:00 on day 0: 2/day back-to-back (08:00/09:00, then 06:00/07:00). */
function tenLessonPlan(instructors = [instructor("i1")], overrides = {}) {
  const input = INPUT(instructors, overrides);
  const plan = computeCoursePlan(input, { date: DATES[0], start: "08:00" }, 10);
  assert.equal(plan.ok, true, "10-lesson plan should build");
  assert.equal(plan.lessons.length, 10);
  return { input, plan };
}

function planValid(lessons, total) {
  assert.equal(lessons.length, total);
  lessons.forEach((l, i) => {
    assert.equal(l.lesson, i + 1);
    assert.equal(minute(l.end_time) - minute(l.start_time), 60);
    assert.ok(DATES.includes(l.date), `expected window date, got ${l.date}`);
  });
  for (let i = 0; i < lessons.length; i++) {
    for (let j = i + 1; j < lessons.length; j++) {
      const a = lessons[i];
      const b = lessons[j];
      if (a.date !== b.date) continue;
      const a0 = minute(a.start_time);
      const a1 = a0 + 60;
      const b0 = minute(b.start_time);
      const b1 = b0 + 60;
      assert.ok(!(a0 < b1 && b0 < a1), `overlapping lessons ${a.lesson} and ${b.lesson}`);
    }
  }
}

test("candidates for a mid-course lesson exclude its current slot; every candidate yields a valid plan", () => {
  const { input, plan } = tenLessonPlan();
  const lesson = plan.lessons[4]; // lesson 5
  const edit = computePlanEditCandidates(input, plan, lesson.lesson);
  assert.equal(edit.instructorId, "i1");
  assert.ok(edit.slots.length > 0);
  // The current slot of lesson 5 is never re-offered.
  assert.ok(!edit.slots.some((s) => s.date === lesson.date && s.start === lesson.start_time));
  // Applying any candidate returns a valid full plan with the lesson moved.
  const sample = edit.slots[0];
  const out = applyPlanEdit(input, plan, lesson.lesson, sample.date, sample.start);
  assert.equal(out.ok, true);
  planValid(out.lessons, 10);
  const moved = out.lessons.find((l) => l.lesson === lesson.lesson);
  assert.equal(moved.date, sample.date);
  assert.equal(moved.start_time, sample.start);
  assert.equal(out.instructorId, "i1");
});

test("candidates honour external occupancy including the instructor travel gap", () => {
  const { plan } = tenLessonPlan();
  const date8 = DATES[7];
  const busyInput = INPUT([instructor("i1")], {
    blocks: [block("i1", date8, minute("06:00"), minute("07:00"))],
  });
  const edit = computePlanEditCandidates(busyInput, plan, 3);
  // Buffered [05:30, 07:30) blocks 06:00 / 06:30 / 07:00 starts on that day.
  assert.ok(!edit.slots.some((s) => s.date === date8 && ["06:00", "06:30", "07:00"].includes(s.start)));
  // And applying an edit straight into the buffered slot is refused.
  const out = applyPlanEdit(busyInput, plan, 3, date8, "06:00");
  assert.equal(out.ok, false);
  assert.match(out.error || "", /no longer free with your trainer/i);
});

test("applyPlanEdit replans the whole course when lesson 1 changes (pick stays lesson 1)", () => {
  const { input, plan } = tenLessonPlan();
  const out = applyPlanEdit(input, plan, 1, DATES[0], "10:00");
  assert.equal(out.ok, true);
  assert.equal(out.totalLessons, 10);
  assert.equal(out.lessons[0].lesson, 1);
  assert.equal(out.lessons[0].date, DATES[0]);
  assert.equal(out.lessons[0].start_time, "10:00");
  planValid(out.lessons, 10);
});

test("applyPlanEdit refuses off-grid, out-of-window and invalid-lesson edits", () => {
  const { input, plan } = tenLessonPlan();
  assert.equal(applyPlanEdit(input, plan, 3, DATES[2], "06:15").ok, false); // off-grid
  assert.equal(applyPlanEdit(input, plan, 3, "2026-01-01", "08:00").ok, false); // out-of-window
  assert.equal(applyPlanEdit(input, plan, 99, DATES[2], "08:00").ok, false); // bad lesson
});

test("applyPlanEdit refuses a change that breaks the consecutive-slot rule", () => {
  // Crafted plan: day0 = 06:00 + 07:00 (adjacent pair), day1 = 06:00.
  const crafted = {
    ok: true,
    instructorId: "i1",
    totalLessons: 3,
    lessons: [
      { lesson: 1, date: DATES[0], day: "thursday", start_time: "06:00", end_time: "07:00" },
      { lesson: 2, date: DATES[0], day: "thursday", start_time: "07:00", end_time: "08:00" },
      { lesson: 3, date: DATES[1], day: "friday", start_time: "06:00", end_time: "07:00" },
    ],
  };
  // Moving lesson 3 onto day0 puts 3 lessons on one day -> rule violation.
  const out = applyPlanEdit(INPUT([instructor("i1")]), crafted, 3, DATES[0], "12:00");
  assert.equal(out.ok, false);
  assert.match(out.error || "", /lesson rules|consecutive|back to back/i);
});

test("singleInstructorForSlots returns the one instructor who can host every slot", () => {
  const { input, plan } = tenLessonPlan();
  assert.equal(singleInstructorForSlots(input, plan.lessons, 10), "i1");
});

test("singleInstructorForSlots rejects a plan whose slot was just taken", () => {
  const { input, plan } = tenLessonPlan();
  const blockedLesson = plan.lessons[2]; // lesson 3 (day 1, 06:00)
  const busyInput = INPUT([instructor("i1")], {
    blocks: [
      block(
        "i1",
        blockedLesson.date,
        minute(blockedLesson.start_time),
        minute(blockedLesson.end_time),
      ),
    ],
  });
  assert.equal(singleInstructorForSlots(busyInput, plan.lessons, 10), null);
});

test("singleInstructorForSlots accepts back-to-back same-day lessons but rejects rule breaks", () => {
  const { input } = tenLessonPlan();
  const adjacent = [
    { date: DATES[0], start_time: "08:00", end_time: "09:00" },
    { date: DATES[0], start_time: "09:00", end_time: "10:00" },
    { date: DATES[1], start_time: "06:00", end_time: "07:00" },
    { date: DATES[1], start_time: "07:00", end_time: "08:00" },
    { date: DATES[2], start_time: "06:00", end_time: "07:00" },
    { date: DATES[2], start_time: "07:00", end_time: "08:00" },
    { date: DATES[3], start_time: "06:00", end_time: "07:00" },
    { date: DATES[3], start_time: "07:00", end_time: "08:00" },
    { date: DATES[4], start_time: "06:00", end_time: "07:00" },
    { date: DATES[4], start_time: "07:00", end_time: "08:00" },
  ];
  assert.equal(singleInstructorForSlots(input, adjacent, 10), "i1");

  // Same day but NOT adjacent (free time, yet breaks the consecutive rule).
  const broken = adjacent.map((s) => ({ ...s }));
  broken[1] = { date: DATES[0], start_time: "10:00", end_time: "11:00" };
  assert.equal(singleInstructorForSlots(input, broken, 10), null);

  // Wrong lesson count is rejected outright.
  assert.equal(singleInstructorForSlots(input, adjacent.slice(0, 9), 10), null);
});

test("singleInstructorForSlots picks deterministically when multiple instructors fit", () => {
  const { input, plan } = tenLessonPlan([instructor("i1"), instructor("i2")]);
  assert.equal(plan.lessons.length, 10);
  assert.equal(singleInstructorForSlots(input, plan.lessons, 10), "i1"); // id sort tie-break
});