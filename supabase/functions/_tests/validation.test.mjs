import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone,
  isValidPhone,
  isValidEmail,
  isValidPincode,
  isValidTime,
  isValidDateISO,
  normalizeName,
  addDaysISO,
  istTodayISO,
  dateToWeekdayLower,
  timeToMinutes,
  minutesToTime,
} from "../_shared/validation.ts";

test("normalizePhone strips formatting, keeps 10 digits", () => {
  assert.equal(normalizePhone("+91 98123 45678"), "9812345678");
  assert.equal(normalizePhone("+919812345678"), "9812345678");
  assert.equal(normalizePhone("09812345678"), "9812345678");
  assert.equal(normalizePhone("9812345678"), "9812345678");
  assert.equal(normalizePhone("123"), null);
  assert.equal(normalizePhone(9812345678), null);
});

test("isValidPhone rejects number starting with 0", () => {
  assert.equal(isValidPhone("0981234567"), false);
  assert.equal(isValidPhone("9812345678"), true);
});

test("email / pincode / time / date validators", () => {
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("a@b"), false);
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidPincode("560001"), true);
  assert.equal(isValidPincode("56000"), false);
  assert.equal(isValidTime("09:30"), true);
  assert.equal(isValidTime("25:00"), false);
  assert.equal(isValidDateISO("2026-09-10"), true);
  assert.equal(isValidDateISO("2026-13-10"), false);
});

test("normalizeName requires 2..120 chars", () => {
  assert.equal(normalizeName("  Ajay Kumar "), "Ajay Kumar");
  assert.equal(normalizeName("A"), null);
});

test("addDaysISO crosses month boundaries", () => {
  assert.equal(addDaysISO("2026-09-30", 1), "2026-10-01");
  assert.equal(addDaysISO("2026-02-28", 1), "2026-03-01");
});

test("istTodayISO returns 2026-09-09 for the 2026 Sep midday wall-clock", () => {
  // 2026-09-09 12:00 UTC = 17:30 IST → same date
  assert.equal(istTodayISO(new Date("2026-09-09T12:00:00Z")), "2026-09-09");
  // 2026-09-09 20:00 UTC = 01:30 IST next day; IST-based date rolls to the 10th
  assert.equal(istTodayISO(new Date("2026-09-09T20:00:00Z")), "2026-09-10");
});

test("weekday/time helpers", () => {
  assert.equal(dateToWeekdayLower("2026-09-10"), "thursday");
  assert.equal(timeToMinutes("19:00"), 1140);
  assert.equal(minutesToTime(1140), "19:00");
  assert.equal(minutesToTime(360), "06:00");
});