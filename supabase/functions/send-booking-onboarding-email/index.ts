// Sends the onboarding + class-guidelines email to a learner who booked through
// the direct funnel AFTER payment is auto-approved. Sent for every case type
// (classes_only / course_rto / rto_only); RTO-only bookings get a trimmed
// template without the class-scheduling guidance. Reuses the same Gmail SMTP
// integration as the hosted app's send-* functions (SMTP_USERNAME /
// SMTP_PASSWORD / SMTP_FROM).
//
// The body is a fixed template from the product team with placeholders for the
// learner's name and the paid advance amount; the portal link and support
// contacts are static product facts.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PORTAL_URL = "https://inlane-web-app.vercel.app/home";
const SUPPORT = {
  email: "support@inlane.in",
  phone: "080 40266972",
  whatsapp: "6360739863",
  hours: "6:30 AM to 8:00 PM (IST), Monday - Sunday",
};

function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) return "₹1,000";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailContent(name: string, amount: number, rtoOnly = false) {
  const safeName = escapeHtml(name);
  const safeAmount = formatINR(amount);
  // RTO-only customers bought paperwork, not classes: onboarding steps 1-4 still
  // apply (account, DOB, signature), but the class-scheduling premise,
  // curriculum and balance-payment guidance do not. Driving cases keep the full
  // product template untouched.
  const scheduleStep = rtoOnly ? "" : `<li><strong>Set your schedule preference, if applicable:</strong><br/>If you enrolled for Driving Classes only, set your preferred class schedule on your dashboard.</li>`;
  const drivingGuidelines = rtoOnly ? "" : `<h2 style="font-size:16px;color:#111;border-bottom:2px solid #00ce84;padding-bottom:8px;">Course Guidelines</h2>
<h2 style="font-size:15px;color:#111;">Class duration and location</h2>
<ul>
<li>Each class is <strong>1 hour in total</strong>, including pick-up, driving instruction, and drop-off.</li>
<li>Pick-up and drop-off must be at the <strong>same location</strong>.</li>
</ul>
<h2 style="font-size:15px;color:#111;">Curriculum</h2>
<ul><li>Classes follow a <strong>structured skill curriculum</strong> rather than a guaranteed distance or kilometre limit.</li></ul>
<h2 style="font-size:15px;color:#111;">Balance payment</h2>
<ul>
<li>Your initial <strong>50% advance covers Lesson 1</strong>.</li>
<li>To avoid any pause in your sessions, clear the remaining balance <strong>before your second driving class</strong>.</li>
</ul>
<h2 style="font-size:15px;color:#111;">Rescheduling</h2>
<ul>
<li>You can reschedule <strong>free of charge up to 12 hours before class</strong>.</li>
<li>For requests made <strong>4 to 12 hours before class</strong>, you receive up to <strong>3 free reschedules</strong>.</li>
<li>After those 3 free reschedules, a fee of <strong>₹200 per class</strong> applies.</li>
<li>A fee of <strong>₹200 per class</strong> also applies to requests made <strong>less than 4 hours before class</strong>.</li>
<li>All rescheduling requests must be directed to <strong>Support</strong>.</li>
</ul>`;
  const promiseLine = rtoOnly
    ? `<p>Our team will reach out to you shortly to start your <strong>RTO paperwork</strong>.</p>`
    : `<p>Your driving classes can only be scheduled after you complete the required onboarding steps below.</p>`;
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
<div style="max-width:640px;margin:0 auto;padding:32px 20px;">
<div style="background:#ffffff;border-radius:12px;overflow:hidden;">
<div style="background:#00ce84;padding:20px 28px;">
<h1 style="margin:0;color:#ffffff;font-size:22px;">Welcome to <strong>Lane Driving School!</strong></h1>
</div>
<div style="padding:28px;">
<p>Dear ${safeName},</p>
<p>Welcome to <strong>Lane Driving School!</strong> We are thrilled to partner with you on your journey toward becoming a confident and safe driver.</p>
<p>We confirm receipt of your <strong>advance payment of ${safeAmount}/-</strong></p>
<h2 style="font-size:16px;color:#111;border-bottom:2px solid #00ce84;padding-bottom:8px;">IMPORTANT: COMPLETE YOUR ONBOARDING</h2>
${promiseLine}
<h2 style="font-size:15px;color:#111;">Complete your onboarding</h2>
<ol>
<li><strong>Open the portal:</strong><br/><a href="${PORTAL_URL}" style="color:#00a86b;">${PORTAL_URL}</a></li>
<li><strong>Create your account:</strong><br/>Click <strong>&quot;Sign Up&quot;</strong> and enter your registered phone number to complete verification.</li>
<li><strong>Verify your Date of Birth:</strong><br/>Sign in and enter your Date of Birth.</li>
<li><strong>Upload your digital signature:</strong><br/>This is mandatory for RTO Form 15 compliance.</li>
${scheduleStep}
</ol>
${drivingGuidelines}
<h2 style="font-size:16px;color:#111;border-bottom:2px solid #00ce84;padding-bottom:8px;">Customer support and contacts</h2>
<p>For all scheduling, account, or class inquiries, our <strong>Support &amp; Operations team</strong> is your primary point of contact:</p>
<ul>
<li><strong>Email:</strong> <a href="mailto:${SUPPORT.email}" style="color:#00a86b;">${SUPPORT.email}</a></li>
<li><strong>Phone:</strong> ${SUPPORT.phone}</li>
<li><strong>WhatsApp:</strong> ${SUPPORT.whatsapp}</li>
<li><strong>Support Hours:</strong> ${SUPPORT.hours}</li>
</ul>
${rtoOnly ? "" : "<p>We look forward to your first driving class!</p>"}
<p>Warm regards,<br/><strong>Team lane</strong></p>
</div>
</div>
</div>
</body>
</html>`;

  const drivingText = rtoOnly
    ? ""
    : `Course Guidelines
Class duration and location
* Each class is 1 hour in total, including pick-up, driving instruction, and drop-off.
* Pick-up and drop-off must be at the same location.

Curriculum
* Classes follow a structured skill curriculum rather than a guaranteed distance or kilometre limit.

Balance payment
* Your initial 50% advance covers Lesson 1.
* To avoid any pause in your sessions, clear the remaining balance before your second driving class.

Rescheduling
* You can reschedule free of charge up to 12 hours before class.
* For requests made 4 to 12 hours before class, you receive up to 3 free reschedules.
* After those 3 free reschedules, a fee of ₹200 per class applies.
* A fee of ₹200 per class also applies to requests made less than 4 hours before class.
* All rescheduling requests must be directed to Support.

`;
  const text = `Dear ${name},

Welcome to **Lane Driving School!** We are thrilled to partner with you on your journey toward becoming a confident and safe driver.

We confirm receipt of your **advance payment of ${safeAmount}/-**

IMPORTANT: COMPLETE YOUR ONBOARDING
${rtoOnly
  ? "Our team will reach out to you shortly to start your RTO paperwork."
  : "Your driving classes can only be scheduled after you complete the required onboarding steps below."}

Complete your onboarding
1. Open the portal: ${PORTAL_URL}
2. Create your account: Click "Sign Up" and enter your registered phone number to complete verification.
3. Verify your Date of Birth: Sign in and enter your Date of Birth.
4. Upload your digital signature: This is mandatory for RTO Form 15 compliance.
${rtoOnly ? "" : "5. Set your schedule preference, if applicable: If you enrolled for Driving Classes only, set your preferred class schedule on your dashboard.\n"}
${drivingText}
Customer support and contacts
For all scheduling, account, or class inquiries, our Support & Operations team is your primary point of contact:
Email: ${SUPPORT.email}
Phone: ${SUPPORT.phone}
WhatsApp: ${SUPPORT.whatsapp}
Support Hours: ${SUPPORT.hours}

${rtoOnly ? "" : "We look forward to your first driving class!\n\n"}
Warm regards,
Team lane`;

  return { html, text };
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

    const body = (await req.json()) as { bookingId?: string };
    if (!body.bookingId || !UUID_RE.test(body.bookingId)) {
      throw new BookingError(422, "validation_error", "A valid booking id is required.");
    }

    const { data: booking } = await client
      .from("booking")
      .select("id, learner_id, case_type, total_amount, installment1_amount")
      .eq("id", body.bookingId)
      .maybeSingle();
    if (!booking) {
      throw new BookingError(404, "booking_not_found", "Booking not found.");
    }

    const { data: learner } = await client
      .from("Learner")
      .select("id, name, email")
      .eq("id", String(booking.learner_id))
      .maybeSingle();
    if (!learner) {
      throw new BookingError(404, "learner_not_found", "Learner record not found.");
    }

    const email = typeof learner.email === "string" && learner.email.trim()
      ? learner.email.trim()
      : null;
    if (!email) {
      throw new BookingError(
        422,
        "email_required",
        "This learner has no email address on file.",
      );
    }

    // Amount the learner was actually charged (first-half advance when they
    // chose it, otherwise the full course total).
    const amount =
      Number(booking.installment1_amount) > 0
        ? Number(booking.installment1_amount)
        : Number(booking.total_amount) > 0
          ? Number(booking.total_amount)
          : 1000;

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

    const { html, text } = buildEmailContent(
      String(learner.name ?? ""),
      amount,
      booking.case_type === "rto_only",
    );

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
        subject: "Welcome to Lane Driving School!",
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

    if (!sent) {
      throw new BookingError(500, "email_failed", "Failed to send the onboarding email.");
    }

    console.log("send-booking-onboarding-email:", { bookingId: body.bookingId, to: email });

    return jsonResponse({ ok: true, sent: true, to: email });
  } catch (error) {
    return errorResponse(error);
  }
});