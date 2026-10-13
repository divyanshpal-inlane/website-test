// Unit tests for validateLearnerWideConsecutive (_shared/availability.ts) — pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLearnerWideConsecutive } from "../_shared/availability.ts";

const L = (date, s, e) => ({ date, start_time: s, end_time: e });

test("no existing, single proposed lesson -> ok", () => {
  assert.equal(validateLearnerWideConsecutive([], [L("2026-10-12", "06:00", "07:00")]), null);
});

test("no existing, two adjacent same-day proposed -> ok", () => {
  assert.equal(
    validateLearnerWideConsecutive([], [L("2026-10-12", "06:00", "07:00"), L("2026-10-12", "07:00", "08:00")]),
    null,
  );
});

test("no existing, two NON-adjacent same-day proposed -> violation", () => {
  assert.match(
    validateLearnerWideConsecutive([], [L("2026-10-12", "06:00", "07:00"), L("2026-10-12", "09:00", "10:00")]),
    /not consecutive/,
  );
});

test("PROD REPRO: existing tentative 12:00 + proposed Demo 06:30 same day -> violation", () => {
  const msg = validateLearnerWideConsecutive(
    [L("2026-10-12", "12:00:00", "13:00:00")],
    [L("2026-10-12", "06:30", "07:30")],
  );
  assert.match(msg, /not consecutive/);
});

test("existing 12:00-13:00 + proposed 13:00-14:00 same day (adjacent) -> ok", () => {
  assert.equal(
    validateLearnerWideConsecutive([L("2026-10-12", "12:00:00", "13:00:00")], [L("2026-10-12", "13:00", "14:00")]),
    null,
  );
});

test("existing 12:00-13:00 + proposed 11:00-12:00 same day (adjacent before) -> ok", () => {
  assert.equal(
    validateLearnerWideConsecutive([L("2026-10-12", "12:00:00", "13:00:00")], [L("2026-10-12", "11:00", "12:00")]),
    null,
  );
});

test("existing 2 lessons that day + any proposed that day -> too many", () => {
  assert.match(
    validateLearnerWideConsecutive(
      [L("2026-10-12", "06:00:00", "07:00:00"), L("2026-10-12", "07:00:00", "08:00:00")],
      [L("2026-10-12", "08:00", "09:00")],
    ),
    /More than 2/,
  );
});

test("existing and proposed on different days -> ok", () => {
  assert.equal(
    validateLearnerWideConsecutive([L("2026-10-12", "12:00:00", "13:00:00")], [L("2026-10-14", "06:30", "07:30")]),
    null,
  );
});

test("overlapping same-day lessons -> violation (prev.end != cur.start)", () => {
  assert.match(
    validateLearnerWideConsecutive([L("2026-10-12", "06:00:00", "07:00:00")], [L("2026-10-12", "06:30", "07:30")]),
    /not consecutive/,
  );
});

test("HH:MM:SS and HH:MM spellings compare equal", () => {
  assert.equal(
    validateLearnerWideConsecutive([L("2026-10-12", "06:00:00", "07:00:00")], [L("2026-10-12", "07:00", "08:00")]),
    null,
  );
});

test("unparseable times are ignored, not crashing", () => {
  assert.equal(validateLearnerWideConsecutive([L("2026-10-12", "bad", "worse")], [L("2026-10-12", "06:00", "07:00")]), null);
});
