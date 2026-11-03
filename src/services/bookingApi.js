import { supabase } from "../supabaseClient";
import { getFunnelSessionId } from "../utils/funnelTracking";

export class BookingApiError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = "BookingApiError";
    this.code = code || "request_failed";
    this.status = status || 0;
    this.details = details;
  }
}

async function parseError(error) {
  let status = 0;
  let payload = null;
  const ctx = error && error.context;
  if (ctx && typeof ctx.status !== "undefined") status = ctx.status;
  if (ctx && typeof ctx.clone === "function") {
    try {
      payload = await ctx.clone().json();
    } catch (_) {
      payload = null;
    }
  } else if (error && error.data) {
    payload = error.data;
  }
  const err = (payload && payload.error) || {};
  return new BookingApiError(
    err.message || error?.message || "Something went wrong. Please try again.",
    {
      code: err.code || (status >= 500 ? "server_error" : "request_failed"),
      status,
      details: err.details,
    },
  );
}

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw await parseError(error);
  if (data && data.success === false) {
    throw new BookingApiError(data.error || "Request failed", {
      code: "request_failed",
      status: data.status || 0,
    });
  }
  return data;
}

export function getBookingConfig() {
  return invoke("get-booking-config", {});
}

/**
 * Attach the funnel session id to every booking call.
 *
 * The server resolves the lead from this session, so the events it emits
 * (location_entered, slots_viewed, slot_selected, lead_captured,
 * payment_*, booking_confirmed) land in the right session and can be
 * back-stitched onto the lead once it is captured.
 */
function withSession(payload) {
  return { ...(payload || {}), client_session_id: getFunnelSessionId() };
}

export function checkLocationServiceability({ latitude, longitude, input_source }) {
  return invoke(
    "check-location-serviceability",
    withSession({ latitude, longitude, input_source }),
  );
}

export function getBookingSlots(params) {
  return invoke("get-booking-slots", withSession(params));
}

export function createBooking(payload) {
  return invoke("create-booking", withSession(payload));
}

export function confirmBooking(bookingId) {
  return invoke("confirm-booking", withSession({ bookingId }));
}

export function changeBookingSlot(params) {
  return invoke("change-booking-slot", withSession(params));
}

export function createRazorpayOrder(params) {
  return invoke("create-razorpay-order", params);
}

export function verifyRazorpayPayment(params) {
  return invoke("verify-razorpay-payment", params);
}

export function approveBookingPayment(bookingId) {
  return invoke("approve-booking-payment", withSession({ bookingId }));
}

export function sendBookingOnboardingEmail(payload) {
  return invoke("send-booking-onboarding-email", payload);
}

export const isSlotConflict = (e) => e instanceof BookingApiError && e.code === "slot_conflict";

export const isHoldExpired = (e) => e instanceof BookingApiError && e.code === "hold_expired";

export function formatINR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", {
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  })}`;
}