// review-booking — Ops approval of paid funnel bookings whose lessons are still
// in the 'tentative' state (they were released at confirm as "held, pending
// approval"; nothing is on the live roster yet). Used by the hosted app's
// "Learner Requests from Funnel" view.
//
//   action = list    -> every booking with at least one tentative Schedule row,
//                       joined with the learner + course + instructor + amounts.
//                       Bookings whose learner has an OPEN licence-resubmission
//                       request (see `reject`) are hidden — the card must vanish
//                       until the learner re-uploads, then it returns.
//   action = approve {bookingId} -> review_booking_slots('approve')   tentative->booked
//                       Also clears any open licence-resubmission request.
//   action = reject  {bookingId, reason} -> NO cancellation. The lessons stay
//                       'tentative' (a booking-level reject cannot approve a
//                       request, so it simply remains in the review queue) and the
//                       learner is emailed to RESUBMIT their LL/DL documents.
//                       Any already-'booked' lesson of the booking is pushed back
//                       to 'tentative' so the invariant "approved ⇒ booked,
//                       otherwise tentative" holds. Nothing is cancelled and the
//                       payment is untouched; releasing a slot is a separate
//                       module, out of scope here. The (required) ops reason is
//                       included in the email.
//                       An open licence-resubmission request is recorded on the
//                       booking's `enrollment` (licence_resubmission_requested_at
//                       / _reason): it HIDES this card from `list` and makes the
//                       learner webapp show its document-upload window. The
//                       learner app clears it on re-upload, bringing the card
//                       back.
//   action = revert  {bookingId | learnerId} -> any 'booked' lessons of that
//                       booking (or of every funnel booking of the learner) are
//                       pushed back to 'tentative' (isTentative=true,
//                       enabled=false) so they re-enter the review queue. Used
//                       when a learner's document is rejected: the lessons must
//                       not stay live on the roster while their documents are
//                       unresolved. Booking stays 'confirmed', so nothing is
//                       cancelled and the payment is untouched.
//
// No docs are returned here: the hosted app looks up the learner's uploaded
// documents directly (ll_applications / ll_documents / LL bucket by phone).
//
// Admin-only: the caller's JWT signature is validated, then access is granted
// when the email is on the admin allowlist OR the user's phone resolves to a
// row in the `Admin` table (see _shared/admin.ts — admins log in by phone).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { verifyAdmin } from "../_shared/admin.ts";
import { toOneRow } from "../_shared/embed.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PORTAL_URL = "https://inlane-web-app.vercel.app/home";
const SUPPORT = {
  email: "support@inlane.in",
  phone: "080 40266972",
  whatsapp: "6360739863",
  hours: "6:30 AM to 8:00 PM (IST), Monday - Sunday",
};

// Type definitions for the list query result
interface ListBookingRow {
  id: string;
  case_type: string;
  learner_id: string | null;
  course_id: string | null;
  total_amount: number | null;
  installment1_amount: number | null;
  created_at: string;
  Learner:
    | { id: string; name: string | null; phone: string | null; email: string | null }
    | { id: string; name: string | null; phone: string | null; email: string | null }[]
    | null;
  Courses: { id: string; name: string | null } | null;
  Schedule: Array<{
    id: number | string;
    date: string;
    start_time: string;
    end_time: string;
    Instructor: { id_instructor: string; name: string | null } | null;
  }>;
}

/**
 * The `enrollment` row the funnel created for a booking — matched on learner +
 * course (course is null for rto_only, which creates no enrollment and has no
 * lessons, so it never reaches the review queue). Writing the licence-
 * resubmission marker here is what hides the card from `list` and makes the
 * learner webapp show its upload nudge; the learner app clears it on re-upload.
 */
async function setFunnelEnrollmentResubmission(
  client: ReturnType<typeof serviceClient>,
  booking: { learner_id?: string | null; course_id?: string | null },
  patch: {
    licence_resubmission_requested_at: string | null;
    licence_resubmission_reason: string | null;
  },
): Promise<void> {
  const learnerId = booking.learner_id ?? null;
  if (!learnerId) return;
  let query = client
    .from("enrollment")
    .update(patch)
    .eq("learner_id", learnerId);
  // Prefer the exact course enrollment; fall back to the funnel marker when the
  // course is unknown (rto_only bookings carry no course).
  query = booking.course_id
    ? query.eq("course_id", booking.course_id)
    : query.eq("acquired_via_funnel", true);
  const { error } = await query;
  if (error) throw error;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRejectContent(
  name: string,
  reason?: string,
): { html: string; text: string } {
  const safeName = escapeHtml(name);
  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  const safeReason = escapeHtml(cleanReason);
  const reasonHtml = cleanReason
    ? `<p><strong>Reason:</strong> ${safeReason}</p>`
    : "";
  const reasonText = cleanReason ? `\n\nReason: ${cleanReason}` : "";
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
<div style="max-width:640px;margin:0 auto;padding:32px 20px;">
<div style="background:#ffffff;border-radius:12px;overflow:hidden;">
<div style="background:#00ce84;padding:20px 28px;">
<h1 style="margin:0;color:#ffffff;font-size:22px;">lane — Please resubmit your documents</h1>
</div>
<div style="padding:28px;">
<p>Dear ${safeName},</p>
<p>Thank you for booking with <strong>Lane Driving School!</strong></p>
<p>Your reserved slot is still held for you and <strong>your payment is safe</strong>. Before we can confirm your lessons, we need you to <strong>resubmit your LL/DL documents</strong> — some of the details we received need another look.</p>
${reasonHtml}
<p>Please resubmit your documents on the portal so our team can confirm your schedule:</p>
<p style="text-align:center;margin:24px 0;">
<a href="${PORTAL_URL}" style="background:#00ce84;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Open the portal</a>
</p>
<h2 style="font-size:16px;color:#111;border-bottom:2px solid #00ce84;padding-bottom:8px;">Need help?</h2>
<p>Our <strong>Support &amp; Operations team</strong> is happy to assist:</p>
<ul>
<li><strong>Email:</strong> <a href="mailto:${SUPPORT.email}" style="color:#00a86b;">${SUPPORT.email}</a></li>
<li><strong>Phone:</strong> ${SUPPORT.phone}</li>
<li><strong>WhatsApp:</strong> ${SUPPORT.whatsapp}</li>
<li><strong>Support Hours:</strong> ${SUPPORT.hours}</li>
</ul>
<p>Warm regards,<br/><strong>Team lane</strong></p>
</div>
</div>
</div>
</body>
</html>`;
  const text = `Dear ${name},

Thank you for booking with **Lane Driving School!**

Your reserved slot is still held for you and **your payment is safe**. Before we can confirm your lessons, we need you to **resubmit your LL/DL documents** — some of the details we received need another look.${reasonText}

Please resubmit your documents on the portal so our team can confirm your schedule:

${PORTAL_URL}

Need help?
Our Support & Operations team is happy to assist:
Email: ${SUPPORT.email}
Phone: ${SUPPORT.phone}
WhatsApp: ${SUPPORT.whatsapp}
Support Hours: ${SUPPORT.hours}

Warm regards,
Team lane`;
  return { html, text };
}

async function sendRejectEmail(
  email: string,
  learnerName: string,
  reason?: string,
): Promise<boolean> {
  const username = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const from = Deno.env.get("SMTP_FROM") ?? username;
  if (!username || !password || !from) {
    throw new BookingError(
      500,
      "email_not_configured",
      "SMTP credentials are not configured.",
    );
  }

  const { html, text } = buildRejectContent(learnerName, reason);

  let sent = false;
  let smtpClient: SMTPClient | null = null;
  try {
    smtpClient = new SMTPClient({
      connection: {
        hostname: Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com",
        port: Number(Deno.env.get("SMTP_PORT") ?? "465"),
        tls: (Deno.env.get("SMTP_TLS") ?? "true") === "true",
        auth: { username, password },
      },
    });
    await smtpClient.send({
      from,
      to: email,
      subject: "lane — Please resubmit your LL/DL documents",
      text,
      html,
    });
    sent = true;
  } finally {
    if (smtpClient) {
      try {
        await smtpClient.close();
      } catch {
        // Ignore close errors — the send result already decided the outcome.
      }
    }
  }
  return sent;
}

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const client = serviceClient();

    // Admin-only access: validate the JWT, then allow the email allowlist or a
    // phone that resolves to an `Admin` row (admins log in by phone).
    const admin = await verifyAdmin(req, client);
    if (!admin.ok) {
      console.warn("review-booking: admin check failed", {
        reason: admin.reason,
        email: admin.email,
        phone: admin.phone,
      });
      return jsonResponse(
        { error: { code: "forbidden", message: "Admin access required." } },
        403,
      );
    }

    // The hosted app only ever POSTs; anything else (e.g. a GET) is a client
    // mistake, not a server failure — answer 405 instead of crashing in
    // `req.json()` below.
    if (req.method !== "POST") {
      return jsonResponse(
        { error: { code: "method_not_allowed", message: "Use POST." } },
        405,
      );
    }

    // Parse defensively: a malformed/absent JSON body is a 422 client error,
    // never a 500.
    let body: {
      action?: string;
      bookingId?: string;
      learnerId?: string;
      reason?: string;
    };
    try {
      const raw = await req.text();
      body = raw
        ? (JSON.parse(raw) as {
            action?: string;
            bookingId?: string;
            learnerId?: string;
            reason?: string;
          })
        : {};
    } catch {
      throw new BookingError(
        422,
        "validation_error",
        "Request body must be valid JSON.",
      );
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new BookingError(
        422,
        "validation_error",
        "Request body must be a JSON object.",
      );
    }

    const action = String(body.action ?? "").trim();
    if (!["list", "approve", "reject", "revert"].includes(action)) {
      throw new BookingError(
        422,
        "validation_error",
        'action must be one of "list", "approve", "reject", "revert".',
      );
    }

    // list — every booking with at least one tentative lesson, newest first.
    if (action === "list") {
      const { data: rows, error } = await client
        .from("booking")
        .select(
          `id, case_type, learner_id, course_id, total_amount, installment1_amount, created_at,
           Learner!inner(id, name, phone, email),
           Courses(id, name),
           Schedule!booking_id!inner(id, date, start_time, end_time, Instructor(id_instructor, name))`,
        )
        .eq("Schedule.status", "tentative")
        // Only reviewable bookings: the RPC refuses anything whose status is
        // not confirmed/payment_completed (409 invalid_state), so the list must
        // not surface rows approve/reject could never act on (e.g. an
        // abandoned 'created' booking with stray tentative rows).
        .in("status", ["confirmed", "payment_completed"])
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Hide bookings whose learner has an OPEN licence-resubmission request:
      // Ops already asked them to re-upload, so the card must not look like a
      // fresh request. The learner app clears the marker on re-upload and the
      // card returns (see `reject`). Matched on the funnel enrollment the
      // booking created — learner + course.
      const allRows = (rows as ListBookingRow[] | null) ?? [];
      const requestKey = (learnerId: string | null, courseId: string | null) =>
        `${learnerId ?? ""}:${courseId ?? ""}`;
      const awaitingResubmission = new Set<string>();
      const learnerIds = [
        ...new Set(
          allRows
            .map((b) => b.learner_id)
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      ];
      if (learnerIds.length > 0) {
        try {
          const { data: flagged, error: flaggedError } = await client
            .from("enrollment")
            .select("learner_id, course_id, licence_resubmission_requested_at")
            .in("learner_id", learnerIds)
            .not("licence_resubmission_requested_at", "is", null);
          if (flaggedError) throw flaggedError;
          for (const e of flagged ?? []) {
            awaitingResubmission.add(requestKey(e.learner_id, e.course_id));
          }
        } catch (flagError) {
          // The column is additive DDL that may not be applied yet. Degrade to
          // the pre-feature behaviour (show every tentative booking) rather than
          // failing the whole review queue — same "deploy ahead of the manual
          // DDL" tolerance used elsewhere.
          console.error(
            "review-booking: resubmission filter unavailable (list unfiltered)",
            {
              error:
                flagError instanceof Error ? flagError.message : flagError,
            },
          );
        }
      }

      const requests = allRows
        .filter((b) => !awaitingResubmission.has(requestKey(b.learner_id, b.course_id)))
        .map((b) => {
        // `Learner` is embedded as a to-one object (PostgREST many-to-one);
        // `toOneRow` also tolerates an array if the relationship ever flips.
        const learner = toOneRow(b.Learner);
        const course = b.Courses;
        const slots = (b.Schedule || [])
          .map((s) => ({
            scheduleId: s.id,
            date: String(s.date),
            start_time: String(s.start_time),
            end_time: String(s.end_time),
            instructorId: s.Instructor?.id_instructor ?? null,
            instructorName: s.Instructor?.name ?? null,
          }))
          // Deterministic, chronological slot order for the UI (PostgREST
          // embeds carry no ORDER BY, so without this the order follows the
          // embedding row order).
          .sort((x, y) =>
            x.date.localeCompare(y.date) ||
            x.start_time.localeCompare(y.start_time)
          );
        return {
          bookingId: b.id,
          caseType: b.case_type,
          totalAmount: b.total_amount,
          installment1Amount: b.installment1_amount,
          createdAt: b.created_at,
          learner: learner
            ? {
                id: learner.id,
                name: learner.name ?? null,
                phone: learner.phone ?? null,
                email: learner.email ?? null,
              }
            : null,
          course: course
            ? { id: course.id, name: course.name ?? null }
            : null,
          slots,
        };
      });

      console.log("review-booking: list", { count: requests.length });
      return jsonResponse({ ok: true, requests });
    }

    // revert — push live ('booked') lessons back to 'tentative' so they leave
    // the roster and re-enter the review queue. Triggered when a learner's
    // document is rejected; nothing is cancelled and the booking/payment are
    // untouched. Scope by bookingId, or by learnerId (every funnel booking of
    // that learner — the RTO pipeline knows the learner, not the booking).
    if (action === "revert") {
      if (body.bookingId && !UUID_RE.test(body.bookingId)) {
        throw new BookingError(422, "validation_error", "Invalid booking id.");
      }
      if (body.learnerId && !UUID_RE.test(body.learnerId)) {
        throw new BookingError(422, "validation_error", "Invalid learner id.");
      }
      if (!body.bookingId && !body.learnerId) {
        throw new BookingError(
          422,
          "validation_error",
          "A booking id or a learner id is required.",
        );
      }

      let query = client
        .from("Schedule")
        .update({ status: "tentative", isTentative: true, enabled: false })
        .eq("status", "booked")
        .not("booking_id", "is", null);
      query = body.bookingId
        ? query.eq("booking_id", body.bookingId)
        : query.eq("learner_id", body.learnerId);

      const { data: reverted, error: revertError } = await query.select("id");
      if (revertError) throw revertError;

      const flipped = (reverted ?? []).length;
      console.log("review-booking: revert", {
        bookingId: body.bookingId ?? null,
        learnerId: body.learnerId ?? null,
        flipped,
      });
      return jsonResponse({ ok: true, action: "revert", flipped });
    }

    // approve / reject — a valid booking id is required.
    if (!body.bookingId || !UUID_RE.test(body.bookingId)) {
      throw new BookingError(422, "validation_error", "A valid booking id is required.");
    }

    // Reject requires an ops reason — it is emailed to the learner so they know
    // what to resubmit. Validate it before touching any state.
    const rejectReason =
      typeof body.reason === "string" ? body.reason.trim() : "";
    if (action === "reject" && !rejectReason) {
      throw new BookingError(
        422,
        "validation_error",
        "A rejection reason is required.",
      );
    }

    // Both actions need the booking + learner (reject for the email; approve to
    // fail loudly on an unknown id rather than silently no-op'ing).
    const { data: bookingRow, error: bookingError } = await client
      .from("booking")
      .select("id, learner_id, course_id, Learner!inner(id, name, email)")
      .eq("id", body.bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!bookingRow) {
      throw new BookingError(404, "booking_not_found", "Booking not found.");
    }
    // `Learner` embeds as a to-one object — never index `[0]` on it (that
    // silently skipped every rejection email). `toOneRow` handles both shapes.
    const embed = bookingRow as {
      Learner?: Parameters<typeof toOneRow>[0];
    };
    const learnerRow = toOneRow(embed?.Learner) as
      | { id?: string; name?: string | null; email?: string | null }
      | null;

    // reject — a booking-level reject does NOT cancel anything. The lessons are
    // already 'tentative' (paid, awaiting ops) and simply STAY tentative, so the
    // request remains in the review queue and the slot stays held; the learner is
    // emailed to resubmit their LL/DL documents. If a lesson had already been
    // approved ('booked') it is pushed back to 'tentative' so the invariant
    // "approved ⇒ booked, otherwise tentative" holds. Nothing is cancelled and
    // the payment is untouched — releasing a slot is a separate module, out of
    // scope here.
    if (action === "reject") {
      // Record the resubmission request first. It is the part BOTH UIs key off
      // (the queue hides the card; the learner app shows the upload window), and
      // doing it before the idempotent lesson flip means a failure here leaves
      // nothing half-changed.
      const bookingEnrollmentRef = bookingRow as {
        learner_id?: string | null;
        course_id?: string | null;
      };
      try {
        await setFunnelEnrollmentResubmission(client, bookingEnrollmentRef, {
          licence_resubmission_requested_at: new Date().toISOString(),
          licence_resubmission_reason: rejectReason,
        });
      } catch (markerError) {
        // Additive DDL may not be applied yet. The email + the lesson state are
        // still correct, so degrade to the pre-feature behaviour (card stays
        // visible) instead of failing the reject outright.
        console.error(
          "review-booking: reject resubmission marker write failed",
          {
            bookingId: body.bookingId,
            error:
              markerError instanceof Error ? markerError.message : markerError,
          },
        );
      }

      const { data: reverted, error: revertError } = await client
        .from("Schedule")
        .update({ status: "tentative", isTentative: true, enabled: false })
        .eq("status", "booked")
        .not("booking_id", "is", null)
        .eq("booking_id", body.bookingId)
        .select("id");
      if (revertError) throw revertError;
      const flipped = (reverted ?? []).length;

      // Best-effort email: the lesson state is already correct at this point, so
      // an SMTP failure must never turn a resubmission request into a 500 (the
      // admin retry would then confusingly re-send the email).
      let sent = false;
      const learnerEmail = learnerRow?.email;
      const learnerName = learnerRow?.name;
      if (typeof learnerEmail === "string" && learnerEmail.trim()) {
        try {
          sent = await sendRejectEmail(
            learnerEmail.trim(),
            typeof learnerName === "string" ? learnerName : "",
            rejectReason,
          );
        } catch (emailError) {
          // Lesson state + ok response still stand; surface only in logs.
          console.error("review-booking: reject email failed", {
            bookingId: body.bookingId,
            error: emailError instanceof Error ? emailError.message : emailError,
          });
        }
      }

      console.log("review-booking: reject (lessons kept tentative)", {
        bookingId: body.bookingId,
        flipped,
        sent,
      });

      return jsonResponse({
        ok: true,
        action: "reject",
        flipped,
        booking: { id: body.bookingId },
        emailSent: sent,
        resubmissionRequested: true,
      });
    }

    // approve — tentative -> booked, atomically (the RPC also clears isTentative
    // and sets enabled=true).
    const { data: rpcResult, error: rpcError } = await client.rpc(
      "review_booking_slots",
      { p_booking_id: body.bookingId, p_action: "approve" },
    );
    if (rpcError) throw rpcError;

    const rpcOut = (rpcResult ?? {}) as {
      ok?: boolean;
      error?: string;
      message?: string;
      action?: string;
      flipped?: number;
      already_applied?: boolean;
    };

    if (!rpcOut.ok) {
      if (rpcOut.error === "not_found") {
        throw new BookingError(404, "booking_not_found", rpcOut.message ?? "Booking not found.");
      }
      if (rpcOut.error === "invalid_state") {
        throw new BookingError(409, "invalid_state", rpcOut.message ?? "This booking has no lessons awaiting review.");
      }
      throw new BookingError(409, "review_failed", rpcOut.message ?? "We couldn't update this booking right now.");
    }

    if (rpcOut.already_applied) {
      // Defensive: clearing is normally done by the learner's re-upload, but an
      // approved booking must never stay hidden by a stale marker. Best-effort.
      try {
        await setFunnelEnrollmentResubmission(client, bookingRow as {
          learner_id?: string | null;
          course_id?: string | null;
        }, {
          licence_resubmission_requested_at: null,
          licence_resubmission_reason: null,
        });
      } catch (clearError) {
        console.error("review-booking: approve clear resubmission failed", {
          bookingId: body.bookingId,
          error: clearError instanceof Error ? clearError.message : clearError,
        });
      }
      return jsonResponse({
        ok: true,
        alreadyApplied: true,
        action: rpcOut.action,
        flipped: 0,
        booking: { id: body.bookingId },
      });
    }

    // Defensive clear — same reasoning as the already_applied branch above.
    try {
      await setFunnelEnrollmentResubmission(client, bookingRow as {
        learner_id?: string | null;
        course_id?: string | null;
      }, {
        licence_resubmission_requested_at: null,
        licence_resubmission_reason: null,
      });
    } catch (clearError) {
      console.error("review-booking: approve clear resubmission failed", {
        bookingId: body.bookingId,
        error: clearError instanceof Error ? clearError.message : clearError,
      });
    }

    console.log("review-booking:", {
      action,
      bookingId: body.bookingId,
      flipped: rpcOut.flipped,
    });

    return jsonResponse({
      ok: true,
      action: rpcOut.action,
      flipped: rpcOut.flipped,
      booking: { id: body.bookingId },
      emailSent: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
});