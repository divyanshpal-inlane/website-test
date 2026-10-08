// change-booking-slot — the slot picker + change API for a held booking.
//
// Two modes:
//   GET-like (no date/start): returns candidate date/time slots for the SAME
//     hidden instructor of the held lesson (their free grid in the window,
//     minus this booking's other lessons and the current slot). The customer
//     only ever sees dates/times.
//   change (date+start): atomically moves the held lesson to the new time via
//     the change_booking_slot RPC. The new slot is pre-checked against the
//     engine and the DB exclusion constraint is the backstop, so the old slot
//     stays if the new one is taken.
//
// Works for both held (created / payment_completed, within the hold window)
// and confirmed (paid) bookings. For created bookings the hold window is
// enforced: once created_at's hold period lapses, slot changes are refused
// (the create/confirm flow governs expiry). Confirmed / payment_completed
// bookings are outside the hold window and their picked lessons (status
// 'booked') can always be rescheduled.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";
import {
  buildInstructorFreeGrid,
  candidateStartMinutes,
  validateConsecutiveRule,
  type InstructorLike,
  type ScheduleBlock,
} from "../_shared/availability.ts";
import {
  addDaysISO,
  istTodayISO,
  isValidDateISO,
  isValidTime,
  minutesToTime,
  timeToMinutes,
} from "../_shared/validation.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChangeRequest {
  bookingId?: string;
  scheduleId?: number | string;
  date?: string;
  start?: string;
}

function toMinutes(time: string): number {
  return timeToMinutes(time);
}

async function loadInstructor(
  client: ReturnType<typeof serviceClient>,
  instructorId: string,
): Promise<InstructorLike | null> {
  const { data } = await client
    .from("Instructor")
    .select("id_instructor, areas, radius, latitude, longitude, gender, unavailability, status, enabled")
    .eq("id_instructor", instructorId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id_instructor),
    areas: (data.areas as string[] | null) || [],
    radiusKm: data.radius == null ? null : Number(data.radius),
    lat: data.latitude == null ? null : Number(data.latitude),
    lng: data.longitude == null ? null : Number(data.longitude),
    gender: data.gender == null ? null : String(data.gender),
    status: data.status == null ? null : String(data.status),
    enabled: data.enabled == null ? null : Boolean(data.enabled),
    unavailability: data.unavailability as unknown[] | null,
  };
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

    const body = (await req.json()) as ChangeRequest;
    if (!body.bookingId || !UUID_RE.test(body.bookingId)) {
      throw new BookingError(422, "validation_error", "A valid booking id is required.");
    }
    const scheduleId = Number(body.scheduleId);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      throw new BookingError(422, "validation_error", "A valid held lesson id is required.");
    }

    const { data: booking } = await client
      .from("booking")
      .select("id, learner_id, course_id, area_name, status, created_at, selected_slots")
      .eq("id", body.bookingId)
      .maybeSingle();
    if (!booking) {
      throw new BookingError(404, "booking_not_found", "Booking not found.");
    }
    const bookingId = String(booking.id);
    const status = String(booking.status);
    if (status !== "created" && status !== "payment_completed" && status !== "confirmed") {
      throw new BookingError(
        409,
        "invalid_state",
        `Lesson changes are only possible for bookings being paid for or already confirmed (current state: ${status}).`,
      );
    }

    const holdMs = config.hold_minutes * 60 * 1000;
    if (status !== "confirmed" && status !== "payment_completed") {
      const createdMs = new Date(String(booking.created_at)).getTime();
      if (Date.now() - createdMs > holdMs) {
        throw new BookingError(
          409,
          "hold_expired",
          `Your ${config.hold_minutes}-minute reservation window expired. Please restart from the schedule step to pick fresh lesson times.`,
        );
      }
    }

    const { data: scheduleRow } = await client
      .from("Schedule")
      .select("id, date, start_time, end_time, status, instructor_id, booking_id")
      .eq("id", scheduleId)
      .maybeSingle();
    if (
      !scheduleRow ||
      String(scheduleRow.booking_id) !== bookingId ||
      !["pending_payment", "booked", "tentative"].includes(String(scheduleRow.status))
    ) {
      throw new BookingError(
        409,
        "slot_not_found",
        "This held lesson was not found for your booking. It may have expired or been released.",
      );
    }
    const instructor = await loadInstructor(client, String(scheduleRow.instructor_id));
    if (!instructor) {
      throw new BookingError(
        409,
        "instructor_unavailable",
        "The trainer for this lesson is no longer available. Please restart your booking.",
      );
    }

    // -------------------------------------------------------------------------
    // Candidate window + free grid for THIS hidden instructor.
    // Blocks = other bookings' active rows + synthetic rows for this booking's
    // own held lessons (current lesson included, so its own time is excluded
    // from the list). Expired pending holds of other bookings are free.
    // -------------------------------------------------------------------------
    const tomorrowIso = addDaysISO(istTodayISO(), 1);
    const dateStarts: string[] = [];
    for (let i = 0; i < config.booking_days_ahead; i++) dateStarts.push(addDaysISO(tomorrowIso, i));
    const dateFrom = dateStarts[0];
    const dateTo = dateStarts[dateStarts.length - 1];

    const { data: scheduleRows } = await client
      .from("Schedule")
      .select("id, instructor_id, date, start_time, end_time, status, booking_id, booking:booking_id(created_at)")
      .eq("instructor_id", scheduleRow.instructor_id)
      .not("status", "in", "(cancelled,rejected)")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("id", { ascending: true })
      .limit(5000);

    const blocks: ScheduleBlock[] = [];
    for (const r of scheduleRows || []) {
      if (String(r.booking_id) === bookingId) {
        // This booking's own held lessons — keep as synthetic blocks so lesson
        // changes never overlap siblings or reuse the exact current slot.
        // ownerBookingId matches input.excludeBookingId so the 30-min travel
        // gap never applies BETWEEN this learner's own lessons.
        const own = {
          instructorId: String(r.instructor_id),
          date: String(r.date),
          startMinute: toMinutes(String(r.start_time)),
          endMinute: toMinutes(String(r.end_time)),
          status: "pending_payment",
          bookingCreatedAt: String(booking.created_at),
          ownerBookingId: bookingId,
        };
        blocks.push(own);
      } else {
        blocks.push({
          instructorId: String(r.instructor_id),
          date: String(r.date),
          startMinute: toMinutes(String(r.start_time)),
          endMinute: toMinutes(String(r.end_time)),
          status: String(r.status),
          bookingCreatedAt: (r.booking as { created_at?: string } | null)?.created_at ?? null,
          ownerBookingId: r.booking_id == null ? null : String(r.booking_id),
        });
      }
    }

    const input = {
      instructors: [instructor],
      learnerArea: String(booking.area_name),
      learner: null,
      blocks,
      dates: dateStarts,
      slotConfig: {
        slotStart: config.slotStart,
        slotEnd: config.slotEnd,
        gridMinutes: config.gridMinutes,
        slotDurationMinutes: config.slotDurationMinutes,
      },
      femalePreference: false,
      femaleMode: config.female_instructor_mode,
      holdMinutes: config.hold_minutes,
      gapMinutes: config.instructor_gap_minutes,
      excludeBookingId: bookingId,
    };

    const freeGrid = buildInstructorFreeGrid(input, [instructor]);
    const freeByDate = freeGrid.get(instructor.id!) ?? new Map<string, number[]>();
    const duration = Math.floor(config.slotDurationMinutes);

    const { data: courseRow } = await client
      .from("Courses")
      .select("total_lessons")
      .eq("id", String(booking.course_id ?? ""))
      .maybeSingle();
    const totalLessons = Number(courseRow?.total_lessons);

    // All of this booking's lessons (held or confirmed), used to keep same-day
    // placements consecutive (max 2/day, back-to-back) when offering change
    // candidates.
    const { data: pendingHoldRows } = await client
      .from("Schedule")
      .select("id, date, start_time, end_time")
      .eq("booking_id", bookingId)
      .in("status", ["pending_payment", "booked", "tentative"])
      .order("id", { ascending: true });
    const heldLessons = (pendingHoldRows || []).map((r) => ({
      id: Number(r.id),
      date: String(r.date),
      start_time: String(r.start_time),
      end_time: String(r.end_time),
    }));

    const replacesTarget = (date: string, start_time: string, end_time: string) =>
      heldLessons.map((l) =>
        l.id === scheduleId
          ? { date, start_time, end_time }
          : { date: l.date, start_time: l.start_time, end_time: l.end_time },
      );

    // -------------------------------------------------------------------------
    // Candidate mode: list all free grid slots for this instructor.
    // -------------------------------------------------------------------------
    const changing = isValidDateISO(String(body.date)) && isValidTime(String(body.start));
    if (!changing) {
      const slots: Array<{ date: string; start_time: string; end_time: string }> = [];
      for (const date of dateStarts) {
        const minutes = freeByDate.get(date) || [];
        for (const m of minutes) {
          const replaced = replacesTarget(date, minutesToTime(m), minutesToTime(m + duration));
          // Only offer placements that keep the consecutive-slot booking rule.
          if (validateConsecutiveRule(replaced)) continue;
          slots.push({
            date,
            start_time: minutesToTime(m),
            end_time: minutesToTime(m + duration),
          });
        }
      }
      return jsonResponse({
        ok: true,
        bookingId,
        scheduleId,
        totalLessons: Number.isInteger(totalLessons) && totalLessons > 0 ? totalLessons : undefined,
        slots,
        message:
          slots.length === 0
            ? "No alternative lesson times are free with your trainer right now. Try again later or restart the booking."
            : undefined,
      });
    }

    // -------------------------------------------------------------------------
    // Change mode: validate + atomically move the held lesson.
    // -------------------------------------------------------------------------
    const newDate = String(body.date);
    const newStart = String(body.start);
    const newStartMinute = toMinutes(newStart);
    const gridStarts = new Set(candidateStartMinutes(config).map((m) => m));

    // Validate date format and compare using Date objects for safety
    const newDateObj = new Date(`${newDate}T00:00:00`);
    const dateFromObj = new Date(`${dateFrom}T00:00:00`);
    const dateToObj = new Date(`${dateTo}T00:00:00`);
    if (Number.isNaN(newDateObj.getTime()) || newDateObj < dateFromObj || newDateObj > dateToObj) {
      throw new BookingError(422, "validation_error", "The picked time is outside the booking window.");
    }
    if (!gridStarts.has(newStartMinute)) {
      throw new BookingError(422, "validation_error", "The picked time is not bookable.");
    }

    const freeMinutes = freeByDate.get(newDate) || [];
    if (!freeMinutes.includes(newStartMinute)) {
      throw new BookingError(
        409,
        "slot_conflict",
        "That time is no longer available or overlaps one of your other lessons. Please pick another slot.",
      );
    }

    // Consecutive-slot rule: the move must keep at most 2 lessons per day with
    // same-day lessons back-to-back (checked again in the DB RPC as backstop).
    const rulePreviewError = validateConsecutiveRule(
      replacesTarget(newDate, newStart, minutesToTime(newStartMinute + duration)),
    );
    if (rulePreviewError) {
      throw new BookingError(
        409,
        "slot_conflict",
        `That change would break the booking rules (${rulePreviewError}). Please pick another slot.`,
      );
    }

    const { data: rpcResult, error: rpcError } = await client.rpc("change_booking_slot", {
      p_booking_id: bookingId,
      p_schedule_id: scheduleId,
      p_new_date: newDate,
      p_new_start: newStart,
    });
    if (rpcError) throw rpcError;
    const rpcOut = (rpcResult ?? {}) as {
      ok?: boolean;
      error?: string;
      message?: string;
      date?: string;
      start_time?: string;
      end_time?: string;
    };
    if (!rpcOut.ok) {
      const rpcCode =
        rpcOut.error === "not_found"
          ? "slot_not_found"
          : rpcOut.error === "hold_expired"
            ? "hold_expired"
            : "slot_conflict";
      throw new BookingError(409, rpcCode, rpcOut.message ?? "We couldn't change that lesson right now. Please try again.");
    }

    // Rebuild selected_slots from the booking's lesson rows (order by id
    // matches the lesson numbering used at confirmation) so day-1 stays
    // consistent.
    const { data: heldRows } = await client
      .from("Schedule")
      .select("id, date, start_time, end_time")
      .eq("booking_id", bookingId)
      .in("status", ["pending_payment", "booked", "tentative"])
      .order("id", { ascending: true });
    const rebuiltSelected = (heldRows || []).map((r, i) => ({
      lesson: i + 1,
      date: String(r.date),
      start_time: String(r.start_time),
      end_time: String(r.end_time),
    }));
    // Defense-in-depth: same-rule check on the authoritative post-change rows.
    const rebuiltRuleError = validateConsecutiveRule(rebuiltSelected);
    if (rebuiltRuleError) {
      throw new BookingError(
        409,
        "slot_conflict",
        `This change conflicts with your other lessons (${rebuiltRuleError}). Please pick another slot.`,
      );
    }
    await client.from("booking").update({ selected_slots: rebuiltSelected }).eq("id", bookingId);

    console.log("change-booking-slot: changed", { bookingId, scheduleId, date: newDate, start: newStart });

    return jsonResponse({
      ok: true,
      scheduleId,
      date: newDate,
      start_time: newStart,
      end_time: rpcOut.end_time ?? minutesToTime(newStartMinute + duration),
      heldSlots: rebuiltSelected,
    });
  } catch (error) {
    return errorResponse(error);
  }
});