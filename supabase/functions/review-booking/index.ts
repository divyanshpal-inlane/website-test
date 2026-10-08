// review-booking — Ops approval of paid funnel bookings whose lessons are still
// in the 'tentative' state (they were released at confirm as "held, pending
// approval"; nothing is on the live roster yet). Used by the hosted app's
// "Learner Requests from Funnel" view.
//
//   action = list    -> every booking with at least one tentative Schedule row,
//                       joined with the learner + course + instructor + amounts.
//   action = approve {bookingId} -> review_booking_slots('approve')   tentative->booked
//   action = reject  {bookingId} -> review_booking_slots('reject')    tentative->cancelled
//                                   + rejection email to the learner.
//
// No docs are returned here: the hosted app looks up the learner's uploaded
// documents directly (ll_applications / ll_documents / LL bucket by phone).
//
// Admin-only: requires valid JWT with admin role or email in admin allowlist.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PORTAL_URL = "https://inlane-web-app.vercel.app/home";
const SUPPORT = {
  email: "support@inlane.in",
  phone: "080 40266972",
  whatsapp: "6360739863",
  hours: "6:30 AM to 8:00 PM (IST), Monday - Sunday",
};

// Admin emails allowlist - add emails of users who should have access
const ADMIN_EMAILS = new Set([
  "admin@inlane.in",
  "ops@inlane.in",
  "support@inlane.in",
]);

// Type definitions for the list query result
interface ListBookingRow {
  id: string;
  case_type: string;
  total_amount: number | null;
  installment1_amount: number | null;
  created_at: string;
  Learner: Array<{ id: string; name: string | null; phone: string | null; email: string | null }>;
  Courses: { id: string; name: string | null } | null;
  Schedule: Array<{
    id: number | string;
    date: string;
    start_time: string;
    end_time: string;
    Instructor: { id: string; name: string | null } | null;
  }>;
}

function getUserFromAuth(req: Request): { email: string } | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const jwt = authHeader.slice(7);
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    return { email: payload.email ?? "" };
  } catch {
    return null;
  }
}

async function verifyAdmin(req: Request): Promise<boolean> {
  const user = getUserFromAuth(req);
  if (!user?.email) return false;
  return ADMIN_EMAILS.has(user.email.toLowerCase());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRejectContent(name: string): { html: string; text: string } {
  const safeName = escapeHtml(name);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
<div style="max-width:640px;margin:0 auto;padding:32px 20px;">
<div style="background:#ffffff;border-radius:12px;overflow:hidden;">
<div style="background:#00ce84;padding:20px 28px;">
<h1 style="margin:0;color:#ffffff;font-size:22px;">lane — Lesson confirmation pending</h1>
</div>
<div style="padding:28px;">
<p>Dear ${safeName},</p>
<p>Thank you for booking with <strong>Lane Driving School!</strong></p>
<p>We could not confirm your lessons yet because some details in your application need attention. Your reserved lesson slots have been released, and <strong>your payment is safe</strong>.</p>
<p>Please review and re-upload your documents on the portal so our team can confirm your schedule:</p>
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

We could not confirm your lessons yet because some details in your application need attention. Your reserved lesson slots have been released, and **your payment is safe**.

Please review and re-upload your documents on the portal so our team can confirm your schedule:

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

  const { html, text } = buildRejectContent(learnerName);

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
      subject: "lane — Please review your booking details",
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

  // Admin-only access
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) {
    return jsonResponse(
      { error: { code: "forbidden", message: "Admin access required." } },
      403,
    );
  }

  try {
    const client = serviceClient();
    const body = (await req.json()) as {
      action?: string;
      bookingId?: string;
    };

    const action = String(body.action ?? "").trim();
    if (!["list", "approve", "reject"].includes(action)) {
      throw new BookingError(
        422,
        "validation_error",
        'action must be one of "list", "approve", "reject".',
      );
    }

    // list — every booking with at least one tentative lesson, newest first.
    if (action === "list") {
      const { data: rows, error } = await client
        .from("booking")
        .select(
          `id, case_type, total_amount, installment1_amount, created_at,
           Learner!inner(id, name, phone, email),
           Courses(id, name),
           Schedule!booking_id(id, date, start_time, end_time, Instructor(id, name))`,
        )
        .eq("Schedule.status", "tentative")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const requests = (rows as ListBookingRow[] || []).map((b) => {
        const learner = b.Learner || [];
        const course = b.Courses;
        const slots = (b.Schedule || []).map((s) => ({
          scheduleId: s.id,
          date: String(s.date),
          start_time: String(s.start_time),
          end_time: String(s.end_time),
          instructorId: s.Instructor?.id ?? null,
          instructorName: s.Instructor?.name ?? null,
        }));
        return {
          bookingId: b.id,
          caseType: b.case_type,
          totalAmount: b.total_amount,
          installment1Amount: b.installment1_amount,
          createdAt: b.created_at,
          learner: learner[0]
            ? {
                id: learner[0].id,
                name: learner[0].name ?? null,
                phone: learner[0].phone ?? null,
                email: learner[0].email ?? null,
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

    // approve / reject — a valid booking id is required.
    if (!body.bookingId || !UUID_RE.test(body.bookingId)) {
      throw new BookingError(422, "validation_error", "A valid booking id is required.");
    }

    const { data: rpcResult, error: rpcError } = await client.rpc(
      "review_booking_slots",
      { p_booking_id: body.bookingId, p_action: action },
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
      return jsonResponse({
        ok: true,
        alreadyApplied: true,
        action: rpcOut.action,
        flipped: 0,
        booking: { id: body.bookingId },
      });
    }

    // Reject: after the atomic slot release, email the learner with next steps.
    let sent = false;
    if (action === "reject") {
      const { data: learner } = await client
        .from("booking")
        .select("id, Learner!inner(id, name, email)")
        .eq("id", body.bookingId)
        .maybeSingle();
      const l = (learner as { Learner?: Record<string, unknown>[] } | null);
      const learnerEmail = l?.Learner?.[0]?.email;
      const learnerName = l?.Learner?.[0]?.name;
      if (typeof learnerEmail === "string" && learnerEmail.trim()) {
        sent = await sendRejectEmail(
          learnerEmail.trim(),
          typeof learnerName === "string" ? learnerName : "",
        );
      }
    }

    console.log("review-booking:", {
      action,
      bookingId: body.bookingId,
      flipped: rpcOut.flipped,
      sent,
    });

    return jsonResponse({
      ok: true,
      action: rpcOut.action,
      flipped: rpcOut.flipped,
      booking: { id: body.bookingId },
      emailSent: sent,
    });
  } catch (error) {
    return errorResponse(error);
  }
});