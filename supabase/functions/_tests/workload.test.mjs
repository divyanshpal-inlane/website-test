// Time-aware instructor workload (§5, §6) and the balance / fairness /
// starvation signals built on it (§21, §22, §23).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeWorkloads,
  balanceScore,
  starvationRelief,
  peakUtilisation,
  peakBookedMinutes,
  DEFAULT_WORKLOAD_POLICY,
} from "../_shared/workload.ts";
import { NOW, block } from "./scheduler-fixtures.mjs";

const policy = (over = {}) => ({ ...DEFAULT_WORKLOAD_POLICY, ...over });

// ─── §6. hours, not learner counts ──────────────────────────────────────────
test("6. booked hours beat the raw learner count", () => {
  // i-2 has FEWER learners (1) but far more booked hours (3 lessons) than
  // i-1 (2 learners, 2 lessons).
  const workloads = computeWorkloads(
    [
      block("i-1", "2026-10-02", 420, 480, { learnerId: "l1" }),
      block("i-1", "2026-10-03", 420, 480, { learnerId: "l2" }),
      block("i-2", "2026-10-02", 420, 480, { learnerId: "l3" }),
      block("i-2", "2026-10-03", 420, 480, { learnerId: "l3" }),
      block("i-2", "2026-10-04", 420, 480, { learnerId: "l3" }),
    ],
    policy(),
    NOW,
    15,
  );

  assert.equal(workloads["i-1"].bookedMinutes, 120);
  assert.equal(workloads["i-2"].bookedMinutes, 180);
  assert.equal(workloads["i-1"].activeLearners, 2);
  assert.equal(workloads["i-2"].activeLearners, 1);

  const busy = balanceScore("i-2", workloads, policy());
  const light = balanceScore("i-1", workloads, policy());
  assert.ok(light.score > busy.score, "fewer booked hours must score better even with more learners");
});

// ─── §6. distinct learners ─────────────────────────────────────────────────
test("6b. one learner with three lessons counts as ONE active learner", () => {
  const workloads = computeWorkloads(
    [
      block("i-1", "2026-10-02", 420, 480, { learnerId: "l1" }),
      block("i-1", "2026-10-03", 420, 480, { learnerId: "l1" }),
      block("i-1", "2026-10-04", 420, 480, { learnerId: "l1" }),
    ],
    policy(),
    NOW,
    15,
  );
  assert.equal(workloads["i-1"].lessons, 3);
  assert.equal(workloads["i-1"].activeLearners, 1);
});

test("6c. rows without a learner id are excluded from the learner count", () => {
  const workloads = computeWorkloads([block("i-1", "2026-10-02", 420, 480)], policy(), NOW, 15);
  assert.equal(workloads["i-1"].bookedMinutes, 60);
  assert.equal(workloads["i-1"].activeLearners, 0);
});

// ─── §5. rolling horizon ───────────────────────────────────────────────────
test("5. the rolling horizon only counts work inside the window", () => {
  const blocks = [
    block("i-1", "2026-10-01", 420, 480, { learnerId: "soon" }),
    block("i-1", "2026-10-04", 420, 480, { learnerId: "later" }),
    block("i-1", "2026-11-01", 420, 480, { learnerId: "distant" }),
  ];
  const next7 = computeWorkloads(blocks, policy({ horizonDays: 7 }), NOW, 15);
  assert.equal(next7["i-1"].bookedMinutes, 120, "today and +3d are inside, +31d is not");

  const next14 = computeWorkloads(blocks, policy({ horizonDays: 14 }), NOW, 15);
  assert.equal(next14["i-1"].bookedMinutes, 120, "nothing extra falls inside 14 days either");

  const everything = computeWorkloads(blocks, policy({ horizonDays: 0 }), NOW, 15);
  assert.equal(everything["i-1"].bookedMinutes, 180, "horizon 0 means the whole window");
});

test("5b. a different horizon yields a different workload", () => {
  const blocks = [
    block("i-1", "2026-10-02", 420, 480),
    block("i-1", "2026-10-12", 420, 480),
  ];
  assert.equal(computeWorkloads(blocks, policy({ horizonDays: 7 }), NOW, 15)["i-1"].bookedMinutes, 60);
  assert.equal(computeWorkloads(blocks, policy({ horizonDays: 30 }), NOW, 15)["i-1"].bookedMinutes, 120);
});

// ─── §5. hold expiry and inactive statuses ─────────────────────────────────
test("5c. cancelled and rejected rows never occupy the instructor", () => {
  const workloads = computeWorkloads(
    [
      block("i-1", "2026-10-02", 420, 480, { status: "cancelled" }),
      block("i-1", "2026-10-03", 420, 480, { status: "rejected" }),
      block("i-1", "2026-10-04", 420, 480, { status: "booked" }),
    ],
    policy(),
    NOW,
    15,
  );
  assert.equal(workloads["i-1"].bookedMinutes, 60, "only the booked row counts");
  assert.equal(workloads["i-1"].lessons, 1);
});

test("5d. an expired hold frees the instructor, a live hold does not", () => {
  const stale = {
    ...block("i-1", "2026-10-02", 420, 480),
    status: "pending_payment",
    bookingCreatedAt: "2026-09-01T00:00:00.000Z",
  };
  const live = {
    ...block("i-1", "2026-10-02", 420, 480),
    status: "pending_payment",
    bookingCreatedAt: NOW.toISOString(),
  };
  assert.equal(computeWorkloads([stale], policy(), NOW, 15)["i-1"], undefined, "the expired hold leaves no workload");
  assert.equal(computeWorkloads([live], policy(), NOW, 15)["i-1"].bookedMinutes, 60);
});

test("5e. a pending hold with no timestamp is treated as live (fail closed)", () => {
  const unknown = { ...block("i-1", "2026-10-02", 420, 480), status: "pending_payment" };
  assert.equal(computeWorkloads([unknown], policy(), NOW, 15)["i-1"].bookedMinutes, 60);
});

// ─── §5. unparseable times ─────────────────────────────────────────────────
test("5f. a row with unreadable times still occupies an hour (fail closed)", () => {
  const broken = { ...block("i-1", "2026-10-02", 420, 480), startMinute: NaN, endMinute: NaN };
  assert.equal(computeWorkloads([broken], policy(), NOW, 15)["i-1"].bookedMinutes, 60);
});

// ─── §5. utilisation ───────────────────────────────────────────────────────
test("5g. utilisation scales booked hours against the reference capacity", () => {
  const one = computeWorkloads([block("i-1", "2026-10-02", 420, 480)], policy({ horizonDays: 1 }), NOW, 15);
  assert.ok(one["i-1"].utilisation > 0);

  const many = computeWorkloads(
    Array.from({ length: 12 }, (_, i) => block("i-1", "2026-10-01", 420 + i * 60, 480 + i * 60)),
    policy({ horizonDays: 1 }),
    NOW,
    15,
  );
  assert.ok(many["i-1"].utilisation > 1, `a 12h day is over the 8h reference: ${many["i-1"].utilisation}`);
});

test("5h. the workload window bounds are reported", () => {
  const workloads = computeWorkloads(
    [
      block("i-1", "2026-10-03", 420, 480),
      block("i-1", "2026-10-09", 420, 480),
    ],
    policy({ horizonDays: 30 }),
    NOW,
    15,
  );
  assert.equal(workloads["i-1"].firstDate, "2026-10-03");
  assert.equal(workloads["i-1"].lastDate, "2026-10-09");
});

// ─── §21. balance score ────────────────────────────────────────────────────
test("21. the balance score always discriminates, even against an idle peer", () => {
  // This is the case the previous normalisation collapsed to a tie on.
  const workloads = computeWorkloads(
    [
      block("busy", "2026-10-02", 420, 480),
      block("busy", "2026-10-03", 420, 480),
      block("busy", "2026-10-04", 420, 480),
      block("busy", "2026-10-05", 420, 480),
      block("busy", "2026-10-06", 420, 480),
    ],
    policy(),
    NOW,
    15,
  );
  workloads.idle = {
    instructorId: "idle",
    activeLearners: 0,
    bookedMinutes: 0,
    lessons: 0,
    utilisation: 0,
    firstDate: null,
    lastDate: null,
  };

  const busy = balanceScore("busy", workloads, policy());
  const idle = balanceScore("idle", workloads, policy());
  assert.equal(idle.score, 1, "an instructor with nothing booked tops the scale");
  assert.ok(busy.score < 0.5, `the most loaded instructor must sit low, got ${busy.score}`);
  assert.ok(idle.score > busy.score, "the tie the previous normalisation produced is gone");
});

test("21e. a full learner signal spreads the score across the whole range", () => {
  const workloads = computeWorkloads(
    [
      block("busy", "2026-10-02", 420, 480, { learnerId: "l1" }),
      block("busy", "2026-10-03", 420, 480, { learnerId: "l2" }),
      block("busy", "2026-10-04", 420, 480, { learnerId: "l3" }),
      block("busy", "2026-10-05", 420, 480, { learnerId: "l4" }),
      block("busy", "2026-10-06", 420, 480, { learnerId: "l5" }),
    ],
    policy(),
    NOW,
    15,
  );
  workloads.idle = {
    instructorId: "idle",
    activeLearners: 0,
    bookedMinutes: 0,
    lessons: 0,
    utilisation: 0,
    firstDate: null,
    lastDate: null,
  };
  // With every signal pointing the same way the loaded instructor sits at the
  // neutral floor (only the queue component, which nobody has, is non-zero).
  assert.ok(balanceScore("busy", workloads, policy()).score <= 0.1);
  assert.equal(balanceScore("idle", workloads, policy()).score, 1);
});

test("21b. identical workloads score identically (no arbitrary tie)", () => {
  const workloads = computeWorkloads(
    [
      block("a", "2026-10-02", 420, 480),
      block("b", "2026-10-02", 420, 480),
    ],
    policy(),
    NOW,
    15,
  );
  assert.equal(balanceScore("a", workloads, policy()).score, balanceScore("b", workloads, policy()).score);
});

test("21c. an unknown instructor is handled without throwing", () => {
  assert.equal(balanceScore("ghost", {}, policy()).score, 0.5);
});

test("21d. the score is always a normalised 0..1 number", () => {
  const workloads = computeWorkloads(
    [
      block("a", "2026-10-02", 420, 480),
      block("b", "2026-10-02", 420, 480),
      block("b", "2026-10-03", 420, 480),
    ],
    policy(),
    NOW,
    15,
  );
  for (const id of ["a", "b"]) {
    const { score, relative } = balanceScore(id, workloads, policy());
    assert.ok(score >= 0 && score <= 1, `${id} score out of range: ${score}`);
    assert.ok(relative >= 0 && relative <= 1, `${id} relative out of range: ${relative}`);
  }
});

// ─── §22. fairness threshold ───────────────────────────────────────────────
test("22. near-identical instructors are treated as equivalent", () => {
  const workloads = computeWorkloads(
    [
      block("a", "2026-10-02", 420, 480),
      block("b", "2026-10-02", 420, 480),
    ],
    policy(),
    NOW,
    15,
  );
  assert.equal(balanceScore("a", workloads, policy()).equivalentToBest, false, "no threshold means never equivalent");
  assert.equal(balanceScore("a", workloads, policy({ fairnessThreshold: 0.5 })).equivalentToBest, true);
});

test("22b. a materially busier instructor is not equivalent", () => {
  const workloads = computeWorkloads(
    [
      block("a", "2026-10-02", 420, 480),
      block("b", "2026-10-02", 420, 480),
      block("b", "2026-10-03", 420, 480),
      block("b", "2026-10-04", 420, 480),
      block("b", "2026-10-05", 420, 480),
    ],
    policy(),
    NOW,
    15,
  );
  assert.equal(balanceScore("b", workloads, policy({ fairnessThreshold: 0.1 })).equivalentToBest, false);
});

// ─── §23. starvation relief ────────────────────────────────────────────────
test("23. an idle instructor earns starvation relief over a loaded one", () => {
  const workloads = computeWorkloads(
    [
      block("busy", "2026-10-02", 420, 480),
      block("busy", "2026-10-03", 420, 480),
      block("busy", "2026-10-04", 420, 480),
    ],
    policy(),
    NOW,
    15,
  );
  workloads.idle = {
    instructorId: "idle",
    activeLearners: 0,
    bookedMinutes: 0,
    lessons: 0,
    utilisation: 0,
    firstDate: null,
    lastDate: null,
  };

  const idle = starvationRelief("idle", workloads, policy({ starvationReliefFactor: 1 }));
  const busy = starvationRelief("busy", workloads, policy({ starvationReliefFactor: 1 }));
  assert.ok(idle > busy, "the starved instructor must earn more relief");
});

test("23b. starvation relief is off unless configured", () => {
  const workloads = computeWorkloads([block("a", "2026-10-02", 420, 480)], policy(), NOW, 15);
  assert.equal(starvationRelief("a", workloads, policy()), 0);
});

// ─── peak helpers ──────────────────────────────────────────────────────────
test("peak helpers report the maxima of the set", () => {
  const workloads = computeWorkloads(
    [
      block("a", "2026-10-02", 420, 480),
      block("b", "2026-10-02", 420, 480),
      block("b", "2026-10-03", 420, 480),
    ],
    policy({ horizonDays: 7 }),
    NOW,
    15,
  );
  assert.equal(peakBookedMinutes(workloads), 120);
  assert.ok(peakUtilisation(workloads) > 0);
  assert.equal(peakBookedMinutes({}), 0);
  assert.equal(peakUtilisation({}), 0);
});