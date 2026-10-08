// Beam-search engine behaviour: hard constraints, instructor selection,
// fallback ladder, auditability and versioning.
import { test } from "node:test";
import assert from "node:assert/strict";

import { scheduleCourse, SCHEDULER_ERROR, buildPlanVersion } from "../_shared/scheduler.ts";
import { planCourse } from "../_shared/coursePlanner.ts";
import {
  AREA,
  FAR_AWAY,
  INDIANAPORE,
  NOW,
  POINTER_10AM,
  block,
  days,
  enabledConfig,
  instructor,
  makeInput,
} from "./scheduler-fixtures.mjs";

function run(over = {}) {
  const { input, config, context } = over;
  return scheduleCourse({
    input,
    pointer: over.pointer ?? POINTER_10AM,
    totalLessons: over.totalLessons ?? 3,
    config,
    context: context ?? {},
  });
}

// ─── 1. single instructor, simple schedule ───────────────────────────────────
test("1. single instructor produces a complete schedule", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig(),
    totalLessons: 3,
  });
  assert.equal(out.ok, true);
  assert.equal(out.lessons.length, 3);
  assert.equal(out.instructorId, "i-1");
});

// ─── 20. first class must remain fixed ────────────────────────────────────────
test("20. the customer's first class is never moved", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig(),
    totalLessons: 4,
  });
  assert.equal(out.ok, true);
  assert.equal(out.lessons[0].date, POINTER_10AM.date);
  assert.equal(out.lessons[0].start_time, POINTER_10AM.start);
  assert.equal(out.lessons[0].lesson, 1);
});

test("20b. first class stays fixed even when later same-day times exist", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig({ beamWidth: 30 }),
    totalLessons: 4,
  });
  assert.equal(out.ok, true);
  // Only strictly-later times may follow on the first lesson's own day.
  if (out.lessons[1].date === POINTER_10AM.date) {
    assert.ok(out.lessons[1].start_time > POINTER_10AM.start);
  }
  assert.equal(out.lessons[0].start_time, "10:00");
});

// ─── 16 / 17. lesson counts ──────────────────────────────────────────────────
test("16. a one-lesson course returns exactly one lesson", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig(),
    totalLessons: 1,
  });
  assert.equal(out.ok, true);
  assert.equal(out.lessons.length, 1);
});

test("17. a ten-lesson course returns ten lessons", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig(),
    totalLessons: 10,
  });
  assert.equal(out.ok, true);
  assert.equal(out.lessons.length, 10);
  assert.deepEqual(out.lessons.map((l) => l.lesson), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

// ─── 4. all eligible instructors are evaluated, not just the first ───────────
test("4. the eligible pool is evaluated, not short-circuited to the first", () => {
  // i-1 is busy at the picked slot; i-2 must still be considered.
  const out = run({
    input: makeInput({
      instructors: [instructor("i-1"), instructor("i-2")],
      blocks: [block("i-1", POINTER_10AM.date, 600, 660)],
    }),
    config: enabledConfig(),
  });
  assert.equal(out.ok, true);
  assert.equal(out.instructorId, "i-2");
});

// ─── 8. existing instructor lesson conflict ───────────────────────────────────
test("8. an instructor booked over the first slot is rejected for it", () => {
  const out = run({
    input: makeInput({
      instructors: [instructor("i-1")],
      blocks: [block("i-1", POINTER_10AM.date, 600, 660)],
    }),
    config: enabledConfig(),
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, SCHEDULER_ERROR.FIRST_SLOT_UNAVAILABLE);
});

test("8b. every generated lesson avoids existing schedule rows", () => {
  const out = run({
    input: makeInput({
      instructors: [instructor("i-1")],
      blocks: [block("i-1", "2026-10-06", 600, 660)],
    }),
    config: enabledConfig(),
    totalLessons: 5,
  });
  assert.equal(out.ok, true);
  for (const l of out.lessons) {
    if (l.date === "2026-10-06" && l.start_time === "10:00") {
      assert.fail("generated a lesson on top of an existing booking");
    }
  }
});

// ─── 10. hard daily class limit ──────────────────────────────────────────────
test("10. the hard daily class limit is never exceeded", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig({ maxCustomerClassesPerDay: 1, preferredCustomerClassesPerDay: 1 }),
    totalLessons: 4,
  });
  assert.equal(out.ok, true);
  const perDay = new Map();
  for (const l of out.lessons) perDay.set(l.date, (perDay.get(l.date) ?? 0) + 1);
  for (const c of perDay.values()) assert.ok(c <= 1, `a day carried ${c} classes`);
});

test("10b. with a limit of 2, no day carries more than 2", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig({ maxCustomerClassesPerDay: 2, preferredCustomerClassesPerDay: 2 }),
    totalLessons: 8,
  });
  assert.equal(out.ok, true);
  const perDay = new Map();
  for (const l of out.lessons) perDay.set(l.date, (perDay.get(l.date) ?? 0) + 1);
  for (const c of perDay.values()) assert.ok(c <= 2);
});

// ─── 10c. same-day lessons stay back-to-back (existing hard rule kept) ───────
test("10c. two lessons on one day are immediately back-to-back", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig({ maxCustomerClassesPerDay: 2, preferredCustomerClassesPerDay: 2 }),
    totalLessons: 4,
  });
  assert.equal(out.ok, true);
  const byDate = new Map();
  for (const l of out.lessons) {
    if (!byDate.has(l.date)) byDate.set(l.date, []);
    byDate.get(l.date).push(l);
  }
  for (const [, ls] of byDate) {
    if (ls.length === 2) {
      assert.equal(ls[1].start_time, ls[0].end_time, "same-day lessons must be consecutive");
    }
  }
});

// ─── 18. no complete schedule ────────────────────────────────────────────────
test("18. no complete schedule returns NO_FEASIBLE_SCHEDULE", () => {
  const out = run({
    input: makeInput({
      instructors: [instructor("i-1")],
      dates: ["2026-10-05"],
      slotConfig: { slotStart: "10:00", slotEnd: "11:00", gridMinutes: 60, slotDurationMinutes: 60 },
    }),
    config: enabledConfig({ maxCustomerClassesPerDay: 2 }),
    totalLessons: 5,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, SCHEDULER_ERROR.NO_FEASIBLE_SCHEDULE);
  assert.equal(out.requiresExecutiveReview, true);
});

test("18b. no eligible instructor returns NO_ELIGIBLE_INSTRUCTOR", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1", { status: "on_break" })] }),
    config: enabledConfig(),
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, SCHEDULER_ERROR.NO_ELIGIBLE_INSTRUCTOR);
});

// ─── 14 / 15. female instructor ──────────────────────────────────────────────
test("14. female-only mode assigns the female instructor", () => {
  const out = run({
    input: makeInput({
      instructors: [instructor("i-male"), instructor("i-female", { gender: "female" })],
    }),
    config: enabledConfig(),
    context: { learnerPoint: INDIANAPORE },
  });
  assert.equal(out.ok, true);
  // Re-run with the mandatory flag.
  const forced = scheduleCourse({
    input: makeInput({
      instructors: [instructor("i-male"), instructor("i-female", { gender: "female" })],
      femaleMode: "mandatory",
      femalePreference: true,
    }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    config: enabledConfig(),
    context: {},
  });
  assert.equal(forced.ok, true);
  assert.equal(forced.instructorId, "i-female");
});

test("15. female-only mode with no female instructor fails loudly", () => {
  const out = scheduleCourse({
    input: makeInput({
      instructors: [instructor("i-male")],
      femaleMode: "mandatory",
      femalePreference: true,
    }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    config: enabledConfig(),
    context: {},
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, SCHEDULER_ERROR.FEMALE_INSTRUCTOR_UNAVAILABLE);
});

// ─── 9. customer availability: an instructor who cannot do the first slot ────
test("9. an instructor unavailable on the picked day is not scheduled", () => {
  const out = run({
    input: makeInput({
      instructors: [
        instructor("i-1", { unavailability: [{ booked_date: POINTER_10AM.date, all_day: true }] }),
      ],
    }),
    config: enabledConfig(),
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, SCHEDULER_ERROR.FIRST_SLOT_UNAVAILABLE);
});

// ─── 2 / 3. balancing across a multi-instructor pool ─────────────────────────
test("2. with several eligible instructors the less-loaded one is preferred", () => {
  const blocks = [
    // i-busy is already heavily booked; i-free has nothing.
    block("i-busy", "2026-10-05", 420, 480),
    block("i-busy", "2026-10-05", 480, 540),
    block("i-busy", "2026-10-06", 420, 480),
    block("i-busy", "2026-10-06", 480, 540),
    block("i-busy", "2026-10-07", 420, 480),
  ];
  const out = run({
    input: makeInput({ instructors: [instructor("i-busy"), instructor("i-free")], blocks }),
    config: enabledConfig(),
  });
  assert.equal(out.ok, true);
  assert.equal(out.instructorId, "i-free");
});

test("3. fewer booked hours beats a higher raw learner count", () => {
  // i-heavy has 2 lessons for 2 distinct learners; i-light has 3 lessons but all
  // for ONE learner. Hours and distinct learners are both considered, so the
  // choice must be driven by scheduled workload, not headcount.
  const blocks = [
    block("i-heavy", "2026-10-06", 420, 480, { learnerId: "l1" }),
    block("i-heavy", "2026-10-06", 480, 540, { learnerId: "l2" }),
    block("i-light", "2026-10-06", 420, 480, { learnerId: "l3" }),
    block("i-light", "2026-10-07", 420, 480, { learnerId: "l3" }),
    block("i-light", "2026-10-08", 420, 480, { learnerId: "l3" }),
  ];
  const out = run({
    input: makeInput({ instructors: [instructor("i-heavy"), instructor("i-light")], blocks }),
    config: enabledConfig(),
  });
  assert.equal(out.ok, true);
  assert.equal(out.instructorId, "i-heavy", "180 booked minutes beats 2 learners vs 1");
});

// ─── 4b. availability beats marginal load differences ─────────────────────────
test("4b. the heavily-loaded instructor is skipped when they cannot do the slot", () => {
  const out = run({
    input: makeInput({
      instructors: [instructor("i-busy"), instructor("i-free")],
      blocks: [
        ...[6, 7, 8, 9].map((d) => block("i-busy", `2026-10-0${d}`, 420, 480)),
        block("i-busy", POINTER_10AM.date, 600, 660),
      ],
    }),
    config: enabledConfig(),
  });
  assert.equal(out.ok, true);
  assert.equal(out.instructorId, "i-free");
});

// ─── 19. progressive fallback ────────────────────────────────────────────────
test("19. the fallback ladder expands the search window to find a plan", () => {
  // Only 2 classes fit inside the booking window, but 3 are needed. With
  // maxFallbackLevels=1 the search must fail...
  const narrow = makeInput({
    instructors: [instructor("i-1")],
    dates: ["2026-10-05", "2026-10-06"],
    slotConfig: { slotStart: "10:00", slotEnd: "12:00", gridMinutes: 60, slotDurationMinutes: 60 },
  });
  const strict = scheduleCourse({
    input: narrow,
    pointer: { date: "2026-10-05", start: "10:00" },
    totalLessons: 5,
    config: enabledConfig({ maxFallbackLevels: 1, maxCustomerClassesPerDay: 2 }),
    context: {},
  });
  assert.equal(strict.ok, false);

  // ...but with more levels plus extra dates it must succeed.
  const relaxed = scheduleCourse({
    input: narrow,
    pointer: { date: "2026-10-05", start: "10:00" },
    totalLessons: 5,
    config: enabledConfig({ maxFallbackLevels: 4, maxCustomerClassesPerDay: 2 }),
    context: { extraDates: ["2026-10-07", "2026-10-08"] },
  });
  assert.equal(relaxed.ok, true);
  assert.equal(relaxed.lessons.length, 5);
  assert.ok(relaxed.fallbackLevel >= 3, "the plan should come from a relaxed level");
});

test("19b. hard constraints survive every fallback level", () => {
  const out = scheduleCourse({
    input: makeInput({
      instructors: [instructor("i-1")],
      dates: ["2026-10-05"],
      slotConfig: { slotStart: "10:00", slotEnd: "12:00", gridMinutes: 60, slotDurationMinutes: 60 },
    }),
    pointer: { date: "2026-10-05", start: "10:00" },
    totalLessons: 6,
    config: enabledConfig({ maxFallbackLevels: 4, maxCustomerClassesPerDay: 2 }),
    context: { extraDates: ["2026-10-06"] },
  });
  // 2 days x 2 classes = 4 < 6, so even with extra dates it cannot be satisfied.
  assert.equal(out.ok, false);
});

// ─── 29. audit trail ─────────────────────────────────────────────────────────
test("29. the audit trail records rejections and the selection", () => {
  const audit = [];
  scheduleCourse({
    input: makeInput({
      instructors: [instructor("i-1"), instructor("i-2")],
      blocks: [block("i-2", POINTER_10AM.date, 600, 660)],
    }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    config: enabledConfig(),
    context: { onAudit: (e) => audit.push(e) },
  });
  assert.equal(audit.length, 2, "one rejection for the busy instructor, one selection");
  assert.equal(audit.filter((a) => a.outcome === "rejected").length, 1);
  assert.equal(audit.filter((a) => a.outcome === "selected").length, 1);
  const rejected = audit.find((a) => a.outcome === "rejected");
  assert.match(rejected.instructorId, /^i-/);
  assert.match(rejected.reason, /first slot conflicts/);
  assert.ok(audit.every((a) => typeof a.instructorId === "string" && a.instructorId.length > 0));
  assert.ok(audit.every((a) => typeof a.reason === "string" && a.reason.length > 0));
});

test("29a. an instructor who passes the first slot but cannot finish is audited too", () => {
  const audit = [];
  // i-solo is free at 10:00 but has no other time left on any later day.
  scheduleCourse({
    input: makeInput({
      instructors: [instructor("i-solo"), instructor("i-open")],
      dates: ["2026-10-05"],
      slotConfig: { slotStart: "10:00", slotEnd: "11:00", gridMinutes: 60, slotDurationMinutes: 60 },
    }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    config: enabledConfig(),
    context: { onAudit: (e) => audit.push(e) },
  });
  assert.ok(
    audit.some((a) => a.outcome === "rejected" && /hard constraints/.test(a.reason)),
    "the incomplete instructor must be audited with the reason it was dropped",
  );
});

test("29b. audit entries never leak into the customer-facing plan", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig(),
  });
  assert.equal(out.ok, true);
  for (const l of out.lessons) {
    assert.deepEqual(Object.keys(l).sort(), ["date", "day", "end_time", "lesson", "start_time"]);
  }
});

// ─── 6 / 7. travel ───────────────────────────────────────────────────────────
// The learner is ~11 km from the previous lesson's point. At 20 kph that needs
// ~33 min, so a 5-minute gap is impossible and a 90-minute gap is fine.
test("6. a travel-infeasible first slot is rejected", () => {
  const out = scheduleCourse({
    input: makeInput({
      instructors: [instructor("i-1")],
      blocks: [block("i-1", POINTER_10AM.date, 555, 595)], // ends 09:55, 5 min before 10:00
    }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    config: enabledConfig({ averageTravelSpeedKph: 20, instructorTravelBufferMinutes: 5 }),
    context: {
      learnerPoint: INDIANAPORE,
      blockLocations: new Map([
        ["i-1", new Map([[POINTER_10AM.date, [{ startMinute: 555, endMinute: 595, point: FAR_AWAY }]]])],
      ]),
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, SCHEDULER_ERROR.TRAVEL_CONFLICT);
});

test("6b. a reachable neighbour does not trigger a travel rejection", () => {
  const out = scheduleCourse({
    input: makeInput({
      instructors: [instructor("i-1")],
      blocks: [block("i-1", POINTER_10AM.date, 480, 540)], // ends 09:00, 60 min before 10:00
    }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    config: enabledConfig({ averageTravelSpeedKph: 20, instructorTravelBufferMinutes: 5 }),
    context: {
      learnerPoint: INDIANAPORE,
      blockLocations: new Map([
        ["i-1", new Map([[POINTER_10AM.date, [{ startMinute: 480, endMinute: 540, point: FAR_AWAY }]]])],
      ]),
    },
  });
  assert.equal(out.ok, true, "60 minutes is enough to cover 11 km at 20 kph plus a 5 min buffer");
  assert.equal(out.lessons.length, 3);
});

test("7. the travel safety buffer widens the protected window", () => {
  // A 30-minute gap: enough at 30 kph (~22 min) with no buffer, not enough once
  // a 20-minute safety buffer is required.
  const build = (buffer) =>
    scheduleCourse({
      input: makeInput({
        instructors: [instructor("i-1")],
        blocks: [block("i-1", POINTER_10AM.date, 510, 570)], // ends 09:30
      }),
      pointer: POINTER_10AM,
      totalLessons: 3,
      config: enabledConfig({ averageTravelSpeedKph: 30, instructorTravelBufferMinutes: buffer }),
      context: {
        learnerPoint: INDIANAPORE,
        blockLocations: new Map([
          ["i-1", new Map([[POINTER_10AM.date, [{ startMinute: 510, endMinute: 570, point: FAR_AWAY }]]])],
        ]),
      },
    });
  assert.equal(build(0).ok, true, "22 minutes of driving fits in a 30-minute gap");
  assert.equal(build(20).ok, false, "a 20-minute buffer leaves only 10 minutes of driving");
});

test("6c. travel is not enforced without a configured speed", () => {
  const out = scheduleCourse({
    input: makeInput({
      instructors: [instructor("i-1")],
      blocks: [block("i-1", POINTER_10AM.date, 555, 595)],
    }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    config: enabledConfig({ averageTravelSpeedKph: null }),
    context: {
      learnerPoint: INDIANAPORE,
      blockLocations: new Map([
        ["i-1", new Map([[POINTER_10AM.date, [{ startMinute: 555, endMinute: 595, point: FAR_AWAY }]]])],
      ]),
    },
  });
  assert.equal(out.ok, true, "no speed configured means no invented travel rule");
});

// ─── 28. versioning ──────────────────────────────────────────────────────────
test("28. a plan version carries algorithm, generator and score", () => {
  const v = buildPlanVersion({
    version: 2,
    config: enabledConfig({ algorithmVersion: "beam-3" }),
    score: 0.8123,
    generatedBy: "scheduler",
    generatedAt: NOW,
    changedBy: "ops@lane",
    changeReason: "customer asked to move lesson 3",
  });
  assert.equal(v.version, 2);
  assert.equal(v.algorithmVersion, "beam-3");
  assert.equal(v.score, 0.8123);
  assert.equal(v.generatedBy, "scheduler");
  assert.equal(v.changedBy, "ops@lane");
  assert.equal(v.changeReason, "customer asked to move lesson 3");
  assert.equal(v.generatedAt, NOW.toISOString());
});

// ─── coursePlanner seam: fail-open + determinism ─────────────────────────────
test("planner: scheduler off delegates to the legacy engine", () => {
  const out = planCourse({
    input: makeInput({ instructors: [instructor("i-1")] }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    bookingFlow: { enabled: true, payment_mode: "test" },
  });
  assert.equal(out.engine, "legacy");
  assert.equal(out.ok, true);
  assert.equal(out.lessons.length, 3);
});

test("planner: scheduler on uses the beam engine and returns scores", () => {
  const out = planCourse({
    input: makeInput({ instructors: [instructor("i-1")] }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    bookingFlow: { scheduler: { enabled: true, beam_width: 8 } },
  });
  assert.equal(out.engine, "beam");
  assert.equal(out.ok, true);
  assert.equal(typeof out.score, "number");
  assert.equal(out.algorithmVersion, "beam-1");
});

test("planner: the beam engine falls back to legacy rather than failing the customer", () => {
  // A config whose travel gate is unsatisfiable must not break booking.
  const out = planCourse({
    input: makeInput({
      instructors: [instructor("i-1")],
      blocks: [block("i-1", POINTER_10AM.date, 420, 480)],
    }),
    pointer: POINTER_10AM,
    totalLessons: 3,
    bookingFlow: {
      scheduler: { enabled: true, beam_width: 8, average_travel_speed_kph: 15, instructor_travel_buffer_minutes: 30 },
    },
    context: {
      learnerPoint: INDIANAPORE,
      blockLocations: new Map([
        ["i-1", new Map([[POINTER_10AM.date, [{ startMinute: 420, endMinute: 480, point: FAR_AWAY }]]])],
      ]),
    },
  });
  assert.equal(out.ok, true, "the customer must remain bookable");
});

// ─── 21 / 22 / 23. determinism, no double-booking, no reassignment ───────────
test("21/23. identical input yields an identical plan (deterministic)", () => {
  const input = makeInput({ instructors: [instructor("i-a"), instructor("i-b")] });
  const config = enabledConfig();
  const a = run({ input, config, totalLessons: 4 });
  const b = run({ input, config, totalLessons: 4 });
  assert.deepEqual(a.lessons, b.lessons);
  assert.equal(a.instructorId, b.instructorId);
  assert.equal(a.score, b.score);
});

test("26. a confirmed booking's instructor is not changed by later load shifts", () => {
  // An existing confirmed (booked) lesson belongs to i-a. Scheduling the NEW
  // customer must not reassign that learner: planCourse only ever writes new
  // lessons, and the existing row is treated as a hard block.
  const input = makeInput({
    instructors: [instructor("i-a"), instructor("i-b")],
    blocks: [block("i-a", POINTER_10AM.date, 600, 660, { status: "booked", learnerId: "existing-learner" })],
  });
  const out = run({ input, config: enabledConfig() });
  assert.equal(out.ok, true);
  assert.equal(out.instructorId, "i-b", "the new customer goes elsewhere; the booked row is untouched");
});

// ─── 11 / 12 / 13. distribution and spacing preferences ───────────────────────
test("11. the distribution score rewards an even spread", () => {
  const out = run({
    input: makeInput({ instructors: [instructor("i-1")] }),
    config: enabledConfig({ maxCustomerClassesPerDay: 1, preferredCustomerClassesPerDay: 1 }),
    totalLessons: 6,
  });
  assert.equal(out.ok, true);
  const distinct = new Set(out.lessons.map((l) => l.date)).size;
  assert.equal(distinct, 6, "a daily cap of 1 must spread the course over 6 days");
  assert.ok(out.components.scheduleDistribution > 0.9);
});

test("12/13. spacing and timing preferences influence the score, not feasibility", () => {
  const base = { input: makeInput({ instructors: [instructor("i-1")] }), totalLessons: 4 };
  const plain = run({ ...base, config: enabledConfig() });
  const picky = run({
    ...base,
    config: enabledConfig({ preferredStartMinutes: [600], preferredMaxGapDays: 1 }),
  });
  assert.equal(plain.ok, true);
  assert.equal(picky.ok, true);
  assert.equal(plain.lessons.length, picky.lessons.length);
  assert.notEqual(plain.score, picky.score, "preferences must move the score");
});

// ─── 33. bounded search ──────────────────────────────────────────────────────
test("33. the beam width bounds the work done", () => {
  const input = makeInput({ instructors: [instructor("i-1")] });
  const narrow = run({ input, config: enabledConfig({ beamWidth: 1 }), totalLessons: 5 });
  const wide = run({ input, config: enabledConfig({ beamWidth: 40 }), totalLessons: 5 });
  assert.equal(narrow.ok, true);
  assert.equal(wide.ok, true);
  assert.ok(narrow.score <= wide.score, "a wider beam cannot do worse");
});

test("33b. the candidate-instructor cap limits how many are considered", () => {
  const many = Array.from({ length: 6 }, (_, i) => instructor(`i-${i}`));
  const out = run({
    input: makeInput({ instructors: many }),
    config: enabledConfig({ maxCandidateInstructors: 2 }),
  });
  assert.equal(out.ok, true);
});