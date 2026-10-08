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

test("readBookingFlowConfig parses payment_mode 'test' and 'live'", () => {
  const testCfg = readBookingFlowConfig({ ...VALID, payment_mode: "test" });
  assert.equal(testCfg.enabled, true);
  assert.equal(testCfg.payment_mode, "test");
  const liveCfg = readBookingFlowConfig({ ...VALID, payment_mode: "live" });
  assert.equal(liveCfg.enabled, true);
  assert.equal(liveCfg.payment_mode, "live");
});

test("readBookingFlowConfig rejects unknown payment_mode (flow disabled, fails closed)", () => {
  const cfg = readBookingFlowConfig({ ...VALID, payment_mode: "sandbox" });
  assert.equal(cfg.enabled, false);
});

test("readBookingFlowConfig requires payment_mode (missing => disabled, no silent approve)", () => {
  const { payment_mode: _drop, ...rest } = VALID;
  const cfg = readBookingFlowConfig(rest);
  assert.equal(cfg.enabled, false);
});