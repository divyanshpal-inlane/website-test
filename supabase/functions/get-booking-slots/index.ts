// Slot availability for a licensed learner's area/course.
// Returns a schedule-later mode (assign_later) for non-licensed learners. For
// licensed learners it offers a grid of FEASIBLE FIRST lessons: date/time
// slots that at least one area instructor can turn into a full course
// (Courses.total_lessons 1-hour lessons, same instructor). Only the chosen
// instructor's identity is kept server-side; the customer never sees it.
// Passing firstSlot {date,start} returns the server-generated full course plan
// (dates/times only) so the customer can preview the whole schedule.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { fetchAllScheduleWindow, fetchServiceZones, fetchActiveAreas } from "../_shared/queries.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";
import type { BookingFlowConfig } from "../_shared/config.ts";
import { resolveServiceability } from "../_shared/serviceability.ts";
import {
  computeCoursePlan,
  computeFeasibleFirstSlots,
  candidateStartMinutes,
  areaEligibleInstructors,
  isFemale,
  type InstructorLike,
  type ScheduleBlock,
  type SlotPointer,
} from "../_shared/availability.ts";
import { applyPlanEdit, computePlanEditCandidates } from "../_shared/planEdit.ts";
import {
  addDaysISO,
  istTodayISO,
  isValidDateISO,
  isValidTime,
  timeToMinutes,
} from "../_shared/validation.ts";

interface SlotsRequest {
  areaId?: string;
  courseId?: string;
  has_a_DL?: boolean;
  from?: string;
  days?: number;
  femaleInstructorPreference?: boolean;
  learnerLat?: number | null;
  learnerLng?: number | null;
  firstSlot?: { date?: string; start?: string };
  // Plan-edit mode (page-2 "change slot"): editLesson alone returns candidate
  // times for that lesson; with editDate + editStart it applies the change and
  // returns the updated full plan.
  editLesson?: number | null;
  editDate?: string;
  editStart?: string;
}

function toMinutes(time: string): number {
  return timeToMinutes(time);
}

function parseCoordinate(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function parseInstructors(rows: Record<string, unknown>[] | null): InstructorLike[] {
  return (rows || []).map((r) => ({
    id: String(r.id_instructor),
    areas: (r.areas as string[] | null) || [],
    radiusKm: r.radius == null ? null : Number(r.radius),
    lat: r.latitude == null ? null : Number(r.latitude),
    lng: r.longitude == null ? null : Number(r.longitude),
    gender: r.gender == null ? null : String(r.gender),
    status: r.status == null ? null : String(r.status),
    enabled: r.enabled == null ? null : Boolean(r.enabled),
    unavailability: r.unavailability as unknown[] | null,
  }));
}

/** Location-mode gate: both coords present & valid -> "location"; none -> null;
 * exactly one present -> throws 422. */
function locationMode(body: SlotsRequest): { lat: number; lng: number } | null {
  // Support both learnerLat/learnerLng (new) and latitude/longitude (legacy)
  const rawLat = body.learnerLat ?? body.latitude;
  const rawLng = body.learnerLng ?? body.longitude;
  const hasLat = rawLat !== undefined && rawLat !== null && rawLat !== "";
  const hasLng = rawLng !== undefined && rawLng !== null && rawLng !== "";
  if (hasLat !== hasLng) {
    throw new BookingError(
      422,
      "validation_error",
      "Both learner latitude and longitude are required.",
    );
  }
  if (!hasLat) {
    throw new BookingError(
      422,
      "validation_error",
      "Missing learner location.",
    );
  }
  const lat = parseCoordinate(rawLat);
  const lng = parseCoordinate(rawLng);
  if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new BookingError(
      422,
      "validation_error",
      "Invalid learner coordinates.",
    );
  }
  return { lat, lng };
}

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    // return jsonResponse({ debug: "try block entered" });
    
    const client = serviceClient();

    const { data: settingRow } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "booking_flow")
      .maybeSingle();
    const config: BookingFlowConfig = readBookingFlowConfig(settingRow?.value);

    // return jsonResponse({ debug: "config parsed", enabled: config.enabled });

    if (!config.enabled) {
      throw new BookingError(
        422,
        "booking_disabled",
        "Online booking is not available right now.",
      );
    }

    let body: SlotsRequest;
    try {
      body = (await req.json()) as SlotsRequest;
    } catch (e) {
      console.error("get-booking-slots: req.json() failed", e);
      throw new BookingError(422, "validation_error", "Invalid JSON body.");
    }

    if (typeof body.has_a_DL !== "boolean") {
      throw new BookingError(422, "validation_error", "Missing learner licence status.");
    }

    if (typeof body.has_a_DL !== "boolean") {
      throw new BookingError(422, "validation_error", "Missing learner licence status.");
    }

    const ROSTER_COLS =
      "id_instructor, name, areas, radius, latitude, longitude, gender, unavailability, status, enabled";

    // Location mode (learner lat/lng given) is authoritative: the resolved
    // service area replaces the client-supplied areaId entirely. It runs for
    // every learner who sends coordinates (DL or not) so create-booking can
    // never discover a different, unserviceable area later.
    let location: { lat: number; lng: number } | null = null;
    try {
      location = locationMode(body);
    } catch (e) {
      console.error("get-booking-slots: locationMode failed", e);
      throw new BookingError(500, "location_check_failed", "We couldn't verify your location right now. Please try again in a moment.");
    }
    let area: { id: string; name: string } | null = null;
    let locationInstructors: InstructorLike[] | null = null;
    let locationRoster: Record<string, unknown>[] | null = null;
    if (location) {
      let zones, activeAreas, instructorRows;
      try {
        [zones, activeAreas, instructorRows] = await Promise.all([
          fetchServiceZones(client),
          fetchActiveAreas(client),
          client
            .from("Instructor")
            .select(ROSTER_COLS)
            .or("enabled.is.null,enabled.eq.true")
            .or("status.is.null,status.eq.active"),
        ]);
      } catch (e) {
        console.error("get-booking-slots: Promise.all failed", e);
        throw new BookingError(500, "service_unavailable", "Could not fetch instructor data. Please try again.");
      }
      locationRoster = instructorRows.data as Record<string, unknown>[] | null;
      let result;
      try {
        result = resolveServiceability({
          lat: location.lat,
          lng: location.lng,
          zones,
          instructors: parseInstructors(locationRoster),
          areas: activeAreas,
        });
      } catch (e) {
        console.error("get-booking-slots: resolveServiceability failed", e);
        throw new BookingError(500, "serviceability_check_failed", "We couldn't verify your location right now. Please try again in a moment.");
      }
      if (!result.serviceable || !result.areaLabel) {
        throw new BookingError(
          422,
          "location_not_serviceable",
          "We can't book this course at that location yet. Try another nearby location or get in touch.",
        );
      }
      area = { id: result.areaId ?? "", name: result.areaLabel };
      locationInstructors = result.eligibleInstructors;
    } else {
      throw new BookingError(422,"validation_error","Missing learner location."); // removed areaId-only path
      area = { id: String(areaRow.id), name: String(areaRow.name) };
    }

    const { data: course } = await client
      .from("Courses")
      .select("id, name, duration, total_lessons, price")
      .eq("id", body.courseId ?? "")
      .or("enabled.is.null,enabled.eq.true")
      .maybeSingle();
    
    if (!course) {
      throw new BookingError(404, "course_not_found", "This course is not available.");
    }
    let courseTotalLessons = Number(course.total_lessons);
    if (!Number.isInteger(courseTotalLessons) || courseTotalLessons < 1) {
      courseTotalLessons = Number(course.duration);
      if (!Number.isInteger(courseTotalLessons) || courseTotalLessons < 1) {
        throw new BookingError(
          422,
          "course_not_configured",
          "This course doesn't have its lesson count configured yet.",
        );
      }
    }

    // Handle firstSlot (plan mode)
    if (body.firstSlot?.date && body.firstSlot?.start) {
      // Plan mode - normal flow continues
    }

    if (!body.has_a_DL) {
      return jsonResponse({
        enabled: true,
        schedulingMode: "assign_later",
        femaleInstructorAvailable: false,
        dateFrom: null,
        dateTo: null,
        dates: [],
        totalLessons: courseTotalLessons,
        message:
          "You don't need a 4-wheeler driving licence to book. We'll assign your instructor after you've got your learner's licence.",
      });
    }

    // Instructor roster — the engine filters by area/radius. In location mode
    // the roster was already fetched for resolution; reuse it and scope the
    // engine to the derived eligible set (non-rough zone polygon only, patched
    // with the resolved area name so the untouched engine keeps them and only
    // them).
    let instructorRows: Record<string, unknown>[] | null = locationRoster;
    let instructors: InstructorLike[];
    if (location) {
      instructors = locationInstructors!;
    } else {
      const { data: rows } = await client
        .from("Instructor")
        .select(ROSTER_COLS)
        .or("enabled.is.null,enabled.eq.true")
        .or("status.is.null,status.eq.active");
      instructorRows = rows as Record<string, unknown>[] | null;
      instructors = parseInstructors(instructorRows);
    }

    // Candidate date window (IST calendar dates, starting tomorrow).
    const todayIso = istTodayISO();
    const tomorrowIso = addDaysISO(todayIso, 1);
    const requestedFrom = typeof body.from === "string" && isValidDateISO(body.from)
      ? body.from
      : null;
    const dateFrom = requestedFrom && requestedFrom >= tomorrowIso ? requestedFrom : tomorrowIso;
    const requestedDays = Number.isFinite(Number(body.days)) ? Math.round(Number(body.days)) : config.booking_days_ahead;
    const days = Math.min(Math.max(requestedDays, 1), config.booking_days_ahead);
    const dateTo = addDaysISO(dateFrom, days - 1);

    const dateStarts: string[] = [];
    for (let i = 0; i < days; i++) dateStarts.push(addDaysISO(dateFrom, i));

    // Existing occupancy in the window (holds + fixed bookings + reschedules).
    // Paginated so availability is computed from the FULL row set (the
    // PostgREST default cap would silently under-count busy instructors).
    const scheduleRows = await fetchAllScheduleWindow(client, dateFrom, dateTo);

    const blocks: ScheduleBlock[] = (scheduleRows || []).map((r) => ({
      instructorId: String(r.instructor_id),
      date: String(r.date),
      startMinute: toMinutes(String(r.start_time)),
      endMinute: toMinutes(String(r.end_time)),
      status: String(r.status),
      bookingCreatedAt: (r.booking as { created_at?: string } | null)?.created_at ?? null,
      ownerBookingId: r.booking_id == null ? null : String(r.booking_id),
    }));

    const engineInput = {
      instructors,
      learnerArea: String(area!.name),
      learner:
        typeof body.learnerLat === "number" && typeof body.learnerLng === "number"
          ? { lat: body.learnerLat, lng: body.learnerLng }
          : null,
      blocks,
      dates: dateStarts,
      slotConfig: {
        slotStart: config.slotStart,
        slotEnd: config.slotEnd,
        gridMinutes: config.gridMinutes,
        slotDurationMinutes: config.slotDurationMinutes,
      },
      femalePreference: Boolean(body.femaleInstructorPreference),
      femaleMode: config.female_instructor_mode,
      holdMinutes: config.hold_minutes,
      gapMinutes: config.instructor_gap_minutes,
    };

    // -------------------------------------------------------------------------
    // Plan preview mode: body.firstSlot was a slot the customer just picked from
    // the feasible grid — return the server-generated full course plan for it,
    // or ok:false so the site can tell them to pick again.
    // -------------------------------------------------------------------------
    const firstSlot = body.firstSlot;
    if (firstSlot && isValidDateISO(String(firstSlot.date)) && isValidTime(String(firstSlot.start))) {
      const slotStartMinute = timeToMinutes(String(firstSlot.start));
      const gridStarts = new Set(candidateStartMinutes(config).map((m) => m));
      const inWindow = String(firstSlot.date) >= dateFrom && String(firstSlot.date) <= dateTo;
      const onGrid = slotStartMinute >= 0 && gridStarts.has(slotStartMinute);

      if (!inWindow || !onGrid) {
        throw new BookingError(
          422,
          "validation_error",
          "The picked first lesson is outside the bookable range.",
        );
      }

      const pointer: SlotPointer = { date: String(firstSlot.date), start: String(firstSlot.start) };
      const plan = computeCoursePlan(engineInput, pointer, courseTotalLessons);

      const totalSlots = plan.ok ? plan.lessons!.length : 0;
      const editLesson = body.editLesson == null ? NaN : Number(body.editLesson);
      const isPlanEdit =
        Number.isInteger(editLesson) && editLesson >= 1 && editLesson <= courseTotalLessons;
      if (isPlanEdit && plan.ok) {
        if (body.editDate && body.editStart) {
          if (!isValidDateISO(String(body.editDate)) || !isValidTime(String(body.editStart))) {
            throw new BookingError(422, "validation_error", "The picked lesson time is invalid.");
          }
          const applied = applyPlanEdit(
            engineInput,
            plan,
            editLesson,
            String(body.editDate),
            String(body.editStart),
          );
          if (!applied.ok) {
            throw new BookingError(
              409,
              "slot_conflict",
              applied.error || "That time is no longer free with your trainer.",
            );
          }
          const firstLesson = applied.lessons[0];
          return jsonResponse({
            enabled: true,
            schedulingMode: totalSlots > 0 ? "direct" : "assign_later",
            femaleInstructorAvailable: femaleInstructorsAvailable(engineInput),
            dateFrom,
            dateTo,
            days,
            totalLessons: courseTotalLessons,
            plan: {
              ok: true,
              totalLessons: applied.totalLessons,
              lessons: applied.lessons,
            },
            date: firstLesson.date,
            start: firstLesson.start_time,
          });
        }
        const candidates = computePlanEditCandidates(engineInput, plan, editLesson);
        return jsonResponse({
          enabled: true,
          schedulingMode: totalSlots > 0 ? "direct" : "assign_later",
          femaleInstructorAvailable: femaleInstructorsAvailable(engineInput),
          dateFrom,
          dateTo,
          days,
          totalLessons: courseTotalLessons,
          planEdit: {
            lesson: editLesson,
            slots: candidates.slots,
          },
          message:
            candidates.slots.length === 0
              ? "There are no other free times for this lesson right now. Please try again shortly."
              : undefined,
        });
      }

      return jsonResponse({
        enabled: true,
        schedulingMode: totalSlots > 0 ? "direct" : "assign_later",
        femaleInstructorAvailable: femaleInstructorsAvailable(engineInput),
        dateFrom,
        dateTo,
        days,
        totalLessons: courseTotalLessons,
        plan: {
          ok: plan.ok,
          totalLessons: courseTotalLessons,
          lessons: plan.ok ? plan.lessons : [],
        },
        date: pointer.date,
        start: pointer.start,
        message: plan.ok
          ? undefined
          : "We couldn't build a full schedule starting from that lesson. Please pick another time.",
      });
    }

    const result = computeFeasibleFirstSlots(engineInput, courseTotalLessons);

    const totalSlots = result.dates.reduce((acc, d) => acc + d.slots.length, 0);
    const schedulingMode = totalSlots > 0 ? "direct" : "assign_later";

    return jsonResponse({
      enabled: true,
      schedulingMode,
      femaleInstructorAvailable: result.femaleInstructorAvailable,
      dateFrom,
      dateTo,
      days,
      totalLessons: courseTotalLessons,
      dates: result.dates.map((d) => ({
        date: d.date,
        day: d.day,
        slots: d.slots.map((s) => ({
          date: s.date,
          day: s.day,
          start: s.start,
          end: s.end,
          femaleCovered: s.femaleCovered,
        })),
      })),
      legend: {
        slotGridMinutes: config.gridMinutes,
        slotDurationMinutes: config.slotDurationMinutes,
        slotStart: config.slotStart,
        slotEnd: config.slotEnd,
      },
      message:
        totalSlots === 0
          ? `We couldn't find an instructor who can complete the full ${courseTotalLessons}-lesson course in your area for these days. You can choose the schedule-later option or try again later.`
          : undefined,
    });
  } catch (error) {
    if (isBookingError(error)) {
      return errorResponse(error);
    }
    console.error("get-booking-slots unexpected error:", error);
    return jsonResponse(
      { error: { code: "internal", message: "We couldn't check availability right now. Please try again in a moment." } },
      500,
    );
  }
});

function femaleInstructorsAvailable(input: {
  instructors: InstructorLike[];
  learnerArea: string;
  learner: { lat?: number | null; lng?: number | null } | null;
}): boolean {
  return areaEligibleInstructors(input).some((i) => isFemale(i.gender));
}


