import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateStartMinutes,
  isTimeUnavailable,
  evaluateSlot,
  pickBestInstructor,
  computeAvailableSlots,
  areaEligibleInstructors,
  haversineKm,
} from "../_shared/availability.ts";

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

const DATE = "2026-09-10"; // Thursday

test("candidateStartMinutes builds a 30-min grid for 60-min lessons 06:00-20:00", () => {
  const minutes = candidateStartMinutes(SLOT_CONFIG);
  assert.equal(minutes[0], 360); // 06:00
  assert.equal(minutes[minutes.length - 1], 1140); // 19:00 (19:00+60min <= 20:00)
  assert.ok(minutes.includes(390)); // 06:30
  assert.ok(minutes.length <= 28);
});

test("isTimeUnavailable handles all web-app shapes (1-4 port)", () => {
  // single-day time-bound (web-app case 1)
  const dayRange = [{ booked_date: DATE, booked_start_time: "12:00", booked_end_time: "14:00" }];
  assert.equal(isTimeUnavailable(dayRange, DATE, "thursday", 720), true);
  assert.equal(isTimeUnavailable(dayRange, DATE, "thursday", 660), false);

  // recurring weekly all-day
  const weekly = [{ day_of_week: "thursday", all_day: true }];
  assert.equal(isTimeUnavailable(weekly, DATE, "thursday", 360), true);
  assert.equal(isTimeUnavailable(weekly, DATE, "friday", 360), false);

  // recurring weekly timed
  const weeklyTimed = [{ day_of_week: "thursday", booked_start_time: "09:00", booked_end_time: "11:00" }];
  assert.equal(isTimeUnavailable(weeklyTimed, DATE, "thursday", 540), true);
  assert.equal(isTimeUnavailable(weeklyTimed, DATE, "thursday", 720), false);

  // date range, timed
  const range = [
    {
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      range_start_time: "18:00",
      range_end_time: "20:00",
    },
  ];
  assert.equal(isTimeUnavailable(range, DATE, "thursday", 1110), true);
  assert.equal(isTimeUnavailable(range, DATE, "thursday", 720), false);

  assert.equal(isTimeUnavailable(null, DATE, "thursday", 720), false);
  assert.equal(isTimeUnavailable([], DATE, "thursday", 720), false);
});

test("isTimeUnavailable handles live DB formats (days_of_week array + edges)", () => {
  // admin recurring format: days_of_week array + booked time window
  const recurring = [
    { type: "recurring", reason: "Afternoon Block", days_of_week: ["monday", "wednesday"], booked_start_time: "12:00", booked_end_time: "17:00" },
  ];
  assert.equal(isTimeUnavailable(recurring, DATE, "wednesday", 720), true); // 12:00
  assert.equal(isTimeUnavailable(recurring, DATE, "wednesday", 1020), false); // 17:00 exactly
  assert.equal(isTimeUnavailable(recurring, DATE, "wednesday", 540), false); // 09:00
  assert.equal(isTimeUnavailable(recurring, DATE, "tuesday", 720), false); // not in array

  // days_of_week all-day (2026-09-13 is a Sunday)
  const recurringAllDay = [{ type: "recurring", days_of_week: ["sunday"], all_day: true }];
  assert.equal(isTimeUnavailable(recurringAllDay, "2026-09-13", "sunday", 360), true);
  assert.equal(isTimeUnavailable(recurringAllDay, "2026-09-14", "monday", 360), false);

  // booked_date alone (no all_day flag) = all-day block
  const bareDate = [{ booked_date: DATE }];
  assert.equal(isTimeUnavailable(bareDate, DATE, "thursday", 720), true);
  assert.equal(isTimeUnavailable(bareDate, "2026-09-02", "thursday", 720), false);

  // range with only a start time = blocked from that time onward
  const rangeOpenEnded = [{ start_date: "2026-09-01", end_date: "2026-09-30", range_start_time: "18:00" }];
  assert.equal(isTimeUnavailable(rangeOpenEnded, "2026-09-10", "thursday", 1110), true);
  assert.equal(isTimeUnavailable(rangeOpenEnded, "2026-09-10", "thursday", 660), false);
});

test("evaluateSlot frees a slot when a same-area instructor is free", () => {
  const res = evaluateSlot(
    INPUT([instructor("i1")], { blocks: [], dates: [DATE] }),
    { date: DATE, start: "12:00" },
  );
  assert.equal(res.ok, true);
  assert.deepEqual(res.instructors, ["i1"]);
});

test("evaluateSlot blocks a slot covered by a booked schedule row", () => {
  const res = evaluateSlot(
    INPUT([instructor("i1")], {
      blocks: [{ instructorId: "i1", date: DATE, startMinute: 720, endMinute: 780, status: "booked" }],
    }),
    { date: DATE, start: "12:00" },
  );
  assert.equal(res.ok, false);
});

test("evaluateSlot blocks on a live pending_payment hold...", () => {
  const res = evaluateSlot(
    INPUT([instructor("i1")], {
      holdMinutes: 30,
      now: new Date("2026-09-10T12:05:00Z"),
      blocks: [
        {
          instructorId: "i1",
          date: DATE,
          startMinute: 720,
          endMinute: 780,
          status: "pending_payment",
          bookingCreatedAt: "2026-09-10T12:00:00Z",
        },
      ],
    }),
    { date: DATE, start: "12:00" },
  );
  assert.equal(res.ok, false);
});

test("...but expired pending_payment holds leave the slot open", () => {
  const res = evaluateSlot(
    INPUT([instructor("i1")], {
      holdMinutes: 30,
      now: new Date("2026-09-10T12:40:00Z"),
      blocks: [
        {
          instructorId: "i1",
          date: DATE,
          startMinute: 720,
          endMinute: 780,
          status: "pending_payment",
          bookingCreatedAt: "2026-09-10T12:00:00Z",
        },
      ],
    }),
    { date: DATE, start: "12:00" },
  );
  assert.equal(res.ok, true);
});

test("evaluateSlot respects instructor unavailability", () => {
  const res = evaluateSlot(
    INPUT([
      instructor("i1", {
        unavailability: [{ booked_date: DATE, booked_start_time: "12:00", booked_end_time: "14:00" }],
      }),
    ]),
    { date: DATE, start: "12:00" },
  );
  assert.equal(res.ok, false);
});

test("femalePreference picks a female instructor when one covers the slot", () => {
  const res = evaluateSlot(
    INPUT(
      [
        instructor("male", { gender: "male" }),
        instructor("female", { gender: "female" }),
      ],
      { femalePreference: true, femaleMode: "preference" },
    ),
    { date: DATE, start: "12:00" },
  );
  assert.equal(res.ok, true);
  assert.deepEqual(res.instructors, ["female"]);
  assert.equal(res.femaleCovered, true);
});

test("computeAvailableSlots returns a direct schedule with metadata", () => {
  const result = computeAvailableSlots(
    INPUT([instructor("i1")], { dates: [DATE, "2026-09-11"] }),
  );
  assert.equal(result.schedulingMode, "direct");
  assert.equal(result.femaleInstructorAvailable, false);
  assert.equal(result.dates.length, 2);
  assert.ok(result.dates[0].slots.length > 0);
  assert.deepEqual(result.dates[0].slots[0].instructors, ["i1"]);
  assert.equal(typeof result.dates[0].slots[0].femaleCovered, "boolean");
  assert.equal(result.dates[0].slots[0].start, "06:00");
});

test("computeAvailableSlots returns empty dates when no instructors serve the area", () => {
  const result = computeAvailableSlots(
    INPUT([instructor("far", { areas: ["other"] })], { dates: [DATE] }),
  );
  assert.equal(result.femaleInstructorAvailable, false);
  assert.ok(result.dates[0].slots.length === 0);
});

test("areaEligibleInstructors filters by area match and excludes inactive", () => {
  const eligible = areaEligibleInstructors(
    INPUT([
      instructor("a"),
      instructor("b", { areas: ["other"] }),
      instructor("c", { status: "inactive" }),
    ]),
  );
  assert.deepEqual(eligible.map((i) => i.id), ["a"]);
});

test("areaEligibleInstructors excludes on_break instructors (root cause of Syed mansoor slots)", () => {
  const eligible = areaEligibleInstructors(
    INPUT([
      instructor("active", { status: "active" }),
      instructor("null-status"),
      instructor("on-break", { status: "on_break" }),
      instructor("disabled", { enabled: false }),
      instructor("inactive", { status: "inactive" }),
    ]),
  );
  assert.deepEqual(eligible.map((i) => i.id), ["active", "null-status"]);
});

test("isInstructorActive returns false for on_break and inactive, true otherwise", async () => {
  const { isInstructorActive } = await import("../_shared/availability.ts");
  const mk = (overrides = {}) =>
    instructor("i", { enabled: true, status: "active", ...overrides });
  assert.equal(isInstructorActive(mk()), true);
  assert.equal(isInstructorActive(mk({ enabled: false })), false);
  assert.equal(isInstructorActive(mk({ status: "inactive" })), false);
  assert.equal(isInstructorActive(mk({ status: "on_break" })), false);
});

test("pickBestInstructor prefers area match then distance, then id tiebreak", () => {
  const near = instructor("near", { lat: 1, lng: 1 });
  const far = instructor("far", { lat: 2, lng: 2 });
  const id = pickBestInstructor([far, near], {
    learnerArea: "area-a",
    learner: { lat: 1.001, lng: 1.001 },
  });
  assert.equal(id, "near");
});

test("haversineKm returns plausible distances", () => {
  const same = haversineKm(28.61, 77.2, 28.61, 77.2);
  assert.ok(same < 0.001);
  const delhiToMumbai = haversineKm(28.61, 77.2, 19.07, 72.87);
  assert.ok(delhiToMumbai > 1000 && delhiToMumbai < 1300);
});