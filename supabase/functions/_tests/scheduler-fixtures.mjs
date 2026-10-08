// Shared fixtures for the scheduler test suites (plain JS: .mjs is not
// type-stripped, so this file must contain no TS syntax).
import { SCHEDULER_DISABLED } from "../_shared/schedulerConfig.ts";

export const NOW = new Date("2026-10-01T00:00:00Z");
export const AREA = "HSR Layout";

export const INDIANAPORE = { lat: 12.9116, lng: 77.6474 };
// ~11 km north of Indian[IN]ore.
export const FAR_AWAY = { lat: 13.0085, lng: 77.6830 };

/** N consecutive days starting at `from` (YYYY-MM-DD). */
export function days(n = 10, from = "2026-10-05") {
  const out = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export function instructor(id, over = {}) {
  return {
    id,
    name: `Instructor ${id.slice(0, 4)}`,
    areas: [AREA],
    status: "active",
    gender: "male",
    ...over,
  };
}

export function block(instructorId, date, startMinute, endMinute, over = {}) {
  return {
    instructorId,
    date,
    startMinute,
    endMinute,
    status: "booked",
    ...over,
  };
}

export function makeInput(over = {}) {
  return {
    instructors: [],
    learnerArea: AREA,
    learner: INDIANAPORE,
    blocks: [],
    dates: days(),
    slotConfig: {
      slotStart: "06:00",
      slotEnd: "20:00",
      gridMinutes: 60,
      slotDurationMinutes: 60,
    },
    femalePreference: false,
    femaleMode: "off",
    holdMinutes: 15,
    now: NOW,
    gapMinutes: 0,
    ...over,
  };
}

/** A scheduler config with the advanced engine switched ON. */
export function enabledConfig(over = {}) {
  return {
    ...SCHEDULER_DISABLED,
    enabled: true,
    beamWidth: 8,
    workloadHorizonDays: 7,
    weights: {
      customerConvenience: 0.35,
      instructorBalance: 0.25,
      travelEfficiency: 0.2,
      scheduleDistribution: 0.15,
      completionEfficiency: 0.05,
    },
    ...over,
  };
}

export const POINTER_10AM = { date: "2026-10-05", start: "10:00" };