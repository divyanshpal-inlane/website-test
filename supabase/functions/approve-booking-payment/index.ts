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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ApproveRequest {
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
    if (paymentError) throw paymentError;
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