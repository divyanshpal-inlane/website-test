// Regression: Postgres returns `time` columns as "HH:MM:SS". A strict "HH:MM"
// parser turned every real Schedule row into NaN minutes; NaN blocks never
// overlap anything, so BOOKED instructors looked FREE in production. These tests
// feed the engine the exact shapes the edge functions build from DB rows.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInstructorFreeGrid,
  computeCoursePlan,
  evaluateSlot,
} from "../_shared/availability.ts";
import { addDaysISO, timeToMinutes, isValidTime } from "../_shared/validation.ts";

const D0 = "2026-10-06";
const DATES = Array.from({ length: 14 }, (_, i) => addDaysISO(D0, i));
const SLOT_CONFIG = { slotStart: "06:00", slotEnd: "22:00", gridMinutes: 30, slotDurationMinutes: 60 };
const instr = (id) => ({ id, areas: ["A"], gender: null, status: "active", enabled: true });

// The same mapping get-booking-slots/create-booking apply to a Schedule row.
function blockFromDbRow(r) {
  return {
    instructorId: String(r.instructor_id),
    date: String(r.date),
    startMinute: timeToMinutes(String(r.start_time)),
    endMinute: timeToMinutes(String(r.end_time)),
    status: String(r.status),
    ownerBookingId: r.booking_id == null ? null : String(r.booking_id),
  };
}
const input = (instructors, blocks) => ({
  instructors, learnerArea: "A", learner: null, blocks, dates: DATES, slotConfig: SLOT_CONFIG,
  femalePreference: false, femaleMode: "off", holdMinutes: 15, gapMinutes: 15,
});

test("timeToMinutes accepts Postgres time output (HH:MM:SS and fractional seconds)", () => {
  assert.equal(timeToMinutes("06:00:00"), 360);
  assert.equal(timeToMinutes("18:30:00"), 1110);
  assert.equal(timeToMinutes("07:15:00.000000"), 435);
  assert.equal(timeToMinutes("06:00"), 360);
});

test("timeToMinutes still rejects garbage / out-of-range", () => {
  for (const bad of ["25:00:00", "12:60:00", "06:00:60", "6:00:00", "06:00:", "abc", "", "06:00:00:00"]) {
    assert.ok(Number.isNaN(timeToMinutes(bad)), `expected NaN for "${bad}"`);
  }
  assert.ok(Number.isNaN(timeToMinutes(null)));
});

test("user-input isValidTime stays strict HH:MM (seconds are not accepted from clients)", () => {
  assert.equal(isValidTime("06:00"), true);
  assert.equal(isValidTime("06:00:00"), false);
});

test("a DB-shaped booked row (HH:MM:SS) BLOCKS its slot - booked instructors are not free", () => {
  const rows = [{ instructor_id: "i1", date: D0, start_time: "06:00:00", end_time: "07:00:00", status: "booked", booking_id: null }];
  const blocks = rows.map(blockFromDbRow);
  assert.ok(Number.isFinite(blocks[0].startMinute) && Number.isFinite(blocks[0].endMinute), "minutes must be finite");
  const r = evaluateSlot(input([instr("i1")], blocks), { date: D0, start: "06:00" });
  assert.equal(r.ok, false, "06:00 is booked; must not be offered");
  // and the travel gap (15m) makes 07:00 busy too, but 07:30 is free
  assert.equal(evaluateSlot(input([instr("i1")], blocks), { date: D0, start: "07:00" }).ok, false);
  assert.equal(evaluateSlot(input([instr("i1")], blocks), { date: D0, start: "07:30" }).ok, true);
});

test("a course plan never lands on a DB-shaped booked row", () => {
  // i1 is booked 06:00-07:00 every day for the whole window.
  const rows = DATES.map((d) => ({ instructor_id: "i1", date: d, start_time: "06:00:00", end_time: "07:00:00", status: "booked", booking_id: null }));
  const blocks = rows.map(blockFromDbRow);
  const plan = computeCoursePlan(input([instr("i1")], blocks), { date: D0, start: "08:00" }, 10);
  assert.equal(plan.ok, true);
  for (const l of plan.lessons) {
    assert.ok(timeToMinutes(l.start_time) >= 7 * 60 + 15, `lesson ${l.lesson} at ${l.start_time} overlaps the booked 06:00 class (+gap)`);
  }
});

test("free grid for an instructor drops every slot overlapping DB-shaped rows", () => {
  const rows = [{ instructor_id: "i1", date: D0, start_time: "09:00:00", end_time: "10:00:00", status: "booked", booking_id: null }];
  const grid = buildInstructorFreeGrid(input([instr("i1")], rows.map(blockFromDbRow)), [instr("i1")]);
  const free = grid.get("i1").get(D0);
  assert.ok(!free.includes(9 * 60), "09:00 must not be free");
  assert.ok(!free.includes(9 * 60 + 30), "09:30 must not be free");
  assert.ok(!free.includes(8 * 60 + 30), "08:30 (within 15m travel gap) must not be free");
  assert.ok(free.includes(7 * 60), "07:00 is far enough away and free");
});

test("FAIL CLOSED: a row whose times cannot be parsed is treated as BUSY, never free", () => {
  const blocks = [blockFromDbRow({ instructor_id: "i1", date: D0, start_time: "garbage", end_time: "??", status: "booked", booking_id: null })];
  assert.ok(Number.isNaN(blocks[0].startMinute));
  const r = evaluateSlot(input([instr("i1")], blocks), { date: D0, start: "12:00" });
  assert.equal(r.ok, false, "unparseable busy row on that day must block the slot");
  // a different date is unaffected
  assert.equal(evaluateSlot(input([instr("i1")], blocks), { date: addDaysISO(D0, 1), start: "12:00" }).ok, true);
});
