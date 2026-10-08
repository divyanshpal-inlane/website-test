// Verifies and completes a payment for the direct online booking flow.
//
// TEST MODE (booking_flow.payment_mode = "test"): the payment is completed
// without any gateway credentials or signature math — only a sanity tie to the
// pending payment's stored order reference. Every submitted "payment" succeeds.
//
// LIVE MODE (payment_mode = "live"): verifies the Razorpay HMAC-SHA256
// signature (order_id + "|" + payment_id vs RAZORPAY_KEY_SECRET) exactly like
// the hosted app, then completes the payment.
//
// Completion (both modes) marks the payment record completed and drives the
// course enrollment state (payment_status / unlocked_lessons) so downstream
// finalization (confirm-booking) sees a paid booking. The booking flow only
// produces "course" payments; demo/topup/custom completion is kept minimal but
// consistent at the enrollment level.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";
import { getHalfPaymentLessons } from "../_shared/pricing.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface VerifyRequest {
  razorpay_order_id?: unknown;
  razorpay_payment_id?: unknown;
  razorpay_signature?: unknown;
  paymentId?: unknown;
}

async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const body = `${orderId}|${paymentId}`;
  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(body);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const calculated = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return calculated === signature;
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

    const testMode = config.payment_mode === "test";
    const razorpayKeySecret = testMode
      ? ""
      : (Deno.env.get("RAZORPAY_KEY_SECRET") ?? "");

    if (!testMode && !razorpayKeySecret) {
      throw new BookingError(
        500,
        "payment_not_configured",
        "Razorpay credentials not configured.",
      );
    }

    const body = (await req.json()) as VerifyRequest;

    const paymentId =
      typeof body.paymentId === "string" && UUID_RE.test(body.paymentId)
        ? body.paymentId
        : null;
    if (!paymentId) {
      throw new BookingError(422, "validation_error", "A valid payment id is required.");
    }
    const orderId =
      typeof body.razorpay_order_id === "string" ? body.razorpay_order_id : "";
    const razorpayPaymentId =
      typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
    const signature =
      typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";
    if (!orderId || !razorpayPaymentId || !signature) {
      throw new BookingError(
        422,
        "validation_error",
        "razorpay_order_id, razorpay_payment_id and razorpay_signature are required.",
      );
    }

    const { data: payment, error: paymentError } = await client
      .from("payment")
      .select("id, learner_id, payment_type, installment_type, status, gateway_reference, amount")
      .eq("id", paymentId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) {
      throw new BookingError(404, "payment_not_found", "Payment record not found.");
    }

    if (String(payment.status) === "completed") {
      return jsonResponse({
        success: true,
        alreadyCompleted: true,
        message: "Payment already completed",
      });
    }

    // ---------------------------------------------------------------------------
    // Verification (signature in live mode; test mode approves).
    // ---------------------------------------------------------------------------
    if (testMode) {
      if (payment.gateway_reference && String(payment.gateway_reference) !== orderId) {
        throw new BookingError(
          409,
          "payment_verification_failed",
          "This payment does not match the order that was created.",
        );
      }
    } else {
      // Verify gateway_reference matches the order we created
      if (payment.gateway_reference && String(payment.gateway_reference) !== orderId) {
        throw new BookingError(
          409,
          "payment_verification_failed",
          "Order reference mismatch.",
        );
      }
      // Verify Razorpay signature
      const isValid = await verifyRazorpaySignature(
        orderId,
        razorpayPaymentId,
        signature,
        razorpayKeySecret,
      );
      if (!isValid) {
        throw new BookingError(
          409,
          "payment_verification_failed",
          "Payment signature verification failed.",
        );
      }
      // Fetch Razorpay order to validate amount/currency against our record
      try {
        const basicAuth = btoa(`${Deno.env.get("RAZORPAY_KEY_ID")}:${razorpayKeySecret}`);
        const rpRes = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
          headers: { Authorization: `Basic ${basicAuth}` },
        });
        if (rpRes.ok) {
          const rpOrder = await rpRes.json();
          const rpAmount = Number(rpOrder.amount) || 0;
          const ourAmount = Math.round(Number(payment.amount) * 100);
          if (rpAmount !== ourAmount) {
            throw new BookingError(
              409,
              "payment_verification_failed",
              "Order amount mismatch with gateway.",
            );
          }
          if (String(rpOrder.currency || "INR") !== "INR") {
            throw new BookingError(
              409,
              "payment_verification_failed",
              "Order currency mismatch.",
            );
          }
        }
      } catch (e) {
        if (e instanceof BookingError) throw e;
        console.warn("Razorpay order fetch failed:", e);
      }
    }

    // ---------------------------------------------------------------------------
    // Completion
    // ---------------------------------------------------------------------------
    const { error: completeError } = await client
      .from("payment")
      .update({
        status: "completed",
        gateway_reference: razorpayPaymentId,
      })
      .eq("id", paymentId);
    if (completeError) throw completeError;

    // Update booking status to payment_completed (R17)
    const { data: bookingToUpdate } = await client
      .from("booking")
      .select("id, status")
      .eq("learner_id", learnerId)
      .eq("course_id", paymentType === "course" ? enrollment?.course_id : null)
      .eq("status", "created")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bookingToUpdate) {
      await client
        .from("booking")
        .update({ status: "payment_completed" })
        .eq("id", bookingToUpdate.id);
    }

    const paymentType = String(payment.payment_type || "course");
    const installmentType = String(payment.installment_type || "full");
    const learnerId = String(payment.learner_id);

    if (paymentType === "course") {
      const { data: enrollment, error: enrollmentError } = await client
        .from("enrollment")
        .select("id, payment_status, unlocked_lessons, progress, course_id")
        .eq("payment_id", paymentId)
        .maybeSingle();
      if (enrollmentError) throw enrollmentError;

      if (enrollment) {
        let totalCourseLessons =
          (enrollment.progress as { total_hours?: number } | null)?.total_hours || 10;
        if (enrollment.course_id) {
          const { data: courseRow } = await client
            .from("Courses")
            .select("total_lessons, duration")
            .eq("id", enrollment.course_id)
            .maybeSingle();
          totalCourseLessons =
            Number(courseRow?.total_lessons) > 0
              ? Number(courseRow.total_lessons)
              : Number(courseRow?.duration) > 0
                ? Number(courseRow.duration)
                : totalCourseLessons;
        }

        const { data: demoPayments } = await client
          .from("payment")
          .select("id")
          .eq("learner_id", learnerId)
          .eq("payment_type", "demo")
          .in("status", ["completed", "upgraded"]);
        const demoSkip = Math.min(
          demoPayments?.length ?? 0,
          Math.max(0, totalCourseLessons - 1),
        );
        const remainingLessons = Math.max(1, totalCourseLessons - demoSkip);
        const fullUnlock = Array.from(
          { length: remainingLessons },
          (_, i) => i + 1 + demoSkip,
        );

        let unlockedLessons = enrollment.unlocked_lessons || [];
        let newPaymentStatus = enrollment.payment_status;
        if (installmentType === "first_half") {
          unlockedLessons = getHalfPaymentLessons(remainingLessons).map(
            (n) => n + demoSkip,
          );
          newPaymentStatus = "half_paid";
        } else if (
          installmentType === "second_half" &&
          enrollment.payment_status === "half_paid"
        ) {
          unlockedLessons = fullUnlock;
          newPaymentStatus = "full_paid";
        } else {
          unlockedLessons = fullUnlock;
          newPaymentStatus = "full_paid";
        }

        const progress = (enrollment.progress as Record<string, unknown>) || {};
        const { error: updateError } = await client
          .from("enrollment")
          .update({
            payment_status: newPaymentStatus,
            unlocked_lessons: unlockedLessons,
            status: "active",
            progress: {
              ...progress,
              completed_lessons: progress.completed_lessons || [],
              current_lesson: progress.current_lesson || 1,
              last_accessed: new Date().toISOString(),
            },
          })
          .eq("id", enrollment.id);
        if (updateError) throw updateError;
      }
    } else if (paymentType === "demo") {
      await completeSimpleEnrollment(client, paymentId, learnerId, [1], {
        type: "demo",
        total_hours: 1,
      });
    } else if (paymentType === "topup") {
      const { data: enrollment } = await client
        .from("enrollment")
        .select("progress")
        .eq("payment_id", paymentId)
        .maybeSingle();
      const topupHours =
        (enrollment?.progress as { total_hours?: number } | null)?.total_hours ||
        Math.max(1, Math.round(Number(payment.amount) || 1));
      const unlocked = Array.from(
        { length: topupHours },
        (_, i) => i + 1,
      );
      await completeSimpleEnrollment(client, paymentId, learnerId, unlocked, {
        type: "topup",
        total_hours: topupHours,
      });
    } else if (paymentType === "custom") {
      const { data: enrollment } = await client
        .from("enrollment")
        .select("progress")
        .eq("payment_id", paymentId)
        .maybeSingle();
      const totalHours =
        (enrollment?.progress as { total_hours?: number } | null)?.total_hours || 10;
      const lessonsToUnlock = Math.min(Math.ceil(totalHours / 1), 10);
      const unlocked = Array.from(
        { length: lessonsToUnlock },
        (_, i) => i + 1,
      );
      await completeSimpleEnrollment(client, paymentId, learnerId, unlocked, {
        ...((enrollment?.progress as Record<string, unknown>) || {}),
      });
    }

    console.log("verify-razorpay-payment:", {
      testMode,
      paymentId,
      razorpayPaymentId,
      paymentType,
      installmentType,
    });

    return jsonResponse({
      success: true,
      alreadyCompleted: false,
      message: "Payment verified successfully",
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * Mark the enrollment linked to a non-course payment as fully paid and active.
 * Kept minimal — the hosted app's scheduler side-effects (reschedule_requests,
 * ll_applications, send-message) belong to the site pipeline, not this flow.
 */
async function completeSimpleEnrollment(
  client: ReturnType<typeof serviceClient>,
  paymentId: string,
  learnerId: string,
  unlockedLessons: number[],
  progress: Record<string, unknown>,
): Promise<void> {
  const { data: existing } = await client
    .from("enrollment")
    .select("id")
    .eq("payment_id", paymentId)
    .maybeSingle();

  const row = {
    learner_id: learnerId,
    course_id: null,
    payment_id: paymentId,
    status: "active",
    payment_status: "full_paid",
    installment_mode: "full",
    unlocked_lessons: unlockedLessons,
    progress: {
      ...progress,
      completed_lessons: [],
      current_lesson: 1,
      last_accessed: new Date().toISOString(),
    },
  };

  if (existing) {
    const { error } = await client
      .from("enrollment")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("enrollment").insert([row]);
    if (error) throw error;
  }
}