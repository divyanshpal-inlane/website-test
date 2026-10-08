// Location-serviceability engine tests: polygon (KML zone) + base-radius
// coverage, area resolution and the "restricted instructor set" the untouched
// availability engine consumes when a learner sends lat/lng.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pointInRing,
  pointInPolygon,
  normalizeZoneRings,
  sanitizeRings,
  resolveServiceability,
} from "../_shared/serviceability.ts";
import {
  computeCoursePlan,
} from "../_shared/availability.ts";

const SLOT_CONFIG = {
  slotStart: "06:00",
  slotEnd: "20:00",
  gridMinutes: 30,
  slotDurationMinutes: 60,
};

// A 2-decimal-degree square polygon: lng 77.57..77.59, lat 12.96..12.98,
// with the ring closed (KML export style: last == first).
const SQUARE = () => ([
  [77.57, 12.96],
  [77.59, 12.96],
  [77.59, 12.98],
  [77.57, 12.98],
  [77.57, 12.96],
]);
const HOLE = () => ([
  [77.575, 12.965],
  [77.585, 12.965],
  [77.585, 12.975],
  [77.575, 12.975],
  [77.575, 12.965],
]);

function ins(id, overrides = {}) {
  const base = {
    id,
    areas: ["Test Area"],
    radiusKm: null,
    lat: null,
    lng: null,
    gender: null,
    status: "active",
    enabled: true,
  };
  return { ...base, ...overrides };
}

const ACTIVE_AREA = { id: "area-1", name: "Test Area" };

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

test("pointInRing: inside / outside / on-edge / on-vertex of a closed ring", () => {
  assert.equal(pointInRing(12.97, 77.58, SQUARE()), true); // inside
  assert.equal(pointInRing(12.99, 77.6, SQUARE()), false); // outside
  assert.equal(pointInRing(12.97, 77.57, SQUARE()), true); // on left edge
  assert.equal(pointInRing(12.96, 77.58, SQUARE()), true); // on bottom edge
  assert.equal(pointInRing(12.96, 77.57, SQUARE()), true); // on a vertex
});

test("pointInRing: open ring (no duplicate closing point) still ray-casts", () => {
  const open = SQUARE().slice(0, 4);
  assert.equal(pointInRing(12.97, 77.58, open), true);
  assert.equal(pointInRing(12.985, 77.595, open), false);
});

test("pointInRing: degenerate rings are not serviceable", () => {
  assert.equal(pointInRing(12.97, 77.58, []), false);
  assert.equal(pointInRing(12.97, 77.58, [[77.57, 12.96]]), false);
  assert.equal(pointInRing(12.97, 77.58, [[77.57, 12.96], [77.59, 12.96]]), false);
});

test("pointInPolygon: interior vs hole (outer ring + hole geometry)", () => {
  const rings = [SQUARE(), HOLE()];
  assert.equal(pointInPolygon(12.97, 77.58, rings), false); // in the hole
  assert.equal(pointInPolygon(12.963, 77.58, rings), true); // in outer, below hole
  assert.equal(pointInPolygon(12.976, 77.586, rings), true); // in outer, right of hole
  assert.equal(pointInPolygon(12.965, 77.57, rings), true); // near outer edge, still in
});

test("pointInPolygon: missing/empty geometry is not serviceable", () => {
  assert.equal(pointInPolygon(12.97, 77.58, []), false);
  assert.equal(pointInPolygon(12.97, 77.58, undefined), false);
});

test("normalizeZoneRings: parses our JSONB ring storage and skips junk", () => {
  const rings = normalizeZoneRings([SQUARE(), HOLE()]);
  assert.equal(rings.length, 2);
  assert.deepEqual(rings[0][0], [77.57, 12.96]);

  assert.equal(normalizeZoneRings(null).length, 0);
  assert.equal(normalizeZoneRings("nope").length, 0);
  assert.equal(normalizeZoneRings([42]).length, 0);
  assert.equal(normalizeZoneRings([[0, 1]]).length, 0); // ring with <3 pts
  // ring with a non-numeric point is dropped entirely
  assert.equal(normalizeZoneRings([[SQUARE()[0], ["a", "b"]]]).length, 0);
});

// --- live `coordinates` format -------------------------------------------
// instructor_service_zones.coordinates stores a flat ring of {lat,lng}
// objects, which is what the admin Instructor Polygon Map writes. It is NOT
// the [[lng,lat],...] ring-of-rings the parser originally assumed, so before
// this was accepted every real polygon parsed to zero rings and every learner
// location resolved as unserviceable.

const asGeoObjects = (ring) =>
  ring.map(([lng, lat]) => ({ lat, lng }));

test("normalizeZoneRings: parses the live flat [{lat,lng}] format", () => {
  const rings = normalizeZoneRings(asGeoObjects(SQUARE()));
  assert.equal(rings.length, 1);
  // Stored [lng, lat] regardless of how the input ordered the fields.
  assert.deepEqual(rings[0][0], [77.57, 12.96]);
  assert.equal(rings[0].length, 5);
});

test("normalizeZoneRings: flat object ring is geometrically identical to tuple ring", () => {
  const fromObjects = normalizeZoneRings(asGeoObjects(SQUARE()));
  const fromTuples = normalizeZoneRings([SQUARE()]);
  assert.deepEqual(fromObjects, fromTuples);
  assert.equal(pointInPolygon(12.97, 77.58, fromObjects), true);
  assert.equal(pointInPolygon(12.99, 77.6, fromObjects), false);
});

test("normalizeZoneRings: outer ring + hole as objects keeps BOTH rings", () => {
  // The nesting sniff must read [{lat,lng},...] as one ring, not as a list of
  // rings. If it guessed "list of rings", each object would fail toZoneRing and
  // the zone would silently vanish.
  const rings = normalizeZoneRings([asGeoObjects(SQUARE()), asGeoObjects(HOLE())]);
  assert.equal(rings.length, 2);
  // And the hole must actually punch through.
  assert.equal(pointInPolygon(12.97, 77.58, rings), false); // in the hole
  assert.equal(pointInPolygon(12.963, 77.58, rings), true); // outer, below hole
});

test("normalizeZoneRings: rejects out-of-range lat/lng rather than clamping", () => {
  assert.equal(normalizeZoneRings([{ lat: 200, lng: 77.58 }, ...asGeoObjects(SQUARE()).slice(1)]).length, 0);
  assert.equal(normalizeZoneRings([{ lat: 12.97, lng: 999 }, ...asGeoObjects(SQUARE()).slice(1)]).length, 0);
  assert.equal(normalizeZoneRings([{ lat: NaN, lng: 77.58 }, { lat: 12.97, lng: 77.58 }, { lat: 12.98, lng: 77.58 }]).length, 0);
});

test("normalizeZoneRings: flat ring with fewer than 3 points is dropped", () => {
  assert.equal(normalizeZoneRings(asGeoObjects(SQUARE().slice(0, 2))).length, 0);
});

test("sanitizeRings: re-validating an existing ring list preserves holes", () => {
  // Regression guard. resolveServiceability() re-validates already-normalized
  // ZoneRings. Feeding those back through normalizeZoneRings() instead would
  // see a [lng,lat] tuple at position 0, conclude the whole array was a single
  // ring, and collapse every hole into garbage — silently turning an
  // excluded hole into serviceable area.
  const rings = [SQUARE(), HOLE()];
  assert.deepEqual(sanitizeRings(rings), rings);
  assert.equal(pointInPolygon(12.97, 77.58, sanitizeRings(rings)), false);
  // Junk rings are still dropped.
  assert.equal(sanitizeRings([[0, 1]]).length, 0);
  assert.equal(sanitizeRings(null).length, 0);
  assert.equal(sanitizeRings("nope").length, 0);
});

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------

function resolve({ lat, lng, instructors, zones, areas, fallbackLabel }) {
  return resolveServiceability({ lat, lng, zones, instructors, areas, fallbackLabel });
}

test("zone cover resolves serviceable with the right area + instructor IDs", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.areaId, "area-1");
  assert.equal(result.areaName, "Test Area");
  assert.equal(result.eligibleInstructorCount, 1);
  assert.deepEqual(result.zoneInstructorIds, ["i1"]);
  assert.equal(result.eligibleInstructors.length, 1);
});

test("point outside every zone but within base radius is NOT serviceable (polygon only)", () => {
  const result = resolve({
    lat: 12.973,
    lng: 77.585,
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 1 })],
    zones: [], // no polygon at all
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
  assert.deepEqual(result.zoneInstructorIds, []);
  assert.equal(result.eligibleInstructorCount, 0);
});

test("a polygon-less instructor with a big radius never joins a pool served by a polygon instructor", () => {
  // Mirrors prod: a test instructor with a 10 km radius and NO polygon must not
  // be assignable at a location that a real instructor polygon covers.
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [
      ins("real"),
      ins("no-polygon", { lat: 12.97, lng: 77.58, radiusKm: 10 }),
    ],
    zones: [{ instructorId: "real", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.eligibleInstructorCount, 1);
  assert.deepEqual(result.eligibleInstructors.map((i) => i.id), ["real"]);
});

test("polygon-less instructor WITHOUT radius does not serve (zone OR radius rule)", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1")],
    zones: [],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
  assert.equal(result.eligibleInstructorCount, 0);
});

test("point outside zone AND outside radius is not serviceable", () => {
  const result = resolve({
    lat: 12.999,
    lng: 77.599,
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 1 })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("point exactly on the zone boundary is serviceable", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.57,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.deepEqual(result.zoneInstructorIds, ["i1"]);
});

test("multi-polygon instructor: covered by EITHER zone (separate zone rows)", () => {
  const far = [
    [77.6, 12.99],
    [77.62, 12.99],
    [77.62, 13.01],
    [77.6, 13.01],
    [77.6, 12.99],
  ];
  const result = resolve({
    lat: 13.0,
    lng: 77.61,
    instructors: [ins("i1")],
    zones: [
      { instructorId: "i1", rings: [SQUARE()] },
      { instructorId: "i1", rings: [far] },
    ],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.deepEqual(result.zoneInstructorIds, ["i1"]);
});

test("point in a zone hole is NOT covered by that zone (radius does not rescue it)", () => {
  const holes = [
    { instructorId: "i1", rings: [SQUARE(), HOLE()] },
    { instructorId: "i2", rings: [] }, // ignored (no rings)
  ];
  const holesOnly = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1")],
    zones: holes.slice(0, 1),
    areas: [ACTIVE_AREA],
  });
  assert.equal(holesOnly.serviceable, false);

  // Same point, i1 also has a base radius that covers it -> STILL not serviceable.
  const withRadius = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 2 })],
    zones: holes.slice(0, 1),
    areas: [ACTIVE_AREA],
  });
  assert.equal(withRadius.serviceable, false);
});

test("zone without a DB instructor row (no-name KML leftovers) can't make a point serviceable", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("real-instructor")], // different instructor, not covering here
    zones: [{ instructorId: "ghost-zone-no-db-match", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
  assert.equal(result.eligibleInstructorCount, 0);
});

test("on_break / disabled instructors are excluded even when the zone covers", () => {
  const base = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1", { status: "on_break" })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(base.serviceable, false);

  const disabled = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1", { enabled: false })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(disabled.serviceable, false);
});

test("instructor whose areas don't resolve to a Serviceable_Areas row is STILL served (polygon is the only source)", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1", { areas: ["Nowhere Road"] })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
    fallbackLabel: "194 Akruthi Chambers",
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.eligibleInstructorCount, 1);
  assert.equal(result.areaId, null);
  assert.equal(result.areaName, null);
  assert.equal(result.areaLabel, "194 Akruthi Chambers");
  // engine handoff carries the label so the untouched availability engine keeps it
  assert.ok(result.eligibleInstructors[0].areas.includes("194 Akruthi Chambers"));
});

test("an instructor with an EMPTY areas array is served when inside a polygon", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1", { areas: [] })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.eligibleInstructorCount, 1);
});

test("area resolution prefers the area serving the most instructors", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [
      ins("i1", { areas: ["Alpha Area", "Beta Area"] }),
      ins("i2", { areas: ["Alpha Area"] }),
    ],
    zones: [
      { instructorId: "i1", rings: [SQUARE()] },
      { instructorId: "i2", rings: [SQUARE()] },
    ],
    areas: [
      { id: "a-alpha", name: "Alpha Area" },
      { id: "b-beta", name: "Beta Area" },
    ],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.areaId, "a-alpha");
  assert.equal(result.areaName, "Alpha Area");
  assert.equal(result.eligibleInstructorCount, 2);
  assert.deepEqual(result.zoneInstructorIds.sort(), ["i1", "i2"]);
});

test("area resolution tie-breaks deterministically to the lexicographically smallest name", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1", { areas: ["Zebra", "Alpha"] })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [
      { id: "z", name: "Zebra" },
      { id: "a", name: "Alpha" },
    ],
  });
  assert.equal(result.areaName, "Alpha");
  assert.equal(result.areaId, "a");
});

test("case/whitespace differences between instructor areas and Serviceable_Areas still resolve", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1", { areas: ["  test   AREA "] })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.areaName, "Test Area");
});

// ---------------------------------------------------------------------------
// Engine handoff
// ---------------------------------------------------------------------------

test("eligibleInstructors are patched with the resolved area name", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1", { areas: ["Test Area"] })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  const one = result.eligibleInstructors[0];
  assert.ok(one.areas.includes("Test Area"));
  assert.equal(one.id, "i1");
  assert.equal(result.eligibleInstructors.length, result.eligibleInstructorCount);
});

test("the restricted eligible set drives the course-plan engine (same-instructor course)", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  const dates = ["2026-09-10", "2026-09-11"];
  const plan = computeCoursePlan(
    {
      instructors: result.eligibleInstructors,
      learnerArea: result.areaName,
      learner: { lat: 12.97, lng: 77.58 },
      blocks: [],
      dates,
      slotConfig: SLOT_CONFIG,
      holdMinutes: 30,
      gapMinutes: 30,
    },
    { date: dates[0], start: "06:00" },
    2,
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.instructorId, "i1");
  assert.equal(plan.lessons.length, 2);
});

test("non-eligible instructors are NOT handed to the engine (radius co-cover excluded)", () => {
  const result = resolve({
    lat: 12.97,
    lng: 77.58,
    instructors: [
      ins("i1"), // zone-eligible
      ins("i2", { areas: ["Elsewhere"] }), // no active area -> not eligible, must NOT leak
    ],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.eligibleInstructorCount, 1);
  assert.equal(result.eligibleInstructors.length, 1);
  assert.equal(result.eligibleInstructors[0].id, "i1");
});