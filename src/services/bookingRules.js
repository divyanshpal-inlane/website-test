// Frontend accessor for the booking_flow rules published by get-booking-config.
// Mirrors the fail-closed server-side parsing: a value is surfaced only if it
// is present and valid — nothing is invented or defaulted. Consumers render
// without the dependent UI when a rule is absent instead of substituting a
// hardcoded fallback.

const isPosInt = (n) => Number.isInteger(n) && n > 0;
const isNonNegInt = (n) => Number.isInteger(n) && n >= 0;
const isTime = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const FEMALE_MODES = ["off", "preference", "mandatory"];
const PAYMENT_MODES = ["test", "live"];

export function getBookingRules(config) {
  const r = (config && typeof config === "object" && config.rules) || {};

  const rules = {};
  if (isPosInt(r.holdMinutes)) rules.holdMinutes = r.holdMinutes;
  if (isPosInt(r.bookingDaysAhead)) rules.bookingDaysAhead = r.bookingDaysAhead;
  if (isNonNegInt(r.slotGridMinutes)) rules.slotGridMinutes = r.slotGridMinutes;
  if (isPosInt(r.slotDurationMinutes)) rules.slotDurationMinutes = r.slotDurationMinutes;
  if (isTime(r.slotStart)) rules.slotStart = r.slotStart;
  if (isTime(r.slotEnd)) rules.slotEnd = r.slotEnd;
  if (isPosInt(r.maxSlotsPerBooking)) rules.maxSlotsPerBooking = r.maxSlotsPerBooking;
  if (isNonNegInt(r.instructorGapMinutes)) rules.instructorGapMinutes = r.instructorGapMinutes;
  if (FEMALE_MODES.includes(r.femaleInstructorMode)) rules.femaleInstructorMode = r.femaleInstructorMode;
  if (PAYMENT_MODES.includes(r.paymentMode)) rules.paymentMode = r.paymentMode;
  if (
    Array.isArray(r.installmentModes) &&
    r.installmentModes.length > 0 &&
    r.installmentModes.every((m) => typeof m === "string" && m.trim() !== "")
  ) {
    rules.installmentModes = [...r.installmentModes];
  }

  return rules;
}