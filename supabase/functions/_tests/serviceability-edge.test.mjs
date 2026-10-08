// Serviceability edge cases - precision, polygons, holes, radius, coordinate edge cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pointInRing,
  pointInPolygon,
  normalizeZoneRings,
  resolveServiceability,
} from "../_shared/serviceability.ts";

function ins(id, overrides = {}) {
  return {
    id,
    areas: ["Test Area"],
    radiusKm: null,
    lat: null,
    lng: null,
    gender: null,
    status: "active",
    enabled: true,
    ...overrides,
  };
}

const ACTIVE_AREA = { id: "area-1", name: "Test Area" };
const SQUARE = () => ([
  [77.57, 12.96],
  [77.59, 12.96],
  [77.59, 12.98],
  [77.57, 12.98],
  [77.57, 12.96],
]);

function resolve({ lat, lng, instructors, zones, areas }) {
  return resolveServiceability({ lat, lng, zones, instructors, areas });
}

test("pointInRing: points exactly on vertex", () => {
  assert.equal(pointInRing(12.96, 77.57, SQUARE()), true);
  assert.equal(pointInRing(12.96, 77.59, SQUARE()), true);
  assert.equal(pointInRing(12.98, 77.59, SQUARE()), true);
  assert.equal(pointInRing(12.98, 77.57, SQUARE()), true);
});

test("pointInRing: points exactly on edges", () => {
  assert.equal(pointInRing(12.97, 77.57, SQUARE()), true); // left
  assert.equal(pointInRing(12.97, 77.59, SQUARE()), true); // right
  assert.equal(pointInRing(12.96, 77.58, SQUARE()), true); // bottom
  assert.equal(pointInRing(12.98, 77.58, SQUARE()), true); // top
});

test("pointInRing: interior points", () => {
  assert.equal(pointInRing(12.97, 77.58, SQUARE()), true);
  assert.equal(pointInRing(12.965, 77.575, SQUARE()), true);
  assert.equal(pointInRing(12.975, 77.585, SQUARE()), true);
});

test("pointInRing: exterior points", () => {
  assert.equal(pointInRing(12.95, 77.58, SQUARE()), false);
  assert.equal(pointInRing(12.99, 77.58, SQUARE()), false);
  assert.equal(pointInRing(12.97, 77.56, SQUARE()), false);
  assert.equal(pointInRing(12.97, 77.60, SQUARE()), false);
});

test("pointInRing: coordinate precision - very close to boundary", () => {
  // 12.9600000001 is within 1e-9 of edge (12.96) -> onSegment returns true (on edge counts as inside)
  assert.equal(pointInRing(12.9600000001, 77.58, SQUARE()), true);
  // 12.9599999999 is within 1e-9 of edge -> onSegment returns true (on edge counts as inside)
  assert.equal(pointInRing(12.9599999999, 77.58, SQUARE()), true);
  // Further outside
  assert.equal(pointInRing(12.959, 77.58, SQUARE()), false);
});

test("pointInPolygon: hole inside polygon excludes points", () => {
  const outer = SQUARE();
  const hole = [
    [77.575, 12.965],
    [77.585, 12.965],
    [77.585, 12.975],
    [77.575, 12.975],
    [77.575, 12.965],
  ];
  const rings = [outer, hole];
  assert.equal(pointInPolygon(12.97, 77.58, rings), false); // in hole
  assert.equal(pointInPolygon(12.963, 77.58, rings), true); // below hole
  assert.equal(pointInPolygon(12.977, 77.58, rings), true); // above hole
  assert.equal(pointInPolygon(12.97, 77.572, rings), true); // left of hole
  assert.equal(pointInPolygon(12.97, 77.588, rings), true); // right of hole
});

test("pointInPolygon: multiple holes", () => {
  const outer = SQUARE();
  const hole1 = [[77.572, 12.962], [77.578, 12.962], [77.578, 12.968], [77.572, 12.968], [77.572, 12.962]];
  const hole2 = [[77.582, 12.972], [77.588, 12.972], [77.588, 12.978], [77.582, 12.978], [77.582, 12.972]];
  const rings = [outer, hole1, hole2];
  assert.equal(pointInPolygon(12.965, 77.575, rings), false); // in hole1
  assert.equal(pointInPolygon(12.975, 77.585, rings), false); // in hole2
  assert.equal(pointInPolygon(12.97, 77.58, rings), true); // between holes
});

test("normalizeZoneRings: skips non-array rings", () => {
  const raw = [SQUARE(), "not-a-ring", null, 42];
  const rings = normalizeZoneRings(raw);
  assert.equal(rings.length, 1);
});

test("normalizeZoneRings: skips rings with < 3 points", () => {
  const raw = [SQUARE(), [[77.57, 12.96]], [[77.57, 12.96], [77.59, 12.96]]];
  const rings = normalizeZoneRings(raw);
  assert.equal(rings.length, 1);
});

test("normalizeZoneRings: skips rings with non-numeric coordinates", () => {
  const raw = [SQUARE(), [[77.57, "12.96"], [77.59, 12.96], [77.59, 12.98], [77.57, 12.98], [77.57, 12.96]]];
  const rings = normalizeZoneRings(raw);
  assert.equal(rings.length, 1);
});

test("normalizeZoneRings: handles open ring (no duplicate closing point)", () => {
  const open = SQUARE().slice(0, 4);
  const rings = normalizeZoneRings([open]);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 4);
});

test("normalizeZoneRings: empty/null input returns empty", () => {
  assert.equal(normalizeZoneRings(null).length, 0);
  assert.equal(normalizeZoneRings(undefined).length, 0);
  assert.equal(normalizeZoneRings([]).length, 0);
  assert.equal(normalizeZoneRings("string").length, 0);
});

test("resolveServiceability: instructor in zone + area match = eligible", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.areaId, "area-1");
  assert.equal(result.eligibleInstructorCount, 1);
  assert.deepEqual(result.zoneInstructorIds, ["i1"]);
});

test("resolveServiceability: instructor in radius (no zone) + area match = NOT eligible", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 1 })],
    zones: [],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
  assert.deepEqual(result.zoneInstructorIds, []);
  assert.equal(result.eligibleInstructorCount, 0);
});

test("resolveServiceability: instructor in zone with NO area match is STILL eligible (areas are label-only)", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { areas: ["Nowhere"] })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.eligibleInstructorCount, 1);
  assert.equal(result.areaId, null);
  assert.equal(result.areaName, null);
  assert.equal(result.areaLabel, "12.97000, 77.58000"); // coordinate fallback
});

test("resolveServiceability: instructor in zone AND radius = counted once (zone only)", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 1 })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.deepEqual(result.zoneInstructorIds, ["i1"]);
  assert.equal(result.eligibleInstructorCount, 1);
});

test("resolveServiceability: point on zone boundary = serviceable", () => {
  const result = resolve({
    lat: 12.96, lng: 77.57, // bottom-left corner
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
});

test("resolveServiceability: point in hole is NOT serviceable even if radius covers it", () => {
  const hole = [[77.575, 12.965], [77.585, 12.965], [77.585, 12.975], [77.575, 12.975], [77.575, 12.965]];
  const result = resolve({
    lat: 12.97, lng: 77.58, // center of hole
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 1 })],
    zones: [{ instructorId: "i1", rings: [SQUARE(), hole] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
  assert.deepEqual(result.zoneInstructorIds, []);
});

test("resolveServiceability: multi-polygon instructor (two separate zones)", () => {
  const far = [[77.6, 12.99], [77.62, 12.99], [77.62, 13.01], [77.6, 13.01], [77.6, 12.99]];
  const result = resolve({
    lat: 13.0, lng: 77.61, // in far zone
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

test("resolveServiceability: ghost zone (no DB instructor) = not serviceable", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("real-instructor")],
    zones: [{ instructorId: "ghost-zone", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
  assert.equal(result.eligibleInstructorCount, 0);
});

test("resolveServiceability: on_break instructor excluded even if zone covers", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { status: "on_break" })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("resolveServiceability: disabled instructor excluded even if zone covers", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { enabled: false })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("resolveServiceability: inactive instructor excluded", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { status: "inactive" })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("resolveServiceability: area tie-break - most instructors wins", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [
      ins("i1", { areas: ["Alpha", "Beta"] }),
      ins("i2", { areas: ["Alpha"] }),
    ],
    zones: [
      { instructorId: "i1", rings: [SQUARE()] },
      { instructorId: "i2", rings: [SQUARE()] },
    ],
    areas: [{ id: "a-alpha", name: "Alpha" }, { id: "b-beta", name: "Beta" }],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.areaId, "a-alpha");
  assert.equal(result.areaName, "Alpha");
  assert.equal(result.eligibleInstructorCount, 2);
});

test("resolveServiceability: area tie-break - lexicographically smallest name", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { areas: ["Zebra", "Alpha"] })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [{ id: "z", name: "Zebra" }, { id: "a", name: "Alpha" }],
  });
  assert.equal(result.areaName, "Alpha");
  assert.equal(result.areaId, "a");
});

test("resolveServiceability: case/whitespace normalization in area matching", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { areas: ["  TEST   AREA  "] })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.areaName, "Test Area");
});

test("resolveServiceability: eligibleInstructors patched with resolved area name", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { areas: ["Test Area"] })],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.eligibleInstructors.length, 1);
  assert.ok(result.eligibleInstructors[0].areas.includes("Test Area"));
});

test("resolveServiceability: non-eligible instructors NOT in eligibleInstructors", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [
      ins("i1"),
      ins("i2", { areas: ["Elsewhere"] }),
    ],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.eligibleInstructorCount, 1);
  assert.equal(result.eligibleInstructors.length, 1);
  assert.equal(result.eligibleInstructors[0].id, "i1");
});

test("resolveServiceability: empty zones array = no zone matches", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1")],
    zones: [],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
  assert.equal(result.eligibleInstructorCount, 0);
});

test("resolveServiceability: empty areas array = still serviceable, no area label", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [SQUARE()] }],
    areas: [],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.eligibleInstructorCount, 1);
  assert.equal(result.areaId, null);
});

test("resolveServiceability: point far from all zones and outside all radii = not serviceable", () => {
  const result = resolve({
    lat: 10.0, lng: 70.0, // far away
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 10 })],
    zones: [],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("resolveServiceability: instructor with zero radius = no radius match", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: 0 })],
    zones: [],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("resolveServiceability: instructor with null radius = no radius match", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { lat: 12.97, lng: 77.58, radiusKm: null })],
    zones: [],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("resolveServiceability: instructor missing lat/lng = no radius match", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1", { lat: null, lng: null, radiusKm: 10 })],
    zones: [],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("resolveServiceability: zone with empty rings array = ignored", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("resolveServiceability: zone with invalid rings (non-numeric) = ignored", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [[[77.57, "12.96"], [77.59, 12.96], [77.59, 12.98], [77.57, 12.98], [77.57, 12.96]]] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, false);
});

test("resolveServiceability: multiple instructors, only the polygon one is eligible", () => {
  const result = resolve({
    lat: 12.97, lng: 77.58,
    instructors: [
      ins("zone-instr"),
      ins("radius-instr", { lat: 12.97, lng: 77.58, radiusKm: 1 }),
    ],
    zones: [{ instructorId: "zone-instr", rings: [SQUARE()] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
  assert.equal(result.eligibleInstructorCount, 1);
  assert.deepEqual(result.zoneInstructorIds, ["zone-instr"]);
  assert.deepEqual(result.eligibleInstructors.map((i) => i.id), ["zone-instr"]);
});

test("resolveServiceability: coordinates at exact antimeridian/pole edge cases", () => {
  // Test boundary conditions
  const result = resolve({
    lat: 90, lng: 0, // North pole (on the polygon top edge)
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [[[-1, 89], [1, 89], [1, 90], [-1, 90], [-1, 89]]] }],
    areas: [ACTIVE_AREA],
  });
  assert.equal(result.serviceable, true);
});

test("resolveServiceability: negative coordinates (southern/western hemisphere)", () => {
  const result = resolve({
    lat: -12.97, lng: -77.58,
    instructors: [ins("i1")],
    zones: [{ instructorId: "i1", rings: [[[-77.6, -13.0], [-77.56, -13.0], [-77.56, -12.94], [-77.6, -12.94], [-77.6, -13.0]]] }],
    areas: [{ id: "area-1", name: "Test Area" }],
  });
  assert.equal(result.serviceable, true);
});