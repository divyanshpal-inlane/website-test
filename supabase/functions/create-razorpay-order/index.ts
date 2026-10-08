// Creates a payment order for the direct online booking flow.
//
// Production interface mirrors the hosted app's create-razorpay-order: learner
// resolution, payment row insert (gateway = 'razorpay'), enrollment
// create/update for course|demo|topup|custom, server-side amount guards, and a
// real Razorpay Orders API call in live mode.
//
// TEST MODE (booking_flow.payment_mode = "test"): every payment is approved
// unconditionally — a synthetic order_id is issued, no Razorpay credentials are
// required, and verify-razorpay-payment completes the payment on success. This
// exists so the whole flow can be exercised end-to-end before live keys exist.
//
// LIVE MODE (payment_mode = "live"): requires RAZORPAY_KEY_ID +
// RAZORPAY_KEY_SECRET and creates a real Razorpay order via the public API.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";
import { getHalfPaymentLessons } from "../_shared/pricing.ts";
import { normalizeName, normalizePhone } from "../_shared/validation.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_TYPES = ["course", "demo", "custom", "topup"] as const;
const INSTALLMENT_TYPES = ["full", "first_half", "second_half"] as const;

interface CreateOrderRequest {
  amount?: unknown;
  email?: unknown;
  phone?: unknown;
  paymentType?: unknown;
  courseId?: unknown;
  name?: unknown;
  learnerId?: unknown;
  installmentType?: unknown;
  totalAmount?: unknown;
  installment1Amount?: unknown;
  installment2Amount?: unknown;
  selectedModules?: unknown;
  totalHours?: unknown;
  isDemoUpgrade?: unknown;
  demoPaymentId?: unknown;
}

function roundAmount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function asString(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
}

function asInt01(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

/**
 * Which amount this enrollment actually requires for the given installment
 * type. Returns null when no stored amount exists (learner-initiated first
 * purchase) so validation is skipped.
 */
function expectedAmountFor(
  enrollment: {
    amount?: number | null;
    installment1_amount?: number | null;
    installment2_amount?: number | null;
  } | null,
  installmentType?: string,
): number | null {
  const total = Math.round(Number(enrollment?.amount) || 0);
  if (total <= 0) return null;
  const inst1 =
    Number(enrollment?.installment1_amount) > 0
      ? Math.round(Number(enrollment?.installment1_amount))
      : Math.round(total / 2);
  const inst2 =
    Number(enrollment?.installment2_amount) > 0
      ? Math.round(Number(enrollment?.installment2_amount))
      : total - inst1;
  if (installmentType === "second_half") return inst2;
  if (installmentType === "first_half") return inst1;
  return total;
}

/** Throw if the client-supplied amount differs from what the enrollment owes (±₹1). */
function assertAmountMatchesEnrollment(
  amount: number,
  enrollment: {
    amount?: number | null;
    installment1_amount?: number | null;
    installment2_amount?: number | null;
  } | null,
  installmentType?: string,
): void {
  const expected = expectedAmountFor(enrollment, installmentType);
  if (expected !== null && Math.abs(Math.round(amount) - expected) > 1) {
    throw new BookingError(
      422,
      "amount_mismatch",
      `Amount mismatch: this enrollment requires ₹${expected}, not ₹${Math.round(amount)}.`,
    );
  }
}

/**
 * The full price this enrollment is sold at (installment-agnostic). Persisting
 * it keeps an abandoned payment from reverting the learner to list price.
 */
function resolveEnrollmentTotal(
  totalAmount?: unknown,
  installment1Amount?: unknown,
  installment2Amount?: unknown,
  amount?: unknown,
): number | null {
  const fromTotal = roundAmount(totalAmount);
  if (fromTotal > 0 && Number.isFinite(fromTotal)) return fromTotal;
  const fromInstallments =
    (roundAmount(installment1Amount) || 0) + (roundAmount(installment2Amount) || 0);
  if (fromInstallments > 0) return fromInstallments;
  const fromAmount = roundAmount(amount);
  return Number.isFinite(fromAmount) && fromAmount > 0 ? fromAmount : null;
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
    const razorpayKeyId = testMode ? "" : (Deno.env.get("RAZORPAY_KEY_ID") ?? "");
    const razorpayKeySecret = testMode
      ? ""
      : (Deno.env.get("RAZORPAY_KEY_SECRET") ?? "");

    if (!testMode && (!razorpayKeyId || !razorpayKeySecret)) {
      throw new BookingError(
        500,
        "payment_not_configured",
        "Razorpay credentials not configured.",
      );
    }

    const body = (await req.json()) as CreateOrderRequest;

    const amount = roundAmount(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BookingError(422, "validation_error", "A valid payment amount is required.");
    }

    const phone = normalizePhone(body.phone);
    if (!phone) {
      throw new BookingError(
        422,
        "validation_error",
        "A valid 10-digit phone number is required.",
      );
    }
    const email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : null;
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;

    const paymentType = asString(body.paymentType, 20);
    if (!paymentType || !(PAYMENT_TYPES as readonly string[]).includes(paymentType)) {
      throw new BookingError(422, "validation_error", "A valid payment type is required.");
    }
    const installmentType = asString(body.installmentType, 20);
    if (
      installmentType &&
      !(INSTALLMENT_TYPES as readonly string[]).includes(installmentType)
    ) {
      throw new BookingError(422, "validation_error", "A valid installment type is required.");
    }

    const courseId = typeof body.courseId === "string" ? body.courseId : null;
    const providedLearnerId =
      typeof body.learnerId === "string" && UUID_RE.test(body.learnerId)
        ? body.learnerId
        : null;

    // ---------------------------------------------------------------------------
    // 1. Learner resolution
    // ---------------------------------------------------------------------------
    let learnerId: string;
    if (providedLearnerId) {
      const { data: existingLearner, error } = await client
        .from("Learner")
        .select("id")
        .eq("id", providedLearnerId)
        .maybeSingle();
      if (error) throw error;
      if (!existingLearner) {
        throw new BookingError(404, "learner_not_found", "Invalid learner ID.");
      }
      learnerId = providedLearnerId;
      if (name) {
        const { error: nameError } = await client
          .from("Learner")
          .update({ name })
          .eq("id", learnerId);
        if (nameError) throw nameError;
      }
    } else {
      const { data: existingLearners } = await client
        .from("Learner")
        .select("id")
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(1);
      if (existingLearners?.length) {
        learnerId = String(existingLearners[0].id);
      } else {
        const displayName = normalizeName(name);
        if (!displayName) {
          throw new BookingError(
            422,
            "validation_error",
            "Your full name is required for a new learner.",
          );
        }
        const { data: createdLearner, error: createError } = await client
          .from("Learner")
          .insert([
            {
              name: displayName,
              email: email || null,
              phone,
              onboarding_completed: false,
            },
          ])
          .select("id")
          .single();
        if (createError) throw createError;
        learnerId = String(createdLearner.id);
      }
    }

    // ---------------------------------------------------------------------------
    // 2. Payment record (gateway = razorpay)
    // ---------------------------------------------------------------------------
    const { data: paymentRecord, error: dbError } = await client
      .from("payment")
      .insert([
        {
          learner_id: learnerId,
          amount,
          email,
          phone,
          payment_type: paymentType,
          status: "pending",
          name,
          installment_type: installmentType ?? null,
          installment1_amount: roundAmount(body.installment1Amount) || null,
          installment2_amount: roundAmount(body.installment2Amount) || null,
          gateway: "razorpay",
        },
      ])
      .select("id")
      .single();
    if (dbError) throw dbError;

    const enrollmentTotal = resolveEnrollmentTotal(
      body.totalAmount,
      body.installment1Amount,
      body.installment2Amount,
      body.amount,
    );

    if (body.isDemoUpgrade && typeof body.demoPaymentId === "string") {
      await client
        .from("payment")
        .update({ status: "upgraded" })
        .eq("id", body.demoPaymentId)
        .eq("learner_id", learnerId);
    }

    // ---------------------------------------------------------------------------
    // 3. Enrollment records
    // ---------------------------------------------------------------------------
    if (paymentType === "course" && courseId) {
      const { data: existingEnrollment } = await client
        .from("enrollment")
        .select("id, amount, installment_mode, installment1_amount, installment2_amount, payment_status")
        .eq("learner_id", learnerId)
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingEnrollment) {
        if (existingEnrollment.payment_status === "full_paid") {
          throw new BookingError(
            422,
            "course_already_owned",
            "This course is already fully paid for.",
          );
        }
        if (
          installmentType === "second_half" &&
          existingEnrollment.payment_status !== "half_paid"
        ) {
          throw new BookingError(
            409,
            "installment_order",
            "Cannot process the second installment before the first payment.",
          );
        }
        // Fetch course price from DB for authoritative amount validation
        const { data: courseRow } = await client
          .from("Courses")
          .select("price")
          .eq("id", courseId)
          .maybeSingle();
        const coursePrice = Math.round(Number(courseRow?.price) || 0);
        if (coursePrice <= 0) {
          throw new BookingError(422, "course_not_configured", "Course price not configured.");
        }
        // For existing enrollments, the amount must match the course price
        // (installment1/2 are derived from the same total)
        const expectedTotal = coursePrice;
        if (Math.abs(amount - expectedTotal) > 1) {
          throw new BookingError(
            422,
            "amount_mismatch",
            `Amount mismatch: this course requires ₹${expectedTotal}, not ₹${amount}.`,
          );
        }

        const { error: updateError } = await client
          .from("enrollment")
          .update({
            payment_id: paymentRecord.id,
            status:
              existingEnrollment.payment_status === "half_paid"
                ? "active"
                : "pending",
            installment_mode: installmentType || existingEnrollment?.installment_mode,
            installment1_amount:
              roundAmount(body.installment1Amount) || existingEnrollment?.installment1_amount || null,
            installment2_amount:
              roundAmount(body.installment2Amount) || existingEnrollment?.installment2_amount || null,
            amount: expectedTotal,
          })
          .eq("id", existingEnrollment.id);
        if (updateError) throw updateError;
      } else {
        const { data: courseRow } = await client
          .from("Courses")
          .select("id, duration, total_lessons, price")
          .eq("id", courseId)
          .maybeSingle();
        if (!courseRow) {
          throw new BookingError(404, "course_not_found", "Course not found.");
        }
        const courseHours = Math.max(
          1,
          Number(courseRow?.duration) > 0
            ? Number(courseRow.duration)
            : Number(courseRow?.total_lessons) > 0
              ? Number(courseRow.total_lessons)
              : 10,
        );
        const coursePrice = Math.round(Number(courseRow.price) || 0);
        if (coursePrice <= 0) {
          throw new BookingError(422, "course_not_configured", "Course price not configured.");
        }
        // Compute expected total from DB: course price + add-ons (if any)
        // For new course enrollment, add-ons would come from booking_addons, but here we only have course.
        const expectedTotal = coursePrice;
        if (Math.abs(amount - expectedTotal) > 1) {
          throw new BookingError(
            422,
            "amount_mismatch",
            `Amount mismatch: this course requires ₹${expectedTotal}, not ₹${amount}.`,
          );
        }

        const { error: insertError } = await client.from("enrollment").insert([
          {
            learner_id: learnerId,
            course_id: courseId,
            payment_id: paymentRecord.id,
            status: "pending",
            payment_status: "pending",
            installment_mode: installmentType,
            installment1_amount: roundAmount(body.installment1Amount) || null,
            installment2_amount: roundAmount(body.installment2Amount) || null,
            amount: expectedTotal,
            unlocked_lessons:
              installmentType === "first_half"
                ? getHalfPaymentLessons(courseHours)
                : [],
            progress: { type: "course", total_hours: courseHours },
          },
        ]);
        if (insertError) throw insertError;
      }
    }

    if (paymentType === "demo") {
      const { data: existingDemos } = await client
        .from("payment")
        .select("id")
        .eq("learner_id", learnerId)
        .eq("payment_type", "demo")
        .eq("status", "completed");
      if ((existingDemos?.length ?? 0) >= 4) {
        throw new BookingError(
          422,
          "demo_limit",
          "Demo limit reached (max 4). Please choose a course or topup instead.",
        );
      }

      const { data: existingPendingDemo, error: demoQueryError } = await client
        .from("enrollment")
        .select("id")
        .eq("learner_id", learnerId)
        .is("course_id", null)
        .neq("payment_status", "full_paid")
        .filter("progress->>type", "eq", "demo")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (demoQueryError) throw demoQueryError;

      const demoEnroll = {
        learner_id: learnerId,
        course_id: null,
        payment_id: paymentRecord.id,
        status: "pending",
        payment_status: "pending",
        installment_mode: "full",
        unlocked_lessons: [1],
        progress: { type: "demo", total_hours: 1 },
      };
      if (existingPendingDemo) {
        const { error: updateError } = await client
          .from("enrollment")
          .update({
            payment_id: paymentRecord.id,
            status: "pending",
            payment_status: "pending",
            installment_mode: "full",
            unlocked_lessons: [1],
            progress: { type: "demo", total_hours: 1 },
          })
          .eq("id", existingPendingDemo.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await client
          .from("enrollment")
          .insert([demoEnroll]);
        if (insertError) throw insertError;
      }
    }

    if (paymentType === "topup") {
      const topupHours = Math.min(200, Math.max(1, Math.round(Number(body.totalHours) || 1)));
      const topupUnlocked = Array.from({ length: topupHours }, (_, i) => i + 1);
      const topupEnroll = {
        learner_id: learnerId,
        course_id: null,
        payment_id: paymentRecord.id,
        status: "pending",
        payment_status: "pending",
        installment_mode: "full",
        unlocked_lessons: topupUnlocked,
        progress: { type: "topup", total_hours: topupHours },
      };

      const { data: existingPendingTopup } = await client
        .from("enrollment")
        .select("id")
        .eq("learner_id", learnerId)
        .is("course_id", null)
        .neq("payment_status", "full_paid")
        .filter("progress->>type", "eq", "topup")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingPendingTopup) {
        const { error: updateError } = await client
          .from("enrollment")
          .update({ ...topupEnroll })
          .eq("id", existingPendingTopup.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await client
          .from("enrollment")
          .insert([topupEnroll]);
        if (insertError) throw insertError;
      }
    }

    if (paymentType === "custom") {
      const selectedModules = Array.isArray(body.selectedModules)
        ? body.selectedModules.map(String)
        : [];
      const totalHours = Math.round(Number(body.totalHours) || 0);

      const { data: existingPendingCustom } = await client
        .from("enrollment")
        .select("id, progress, amount, installment1_amount, installment2_amount")
        .eq("learner_id", learnerId)
        .is("course_id", null)
        .neq("payment_status", "full_paid")
        .filter("progress->>type", "eq", "custom")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const existingProgress = existingPendingCustom?.progress as
        | { selected_modules?: string[]; total_hours?: number; module_prices?: Record<string, number> }
        | null
        | undefined;
      const mergedModules =
        selectedModules.length > 0
          ? selectedModules
          : existingProgress?.selected_modules || [];
      const mergedHours = totalHours || existingProgress?.total_hours || 0;
      const lessonsToUnlock = Math.min(Math.ceil((mergedHours || 0) / 1), 10);
      const unlockedLessons = Array.from(
        { length: lessonsToUnlock },
        (_, i) => i + 1,
      );

      const customProgress = {
        type: "custom",
        selected_modules: mergedModules,
        total_hours: mergedHours,
        module_prices: existingProgress?.module_prices || {},
        is_demo_upgrade: body.isDemoUpgrade === true,
      };

      if (existingPendingCustom) {
        if (!testMode) {
          assertAmountMatchesEnrollment(
            amount,
            existingPendingCustom,
            installmentType,
          );
        }
        const { error: updateError } = await client
          .from("enrollment")
          .update({
            payment_id: paymentRecord.id,
            status: "pending",
            payment_status: "pending",
            installment_mode: installmentType || "full",
            installment1_amount:
              roundAmount(body.installment1Amount) ||
              existingPendingCustom.installment1_amount ||
              null,
            installment2_amount:
              roundAmount(body.installment2Amount) ||
              existingPendingCustom.installment2_amount ||
              null,
            amount: existingPendingCustom.amount || enrollmentTotal,
            unlocked_lessons:
              installmentType === "first_half"
                ? getHalfPaymentLessons(mergedHours || 10)
                : unlockedLessons,
            progress: customProgress,
          })
          .eq("id", existingPendingCustom.id);
        if (updateError) throw updateError;
      } else if (selectedModules.length > 0) {
        const { error: insertError } = await client.from("enrollment").insert([
          {
            learner_id: learnerId,
            course_id: null,
            payment_id: paymentRecord.id,
            status: "pending",
            payment_status: "pending",
            installment_mode: installmentType || "full",
            installment1_amount: roundAmount(body.installment1Amount) || null,
            installment2_amount: roundAmount(body.installment2Amount) || null,
            amount: enrollmentTotal,
            unlocked_lessons:
              installmentType === "first_half"
                ? getHalfPaymentLessons(mergedHours || 10)
                : unlockedLessons,
            progress: customProgress,
          },
        ]);
        if (insertError) throw insertError;
      }
    }

    // ---------------------------------------------------------------------------
    // 4. Order (test => synthetic; live => Razorpay Orders API)
    // ---------------------------------------------------------------------------
    let orderId: string;
    if (testMode) {
      orderId = `order_test_${String(paymentRecord.id).replace(/-/g, "")}`;
      await client
        .from("payment")
        .update({ gateway_reference: orderId })
        .eq("id", paymentRecord.id);
    } else {
      try {
        const razorpayOrderData = {
          amount: Math.round(amount * 100), // paise
          currency: "INR",
          receipt: `ORD-${String(paymentRecord.id)}`,
          notes: {
            payment_id: String(paymentRecord.id),
            learner_id: learnerId,
            payment_type: paymentType,
          },
        };
        const basicAuth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
        const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${basicAuth}`,
          },
          body: JSON.stringify(razorpayOrderData),
        });
        const razorpayOrder = await razorpayResponse.json();
        if (!razorpayResponse.ok) {
          console.error("Razorpay error:", razorpayOrder);
          throw new BookingError(
            502,
            "payment_gateway_error",
            razorpayOrder.error?.description || "Failed to create Razorpay order.",
          );
        }
        orderId = String(razorpayOrder.id);
        await client
          .from("payment")
          .update({ gateway_reference: orderId })
          .eq("id", paymentRecord.id);
      } catch (gatewayError) {
        if (gatewayError instanceof BookingError) throw gatewayError;
        console.error("Razorpay order creation failed:", gatewayError);
        throw new BookingError(
          502,
          "payment_gateway_error",
          "Could not reach the payment gateway. Please try again.",
        );
      }
    }

    console.log("create-razorpay-order:", { testMode, paymentId: paymentRecord.id, orderId, paymentType });

    return jsonResponse({
      success: true,
      orderId,
      paymentId: paymentRecord.id,
      amount: Math.round(amount * 100),
      currency: "INR",
      keyId: testMode ? "" : razorpayKeyId,
      testMode,
    });
  } catch (error) {
    return errorResponse(error);
  }
});