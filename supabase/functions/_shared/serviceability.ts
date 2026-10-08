// Pure location-serviceability engine for the direct booking flow. No Deno
// imports — usable from the Node test harness.
//
// Rule (backend-authoritative, POLYGON ONLY): a learner's (lat, lng) is serviced
// only when it falls inside an instructor's driving-zone polygon from
// `instructor_service_zones` (one polygon per instructor; rough polygons are
// filtered out by fetchServiceZones). An instructor with no polygon can never
// be assigned. There is NO base-radius fallback: radius matching let
// polygon-less instructors (e.g. test accounts) into the pool. Only active
// instructors count. Instructor.areas[] and Serviceable_Areas play NO part in
// eligibility; the area name is only a best-effort display label (see
// ServiceabilityResult.areaLabel).
//
// Zone geometry is read from `instructor_service_zones.coordinates`, which is
// the single source of truth shared with the admin Instructor Polygon Map.
// There is no separate geometry file, alias table or hardcoded polygon list.
//
// The label area (when any eligible instructor's areas[] maps to an active
// Serviceable_Areas row) is the one serving the most eligible instructors (tie →
// lexicographically smallest name, for determinism). When none maps, areaId and
// areaName are null and areaLabel falls back to the caller-supplied label.

import { isInstructorActive, type InstructorLike } from "./availability.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ZonePoint = [number, number]; // [lng, lat]
export type ZoneRing = ZonePoint[];
/** Ring 0 is the outer boundary; any further rings are holes. */
export type ZoneRings = ZoneRing[];

export interface ServiceZone {
  instructorId: string;
  rings: ZoneRings;
  sourceName?: string;
}

export interface ServiceableAreaLike {
  id: string;
  name: string;
}

export interface ServiceabilityInput {
  lat: number;
  lng: number;
  /** Active polygons from instructor_service_zones. */
  zones?: ServiceZone[] | null;
  /** Full instructor roster (active/status filters applied inside this module). */
  instructors?: InstructorLike[] | null;
  /** Active Serviceable_Areas rows (id, name). Label lookup only. */
  areas?: ServiceableAreaLike[] | null;
  /** Label used when no eligible instructor maps to a Serviceable_Areas row
   *  (e.g. the learner's typed location). Defaults to "lat, lng". */
  fallbackLabel?: string | null;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  areaId: string | null;
  areaName: string | null;
  eligibleInstructorCount: number;
  /** Always set when serviceable: the Serviceable_Areas name if one maps, else
   *  the fallback label. Used for booking.area_name and engine handoff. */
  areaLabel: string | null;
  /** Instructors whose POLYGON covers the point (active + area-resolved). */
  zoneInstructorIds: string[];
  /** Engine-ready instructor clones: scope restricted to the eligible set and
   *  `areas` patched with the resolved area name so the untouched availability
   *  engine keeps accepting them via its area matching. */
  eligibleInstructors: InstructorLike[];
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function onSegment(x1: number, y1: number, x2: number, y2: number, x: number, y: number): boolean {
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-9) return false;
  return (
    x >= Math.min(x1, x2) - 1e-9 && x <= Math.max(x1, x2) + 1e-9 &&
    y >= Math.min(y1, y2) - 1e-9 && y <= Math.max(y1, y2) + 1e-9
  );
}

/**
 * Ray-casting point-in-polygon for a ring of [lng, lat] points. Points exactly
 * on an edge count as INSIDE (a learner standing on the driving-zone boundary
 * is serviceable).
 */
export function pointInRing(lat: number, lng: number, ring: ZoneRing): boolean {
  const n = ring.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (onSegment(xi, yi, xj, yj, lng, lat)) return true;
    const intersects =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Point-in-multi-ring polygon: inside the outer ring (0) and outside every
 * hole (rings 1..n). Ship with any degenerate geometry missing ring 0.
 */
export function pointInPolygon(lat: number, lng: number, rings: ZoneRings): boolean {
  if (!rings || rings.length === 0) return false;
  if (!pointInRing(lat, lng, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lat, lng, rings[h])) return false;
  }
  return true;
}

/**
 * Coerce one stored coordinate into `[lng, lat]`.
 *
 * Accepts both shapes that occur in this table:
 *   - `{ lat, lng }`      — the live `coordinates` format written by the admin map
 *   - `[lng, lat]`        — a positional pair (legacy / imported geometry)
 *
 * Ranges are checked but NOT clamped: a lat of 200 is corrupt data, not a point
 * to be bent into range, and silently clamping would turn a bad row into a
 * plausible-looking one that matches somewhere on earth.
 */
function toZonePoint(v: unknown): ZonePoint | null {
  if (typeof v !== "object" || v === null) return null;

  if (!Array.isArray(v)) {
    const o = v as { lat?: unknown; lng?: unknown };
    if (
      typeof o.lat !== "number" ||
      typeof o.lng !== "number" ||
      !Number.isFinite(o.lat) ||
      !Number.isFinite(o.lng) ||
      Math.abs(o.lat) > 90 ||
      Math.abs(o.lng) > 180
    ) {
      return null;
    }
    return [o.lng, o.lat];
  }

  if (v.length < 2) return null;
  const lng = v[0];
  const lat = v[1];
  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  return [lng, lat];
}

/** Coerce one ring, or return null if any point in it is unusable. */
function toZoneRing(v: unknown): ZoneRing | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const ring: ZoneRing = [];
  for (const p of v) {
    const pt = toZonePoint(p);
    if (!pt) return null;
    ring.push(pt);
  }
  return ring;
}

/**
 * Normalize a raw `coordinates` value from `instructor_service_zones` into
 * ZoneRings, skipping rings that aren't arrays of usable numeric points.
 *
 * Handles both nesting levels found in practice:
 *   - `[{lat,lng}, ...]`                 — flat single ring (the live format)
 *   - `[[{lat,lng}|[lng,lat], ...], ...]` — outer ring plus holes
 *   - `[[[lng,lat], ...], ...]`          — legacy ring-of-rings
 *
 * The two levels are told apart by inspecting the first element: a point
 * (object, or array of numbers) means the whole array is ONE ring, whereas an
 * array of points means it is a LIST of rings.
 */
export function normalizeZoneRings(raw: unknown): ZoneRings {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const isSingleRing = toZonePoint(raw[0]) !== null;
  const candidates: unknown[] = isSingleRing ? [raw] : raw;

  const rings: ZoneRings = [];
  for (const c of candidates) {
    const ring = toZoneRing(c);
    if (ring) rings.push(ring);
  }
  return rings;
}

/**
 * Validate an already-normalized ZoneRings (an array of rings) without
 * re-sniffing the nesting level.
 *
 * `normalizeZoneRings` cannot be reused here: its whole-value shape check sees
 * `[lng, lat]` tuples and would treat an entire list of rings as one very
 * broken ring, collapsing the holes that `pointInPolygon` depends on.
 */
export function sanitizeRings(raw: unknown): ZoneRings {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const rings: ZoneRings = [];
  for (const c of raw) {
    const ring = toZoneRing(c);
    if (ring) rings.push(ring);
  }
  return rings;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Normalized area label: trim, lowercase, collapse internal whitespace. */
function normAreaLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normalized (trim + lowercase) area-name -> Serviceable_Areas row. */
function areaIndex(areas?: ServiceableAreaLike[] | null): Map<string, ServiceableAreaLike> {
  const idx = new Map<string, ServiceableAreaLike>();
  for (const a of areas || []) {
    const key = normAreaLabel(a.name);
    if (key) idx.set(key, a);
  }
  return idx;
}

/**
 * Area names (as stored on the instructor) that resolve to an active
 * Serviceable_Areas row, in original case.
 */
function resolvedAreaNames(instructor: InstructorLike, idx: Map<string, ServiceableAreaLike>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of instructor.areas || []) {
    if (typeof raw !== "string") continue;
    const key = normAreaLabel(raw);
    if (!key || seen.has(key)) continue;
    if (idx.has(key)) {
      seen.add(key);
      out.push(raw);
    }
  }
  return out;
}

export function resolveServiceability(input: ServiceabilityInput): ServiceabilityResult {
  const result: ServiceabilityResult = {
    serviceable: false,
    areaId: null,
    areaName: null,
    eligibleInstructorCount: 0,
    areaLabel: null,
    zoneInstructorIds: [],
    eligibleInstructors: [],
  };

  const zones = input.zones || [];
  const zoneByInstructor = new Map<string, ServiceZone[]>();
  for (const z of zones) {
    if (!z || !z.instructorId || z.rings.length === 0) continue;
    // Re-validate ring-by-ring (see sanitizeRings); a zone whose rings are all
    // unusable must not be able to contribute a match.
    const rings = sanitizeRings(z.rings);
    if (rings.length === 0) continue;
    const list = zoneByInstructor.get(z.instructorId) ?? [];
    list.push({ ...z, rings });
    zoneByInstructor.set(z.instructorId, list);
  }

  const idx = areaIndex(input.areas);

  // Active + point inside the instructor's (non-rough) polygon => eligible.
  // No polygon => never eligible. Areas play no part in eligibility.
  const eligible: InstructorLike[] = [];
  const zoneMatched = new Set<string>();
  for (const instr of input.instructors || []) {
    if (!isInstructorActive(instr)) continue;
    const zonesForInstr = zoneByInstructor.get(instr.id);
    if (!zonesForInstr || zonesForInstr.length === 0) continue;
    const inZone = zonesForInstr.some((z) => pointInPolygon(input.lat, input.lng, z.rings));
    if (!inZone) continue;

    eligible.push(instr);
    zoneMatched.add(instr.id);
  }
  if (eligible.length === 0) return result;

  result.zoneInstructorIds = [...zoneMatched];

  // Best-effort label: the active Serviceable_Areas row that most eligible
  // instructors list; tie -> lexicographically smallest (deterministic).
  const counts = new Map<string, number>();
  for (const instr of eligible) {
    for (const name of resolvedAreaNames(instr, idx)) {
      const key = normAreaLabel(name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let bestKey: string | null = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount || (count === bestCount && (bestKey === null || key < bestKey))) {
      bestKey = key;
      bestCount = count;
    }
  }
  const area = bestKey ? idx.get(bestKey) : null;

  const fallback =
    typeof input.fallbackLabel === "string" && input.fallbackLabel.trim()
      ? input.fallbackLabel.trim()
      : `${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`;
  const label = area ? area.name : fallback;

  result.serviceable = true;
  result.areaId = area ? area.id : null;
  result.areaName = area ? area.name : null;
  result.areaLabel = label;
  result.eligibleInstructorCount = eligible.length;

  // Engine handoff: each eligible instructor carries the label so the
  // (untouched) availability engine's area matching keeps it.
  result.eligibleInstructors = eligible.map((instr) => {
    const areas = new Set((instr.areas || []).map((a) => String(a)));
    areas.add(label);
    return { ...instr, areas: [...areas] };
  });
  return result;
}