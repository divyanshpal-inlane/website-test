// Distance-based travel feasibility (§6, §7) and its cache.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TravelCache,
  travelSlackMinutes,
  travelEfficiencyScore,
  geographicCost,
  toLatLng,
  DEFAULT_TRAVEL_POLICY,
} from "../_shared/travel.ts";
import { FAR_AWAY, INDIANAPORE } from "./scheduler-fixtures.mjs";

/** Travel minutes for a pair, using a shared cache like the scheduler does. */
function minutes(from, to, { speed, buffer = 0, cache = new TravelCache() } = {}) {
  return cache.minutes(from, to, {
    averageSpeedKph: speed ?? null,
    bufferMinutes: buffer,
    negligibleKm: 0.5,
  });
}

function policy(averageSpeedKph, bufferMinutes = 0) {
  return { averageSpeedKph, bufferMinutes, negligibleKm: 0.5 };
}

test("travel policy default enforces nothing", () => {
  assert.equal(DEFAULT_TRAVEL_POLICY.averageSpeedKph, null);
  assert.equal(DEFAULT_TRAVEL_POLICY.bufferMinutes, 0);
});

// ─── 6. travel feasibility ───────────────────────────────────────────────────
test("6. travel minutes shrink as the average speed rises", () => {
  const slow = minutes(INDIANAPORE, FAR_AWAY, { speed: 10 });
  const fast = minutes(INDIANAPORE, FAR_AWAY, { speed: 40 });
  assert.ok(slow > fast, "a slower average speed must need more time");
  assert.ok(slow > 50 && slow < 80, `~11km at 10kph should be roughly an hour, got ${slow}`);
});

test("6b. a trip inside the negligible radius needs no time", () => {
  assert.equal(minutes(INDIANAPORE, { lat: 12.912, lng: 77.6474 }, { speed: 5 }), 0);
});

test("6c. a sub-kilometre trip still costs the configured buffer", () => {
  // Just outside the 0.5 km "negligible" radius: driving time rounds to ~2 min.
  const near = { lat: INDIANAPORE.lat + 0.006, lng: INDIANAPORE.lng };
  const plain = minutes(INDIANAPORE, near, { speed: 30, buffer: 0 });
  const buffered = minutes(INDIANAPORE, near, { speed: 30, buffer: 10 });
  assert.ok(plain > 0, "outside the negligible radius the trip has a cost");
  assert.equal(buffered - plain, 10, "the buffer is added on top");
});

test("6d. no configured speed means no travel opinion (null)", () => {
  assert.equal(minutes(INDIANAPORE, FAR_AWAY, { speed: null }), null);
});

test("6e. a null or non-positive speed disables the gate rather than dividing by zero", () => {
  assert.equal(minutes(INDIANAPORE, FAR_AWAY, { speed: 0 }), null);
  assert.equal(minutes(INDIANAPORE, FAR_AWAY, { speed: -5 }), null);
});

test("6f. a negligible trip costs nothing even with a buffer", () => {
  // Inside the negligible radius the two points are treated as the same place.
  assert.equal(minutes(INDIANAPORE, { lat: 12.912, lng: 77.6474 }, { speed: 5, buffer: 10 }), 0);
});

// ─── 7. safety buffer ────────────────────────────────────────────────────────
test("7. the buffer is added on top of the driving time", () => {
  const plain = minutes(INDIANAPORE, FAR_AWAY, { speed: 30, buffer: 0 });
  const buffered = minutes(INDIANAPORE, FAR_AWAY, { speed: 30, buffer: 15 });
  assert.equal(buffered - plain, 15);
});

test("7b. slack is the gap minus the required travel, and can go negative", () => {
  // 60 minutes available, ~66 required at 10 kph.
  const slack = travelSlackMinutes(0, 60, INDIANAPORE, FAR_AWAY, policy(10, 0), new TravelCache());
  assert.ok(slack < 0, `expected a negative slack, got ${slack}`);
});

test("7c. slack is positive when there is comfortably enough time", () => {
  const slack = travelSlackMinutes(0, 240, INDIANAPORE, FAR_AWAY, policy(30, 5), new TravelCache());
  assert.ok(slack > 100, `expected comfortable slack, got ${slack}`);
});

test("7d. a bigger buffer makes the slack smaller, never larger", () => {
  const cache = new TravelCache();
  const small = travelSlackMinutes(0, 60, INDIANAPORE, FAR_AWAY, policy(20, 0), cache);
  const large = travelSlackMinutes(0, 60, INDIANAPORE, FAR_AWAY, policy(20, 30), cache);
  assert.ok(large < small, "a wider safety buffer must be stricter");
});

test("7e. without a speed the gate cannot reject", () => {
  assert.equal(
    travelSlackMinutes(0, 1, INDIANAPORE, FAR_AWAY, policy(null), new TravelCache()),
    null,
  );
});

test("7f. an unknown location yields null (no travel opinion), never a false pass/fail", () => {
  const cache = new TravelCache();
  assert.equal(travelSlackMinutes(0, 60, null, FAR_AWAY, policy(20), cache), null);
  assert.equal(travelSlackMinutes(0, 60, INDIANAPORE, null, policy(20), cache), null);
});

// ─── caching ────────────────────────────────────────────────────────────────
test("cache: a repeated pair returns the identical value", () => {
  const cache = new TravelCache();
  const first = minutes(INDIANAPORE, FAR_AWAY, { speed: 30, cache });
  const second = minutes(INDIANAPORE, FAR_AWAY, { speed: 30, cache });
  assert.equal(first, second);
  assert.ok(cache.size >= 1, "the pair should have been cached");
  assert.ok(cache.hits >= 1, "the second lookup should have been a hit");
});

test("cache: the cache is symmetric", () => {
  const cache = new TravelCache();
  assert.equal(
    minutes(INDIANAPORE, FAR_AWAY, { speed: 25, cache }),
    minutes(FAR_AWAY, INDIANAPORE, { speed: 25, cache }),
  );
});

test("cache: different policies get different entries", () => {
  const cache = new TravelCache();
  const a = minutes(INDIANAPORE, FAR_AWAY, { speed: 30, buffer: 0, cache });
  const b = minutes(INDIANAPORE, FAR_AWAY, { speed: 30, buffer: 25, cache });
  assert.notEqual(a, b, "a different buffer must not reuse the wrong cached value");
});

test("cache: clear() empties it", () => {
  const cache = new TravelCache();
  minutes(INDIANAPORE, FAR_AWAY, { speed: 30, cache });
  assert.ok(cache.size > 0);
  cache.clear();
  assert.equal(cache.size, 0);
});

// ─── scoring helpers ────────────────────────────────────────────────────────
test("geographic cost accumulates km and counts location transitions", () => {
  const cache = new TravelCache();
  const p = policy(30, 0);

  // Same place twice: no distance, no transitions.
  const same = geographicCost([INDIANAPORE, INDIANAPORE, INDIANAPORE], cache, p);
  assert.equal(same.totalKm, 0);
  assert.equal(same.transitions, 0);

  // Out and back: two hops, two cluster changes.
  const round = geographicCost([INDIANAPORE, FAR_AWAY, INDIANAPORE], cache, p);
  assert.ok(round.totalKm > 10, `expected a real distance, got ${round.totalKm}`);
  assert.equal(round.transitions, 2);

  // Clustering is by rounded coordinates, so a tiny wobble is not a transition.
  const wobble = geographicCost(
    [INDIANAPORE, { lat: INDIANAPORE.lat + 0.00001, lng: INDIANAPORE.lng }, INDIANAPORE],
    cache,
    p,
  );
  assert.equal(wobble.transitions, 0);
});

test("unknown points are skipped without breaking the chain", () => {
  const cost = geographicCost([INDIANAPORE, null, FAR_AWAY], new TravelCache(), policy(30, 0));
  assert.ok(cost.totalKm > 10, "the two known points are still linked");
});

test("travel efficiency score is higher for a compact plan", () => {
  const worst = { totalKm: 60, transitions: 4 };
  const compact = travelEfficiencyScore({ totalKm: 5, transitions: 1 }, worst.totalKm, worst.transitions);
  const sprawling = travelEfficiencyScore({ totalKm: 55, transitions: 4 }, worst.totalKm, worst.transitions);
  assert.ok(sprawling < compact, "more kilometres and transitions is worse");
  assert.ok(compact >= 0 && compact <= 1);
  assert.ok(sprawling >= 0 && sprawling <= 1);
});

test("the reference plan itself scores zero", () => {
  const worst = { totalKm: 60, transitions: 4 };
  assert.equal(travelEfficiencyScore(worst, worst.totalKm, worst.transitions), 0);
});

test("travel efficiency handles a zero-trip plan without dividing by zero", () => {
  assert.equal(travelEfficiencyScore({ totalKm: 0, transitions: 0 }, 0, 0), 1);
});

// ─── coordinate coercion ────────────────────────────────────────────────────
test("toLatLng accepts every DB spelling of the coordinates", () => {
  assert.deepEqual(toLatLng({ lat: 12.9, lng: 77.6 }), { lat: 12.9, lng: 77.6 });
  assert.deepEqual(toLatLng({ latitude: 12.9, longitude: 77.6 }), { lat: 12.9, lng: 77.6 });
  assert.deepEqual(toLatLng({ address_lat: 12.9, address_lng: 77.6 }), { lat: 12.9, lng: 77.6 });
  assert.deepEqual(toLatLng({ lat: "12.9", lng: "77.6" }), { lat: 12.9, lng: 77.6 });
});

test("toLatLng rejects nonsense instead of inventing a location", () => {
  assert.equal(toLatLng({ lat: 999, lng: 0 }), null, "out of range is rejected, not clamped");
  assert.equal(toLatLng({ lat: 12.9 }), null, "one-sided coordinates are rejected");
  assert.equal(toLatLng({ latitude: 12.9 }), null);
  assert.equal(toLatLng(null), null);
  assert.equal(toLatLng(undefined), null);
  assert.equal(toLatLng("nope"), null);
  assert.equal(toLatLng(42), null);
  assert.equal(toLatLng({ lat: NaN, lng: 77.6 }), null);
  assert.equal(toLatLng({ lat: "", lng: "77.6" }), null);
});