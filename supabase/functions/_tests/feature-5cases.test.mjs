// Feature-focused test suite - 5 test cases per feature area
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCoursePlan,
  computeFeasibleFirstSlots,
  computeAvailableSlots,
  evaluateSlot,
  buildInstructorFreeGrid,
  candidateStartMinutes,
  areaEligibleInstructors,
  pickBestInstructor,
  isTimeUnavailable,
  validateConsecutiveRule,
  planLessonsForInstructor,
} from "../_shared/availability.ts";
import { resolveServiceability } from "../_shared/serviceability.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";
import { normalizePhone, isValidPhone, isValidEmail, isValidTime, addDaysISO } from "../_shared/validation.ts";

const SLOT_CONFIG = { slotStart: "06:00", slotEnd: "20:00", gridMinutes: 30, slotDurationMinutes: 60 };
function instructor(id, overrides = {}) { return { id, areas: ["area-a"], gender: null, ...overrides }; }
const INPUT = (instructors, overrides = {}) => ({ instructors, learnerArea: "area-a", learner: null, slotConfig: SLOT_CONFIG, ...overrides });
const D0 = "2026-09-10";
const DATES = Array.from({ length: 14 }, (_, i) => addDaysISO(D0, i));
const minute = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// ===== FEATURE 1: SLOT GRID GENERATION (5 cases) =====
test("FEATURE-SLOTS 1: Grid generates correct 30-min slots 06:00-19:00 for 60-min lessons", () => {
  const mins = candidateStartMinutes(SLOT_CONFIG);
  assert.equal(mins[0], 360); // 06:00
  assert.equal(mins[mins.length-1], 1140); // 19:00
  assert.ok(mins.includes(390)); // 06:30
  assert.equal(mins.length, 27); // 06:00 to 19:00 inclusive = 27 slots
});

test("FEATURE-SLOTS 2: Grid with 15-min gridMinutes for 60-min lessons", () => {
  const config = { ...SLOT_CONFIG, gridMinutes: 15 };
  const mins = candidateStartMinutes(config);
  assert.ok(mins.includes(360)); // 06:00
  assert.ok(mins.includes(375)); // 06:15
  assert.ok(mins.includes(1140)); // 19:00
  assert.ok(!mins.includes(1155)); // 19:15 ends 20:15 > 20:00
});

test("FEATURE-SLOTS 3: Grid with 90-min lessons, 30-min grid", () => {
  const config = { ...SLOT_CONFIG, slotDurationMinutes: 90 };
  const mins = candidateStartMinutes(config);
  assert.ok(mins.includes(360)); // 06:00
  assert.ok(mins.includes(1110)); // 18:30 (18:30+90=20:00)
  assert.ok(!mins.includes(1140)); // 19:00 would end 20:30
});

test("FEATURE-SLOTS 4: Empty instructor list returns empty grid", () => {
  const result = computeAvailableSlots(INPUT([], { dates: [D0] }));
  assert.equal(result.dates[0].slots.length, 0);
});

test("FEATURE-SLOTS 5: Instructor without matching area excluded from grid", () => {
  const result = computeAvailableSlots(INPUT([instructor("i1", { areas: ["other"] })], { dates: [D0] }));
  assert.equal(result.dates[0].slots.length, 0);
});

// ===== FEATURE 2: COURSE PLAN ENGINE (5 cases) =====
test("FEATURE-PLAN 1: 10-lesson Masterclass from 06:00 fits 5 days (2/day)", () => {
  const plan = computeCoursePlan(INPUT([instructor("i1")], { dates: DATES }), { date: D0, start: "06:00" }, 10);
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 10);
  const byDate = new Map();
  for (const l of plan.lessons) byDate.set(l.date, (byDate.get(l.date)||0)+1);
  for (const [, cnt] of byDate) assert.ok(cnt <= 2);
});

test("FEATURE-PLAN 2: 8-lesson Brush Up from 10:00 works", () => {
  const plan = computeCoursePlan(INPUT([instructor("i1")], { dates: DATES }), { date: D0, start: "10:00" }, 8);
  assert.equal(plan.ok, true);
  assert.equal(plan.lessons.length, 8);
});

test("FEATURE-PLAN 3: Plan fails if instructor cannot complete full course", () => {
  const blocks = [];
  for (const date of DATES) for (let m=360; m<=1140; m+=30) if (!(date===DATES[1] && m>=360 && m<720)) blocks.push({ instructorId:"i1", date, startMinute:m, endMinute:m+60, status:"booked" });
  const plan = computeCoursePlan(INPUT([instructor("i1")], { dates: DATES, blocks }), { date: DATES[1], start: "06:00" }, 10);
  assert.equal(plan.ok, false);
});

test("FEATURE-PLAN 4: Same time on later dates NOT treated as overlap (morning-only instructor fits)", () => {
  const morningOnly = [];
  for (let m=360; m<720; m+=30) morningOnly.push(m);
  const free = new Map(DATES.map(d => [d, morningOnly]));
  const plan = planLessonsForInstructor(free, DATES, D0, 360, 10, 60);
  assert.ok(plan);
  assert.equal(plan.length, 10);
});

test("FEATURE-PLAN 5: Lesson 1 is exactly the picked first slot", () => {
  const plan = computeCoursePlan(INPUT([instructor("i1")], { dates: DATES }), { date: D0, start: "14:00" }, 4);
  assert.equal(plan.lessons[0].start_time, "14:00");
  assert.equal(plan.lessons[0].date, D0);
});

// ===== FEATURE 3: UNAVAILABILITY HANDLING (5 cases) =====
test("FEATURE-UNAVAIL 1: Single-day timed block excludes that window", () => {
  const u = [{ booked_date: D0, booked_start_time: "12:00", booked_end_time: "14:00" }];
  assert.equal(isTimeUnavailable(u, D0, "thursday", minute("12:00")), true);
  assert.equal(isTimeUnavailable(u, D0, "thursday", minute("11:00")), false);
  assert.equal(isTimeUnavailable(u, D0, "thursday", minute("14:00")), false);
});

test("FEATURE-UNAVAIL 2: Recurring weekly all-day (days_of_week array) blocks all day", () => {
  const u = [{ type: "recurring", days_of_week: ["friday"], all_day: true }];
  assert.equal(isTimeUnavailable(u, "2026-09-11", "friday", 360), true);
  assert.equal(isTimeUnavailable(u, "2026-09-10", "thursday", 360), false);
});

test("FEATURE-UNAVAIL 3: Date-range all-day blocks entire range", () => {
  const u = [{ start_date: "2026-09-01", end_date: "2026-09-30", range_all_day: true }];
  assert.equal(isTimeUnavailable(u, D0, "thursday", 360), true);
  assert.equal(isTimeUnavailable(u, "2026-10-01", "thursday", 360), false);
});

test("FEATURE-UNAVAIL 4: Recurring timed with days_of_week array", () => {
  const u = [{ type: "recurring", days_of_week: ["thursday"], booked_start_time: "12:00", booked_end_time: "14:00" }];
  assert.equal(isTimeUnavailable(u, D0, "thursday", minute("13:00")), true);
  assert.equal(isTimeUnavailable(u, D0, "thursday", minute("11:00")), false);
});

test("FEATURE-UNAVAIL 5: Bare booked_date (no all_day, no times) = all-day block", () => {
  const u = [{ booked_date: D0 }];
  assert.equal(isTimeUnavailable(u, D0, "thursday", 360), true);
  assert.equal(isTimeUnavailable(u, "2026-09-09", "wednesday", 360), false);
});

// ===== FEATURE 4: LOCATION SERVICEABILITY (5 cases) =====
const SQUARE = () => [[77.57,12.96],[77.59,12.96],[77.59,12.98],[77.57,12.98],[77.57,12.96]];
const AREA = { id: "area-1", name: "Test Area" };
function ins(id, overrides={}) { return { id, areas: ["Test Area"], radiusKm: null, lat: null, lng: null, gender: null, status: "active", enabled: true, ...overrides }; }
function resolve({ lat, lng, instructors, zones, areas }) { return resolveServiceability({ lat, lng, zones, instructors, areas }); }

test("FEATURE-LOC 1: Point in zone polygon = serviceable", () => {
  const r = resolve({ lat: 12.97, lng: 77.58, instructors: [ins("i1")], zones: [{ instructorId: "i1", rings: [SQUARE()] }], areas: [AREA] });
  assert.equal(r.serviceable, true);
  assert.equal(r.areaName, "Test Area");
});

test("FEATURE-LOC 2: Radius alone is NOT enough - no polygon means not serviceable", () => {
  const r = resolve({ lat: 12.973, lng: 77.585, instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 1 })], zones: [], areas: [AREA] });
  assert.equal(r.serviceable, false);
  assert.equal(r.eligibleInstructorCount, 0);
});

test("FEATURE-LOC 3: Point in polygon hole is NOT serviceable even if radius covers it", () => {
  const hole = [[77.575,12.965],[77.585,12.965],[77.585,12.975],[77.575,12.975],[77.575,12.965]];
  const r = resolve({ lat: 12.97, lng: 77.58, instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 1 })], zones: [{ instructorId: "i1", rings: [SQUARE(), hole] }], areas: [AREA] });
  assert.equal(r.serviceable, false);
});

test("FEATURE-LOC 4: On_break instructor excluded even if zone covers", () => {
  const r = resolve({ lat: 12.97, lng: 77.58, instructors: [ins("i1", { status: "on_break" })], zones: [{ instructorId: "i1", rings: [SQUARE()] }], areas: [AREA] });
  assert.equal(r.serviceable, false);
});

test("FEATURE-LOC 5: Area tie-break = most instructors, then lexicographically smallest name", () => {
  const r = resolve({ lat: 12.97, lng: 77.58, instructors: [ins("i1", { areas: ["Zebra", "Alpha"] })], zones: [{ instructorId: "i1", rings: [SQUARE()] }], areas: [{ id: "z", name: "Zebra" }, { id: "a", name: "Alpha" }] });
  assert.equal(r.areaName, "Alpha");
});

// ===== FEATURE 5: CONFIG VALIDATION (5 cases) =====
const VALID = { enabled: true, gateway: "razorpay", payment_mode: "test", hold_minutes: 30, max_slots_per_booking: 20, booking_days_ahead: 14, slot_start: "06:00", slot_end: "20:00", slot_grid_minutes: 30, slot_duration_minutes: 60, instructor_gap_minutes: 30, female_instructor_mode: "preference", installment_modes: ["full", "first_half"] };

test("FEATURE-CONFIG 1: Missing payment_mode disables flow", () => {
  const { payment_mode: _p, ...rest } = VALID;
  assert.equal(readBookingFlowConfig({ ...rest, enabled: true }).enabled, false);
});

test("FEATURE-CONFIG 2: Invalid slot_start format disables flow", () => {
  assert.equal(readBookingFlowConfig({ ...VALID, slot_start: "6:00" }).enabled, false);
});

test("FEATURE-CONFIG 3: Unknown female_instructor_mode disables flow", () => {
  assert.equal(readBookingFlowConfig({ ...VALID, female_instructor_mode: "always" }).enabled, false);
});

test("FEATURE-CONFIG 4: Empty installment_modes disables flow", () => {
  assert.equal(readBookingFlowConfig({ ...VALID, installment_modes: [] }).enabled, false);
});

test("FEATURE-CONFIG 5: hold_minutes out of range (0) disables flow", () => {
  assert.equal(readBookingFlowConfig({ ...VALID, hold_minutes: 0 }).enabled, false);
});

// ===== FEATURE 6: VALIDATION HELPERS (5 cases) =====
test("FEATURE-VALID 1: normalizePhone strips +91/0 and keeps 10 digits", () => {
  assert.equal(normalizePhone("+91 98123 45678"), "9812345678");
  assert.equal(normalizePhone("09812345678"), "9812345678");
});

test("FEATURE-VALID 2: isValidPhone rejects non-6-9 start", () => {
  assert.equal(isValidPhone("6123456789"), true);
  assert.equal(isValidPhone("5123456789"), false);
});

test("FEATURE-VALID 3: isValidEmail rejects invalid formats", () => {
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("a@b"), false);
  assert.equal(isValidEmail("@domain.com"), false);
});

test("FEATURE-VALID 4: isValidTime strict HH:MM 24hr", () => {
  assert.equal(isValidTime("09:30"), true);
  assert.equal(isValidTime("24:00"), false);
  assert.equal(isValidTime("9:30"), false);
});

test("FEATURE-VALID 5: addDaysISO crosses month/year boundaries", () => {
  assert.equal(addDaysISO("2026-01-31", 1), "2026-02-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
});

// ===== FEATURE 7: CONSECUTIVE RULE (5 cases) =====
test("FEATURE-CONSEC 1: Valid plan (2/day, back-to-back) passes", () => {
  const plan = [
    { date: D0, start_time: "12:00", end_time: "13:00" },
    { date: D0, start_time: "13:00", end_time: "14:00" },
    { date: DATES[1], start_time: "09:00", end_time: "10:00" },
  ];
  assert.equal(validateConsecutiveRule(plan), null);
});

test("FEATURE-CONSEC 2: 3 lessons same day rejected", () => {
  const plan = [
    { date: D0, start_time: "10:00", end_time: "11:00" },
    { date: D0, start_time: "11:00", end_time: "12:00" },
    { date: D0, start_time: "14:00", end_time: "15:00" },
  ];
  assert.ok(validateConsecutiveRule(plan));
});

test("FEATURE-CONSEC 3: Same-day gap rejected", () => {
  const plan = [
    { date: D0, start_time: "10:00", end_time: "11:00" },
    { date: D0, start_time: "13:00", end_time: "14:00" },
  ];
  assert.ok(validateConsecutiveRule(plan));
});

test("FEATURE-CONSEC 4: Overlapping lessons rejected", () => {
  const plan = [
    { date: D0, start_time: "10:00", end_time: "11:30" },
    { date: D0, start_time: "11:00", end_time: "12:00" },
  ];
  assert.ok(validateConsecutiveRule(plan));
});

test("FEATURE-CONSEC 5: Single lessons separate days always pass", () => {
  const plan = [
    { date: D0, start_time: "10:00", end_time: "11:00" },
    { date: DATES[1], start_time: "10:00", end_time: "11:00" },
  ];
  assert.equal(validateConsecutiveRule(plan), null);
});