// Validation edge cases - phone, email, date, name, time edge cases.
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

test("normalizePhone: +91 prefix with various formats", () => {
  assert.equal(normalizePhone("+91 98123 45678"), "9812345678");
  assert.equal(normalizePhone("+91-98123-45678"), "9812345678");
  assert.equal(normalizePhone("+919812345678"), "9812345678");
  assert.equal(normalizePhone("+91 98 1234 5678"), "9812345678");
});

test("normalizePhone: 0 prefix (Indian STD) stripped", () => {
  assert.equal(normalizePhone("09812345678"), "9812345678");
  assert.equal(normalizePhone("0 98123 45678"), "9812345678");
});

test("normalizePhone: already 10 digits unchanged", () => {
  assert.equal(normalizePhone("9812345678"), "9812345678");
});

test("normalizePhone: more than 10 digits after cleaning - strips 91 prefix", () => {
  // 12 digits starting with 91 -> strips 91 prefix, returns 10 digits
  assert.equal(normalizePhone("919812345678"), "9812345678");
  // 11 digits not starting with 91 or 0 -> null
  assert.equal(normalizePhone("98123456789"), null);
});

test("normalizePhone: non-numeric input = null", () => {
  assert.equal(normalizePhone("abc"), null);
  assert.equal(normalizePhone(9812345678), null); // number type
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(undefined), null);
});

test("isValidPhone: exactly 10 digits starting 6-9 = true", () => {
  for (let d = 6; d <= 9; d++) {
    assert.equal(isValidPhone(`${d}123456789`), true, `digit ${d} should be valid`);
  }
});

test("isValidPhone: starting with 0-5 = false", () => {
  for (let d = 0; d <= 5; d++) {
    assert.equal(isValidPhone(`${d}12345678`), false, `digit ${d} should be invalid`);
  }
});

test("isValidPhone: non-numeric input returns false", () => {
  assert.equal(isValidPhone("981234567a"), false); // 9 digits after stripping
  assert.equal(isValidPhone("+91 98123 45678"), true); // +91 stripped, valid 10-digit
  assert.equal(isValidPhone("not-a-phone"), false);
});

test("isValidEmail: basic valid formats", () => {
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("user.name@domain.com"), true);
  assert.equal(isValidEmail("user+tag@domain.org"), true);
  assert.equal(isValidEmail("user@sub.domain.co.in"), true);
});

test("isValidEmail: invalid formats", () => {
  assert.equal(isValidEmail("a@b"), false); // no TLD
  assert.equal(isValidEmail("@domain.com"), false); // no local part
  assert.equal(isValidEmail("user@"), false); // no domain
  assert.equal(isValidEmail("user.domain.com"), false); // no @
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("user@domain"), false); // no TLD
  assert.equal(isValidEmail("user@.com"), false);
  assert.equal(isValidEmail("user@domain..com"), false); // double dot
});

test("isValidPincode: exactly 6 digits = true", () => {
  assert.equal(isValidPincode("560001"), true);
  assert.equal(isValidPincode("110001"), true);
  assert.equal(isValidPincode("400001"), true);
});

test("isValidPincode: not 6 digits = false", () => {
  assert.equal(isValidPincode("56000"), false); // 5
  assert.equal(isValidPincode("5600012"), false); // 7
  assert.equal(isValidPincode("abc123"), false);
  assert.equal(isValidPincode(""), false);
});

test("isValidTime: HH:MM 24-hour format", () => {
  assert.equal(isValidTime("00:00"), true);
  assert.equal(isValidTime("06:00"), true);
  assert.equal(isValidTime("12:30"), true);
  assert.equal(isValidTime("19:00"), true);
  assert.equal(isValidTime("23:59"), true);
  assert.equal(isValidTime("09:05"), true);
});

test("isValidTime: invalid formats", () => {
  assert.equal(isValidTime("24:00"), false); // hour 24
  assert.equal(isValidTime("25:00"), false);
  assert.equal(isValidTime("12:60"), false); // minute 60
  assert.equal(isValidTime("12:61"), false);
  assert.equal(isValidTime("9:30"), false); // single digit hour
  assert.equal(isValidTime("09:3"), false); // single digit minute
  assert.equal(isValidTime("09-30"), false); // wrong separator
  assert.equal(isValidTime(""), false);
  assert.equal(isValidTime("not-a-time"), false);
});

test("isValidDateISO: valid YYYY-MM-DD", () => {
  assert.equal(isValidDateISO("2026-09-10"), true);
  assert.equal(isValidDateISO("2026-01-01"), true);
  assert.equal(isValidDateISO("2026-12-31"), true);
});

test("isValidDateISO: invalid months/days", () => {
  assert.equal(isValidDateISO("2026-13-10"), false); // month 13
  assert.equal(isValidDateISO("2026-00-10"), false); // month 00
  assert.equal(isValidDateISO("2026-02-30"), false); // Feb 30
  assert.equal(isValidDateISO("2026-04-31"), false); // Apr 31
  assert.equal(isValidDateISO("2026-09-00"), false); // day 00
  assert.equal(isValidDateISO("2026-09-31"), false); // Sep 31
});

test("isValidDateISO: leap year Feb 29", () => {
  assert.equal(isValidDateISO("2024-02-29"), true); // leap year
  assert.equal(isValidDateISO("2023-02-29"), false); // not leap year
  assert.equal(isValidDateISO("2000-02-29"), true); // century leap
  assert.equal(isValidDateISO("1900-02-29"), false); // century not leap
});

test("isValidDateISO: wrong format", () => {
  assert.equal(isValidDateISO("10-09-2026"), false); // DD-MM-YYYY
  assert.equal(isValidDateISO("2026/09/10"), false); // slashes
  assert.equal(isValidDateISO("2026-9-10"), false); // single digit month
  assert.equal(isValidDateISO("2026-09-1"), false); // single digit day
  assert.equal(isValidDateISO(""), false);
});

test("normalizeName: trims whitespace", () => {
  assert.equal(normalizeName("  Ajay Kumar  "), "Ajay Kumar");
  assert.equal(normalizeName("\t\nAjay\n\t"), "Ajay");
});

test("normalizeName: min 2 chars", () => {
  assert.equal(normalizeName("A"), null);
  assert.equal(normalizeName("A "), null);
  assert.equal(normalizeName(" Ab"), "Ab");
});

test("normalizeName: max 120 chars", () => {
  const long = "A".repeat(121);
  assert.equal(normalizeName(long), null);
  const ok = "A".repeat(120);
  assert.equal(normalizeName(ok), ok);
});

test("normalizeName: internal whitespace preserved", () => {
  assert.equal(normalizeName("Ajay  Kumar"), "Ajay  Kumar");
  assert.equal(normalizeName("Ajay\tKumar"), "Ajay\tKumar");
});

test("addDaysISO: month boundaries", () => {
  assert.equal(addDaysISO("2026-01-31", 1), "2026-02-01");
  assert.equal(addDaysISO("2026-02-28", 1), "2026-03-01"); // non-leap
  assert.equal(addDaysISO("2024-02-29", 1), "2024-03-01"); // leap
  assert.equal(addDaysISO("2026-04-30", 1), "2026-05-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
});

test("addDaysISO: negative days (subtraction)", () => {
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysISO("2026-03-01", -2), "2026-02-27");
  assert.equal(addDaysISO("2024-03-01", -1), "2024-02-29"); // leap
  assert.equal(addDaysISO("2026-01-01", -1), "2025-12-31");
});

test("addDaysISO: large positive spans multiple months", () => {
  assert.equal(addDaysISO("2026-01-01", 365), "2027-01-01");
  assert.equal(addDaysISO("2024-01-01", 366), "2025-01-01"); // leap year
});

test("addDaysISO: zero days returns same date", () => {
  assert.equal(addDaysISO("2026-09-10", 0), "2026-09-10");
});

test("istTodayISO: UTC to IST conversion (IST = UTC+5:30)", () => {
  // 12:00 UTC = 17:30 IST same day
  assert.equal(istTodayISO(new Date("2026-09-09T12:00:00Z")), "2026-09-09");
  // 20:00 UTC = 01:30 IST next day
  assert.equal(istTodayISO(new Date("2026-09-09T20:00:00Z")), "2026-09-10");
  // 18:29 UTC = 23:59 IST same day
  assert.equal(istTodayISO(new Date("2026-09-09T18:29:00Z")), "2026-09-09");
  // 18:30 UTC = 00:00 IST next day
  assert.equal(istTodayISO(new Date("2026-09-09T18:30:00Z")), "2026-09-10");
  // Midnight UTC = 05:30 IST same day
  assert.equal(istTodayISO(new Date("2026-09-09T00:00:00Z")), "2026-09-09");
});

test("dateToWeekdayLower: known dates", () => {
  assert.equal(dateToWeekdayLower("2026-09-10"), "thursday");
  assert.equal(dateToWeekdayLower("2026-09-11"), "friday");
  assert.equal(dateToWeekdayLower("2026-09-12"), "saturday");
  assert.equal(dateToWeekdayLower("2026-09-13"), "sunday");
  assert.equal(dateToWeekdayLower("2026-09-14"), "monday");
  assert.equal(dateToWeekdayLower("2026-01-01"), "thursday"); // 2026-01-01
});

test("timeToMinutes: all valid times", () => {
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes("06:00"), 360);
  assert.equal(timeToMinutes("12:00"), 720);
  assert.equal(timeToMinutes("19:00"), 1140);
  assert.equal(timeToMinutes("23:59"), 1439);
  assert.equal(timeToMinutes("09:05"), 545);
});

test("timeToMinutes: invalid returns NaN", () => {
  assert.ok(Number.isNaN(timeToMinutes("25:00")));
  assert.ok(Number.isNaN(timeToMinutes("12:60")));
  assert.ok(Number.isNaN(timeToMinutes("not-a-time")));
});

test("minutesToTime: all valid minutes", () => {
  assert.equal(minutesToTime(0), "00:00");
  assert.equal(minutesToTime(360), "06:00");
  assert.equal(minutesToTime(720), "12:00");
  assert.equal(minutesToTime(1140), "19:00");
  assert.equal(minutesToTime(1439), "23:59");
  assert.equal(minutesToTime(545), "09:05");
});

test("minutesToTime: wraps at 24 hours", () => {
  assert.equal(minutesToTime(1440), "00:00");
  assert.equal(minutesToTime(1500), "01:00");
  assert.equal(minutesToTime(-60), "23:00"); // negative wraps
});

test("timeToMinutes + minutesToTime round-trip", () => {
  const times = ["00:00", "06:00", "09:05", "12:00", "19:30", "23:59"];
  for (const t of times) {
    assert.equal(minutesToTime(timeToMinutes(t)), t);
  }
});