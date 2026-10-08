// Direct booking configuration for the website.
// Publishes the serviceable areas, enabled courses, the add-on catalogue and
// the flow rules — all read from the DB, never hardcoded. When the flow is
// disabled (app_settings.booking_flow.enabled = false) only { enabled: false }
// is returned so the site can render a "coming soon" state.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";

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
    const rules = {
      holdMinutes: config.hold_minutes,
      bookingDaysAhead: config.booking_days_ahead,
      slotGridMinutes: config.gridMinutes,
      slotDurationMinutes: config.slotDurationMinutes,
      slotStart: config.slotStart,
      slotEnd: config.slotEnd,
      maxSlotsPerBooking: config.max_slots_per_booking,
      instructorGapMinutes: config.instructor_gap_minutes,
      femaleInstructorMode: config.female_instructor_mode,
      installmentModes: config.installment_modes,
      paymentMode: config.payment_mode,
    };

    if (!config.enabled) {
      console.log("get-booking-config: flow disabled");
      return jsonResponse({ enabled: false, rules, gateway: config.gateway });
    }

    const [areas, courses, addons, courseAddons] = await Promise.all([
      client
        .from("Serviceable_Areas")
        .select("id, name")
        .eq("active", true)
        .order("name"),
      client
        .from("Courses")
        .select("id, name, code, description, is_recommended, duration, total_lessons, price")
        .or("enabled.is.null,enabled.eq.true")
        .order("created_at"),
      client
        .from("booking_addons")
        .select("id, code, name, description, price")
        .eq("active", true)
        .order("sort_order"),
      client.from("course_addons").select("course_id, addon_id, included"),
    ]);

    return jsonResponse({
      enabled: true,
      gateway: config.gateway,
      rules,
      areas: (areas.data || []).map((a) => ({
        id: a.id,
        name: a.name,
      })),
      courses: (courses.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        description: c.description || null,
        isRecommended: Boolean(c.is_recommended),
        duration: Number(c.duration) || 0,
        totalLessons: Number(c.total_lessons) || 0,
        price: Number(c.price) || 0,
      })),
      addons: (addons.data || []).map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        description: a.description,
        price: Number(a.price) || 0,
      })),
      courseAddons: (courseAddons.data || []).map((row) => ({
        courseId: row.course_id,
        addonId: row.addon_id,
        included: Boolean(row.included),
      })),
      pricing: { currency: "INR" },
    }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
  } catch (error) {
    return errorResponse(error);
  }
});