// Finalizes a direct online booking after the payment has completed
// (payment.status = 'completed', set by the existing verify/webhook path).
//
// The actual transition (hold re-check, slot re-scan, flip pending_payment ->
// booked, booking -> confirmed) happens atomically inside the
// confirm_booking_slots RPC so the "confirm vs a concurrent release of our
// just-expired holds" race can never yield a confirmed booking with zero
// booked lessons. Money-safe fallbacks: if the hold window lapsed or a slot
// was lost while the learner paid, the booking is still confirmed and the
// learner is flagged for manual scheduling — the payment is never in doubt.
//
// Idempotent: a replay of an already-confirmed booking returns the saved
// result without touching state.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConfirmRequest {
  bookingId?: string;
}

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const client = serviceClient();

    const { data: settingRow } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "booking_flow")
      .maybeSingle();
    const config = readBookingFlowConfig(settingRow?.value);

    if (!config.enabled) {
      throw new BookingError(
        422,
        "booking_disabled",
        "Online booking is not available right now.",
      );
    }

    const body = (await req.json()) as ConfirmRequest;
    if (!body.bookingId || !UUID_RE.test(body.bookingId)) {
      throw new BookingError(422, "validation_error", "A valid booking id is required.");
    }

    const { data: booking } = await client
      .from("booking")
      .select("*")
      .eq("id", body.bookingId)
      .maybeSingle();
    if (!booking) {
      throw new BookingError(404, "booking_not_found", "Booking not found.");
    }

    const bookingId = String(booking.id);
    const currentStatus = String(booking.status);

    if (currentStatus === "confirmed") {
      return jsonResponse({
        success: true,
        alreadyConfirmed: true,
        booking: { id: bookingId, status: "confirmed" },
      });
    }
    if (currentStatus === "conflict") {
      throw new BookingError(
        409,
        "slot_conflict",
        "This booking hit a slot conflict. Please pick new slots and complete the booking again.",
      );
    }
    if (currentStatus === "failed") {
      throw new BookingError(422, "payment_failed", "The payment for this booking was not completed.");
    }
    if (currentStatus === "abandoned") {
      throw new BookingError(422, "booking_abandoned", "This booking was abandoned. Please book again.");
    }
    if (currentStatus !== "created" && currentStatus !== "payment_completed") {
      throw new BookingError(409, "invalid_state", `Cannot confirm a booking in state "${currentStatus}".`);
    }

    // RTO-only bookings hold no lessons and link no enrollment. Their payment is
    // recorded by approve-booking-payment, which advances the booking to
    // "payment_completed" only AFTER inserting the completed payment row — so
    // reaching that state here is proof enough. Nothing to schedule afterwards.
    if (String(booking.case_type ?? "course_rto") === "rto_only") {
      if (currentStatus === "payment_completed") {
        await client
          .from("booking")
          .update({ status: "confirmed", gateway_reference: booking.gateway_reference ?? "auto-approved" })
          .eq("id", bookingId);
        console.log("confirm-booking: confirmed rto_only", { bookingId });
        return jsonResponse({
          success: true,
          schedulingMode: "none",
          scheduledCount: 0,
          message: "Paid. Our team will contact you to start your RTO paperwork.",
        });
      }
      throw new BookingError(
        409,
        "payment_not_completed",
        "Payment is not confirmed yet. Please complete your payment first.",
      );
    }

    // Ensure the payment actually completed via the payment gateway.
    const { data: enrollment } = await client
      .from("enrollment")
      .select("id, payment_id")
      .eq("learner_id", booking.learner_id)
      .eq("course_id", booking.course_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!enrollment?.payment_id) {
      throw new BookingError(
        409,
        "payment_not_completed",
        "No payment found for this booking yet.",
      );
    }

    const { data: payment } = await client
      .from("payment")
      .select("id, status, gateway_reference")
      .eq("id", enrollment.payment_id)
      .maybeSingle();
    if (!payment) {
      throw new BookingError(409, "payment_not_completed", "Payment record not found.");
    }
    if (String(payment.status) !== "completed") {
      throw new BookingError(
        409,
        "payment_not_completed",
        "Payment is not confirmed yet. Please complete your payment first.",
      );
    }

    // Everything after this point is one atomic transaction in the RPC.
    const { data: rpcResult, error: rpcError } = await client.rpc("confirm_booking_slots", {
      p_booking_id: bookingId,
      p_payment_id: String(payment.id),
    });
    if (rpcError) throw rpcError;

    const rpcOut = (rpcResult ?? {}) as {
      ok?: boolean;
      error?: string;
      message?: string;
      scheduling_mode?: string;
      scheduled?: number;
      rows?: Array<{ id: number | string; date: string; start_time: string; end_time: string }>;
    };

    const planScheduling = async (): Promise<void> => {
      await client.from("Learner").update({ needs_scheduling: true }).eq("id", booking.learner_id);
    };

    if (!rpcOut.ok) {
      if (rpcOut.error === "hold_expired" || rpcOut.error === "slot_conflict") {
        // Money-safe: the RPC already cancelled the stale holds and marked the
        // booking confirmed. Flag for manual scheduling and return success so
        // the learner understands their payment is safe.
        await planScheduling();
        await client
          .from("booking")
          .update({ gateway_reference: payment.gateway_reference ?? booking.gateway_reference })
          .eq("id", bookingId);
        return jsonResponse({
          success: true,
          schedulingMode: "assign_later",
          scheduledCount: 0,
          holdExpired: rpcOut.error === "hold_expired",
          message:
            rpcOut.error === "hold_expired"
              ? "Your payment is safe, but your lesson times were released because the reservation window had expired. Our team will contact you to schedule your lessons."
              : "One of your lesson times became unavailable while you paid. Your payment is safe — our team will contact you to schedule your lessons.",
        });
      }
      if (rpcOut.error === "not_found") {
        throw new BookingError(404, "booking_not_found", "Booking not found.");
      }
      if (rpcOut.error === "invalid_state") {
        throw new BookingError(
          409,
          "invalid_state",
          rpcOut.message ?? `Cannot confirm a booking in its current state.`,
        );
      }
      throw new BookingError(409, "slot_conflict", rpcOut.message ?? "We couldn't confirm this booking right now. Please try again.");
    }

    if (rpcOut.scheduling_mode === "direct" && (rpcOut.scheduled ?? 0) > 0) {
      await client
        .from("booking")
        .update({ gateway_reference: payment.gateway_reference ?? booking.gateway_reference })
        .eq("id", bookingId);
      console.log("confirm-booking: confirmed", { bookingId, scheduled: rpcOut.scheduled, payment: payment.id });
      return jsonResponse({
        success: true,
        schedulingMode: "direct",
        scheduledCount: rpcOut.scheduled,
        slots: (rpcOut.rows || []).map((s) => ({
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time,
        })),
        message: "Payment confirmed. Your lesson times are held and awaiting our team's confirmation — we'll email you once they're approved.",
      });
    }

    if (rpcOut.scheduling_mode === "already_confirmed") {
      return jsonResponse({
        success: true,
        alreadyConfirmed: true,
        booking: { id: bookingId, status: "confirmed" },
      });
    }

    // assign_later (nothing was held, or a money-safe fallback already handled
    // the sentinel above): mark confirmed + flag for scheduling.
    await planScheduling();
    await client
      .from("booking")
      .update({ gateway_reference: payment.gateway_reference ?? booking.gateway_reference })
      .eq("id", bookingId);
    return jsonResponse({
      success: true,
      schedulingMode: "assign_later",
      scheduledCount: 0,
      message: "Paid. Our team will contact you to fix your lesson schedule.",
    });
  } catch (error) {
    return errorResponse(error);
  }
});