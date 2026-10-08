// Config parsing edge cases - fail-closed behavior, missing/invalid fields.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBookingFlowConfig } from "../_shared/config.ts";

const VALID = {
  enabled: true,
  gateway: "razorpay",
  payment_mode: "test",
  hold_minutes: 30,
  max_slots_per_booking: 20,
  booking_days_ahead: 14,
  slot_start: "06:00",
  slot_end: "20:00",
  slot_grid_minutes: 30,
  slot_duration_minutes: 60,
  instructor_gap_minutes: 30,
  female_instructor_mode: "preference",
  installment_modes: ["full", "first_half"],
};

test("readBookingFlowConfig: enabled=false in DB returns disabled even if all fields valid", () => {
  const cfg = readBookingFlowConfig({ ...VALID, enabled: false });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: enabled=true but missing gateway = disabled", () => {
  const { gateway: _g, ...rest } = VALID;
  const cfg = readBookingFlowConfig({ ...rest, enabled: true });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: missing payment_mode = disabled", () => {
  const { payment_mode: _pm, ...rest } = VALID;
  const cfg = readBookingFlowConfig({ ...rest, enabled: true });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: missing hold_minutes = disabled", () => {
  const { hold_minutes: _hm, ...rest } = VALID;
  const cfg = readBookingFlowConfig({ ...rest, enabled: true });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: hold_minutes below min (5) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, hold_minutes: 4 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: hold_minutes above max (1440) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, hold_minutes: 1441 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: hold_minutes at boundary (5) = enabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, hold_minutes: 5 });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.hold_minutes, 5);
});

test("readBookingFlowConfig: hold_minutes at boundary (1440) = enabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, hold_minutes: 1440 });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.hold_minutes, 1440);
});

test("readBookingFlowConfig: max_slots_per_booking below min (1) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, max_slots_per_booking: 0 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: max_slots_per_booking above max (100) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, max_slots_per_booking: 101 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: booking_days_ahead below min (1) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, booking_days_ahead: 0 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: booking_days_ahead above max (60) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, booking_days_ahead: 61 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: slot_start invalid format (not HH:MM) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, slot_start: "6:00" }); // missing leading zero
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: slot_start invalid (25:00) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, slot_start: "25:00" });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: slot_end invalid (24:00) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, slot_end: "24:00" });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: gridMinutes below min (5) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, slot_grid_minutes: 4 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: gridMinutes above max (60) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, slot_grid_minutes: 61 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: slot_duration_minutes below min (15) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, slot_duration_minutes: 14 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: slot_duration_minutes above max (240) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, slot_duration_minutes: 241 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: instructor_gap_minutes below min (0) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, instructor_gap_minutes: -1 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: instructor_gap_minutes above max (240) = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, instructor_gap_minutes: 241 });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: instructor_gap_minutes at 0 = enabled (no gap)", () => {
  const cfg = readBookingFlowConfig({ ...VALID, instructor_gap_minutes: 0 });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.instructor_gap_minutes, 0);
});

test("readBookingFlowConfig: female_instructor_mode invalid = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, female_instructor_mode: "always" });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: female_instructor_mode 'off' = enabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, female_instructor_mode: "off" });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.female_instructor_mode, "off");
});

test("readBookingFlowConfig: female_instructor_mode 'mandatory' = enabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, female_instructor_mode: "mandatory" });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.female_instructor_mode, "mandatory");
});

test("readBookingFlowConfig: installment_modes empty array = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, installment_modes: [] });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: installment_modes with empty string = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, installment_modes: ["full", ""] });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: installment_modes with non-string = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, installment_modes: ["full", 123] });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: installment_modes null = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, installment_modes: null });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: installment_modes missing = disabled", () => {
  const { installment_modes: _im, ...rest } = VALID;
  const cfg = readBookingFlowConfig({ ...rest, enabled: true });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: gateway empty string = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, gateway: "" });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: gateway null = disabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, gateway: null });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: slot_end before slot_start = still enabled (config doesn't validate order)", () => {
  const cfg = readBookingFlowConfig({ ...VALID, slot_start: "12:00", slot_end: "10:00" });
  // The config parser doesn't validate slotStart < slotEnd - that's runtime logic
  assert.equal(cfg.enabled, true);
});

test("readBookingFlowConfig: non-integer hold_minutes rounds correctly", () => {
  const cfg = readBookingFlowConfig({ ...VALID, hold_minutes: 30.7 });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.hold_minutes, 31);
});

test("readBookingFlowConfig: string hold_minutes parses correctly", () => {
  const cfg = readBookingFlowConfig({ ...VALID, hold_minutes: "45" });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.hold_minutes, 45);
});

test("readBookingFlowConfig: installment_modes single value = enabled", () => {
  const cfg = readBookingFlowConfig({ ...VALID, installment_modes: ["full"] });
  assert.equal(cfg.enabled, true);
  assert.deepEqual(cfg.installment_modes, ["full"]);
});

test("readBookingFlowConfig: partial config (only enabled=true) = disabled", () => {
  const cfg = readBookingFlowConfig({ enabled: true });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: null input = disabled", () => {
  const cfg = readBookingFlowConfig(null);
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: undefined input = disabled", () => {
  const cfg = readBookingFlowConfig(undefined);
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: empty object = disabled", () => {
  const cfg = readBookingFlowConfig({});
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: returns defaults for missing optional when enabled=false", () => {
  const cfg = readBookingFlowConfig({ enabled: false, gateway: "razorpay" });
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.payment_mode, "live"); // default when disabled
  assert.equal(cfg.female_instructor_mode, "off");
});

test("readBookingFlowConfig: installment_modes array with whitespace trimmed", () => {
  const cfg = readBookingFlowConfig({ ...VALID, installment_modes: [" full ", "first_half "] });
  assert.equal(cfg.enabled, true);
  assert.deepEqual(cfg.installment_modes, [" full ", "first_half "]); // kept as-is, validation only checks non-empty
});

test("readBookingFlowConfig: female_instructor_mode case sensitive", () => {
  const cfg = readBookingFlowConfig({ ...VALID, female_instructor_mode: "PREFERENCE" });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: payment_mode case sensitive", () => {
  const cfg = readBookingFlowConfig({ ...VALID, payment_mode: "TEST" });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig: extra fields in config ignored", () => {
  const cfg = readBookingFlowConfig({ ...VALID, extra_field: "ignored", another: 123 });
  assert.equal(cfg.enabled, true);
});