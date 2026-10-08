// Integration-style edge case tests - full flow scenarios combining multiple components.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBookingFlowConfig } from "../_shared/config.ts";
import {
  computeCoursePlan,
  computeFeasibleFirstSlots,
  computeAvailableSlots,
  candidateStartMinutes,
  buildInstructorFreeGrid,
  evaluateSlot,
  isTimeUnavailable,
  areaEligibleInstructors,
  pickBestInstructor,
  instructorBookingLoad,
  planLessonsForInstructor,
} from "../_shared/availability.ts";
import { resolveServiceability } from "../_shared/serviceability.ts";
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

const block = (instructorId, date, start, end, status = "booked", ownerBookingId = null, bookingCreatedAt = null) => ({
  instructorId,
  date,
  startMinute: (() => { const [h, m] = start.split(":").map(Number); return h * 60 + m; })(),
  endMinute: (() => { const [h, m] = end.split(":").map(Number); return h * 60 + m; })(),
  status,
  ownerBookingId,
  bookingCreatedAt,
});

const ACTIVE_AREA = { id: "area-1", name: "Test Area" };
const SQUARE = () => ([
  [77.57, 12.96], [77.59, 12.96], [77.59, 12.98], [77.57, 12.98], [77.57, 12.96]
]);

function ins(id, overrides = {}) {
  return {
    id, areas: ["Test Area"], radiusKm: null, lat: null, lng: null,
    gender: null, status: "active", enabled: true, ...overrides,
  };
}

function resolve({ lat, lng, instructors, zones, areas }) {
  return resolveServiceability({ lat, lng, zones, instructors, areas });
}

// ---------------------------------------------------------------------------
// 1. Location -> Slots -> Plan -> Create flow
// ---------------------------------------------------------------------------

test("INTEGRATION: Location mode -> slots -> plan -> create flow (10 lessons)", () => {
  // 1. Resolve location
  const locResult = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(locResult.serviceable, true);
  assert.equal(locResult.eligibleInstructorCount, 1);

  // 2. Get feasible first slots using eligible instructors
  const dates = DATES;
  const learnerArea = locResult.areaName;
  const freeGrid = buildInstructorFreeGrid(
    INPUT(locResult.eligibleInstructors, { dates, learnerArea }),
    locResult.eligibleInstructors,
  );
  const feasible = computeFeasibleFirstSlots(
    INPUT(locResult.eligibleInstructors, { dates, blocks: [], learnerArea }),
    10,
  );
  const totalSlots = feasible.dates.reduce((acc, d) => acc + d.slots.length, 0);
  assert.ok(totalSlots > 0, "should have feasible first slots");

  // 3. Pick first slot and generate full plan
  const firstSlot = feasible.dates[0].slots[0];
  const plan = computeCoursePlan(
    INPUT(locResult.eligibleInstructors, { dates, blocks: [], learnerArea }),
    { date: firstSlot.date, start: firstSlot.start },
    10,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  assert.equal(plan.instructorId, "i1");
  assert.equal(plan.lessons[0].date, firstSlot.date);
  assert.equal(plan.lessons[0].start_time, firstSlot.start);
});

test("INTEGRATION: Location mode with zone polygon -> slots -> plan", () => {
  const locResult = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(locResult.serviceable, true);
  assert.deepEqual(locResult.zoneInstructorIds, ["i1"]);

  const learnerArea = locResult.areaName;
  const freeGrid = buildInstructorFreeGrid(
    INPUT(locResult.eligibleInstructors, { dates: DATES, learnerArea }),
    locResult.eligibleInstructors,
  );
  const feasible = computeFeasibleFirstSlots(
    INPUT(locResult.eligibleInstructors, { dates: DATES, blocks: [], learnerArea }),
    10,
  );
  assert.ok(feasible.dates[0].slots.length > 0);
});

test("INTEGRATION: Location not serviceable -> no slots", () => {
  const locResult = resolve({
    lat: 10.0, lng: 70.0, // far away
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 10 })],
    zones: [],
    areas: [ACTIVE_AREA],
  });
  assert.equal(locResult.serviceable, false);
  assert.equal(locResult.eligibleInstructorCount, 0);
});

test("INTEGRATION: Non-DL learner with location -> pure function returns direct mode (edge function handles assign_later)", () => {
  const locResult = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(locResult.serviceable, true);

  // Pure function always returns direct; edge function handles assign_later for non-DL
  const result = computeAvailableSlots(
    INPUT(locResult.eligibleInstructors, {
      dates: DATES,
      has_a_DL: false,
    }),
  );
  // Pure function returns direct; edge function handles the assign_later logic
  assert.equal(result.schedulingMode, "direct");
});

// ---------------------------------------------------------------------------
// 2. Unavailability + Slot Grid + Plan integration
// ---------------------------------------------------------------------------

test("INTEGRATION: Instructor unavailability blocks slots in grid and plan", () => {
  const unavailability = [{ booked_date: D0, booked_start_time: "10:00", booked_end_time: "14:00" }];
  const freeGrid = buildInstructorFreeGrid(
    INPUT([instructor("i1", { unavailability })], { dates: [D0] }),
    [instructor("i1", { unavailability })],
  );
  const free = freeGrid.get("i1").get(D0) || [];
  // 10:00-14:00 blocked
  assert.ok(!free.includes(600), "10:00 blocked");
  assert.ok(!free.includes(660), "11:00 blocked");
  assert.ok(!free.includes(720), "12:00 blocked");
  assert.ok(!free.includes(780), "13:00 blocked");
  assert.ok(free.includes(540), "09:00 free");
  assert.ok(free.includes(840), "14:00 free");

  // Plan should work around unavailability
  const plan = computeCoursePlan(
    INPUT([instructor("i1", { unavailability })], { dates: DATES }),
    { date: D0, start: "09:00" },
    4,
  );
  assert.equal(plan.ok, true);
  // Lesson 1 at 09:00, lesson 2 at 10:00 would be blocked by unavailability
  // So lesson 2 should be on next day or later
  assert.ok(plan.lessons.some((l) => l.date !== D0), "lessons should flow to next days");
});

test("INTEGRATION: Recurring unavailability (Friday all-day) blocks all Friday slots", () => {
  const fri = "2026-09-11";
  const unavailability = [{ type: "recurring", days_of_week: ["friday"], all_day: true }];
  const freeGrid = buildInstructorFreeGrid(
    INPUT([instructor("i1", { unavailability })], { dates: [fri] }),
    [instructor("i1", { unavailability })],
  );
  const free = freeGrid.get("i1").get(fri) || [];
  assert.equal(free.length, 0, "all slots blocked on Friday");
});

test("INTEGRATION: Instructor gap (30 min) affects free grid", () => {
  const blocks = [block("i1", D0, "12:00", "13:00")];
  const freeGrid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], { dates: [D0], gapMinutes: 30, blocks }),
    [instructor("i1")],
  );
  const free = freeGrid.get("i1").get(D0) || [];
  // 12:00-13:00 + 30 min buffer = blocks 11:30-13:30
  assert.ok(!free.includes(690), "11:30 blocked (ends at 12:00)");
  assert.ok(!free.includes(720), "12:00 blocked");
  assert.ok(!free.includes(780), "13:00 blocked");
  assert.ok(free.includes(810), "13:30 free (30 min after class ends)");
  assert.ok(!free.includes(660), "11:00 blocked (ends exactly at 12:00, gap=0)");
  assert.ok(free.includes(630), "10:30 free (ends 30 min before class)");
  assert.ok(free.includes(840), "14:00 free");
});

// ---------------------------------------------------------------------------
// 3. Load balancing integration
// ---------------------------------------------------------------------------

test("INTEGRATION: Load balancing picks least-loaded instructor for grid and plan", () => {
  // Instructor 'a' has 3 lessons, 'b' has 0
  const blocks = [
    block("a", DATES[1], "06:00", "07:00"),
    block("a", DATES[2], "06:00", "07:00"),
    block("a", DATES[3], "06:00", "07:00"),
  ];
  const result = computeFeasibleFirstSlots(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    4,
  );
  // All slots should map to 'b' (least loaded)
  for (const d of result.dates) {
    for (const s of d.slots) {
      assert.equal(s.instructors[0], "b");
    }
  }

  // Plan from any slot should also pick 'b'
  const firstSlot = result.dates[0].slots[0];
  const plan = computeCoursePlan(
    INPUT([instructor("a"), instructor("b")], { dates: DATES, blocks }),
    { date: firstSlot.date, start: firstSlot.start },
    4,
  );
  assert.equal(plan.instructorId, "b");
});

// ---------------------------------------------------------------------------
// 4. Config validation integration
// ---------------------------------------------------------------------------

test("INTEGRATION: Config missing payment_mode disables entire flow", () => {
  const config = readBookingFlowConfig({
    enabled: true,
    gateway: "razorpay",
    // payment_mode missing
    hold_minutes: 30,
    max_slots_per_booking: 20,
    booking_days_ahead: 14,
    slot_start: "06:00",
    slot_end: "20:00",
    slot_grid_minutes: 30,
    slot_duration_minutes: 60,
    instructor_gap_minutes: 30,
    female_instructor_mode: "preference",
    installment_modes: ["full"],
  });
  assert.equal(config.enabled, false);
});

test("INTEGRATION: Config with invalid slot_start format disables flow", () => {
  const config = readBookingFlowConfig({
    enabled: true,
    gateway: "razorpay",
    payment_mode: "test",
    hold_minutes: 30,
    max_slots_per_booking: 20,
    booking_days_ahead: 14,
    slot_start: "6:00", // missing leading zero
    slot_end: "20:00",
    slot_grid_minutes: 30,
    slot_duration_minutes: 60,
    instructor_gap_minutes: 30,
    female_instructor_mode: "preference",
    installment_modes: ["full"],
  });
  assert.equal(config.enabled, false);
});

// ---------------------------------------------------------------------------
// 5. Hold expiry integration
// ---------------------------------------------------------------------------

test("INTEGRATION: Expired hold frees slot in grid and allows new plan", () => {
  const heldAt = "2026-09-10T12:00:00Z";
  const now = new Date("2026-09-10T12:40:00Z"); // 40 min later, hold=30 => expired
  const holdBlock = block("i1", D0, "12:00", "13:00", "pending_payment", null, heldAt);

  const freeGrid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], { dates: [D0], holdMinutes: 30, now, blocks: [holdBlock] }),
    [instructor("i1")],
  );
  const free = freeGrid.get("i1").get(D0) || [];
  assert.ok(free.includes(720), "12:00 free after hold expires");

  // Plan should work
  const plan = computeCoursePlan(
    INPUT([instructor("i1")], { dates: [D0], holdMinutes: 30, now, blocks: [holdBlock] }),
    { date: D0, start: "12:00" },
    1,
  );
  assert.equal(plan.ok, true);
});

test("INTEGRATION: Live hold blocks slot in grid and plan", () => {
  const heldAt = "2026-09-10T12:00:00Z";
  const now = new Date("2026-09-10T12:05:00Z"); // 5 min later, hold=30 => live
  const holdBlock = block("i1", D0, "12:00", "13:00", "pending_payment", null, heldAt);

  const freeGrid = buildInstructorFreeGrid(
    INPUT([instructor("i1")], { dates: [D0], holdMinutes: 30, now, blocks: [holdBlock] }),
    [instructor("i1")],
  );
  const free = freeGrid.get("i1").get(D0) || [];
  assert.ok(!free.includes(720), "12:00 blocked by live hold");

  const res = evaluateSlot(
    INPUT([instructor("i1")], { dates: [D0], holdMinutes: 30, now, blocks: [holdBlock] }),
    { date: D0, start: "12:00" },
  );
  assert.equal(res.ok, false);
});

// ---------------------------------------------------------------------------
// 6. Consecutive rule + load balancing + unavailability combo
// ---------------------------------------------------------------------------

test("INTEGRATION: Consecutive rule + unavailability + load balancing", () => {
  // Instructor 'a' has unavailability on D0 10:00-12:00, but is least loaded
  // Instructor 'b' has no unavailability but more load
  const blocks = [
    block("a", DATES[1], "06:00", "07:00"),
    block("a", DATES[2], "06:00", "07:00"),
    block("a", DATES[3], "06:00", "07:00"),
  ];
  const unavail = [{ booked_date: D0, booked_start_time: "10:00", booked_end_time: "12:00" }];

  const result = computeFeasibleFirstSlots(
    INPUT([instructor("a", { unavailability: unavail }), instructor("b")], {
      dates: DATES,
      blocks,
    }),
    4,
  );

  // 'b' should be preferred for slots during a's unavailability
  // and for slots where 'a' is busy
  let bCount = 0, aCount = 0;
  for (const d of result.dates) {
    for (const s of d.slots) {
      if (s.instructors[0] === "b") bCount++;
      else aCount++;
    }
  }
  assert.ok(bCount > 0, "instructor b should get some slots");
});

// ---------------------------------------------------------------------------
// 7. Edge: maximum lessons at boundary
// ---------------------------------------------------------------------------

test("INTEGRATION: 20 lessons (max_slots_per_booking=20) fits in 14 days", () => {
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 20, 60);
  assert.ok(plan);
  assert.equal(plan.length, 20);
  // Check no day has > 2 lessons
  const byDate = new Map();
  for (const l of plan) {
    byDate.set(l.date, (byDate.get(l.date) || 0) + 1);
  }
  for (const [date, count] of byDate) {
    assert.ok(count <= 2, `day ${date} has ${count} lessons`);
  }
});

test("INTEGRATION: 21 lessons fits in 14 days (max 28 with 2/day)", () => {
  const free = new Map(DATES.map((d) => [d, candidateStartMinutes(SLOT_CONFIG)]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 21, 60);
  assert.ok(plan);
  assert.equal(plan.length, 21);
});

// ---------------------------------------------------------------------------
// 8. Female preference + mandatory mode integration
// ---------------------------------------------------------------------------

test("INTEGRATION: femaleMode=mandatory + femalePreference + female instructor available = female picked", () => {
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

test("INTEGRATION: femaleMode=mandatory + femalePreference + NO female = falls back to male (graceful degradation)", () => {
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

test("INTEGRATION: femaleMode=preference + femalePreference + female available = female picked", () => {
  const plan = computeCoursePlan(
    INPUT(
      [instructor("male", { gender: "male" }), instructor("female", { gender: "female" })],
      { dates: DATES, femalePreference: true, femaleMode: "preference" }
    ),
    { date: D0, start: "12:00" },
    4,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "female");
});

test("INTEGRATION: femaleMode=preference + NO femalePreference = load balancing decides", () => {
  const plan = computeCoursePlan(
    INPUT(
      [instructor("male", { gender: "male" }), instructor("female", { gender: "female" })],
      { dates: DATES, femalePreference: false, femaleMode: "preference" }
    ),
    { date: D0, start: "12:00" },
    4,
  );
  assert.equal(plan.ok, true);
  // Could be either, but deterministic by ID
  assert.ok(["male", "female"].includes(plan.instructorId));
});

// ---------------------------------------------------------------------------
// 9. Radius + Zone combination
// ---------------------------------------------------------------------------

test("INTEGRATION: Polygon-less instructor with a covering radius is NOT eligible", () => {
  const locResult = resolve({
    lat: 12.973, lng: 77.585, // within 1km of the instructor base, but no polygon
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 1, areas: ["Test Area"] })],
    zones: [],
    areas: [ACTIVE_AREA],
  });
  assert.equal(locResult.serviceable, false);
  assert.equal(locResult.eligibleInstructorCount, 0);
  assert.deepEqual(locResult.eligibleInstructors, []);
});

test("INTEGRATION: Instructor in zone (radius ignored) = zone-matched only", () => {
  const locResult = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 1 })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(locResult.serviceable, true);
  assert.deepEqual(locResult.zoneInstructorIds, ["i1"]);
  assert.equal(locResult.eligibleInstructorCount, 1);
});

// ---------------------------------------------------------------------------
// 10. Concurrent booking simulation (own booking exemption)
// ---------------------------------------------------------------------------

test("INTEGRATION: Own booking's consecutive lessons exempt from travel gap", () => {
  const ownHeld = [
    block("i1", D0, "12:00", "13:00", "pending_payment", "my-booking"),
  ];
  const exempt = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      gapMinutes: 30,
      excludeBookingId: "my-booking",
      blocks: ownHeld,
    }),
    [instructor("i1")],
  );
  const free = exempt.get("i1").get(D0) || [];
  // Adjacent own lesson (13:00) should be free despite 30-min gap
  assert.ok(free.includes(780), "13:00 free for own consecutive lesson");
});

test("INTEGRATION: Other booking's lessons still require travel gap", () => {
  const otherHeld = [
    block("i1", D0, "12:00", "13:00", "pending_payment", "other-booking"),
  ];
  const gapped = buildInstructorFreeGrid(
    INPUT([instructor("i1")], {
      dates: [D0],
      gapMinutes: 30,
      excludeBookingId: "my-booking",
      blocks: otherHeld,
    }),
    [instructor("i1")],
  );
  const free = gapped.get("i1").get(D0) || [];
  assert.ok(!free.includes(780), "13:00 blocked for other booking");
  assert.ok(free.includes(810), "13:30 free for other booking");
});