// Scheduler configuration: fail-open, clamping, and the guarantee that the new
// keys can NEVER disable the live booking funnel.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  readSchedulerConfig,
  schedulerCapabilities,
  SCHEDULER_DISABLED,
  ALGORITHM_VERSION,
} from "../_shared/schedulerConfig.ts";

test("config: absent scheduler block is OFF (fail-open)", () => {
  assert.equal(readSchedulerConfig(undefined).enabled, false);
  assert.equal(readSchedulerConfig(null).enabled, false);
  assert.equal(readSchedulerConfig({}).enabled, false);
  assert.equal(readSchedulerConfig({ scheduler: null }).enabled, false);
});

test("config: the PRODUCTION booking_flow row (no scheduler key) leaves it OFF", () => {
  // This is the exact shape of prod's row. Reading it must not throw, and must
  // NOT claim the funnel is disabled — that decision belongs to config.ts.
  const prodBookingFlow = {
    enabled: true,
    gateway: "razorpay",
    payment_mode: "test",
    hold_minutes: 15,
    max_slots_per_booking: 12,
    booking_days_ahead: 14,
    slot_start: "06:00",
    slot_end: "22:00",
    slot_grid_minutes: 30,
    slot_duration_minutes: 60,
    instructor_gap_minutes: 15,
    female_instructor_mode: "off",
    installment_modes: ["full"],
  };
  const cfg = readSchedulerConfig(prodBookingFlow);
  assert.equal(cfg.enabled, false);
  assert.deepEqual(cfg, SCHEDULER_DISABLED);
});

test("config: enabled only when literally true", () => {
  assert.equal(readSchedulerConfig({ scheduler: { enabled: true } }).enabled, true);
  assert.equal(readSchedulerConfig({ scheduler: { enabled: "true" } }).enabled, false);
  assert.equal(readSchedulerConfig({ scheduler: { enabled: 1 } }).enabled, false);
  assert.equal(readSchedulerConfig({ scheduler: { enabled: false } }).enabled, false);
});

test("config: malformed scheduler block fails OPEN to disabled", () => {
  assert.equal(readSchedulerConfig({ scheduler: "garbage" }).enabled, false);
  assert.equal(readSchedulerConfig({ scheduler: 42 }).enabled, false);
  assert.equal(readSchedulerConfig({ scheduler: { enabled: true, weights: "nope" } }).enabled, true);
});

test("config: defaults reproduce today's behaviour", () => {
  const cfg = readSchedulerConfig({ scheduler: { enabled: true } });
  assert.equal(cfg.maxCustomerClassesPerDay, 2);
  assert.equal(cfg.preferredCustomerClassesPerDay, 2);
  assert.equal(cfg.averageTravelSpeedKph, null, "travel must stay unenforced until a speed is supplied");
  assert.equal(cfg.instructorTravelBufferMinutes, 0);
  assert.equal(cfg.algorithmVersion, ALGORITHM_VERSION);
});

test("config: out-of-range values fall back instead of throwing", () => {
  const cfg = readSchedulerConfig({
    scheduler: {
      enabled: true,
      max_customer_classes_per_day: 9999,
      beam_width: -5,
      workload_horizon_days: 5000,
      average_travel_speed_kph: 0,
    },
  });
  assert.equal(cfg.maxCustomerClassesPerDay, 2);
  assert.equal(cfg.beamWidth, 0);
  assert.equal(cfg.workloadHorizonDays, 0);
  assert.equal(cfg.averageTravelSpeedKph, null);
});

test("config: preferred classes/day can never exceed the hard cap", () => {
  const cfg = readSchedulerConfig({
    scheduler: { enabled: true, max_customer_classes_per_day: 2, preferred_customer_classes_per_day: 5 },
  });
  assert.equal(cfg.preferredCustomerClassesPerDay, 2);
});

test("config: travel requires an explicit speed", () => {
  const caps = schedulerCapabilities(readSchedulerConfig({ scheduler: { enabled: true } }));
  assert.equal(caps.travelEnforced, false);

  const withSpeed = readSchedulerConfig({
    scheduler: { enabled: true, average_travel_speed_kph: 25, instructor_travel_buffer_minutes: 10 },
  });
  assert.equal(withSpeed.averageTravelSpeedKph, 25);
  assert.equal(withSpeed.instructorTravelBufferMinutes, 10);
  assert.equal(schedulerCapabilities(withSpeed).travelEnforced, true);
});

test("config: capabilities reflect what is actually configured", () => {
  const bare = readSchedulerConfig({ scheduler: { enabled: true } });
  assert.equal(schedulerCapabilities(bare).canSearch, false);
  assert.equal(schedulerCapabilities(bare).scoringEnabled, false);

  const full = readSchedulerConfig({
    scheduler: {
      enabled: true,
      beam_width: 20,
      weights: { customer_convenience: 35, instructor_balance: 25, travel_efficiency: 20, schedule_distribution: 15, completion_efficiency: 5 },
    },
  });
  const caps = schedulerCapabilities(full);
  assert.equal(caps.canSearch, true);
  assert.equal(caps.scoringEnabled, true);
});

test("config: weights are read from the DB block", () => {
  const cfg = readSchedulerConfig({
    scheduler: {
      enabled: true,
      weights: {
        customer_convenience: 0.35,
        instructor_balance: 0.25,
        travel_efficiency: 0.2,
        schedule_distribution: 0.15,
        completion_efficiency: 0.05,
      },
    },
  });
  assert.equal(cfg.weights.customerConvenience, 0.35);
  assert.equal(cfg.weights.instructorBalance, 0.25);
  assert.equal(cfg.weights.travelEfficiency, 0.2);
  assert.equal(cfg.weights.scheduleDistribution, 0.15);
  assert.equal(cfg.weights.completionEfficiency, 0.05);
});

test("config: preferred timings and weekdays are sanitised", () => {
  const cfg = readSchedulerConfig({
    scheduler: {
      enabled: true,
      preferred_start_minutes: [600, "660", -5, 99999, null],
      preferred_weekdays: ["monday", "FUNDAY", "friday"],
    },
  });
  assert.deepEqual(cfg.preferredStartMinutes, [600, 660]);
  assert.deepEqual(cfg.preferredWeekdays, ["monday", "friday"]);
});

test("config: algorithm_version is overridable for §28 versioning", () => {
  const cfg = readSchedulerConfig({ scheduler: { enabled: true, algorithm_version: "beam-7" } });
  assert.equal(cfg.algorithmVersion, "beam-7");
});