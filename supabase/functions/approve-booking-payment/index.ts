// Auto-approves the payment for a direct online booking — the payment gateway
// is deliberately skipped while the funnel runs in test mode
// (booking_flow.payment_mode = "test"). The frontend switches to this function
// instead of create-razorpay-order + verify-razorpay-payment, so no gateway
// credentials or checkout modal are involved.
//
// It creates a *completed* payment record from the booking snapshot, links and
// activates the enrollment (full_paid / half_paid + unlocked lessons), and
// advances the booking to "payment_completed" so the existing confirm-booking
// finalization can run exactly as it does after a real payment.
//
// Idempotent: replaying with an already-completed payment returns
// { alreadyApproved: true }; an already-confirmed booking returns
// { alreadyConfirmed: true }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";
import { getHalfPaymentLessons } from "../_shared/pricing.ts";
import {
  deriveHashedClientEventId,
  emitServerEvent,
} from "../_shared/funnelEvents.ts";
import { findLeadByPhone } from "../_shared/funnelStore.ts";
import { phoneToLast10 } from "../_shared/funnelTaxonomy.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ApproveRequest {
  bookingId?: string;
  /** Funnel session id (uuid4) supplied by the website. */
  client_session_id?: string | null;
}

/**
 * Resolve the funnel lead id for a learner phone number (last 10 digits).
 * Returns null when the learner has no funnel lead yet — the events are then
 * recorded against the session only.
 */
async function resolveLeadId(
  client: unknown,
  phone: unknown,
): Promise<string | null> {
  try {
    const normalized = phoneToLast10(String(phone ?? ""));
    if (!normalized) return null;
    const lead = await findLeadByPhone(client as never, normalized);
    return lead?.id ? String(lead.id) : null;
  } catch (error) {
    console.error(
      "approve-booking-payment: funnel_resolve_lead_failed",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Emit a payment funnel event. Never throws — instrumentation must never be
 * able to fail a payment.
 */
async function emitPaymentFunnelEvent(
  client: unknown,
  args: {
    body: ApproveRequest;
    userAgent: string | null;
    leadId: string | null;
    eventName: "payment_initiated" | "payment_success" | "payment_failed";
    clientEventId: string;
    properties: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await emitServerEvent(client as never, {
      eventName: args.eventName,
      clientSessionId: args.body.client_session_id ?? null,
      leadId: args.leadId,
      occurredAt: new Date().toISOString(),
      properties: args.properties,
      clientEventId: args.clientEventId,
      userAgent: args.userAgent,
    });
  } catch (error) {
    console.error(
      "approve-booking-payment: funnel_emit_failed",
      args.eventName,
      error instanceof Error ? error.message : String(error),
    );
  }
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
    if (config.payment_mode !== "test") {
      throw new BookingError(
        409,
        "auto_approve_not_available",
        "Auto-approved payment is only available while the booking is in test payment mode.",
      );
    }

    const body = (await req.json()) as ApproveRequest;
    if (!body.bookingId || !UUID_RE.test(body.bookingId)) {
      throw new BookingError(422, "validation_error", "A valid booking id is required.");
    }

    const bookingId = body.bookingId;

    const { data: booking } = await client
      .from("booking")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) {
      throw new BookingError(404, "booking_not_found", "Booking not found.");
    }

    // Fetch RTO addon IDs for this booking
    const { data: bookingAddons } = await client
      .from("booking_addons")
      .select("code")
      .in("id", booking.addon_ids || []);
    const rtoAddonCodes = (bookingAddons || [])
      .map((a) => a.code)
      .filter((c) => c && c.startsWith("rto_"));

    const status = String(booking.status);
    if (status === "confirmed") {
      return jsonResponse({ success: true, alreadyConfirmed: true, paymentId: null });
    }
    if (status === "conflict") {
      throw new BookingError(
        409,
        "slot_conflict",
        "This booking hit a slot conflict. Please pick new slots and complete the booking again.",
      );
    }
    if (status === "failed") {
      // A previously failed payment attempt. Record it so the failure-rate
      // metric is measured rather than assumed to be zero. `leadId` is left
      // null on purpose: the session's own lead link is used as the fallback.
      await emitPaymentFunnelEvent(client, {
        body,
        userAgent: req.headers.get("user-agent"),
        leadId: null,
        eventName: "payment_failed",
        clientEventId: await deriveHashedClientEventId(
          "pay-fail",
          bookingId,
          "booking_failed",
        ),
        properties: {
          installment_mode: String(booking.installment_mode ?? "full"),
          amount: Number(booking.total_amount ?? booking.base_amount ?? 0),
          gateway: "razorpay",
          error_code: "booking_failed",
          reason: "The booking was already marked as failed.",
        },
      });
      throw new BookingError(422, "payment_failed", "This booking cannot continue.");
    }
    if (status === "abandoned") {
      throw new BookingError(422, "booking_abandoned", "This booking was abandoned. Please book again.");
    }
    if (status !== "created" && status !== "payment_completed") {
      throw new BookingError(
        409,
        "invalid_state",
        `Cannot approve a booking in state "${status}".`,
      );
    }

    const learnerId = String(booking.learner_id);
    const courseId = booking.course_id ? String(booking.course_id) : null;
    const isRtoOnly = String(booking.case_type ?? "course_rto") === "rto_only";

    const { data: enrollment } = await client
      .from("enrollment")
      .select("id, payment_id, progress")
      .eq("learner_id", learnerId)
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (enrollment?.payment_id) {
      const { data: existingPayment } = await client
        .from("payment")
        .select("id, status")
        .eq("id", String(enrollment.payment_id))
        .maybeSingle();
      if (existingPayment && String(existingPayment.status) === "completed") {
        return jsonResponse({
          success: true,
          alreadyApproved: true,
          paymentId: String(existingPayment.id),
        });
      }
    }

    // An rto_only booking has no enrollment to link its payment, so a replay
    // would otherwise double-insert a payment row. "payment_completed" is only
    // ever set by this function, so reaching it means approval already ran.
    if (status === "payment_completed") {
      return jsonResponse({ success: true, alreadyApproved: true, paymentId: null });
    }

    const { data: learner } = await client
      .from("Learner")
      .select("id, name, email, phone")
      .eq("id", learnerId)
      .maybeSingle();
    if (!learner) {
      throw new BookingError(404, "learner_not_found", "Learner record not found.");
    }

    // --- funnel instrumentation (never fatal) ------------------------------
    // Resolve the funnel lead for this learner so the payment events are
    // attached to the lead (not just to a session). The lead was created by
    // create-booking / capture-lead, both of which dedupe on the last 10
    // phone digits.
    const leadId = await resolveLeadId(client, learner.phone);

    // --- LL application for RTO services (create BEFORE payment so we don't have
    // a payment without a pipeline entry). If this fails, we return an error and
    // the caller can retry. ---
    let llAppId: string | null = null;
    if (rtoAddonCodes && rtoAddonCodes.length > 0) {
      try {
        const { data: existingApp } = await client
          .from("ll_applications")
          .select("id")
          .eq("learner_id", learnerId)
          .not("status", "in", "('dl_delivered','closed')")
          .maybeSingle();
        if (!existingApp) {
          const { data: newApp, error: appError } = await client
            .from("ll_applications")
            .insert({
              learner_id: learnerId,
              services: rtoAddonCodes,
              status: "payment_received",
              acquired_via_funnel: true,
            })
            .select("id")
            .single();
          if (appError) throw appError;
          llAppId = newApp.id;
          await client.from("ll_pipeline_events").insert({
            application_id: newApp.id,
            learner_id: learnerId,
            event_type: "status_change",
            to_status: "payment_received",
            actor_name: "auto-approved",
            note: "RTO services booked via funnel",
          });
        } else {
          llAppId = existingApp.id;
        }
      } catch (e) {
        console.error("Failed to create LL application for RTO services:", e);
        throw new BookingError(
          500,
          "ll_pipeline_error",
          "Could not create RTO pipeline entry. Please try again.",
        );
      }
    }

    const amount = Number(booking.total_amount ?? booking.base_amount ?? 0);
    const installmentMode = String(booking.installment_mode ?? "full");
    const installment1 = Number(booking.installment1_amount ?? amount);
    const installment2 = Number(booking.installment2_amount ?? 0);

    const firstHalf = installmentMode === "first_half";
    const paidAmount = firstHalf ? installment1 : amount;

    // Enrollment unlock size comes from the course catalogue. RTO-only bookings
    // have no course/enrollment — nothing to unlock.
    let totalLessons = 0;
    let unlockedLessons: number[] = [];
    if (!isRtoOnly && courseId) {
      const { data: course } = await client
        .from("Courses")
        .select("total_lessons, duration")
        .eq("id", courseId)
        .maybeSingle();
      totalLessons =
        Number(course?.total_lessons) > 0
          ? Number(course.total_lessons)
          : Number(course?.duration) > 0
            ? Number(course.duration)
            : 10;
      unlockedLessons = firstHalf
        ? getHalfPaymentLessons(totalLessons)
        : Array.from({ length: totalLessons }, (_, i) => i + 1);
    }

    // --- funnel instrumentation (never fatal) ------------------------------
    // `payment_initiated` fires exactly once per booking, right before the
    // charge. A replay of an already-approved booking returns early and never
    // reaches this point, so the event is not duplicated.
    await emitPaymentFunnelEvent(client, {
      body,
      userAgent: req.headers.get("user-agent"),
      leadId,
      eventName: "payment_initiated",
      clientEventId: await deriveHashedClientEventId("pay-init", bookingId),
      properties: {
        installment_mode: installmentMode,
        amount: paidAmount,
        gateway: "razorpay",
      },
    });

    const { data: paymentRow, error: paymentError } = await client
      .from("payment")
      .insert([
        {
          learner_id: learnerId,
          amount: paidAmount,
          email: String(learner.email ?? ""),
          phone: String(learner.phone ?? ""),
          payment_type: isRtoOnly ? "custom" : "course",
          status: "completed",
          name: String(learner.name ?? ""),
          installment_type: firstHalf ? "first_half" : "full",
          installment1_amount: installment1,
          installment2_amount: installment2,
          gateway: "razorpay",
          gateway_reference: "auto-approved",
        },
      ])
      .select("id, gateway_reference")
      .single();
    if (paymentError) {
      // --- funnel instrumentation (never fatal) ---------------------------
      // A real payment failure, not a replay: emit `payment_failed` so the
      // failure-rate metric is measured rather than assumed to be zero.
      await emitPaymentFunnelEvent(client, {
        body,
        userAgent: req.headers.get("user-agent"),
        leadId,
        eventName: "payment_failed",
        clientEventId: await deriveHashedClientEventId(
          "pay-fail",
          bookingId,
          "payment_write_failed",
        ),
        properties: {
          installment_mode: installmentMode,
          amount: paidAmount,
          gateway: "razorpay",
          error_code: "payment_write_failed",
          reason: "The payment record could not be written.",
        },
      });
      throw paymentError;
    }
    const paymentId = String(paymentRow.id);

    if (enrollment) {
      const progress = (enrollment.progress as Record<string, unknown>) || {};
      const { error: enrollError } = await client
        .from("enrollment")
        .update({
          payment_id: paymentId,
          payment_status: firstHalf ? "half_paid" : "full_paid",
          status: "active",
          unlocked_lessons: unlockedLessons,
          progress: {
            ...progress,
            completed_lessons: progress.completed_lessons || [],
            current_lesson: progress.current_lesson || 1,
            last_accessed: new Date().toISOString(),
          },
        })
        .eq("id", String(enrollment.id));
      if (enrollError) throw enrollError;
    }

const { error: bookingError } = await client
      .from("booking")
      .update({
        status: "payment_completed",
        gateway_reference: String(paymentRow.gateway_reference ?? "auto-approved"),
      })
      .eq("id", bookingId);
    if (bookingError) throw bookingError;

    console.log("approve-booking-payment:", {
      bookingId,
      paymentId,
      amount: paidAmount,
      installmentMode,
      unlocked: unlockedLessons.length,
    });

    // --- funnel instrumentation (never fatal) ------------------------------
    // `payment_success` fires only after the payment row is `completed` AND
    // the booking has been advanced to "payment_completed".
    await emitPaymentFunnelEvent(client, {
      body,
      userAgent: req.headers.get("user-agent"),
      leadId,
      eventName: "payment_success",
      clientEventId: await deriveHashedClientEventId("pay-ok", paymentId),
      properties: {
        installment_mode: installmentMode,
        amount: paidAmount,
        gateway: "razorpay",
        payment_id: paymentId,
      },
    });

    return jsonResponse({
      success: true,
      autoApproved: true,
      paymentId,
      amount: paidAmount,
      installmentMode,
      message: "Payment approved.",
    });
  } catch (error) {
    return errorResponse(error);
  }
});