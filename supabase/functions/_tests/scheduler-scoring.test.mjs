// The five score components (§9-§13, §20) and how they are combined.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  customerConvenienceScore,
  scheduleDistributionScore,
  completionEfficiencyScore,
  combine,
  emptyComponents,
  scoreWeightsPresent,
} from "../_shared/scoring.ts";
import { enabledConfig } from "./scheduler-fixtures.mjs";

/** Build lessons: `plan` is a list of [date, "HH:MM"] pairs. */
function lessons(plan) {
  return plan.map(([date, start], i) => ({
    date,
    start_time: start,
    end_time: addHour(start),
    lesson: i + 1,
  }));
}

function addHour(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const NO_PREFERENCES = {
  preferredStartMinutes: [],
  preferredWeekdays: [],
  preferredClassesPerDay: 2,
  maxClassesPerDay: 2,
  minGapDays: 0,
  maxGapDays: 0,
};

// ─── §20. customer convenience ─────────────────────────────────────────────
test("20. every lesson at a preferred time beats none of them", () => {
  const onTime = lessons([
    ["2026-10-05", "10:00"],
    ["2026-10-06", "10:00"],
  ]);
  const offTime = lessons([
    ["2026-10-05", "14:00"],
    ["2026-10-06", "14:00"],
  ]);
  const opts = { ...NO_PREFERENCES, preferredStartMinutes: [600] };
  const good = customerConvenienceScore(onTime, opts);
  const bad = customerConvenienceScore(offTime, opts);
  assert.ok(good.score > bad.score, "matching the preferred time must score higher");
  assert.equal(good.facts.preferredTimingHits, 2);
  assert.equal(bad.facts.preferredTimingHits, 0);
});

test("20b. preferred weekdays are rewarded", () => {
  // 2026-10-05 is a Monday, 2026-10-09 a Friday.
  const weekdays = customerConvenienceScore(lessons([["2026-10-05", "09:00"]]), {
    ...NO_PREFERENCES,
    preferredWeekdays: ["monday"],
  });
  const weekend = customerConvenienceScore(lessons([["2026-10-05", "09:00"]]), {
    ...NO_PREFERENCES,
    preferredWeekdays: ["sunday"],
  });
  assert.ok(weekdays.score > weekend.score);
});

test("20c. piling classes onto one day scores worse than spreading them", () => {
  const piled = lessons([
    ["2026-10-05", "09:00"],
    ["2026-10-05", "10:00"],
    ["2026-10-05", "11:00"],
  ]);
  const spread = lessons([
    ["2026-10-05", "09:00"],
    ["2026-10-06", "09:00"],
    ["2026-10-07", "09:00"],
  ]);
  const a = customerConvenienceScore(piled, NO_PREFERENCES);
  const b = customerConvenienceScore(spread, NO_PREFERENCES);
  assert.ok(b.score > a.score, "spreading must be preferred");
  assert.equal(a.facts.maxClassesInADay, 3);
  assert.equal(b.facts.maxClassesInADay, 1);
  assert.equal(b.facts.distinctDays, 3);
});

test("20d. spacing preferences are scored against the configured bounds", () => {
  const plan = lessons([
    ["2026-10-05", "09:00"],
    ["2026-10-06", "09:00"],
    ["2026-10-07", "09:00"],
  ]);
  const comfortable = customerConvenienceScore(plan, { ...NO_PREFERENCES, maxGapDays: 2 });
  const cramped = customerConvenienceScore(plan, { ...NO_PREFERENCES, minGapDays: 5 });
  assert.ok(comfortable.score > cramped.score, "a 1-day gap suits maxGapDays=2, not minGapDays=5");
});

test("20e. an empty plan is handled without dividing by zero", () => {
  const out = customerConvenienceScore([], NO_PREFERENCES);
  assert.ok(Number.isFinite(out.score));
  assert.ok(out.score >= 0 && out.score <= 1);
});

test("20f. the score is always normalised to 0..1", () => {
  const opts = { ...NO_PREFERENCES, preferredStartMinutes: [600], preferredWeekdays: ["monday"] };
  const plan = lessons([
    ["2026-10-05", "10:00"],
    ["2026-10-05", "11:00"],
    ["2026-10-12", "10:00"],
  ]);
  const { score } = customerConvenienceScore(plan, opts);
  assert.ok(score >= 0 && score <= 1, `out of range: ${score}`);
});

// ─── §11. distribution ─────────────────────────────────────────────────────
test("11. an even spread scores 1 and a lopsided one scores lower", () => {
  const even = lessons([
    ["2026-10-05", "09:00"],
    ["2026-10-06", "09:00"],
    ["2026-10-07", "09:00"],
    ["2026-10-08", "09:00"],
  ]);
  const lopsided = lessons([
    ["2026-10-05", "09:00"],
    ["2026-10-05", "10:00"],
    ["2026-10-05", "11:00"],
    ["2026-10-06", "09:00"],
  ]);
  assert.equal(scheduleDistributionScore(even), 1);
  assert.ok(scheduleDistributionScore(lopsided) < 1);
  assert.ok(scheduleDistributionScore(lopsided) > 0);
});

test("11b. a single day is scored on its size", () => {
  assert.equal(scheduleDistributionScore(lessons([["2026-10-05", "09:00"]])), 1);
  assert.ok(scheduleDistributionScore(lessons([
    ["2026-10-05", "09:00"],
    ["2026-10-05", "10:00"],
    ["2026-10-05", "11:00"],
  ])) < 1);
});

test("11c. an empty plan is handled", () => {
  assert.ok(Number.isFinite(scheduleDistributionScore([])));
});

// ─── §14. completion efficiency ────────────────────────────────────────────
test("14. finishing sooner scores higher", () => {
  const fast = lessons([
    ["2026-10-05", "09:00"],
    ["2026-10-06", "09:00"],
  ]);
  const slow = lessons([
    ["2026-10-05", "09:00"],
    ["2026-10-12", "09:00"],
  ]);
  assert.ok(
    completionEfficiencyScore(fast, 30) > completionEfficiencyScore(slow, 30),
    "a 2-day course beats a 8-day one against the same window",
  );
});

test("14b. an unconfigured completion window expresses no opinion", () => {
  assert.equal(completionEfficiencyScore(lessons([["2026-10-05", "09:00"]]), 0), 0.5);
});

test("14c. a single-day course completes perfectly", () => {
  assert.equal(completionEfficiencyScore(lessons([
    ["2026-10-05", "09:00"],
    ["2026-10-05", "10:00"],
  ]), 30), 1);
});

// ─── §19. combining ────────────────────────────────────────────────────────
test("19. weights drive the final score", () => {
  // Only the customer component is non-zero, so the result must track the weight
  // given to that component.
  const customerOnly = {
    customerConvenience: 1,
    instructorBalance: 0,
    travelEfficiency: 0,
    scheduleDistribution: 0,
    completionEfficiency: 0,
  };
  const heavyOnCustomer = combine(customerOnly, {
    customerConvenience: 0.6,
    instructorBalance: 0.15,
    travelEfficiency: 0.1,
    scheduleDistribution: 0.1,
    completionEfficiency: 0.05,
  });
  const lightOnCustomer = combine(customerOnly, {
    customerConvenience: 0.1,
    instructorBalance: 0.4,
    travelEfficiency: 0.25,
    scheduleDistribution: 0.2,
    completionEfficiency: 0.05,
  });
  assert.ok(heavyOnCustomer > lightOnCustomer, "weighting the customer component more must matter");
  assert.ok(Math.abs(heavyOnCustomer - 0.6) < 0.001, `expected ~0.6, got ${heavyOnCustomer}`);
});

test("19b. the combination is scale-invariant across weight notations", () => {
  const components = { customerConvenience: 0.8, instructorBalance: 0.4, travelEfficiency: 0.2, scheduleDistribution: 0.6, completionEfficiency: 0.1 };
  const fractions = combine(components, {
    customerConvenience: 0.35,
    instructorBalance: 0.25,
    travelEfficiency: 0.2,
    scheduleDistribution: 0.15,
    completionEfficiency: 0.05,
  });
  const percentages = combine(components, {
    customerConvenience: 35,
    instructorBalance: 25,
    travelEfficiency: 20,
    scheduleDistribution: 15,
    completionEfficiency: 5,
  });
  assert.equal(fractions, percentages, "0.35 and 35 must mean the same thing");
});

test("19c. no configured weights means no opinion, not a zero", () => {
  const zero = {
    customerConvenience: 0,
    instructorBalance: 0,
    travelEfficiency: 0,
    scheduleDistribution: 0,
    completionEfficiency: 0,
  };
  assert.equal(scoreWeightsPresent(zero), false);
  assert.equal(combine(emptyComponents(), zero), 0.5);
});

test("19d. the combined score is always 0..1 and deterministic", () => {
  const weights = enabledConfig().weights;
  assert.equal(scoreWeightsPresent(weights), true);
  const components = emptyComponents();
  const a = combine(components, weights);
  assert.equal(a, combine(components, weights));
  assert.ok(a >= 0 && a <= 1);
});

test("19e. an all-neutral plan scores exactly 0.5", () => {
  assert.equal(combine(emptyComponents(), enabledConfig().weights), 0.5);
});