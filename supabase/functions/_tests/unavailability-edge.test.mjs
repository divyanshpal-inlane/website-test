// Unavailability edge case tests - complex recurring patterns, overlaps, edge of day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTimeUnavailable } from "../_shared/availability.ts";

const D0 = "2026-09-10"; // Thursday
const D1 = "2026-09-11"; // Friday
const D2 = "2026-09-12"; // Saturday
const D3 = "2026-09-13"; // Sunday
const D4 = "2026-09-14"; // Monday
const D5 = "2026-09-15"; // Tuesday
const D6 = "2026-09-16"; // Wednesday

test("isTimeUnavailable: overlapping single-day blocks", () => {
  const unavail = [
    { booked_date: D0, booked_start_time: "10:00", booked_end_time: "12:00" },
    { booked_date: D0, booked_start_time: "11:00", booked_end_time: "13:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 660), true); // 11:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), true); // 10:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), true); // 12:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 540), false); // 09:00
});

test("isTimeUnavailable: overlapping recurring weekly timed blocks", () => {
  const unavail = [
    { type: "recurring", days_of_week: ["thursday"], booked_start_time: "10:00", booked_end_time: "12:00" },
    { type: "recurring", days_of_week: ["thursday"], booked_start_time: "11:00", booked_end_time: "13:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 660), true); // 11:00 in both
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), true); // 10:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), true); // 12:00
});

test("isTimeUnavailable: mixed single-day and recurring overlap", () => {
  const unavail = [
    { booked_date: D0, booked_start_time: "10:00", booked_end_time: "14:00" },
    { type: "recurring", days_of_week: ["thursday"], booked_start_time: "12:00", booked_end_time: "15:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), true); // 12:00 in both
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 540), false); // 09:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 840), true); // 14:00 in recurring
});

test("isTimeUnavailable: all-day recurring + timed recurring same day", () => {
  const unavail = [
    { type: "recurring", days_of_week: ["friday"], all_day: true },
    { type: "recurring", days_of_week: ["friday"], booked_start_time: "09:00", booked_end_time: "11:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 360), true); // 06:00 - all day covers
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 540), true); // 09:00 - all day covers
});

test("isTimeUnavailable: date-range all-day + recurring weekly timed", () => {
  const unavail = [
    { start_date: "2026-09-01", end_date: "2026-09-30", range_all_day: true },
    { type: "recurring", days_of_week: ["thursday"], booked_start_time: "09:00", booked_end_time: "10:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 360), true); // all-day range covers
  assert.equal(isTimeUnavailable(unavail, "2026-09-17", "thursday", 540), true); // all-day range covers
});

test("isTimeUnavailable: date-range timed + recurring weekly timed same time", () => {
  const unavail = [
    { start_date: "2026-09-01", end_date: "2026-09-30", range_start_time: "12:00", range_end_time: "14:00" },
    { type: "recurring", days_of_week: ["thursday"], booked_start_time: "13:00", booked_end_time: "15:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 780), true); // 13:00 in both
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), true); // 12:00 in range
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 840), true); // 14:00 in recurring
});

test("isTimeUnavailable: days_of_week array with mixed case (Monday vs monday)", () => {
  const unavail = [
    { type: "recurring", days_of_week: ["Monday", "WEDNESDAY"], booked_start_time: "10:00", booked_end_time: "12:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D4, "monday", 600), true);
  assert.equal(isTimeUnavailable(unavail, D6, "wednesday", 600), true);
  assert.equal(isTimeUnavailable(unavail, D5, "tuesday", 600), false);
});

test("isTimeUnavailable: days_of_week with empty string in array", () => {
  const unavail = [
    { type: "recurring", days_of_week: ["thursday", "", "friday"], booked_start_time: "10:00", booked_end_time: "12:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), true);
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 600), true);
});

test("isTimeUnavailable: days_of_week with null/undefined entries", () => {
  const unavail = [
    { type: "recurring", days_of_week: ["thursday", null, "friday", undefined], booked_start_time: "10:00", booked_end_time: "12:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), true);
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 600), true);
});

test("isTimeUnavailable: recurring all_day true + days_of_week array", () => {
  const unavail = [
    { type: "recurring", days_of_week: ["monday", "wednesday", "friday"], all_day: true },
  ];
  assert.equal(isTimeUnavailable(unavail, D4, "monday", 360), true);
  assert.equal(isTimeUnavailable(unavail, D6, "wednesday", 1020), true);
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 360), true);
  assert.equal(isTimeUnavailable(unavail, D5, "tuesday", 360), false);
});

test("isTimeUnavailable: date-range with only range_start_time (open-ended end)", () => {
  const unavail = [
    { start_date: "2026-09-01", end_date: "2026-09-30", range_start_time: "18:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 1080), true); // 18:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 1200), true); // 20:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 1020), false); // 17:00
  // Outside range
  assert.equal(isTimeUnavailable(unavail, "2026-08-31", "monday", 1080), false);
  assert.equal(isTimeUnavailable(unavail, "2026-10-01", "thursday", 1080), false);
});

test("isTimeUnavailable: date-range with both range_start_time and range_end_time", () => {
  const unavail = [
    { start_date: "2026-09-01", end_date: "2026-09-30", range_start_time: "12:00", range_end_time: "14:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), true); // 12:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 780), true); // 13:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 840), false); // 14:00 - exactly at end
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 660), false); // 11:00
});

test("isTimeUnavailable: date-range with range_end_time but no range_start_time (defaults to all day?)", () => {
  const unavail = [
    { start_date: "2026-09-01", end_date: "2026-09-30", range_end_time: "14:00" },
  ];
  // The code treats missing range_start_time as all-day
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 360), true);
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), true);
});

test("isTimeUnavailable: single-day block without all_day but also without times = all-day", () => {
  const unavail = [{ booked_date: D0 }];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 360), true);
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 1200), true);
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 360), false);
});

test("isTimeUnavailable: single-day all_day true = all day", () => {
  const unavail = [{ booked_date: D0, all_day: true }];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 360), true);
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 360), false);
});

test("isTimeUnavailable: single-day with times only (no all_day) = timed block", () => {
  const unavail = [{ booked_date: D0, booked_start_time: "12:00", booked_end_time: "14:00" }];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), true);
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 840), false);
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 720), false);
});

test("isTimeUnavailable: day_of_week single string (legacy format) all_day", () => {
  const unavail = [{ day_of_week: "friday", all_day: true }];
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 360), true);
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 360), false);
});

test("isTimeUnavailable: day_of_week single string (legacy format) timed", () => {
  const unavail = [{ day_of_week: "thursday", booked_start_time: "10:00", booked_end_time: "12:00" }];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), true);
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 540), false);
  assert.equal(isTimeUnavailable(unavail, D4, "monday", 600), false);
});

test("isTimeUnavailable: multiple day_of_week single strings", () => {
  const unavail = [
    { day_of_week: "monday", booked_start_time: "09:00", booked_end_time: "10:00" },
    { day_of_week: "friday", all_day: true },
  ];
  assert.equal(isTimeUnavailable(unavail, D4, "monday", 540), true);
  assert.equal(isTimeUnavailable(unavail, D1, "friday", 360), true);
});

test("isTimeUnavailable: day_of_week with times + all_day false explicit", () => {
  const unavail = [{ day_of_week: "thursday", all_day: false, booked_start_time: "10:00", booked_end_time: "12:00" }];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), true);
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 540), false);
});

test("isTimeUnavailable: recursive weekly recurring with reason field (ignored)", () => {
  const unavail = [
    { type: "recurring", reason: "Afternoon Block", days_of_week: ["thursday"], booked_start_time: "12:00", booked_end_time: "14:00" },
  ];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), true);
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 660), false);
});

test("isTimeUnavailable: empty days_of_week array = no match", () => {
  const unavail = [{ type: "recurring", days_of_week: [], booked_start_time: "10:00", booked_end_time: "12:00" }];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), false);
});

test("isTimeUnavailable: days_of_week array with non-string elements", () => {
  const unavail = [{ type: "recurring", days_of_week: ["thursday", 5, null], booked_start_time: "10:00", booked_end_time: "12:00" }];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), true);
});

test("isTimeUnavailable: null/undefined unavailability = available", () => {
  assert.equal(isTimeUnavailable(null, D0, "thursday", 600), false);
  assert.equal(isTimeUnavailable(undefined, D0, "thursday", 600), false);
  assert.equal(isTimeUnavailable([], D0, "thursday", 600), false);
});

test("isTimeUnavailable: date-range spanning year boundary", () => {
  const unavail = [
    { start_date: "2025-12-20", end_date: "2026-01-20", range_all_day: true },
  ];
  assert.equal(isTimeUnavailable(unavail, "2025-12-25", "thursday", 600), true);
  assert.equal(isTimeUnavailable(unavail, "2026-01-05", "monday", 600), true);
  assert.equal(isTimeUnavailable(unavail, "2025-12-15", "monday", 600), false);
  assert.equal(isTimeUnavailable(unavail, "2026-01-25", "sunday", 600), false);
});

test("isTimeUnavailable: recurring days_of_week spanning year boundary", () => {
  const unavail = [
    { type: "recurring", days_of_week: ["monday"], all_day: true },
  ];
  assert.equal(isTimeUnavailable(unavail, "2025-12-29", "monday", 600), true); // 2025 Monday
  assert.equal(isTimeUnavailable(unavail, "2026-01-05", "monday", 600), true); // 2026 Monday
});

test("isTimeUnavailable: exact boundary times - start_time inclusive, end_time exclusive", () => {
  const unavail = [{ booked_date: D0, booked_start_time: "12:00", booked_end_time: "13:00" }];
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), true);   // 12:00 exactly
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 779), true);   // 12:59
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 780), false);  // 13:00 exactly = free
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 719), false);  // 11:59
});

test("isTimeUnavailable: midnight crossing not supported (start > end), but times are within day", () => {
  // The system doesn't support overnight blocks; times must be within 00:00-23:59
  // This test documents that behavior
  const unavail = [{ booked_date: D0, booked_start_time: "22:00", booked_end_time: "02:00" }];
  // 22:00 = 1320, 02:00 = 120. Since 120 < 1320, the check currentMinutes >= 1320 && currentMinutes < 120
  // will be false for all currentMinutes (no number is >= 1320 AND < 120)
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 1320), false); // 22:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 120), false);  // 02:00
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 720), false);  // 12:00
});

test("isTimeUnavailable: booked_date in different format (with time)", () => {
  const unavail = [{ booked_date: "2026-09-10T00:00:00.000Z" }];
  // String comparison: "2026-09-10" !== "2026-09-10T00:00:00.000Z"
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), false);
});

test("isTimeUnavailable: start_date/end_date with time component", () => {
  const unavail = [
    { start_date: "2026-09-01T00:00:00", end_date: "2026-09-30T23:59:59", range_all_day: true },
  ];
  // String comparison works if format matches
  assert.equal(isTimeUnavailable(unavail, D0, "thursday", 600), true);
});