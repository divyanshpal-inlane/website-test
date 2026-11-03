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
import { errorResponse, isBookingError, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { fetchAllScheduleWindow, fetchServiceZones, fetchActiveAreas, fetchInstructorRoster } from "../_shared/queries.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";
import type { BookingFlowConfig } from "../_shared/config.ts";
import { resolveServiceability } from "../_shared/serviceability.ts";
import {
  computeCoursePlan,
  computeCoursePlanPreferred,
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
  planPreferredCourseWithFallbacks,
  supplyGapEventProperties,
  toPublicSchedulingSummary,
} from "../_shared/scheduling.ts";
import {
  deriveHashedClientEventId,
  emitServerEvent,
} from "../_shared/funnelEvents.ts";
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
  // "3 preferred slots" mode: a Start Date plus up to 3 ranked daily time
  // preferences. Takes precedence over firstSlot when both are present.
  startDate?: string;
  preferredTimes?: string[];
  // Plan-edit mode (page-2 "change slot"): editLesson alone returns candidate
  // times for that lesson; with editDate + editStart it applies the change and
  // returns the updated full plan.
  editLesson?: number | null;
  editDate?: string;
  editStart?: string;
  /** Funnel session id (uuid4) supplied by the website. */
  client_session_id?: string | null;
}

function toMinutes(time: string): number {
  return timeToMinutes(time);
}

/** Inclusive day count between two IST calendar dates (0 when `to` < `from`). */
function daysInclusiveISO(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

function parseCoordinate(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function parseInstructors(rows: Record<string, unknown>[] | null): InstructorLike[] {
  return (rows || []).map((r) => ({
    id: String(r.id_instructor),
    name: r.name == null ? null : String(r.name), // TEMP-TEST (instructor name in slots)
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

/**
 * Emit a funnel event from this function. Never throws — instrumentation must
 * never be able to fail a slot lookup.
 */
async function emitSlotsFunnelEvent(
  client: unknown,
  body: SlotsRequest,
  userAgent: string | null,
  args: {
    eventName: "slots_viewed" | "slot_selected" | "supply_gap_logged";
    properties: Record<string, unknown>;
    clientEventId: string;
  },
): Promise<void> {
  try {
    await emitServerEvent(client as never, {
      eventName: args.eventName,
      clientSessionId: body.client_session_id ?? null,
      occurredAt: new Date().toISOString(),
      properties: args.properties,
      clientEventId: args.clientEventId,
      userAgent,
    });
  } catch (error) {
    console.error(
      "get-booking-slots: funnel_emit_failed",
      args.eventName,
      error instanceof Error ? error.message : String(error),
    );
  }
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

    // Roster columns live in one place: _shared/queries.ts
    // (INSTRUCTOR_ROSTER_COLUMNS) so a missing column can never make
    // PostgREST reject the whole select for one function but not another.

    // Location mode (learner lat/lng given) is authoritative: the resolved
    // service area replaces the client-supplied areaId entirely. It runs for
    // every learner who sends coordinates (DL or not) so create-booking can
    // never discover a different, unserviceable area later.
    let location: { lat: number; lng: number } | null = null;
    try {
      location = locationMode(body);
    } catch (e) {
      // locationMode raises a 422 BookingError for missing / one-sided /
      // out-of-range coordinates. Those are client errors and must keep their
      // 422 status - masking them as a 500 told the customer their area was
      // broken when the real problem was a missing coordinate.
      if (isBookingError(e)) throw e;
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
          // Throws on a PostgREST error instead of resolving to an empty
          // roster (a failed select used to look exactly like "no instructor
          // serves this area" -> bogus 422 location_not_serviceable).
          fetchInstructorRoster(client),
        ]);
      } catch (e) {
        console.error("get-booking-slots: Promise.all failed", e);
        throw new BookingError(500, "service_unavailable", "Could not fetch instructor data. Please try again.");
      }
      locationRoster = instructorRows;
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
    }

    const { data: course } = await client
      .from("Courses")
      .select("id, name, code, duration, total_lessons, price")
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
      try {
        instructorRows = await fetchInstructorRoster(client);
      } catch (e) {
        console.error("get-booking-slots: instructor roster failed", e);
        throw new BookingError(500, "service_unavailable", "Could not fetch instructor data. Please try again.");
      }
      instructors = parseInstructors(instructorRows);
    }

    // TEMP-TEST (instructor name in slots) — display-only lookup so the site
    // can show which instructor each slot/plan belongs to. REMOVE this block
    // and every "TEMP-TEST (instructor name" line when testing is done.
    const nameById = new Map<string, string>();
    for (const instr of instructors) {
      if (instr.id && instr.name) nameById.set(String(instr.id), String(instr.name));
    }
    const instructorNameOf = (id?: string | null): string | null =>
      id == null ? null : nameById.get(String(id)) ?? null;
    const withLessonNames = <T>(
      lessons: T[] | undefined,
      name: string | null,
    ): Array<T & { instructorName: string | null }> =>
      (lessons || []).map((l) => ({ ...l, instructorName: name }));

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
    // "3 preferred slots" mode: the customer picked a Start Date and ranked up
    // to 3 daily time preferences. Preference #1 is tried on every course day
    // starting at the Start Date; if it isn't free, #2 then #3 are tried on
    // the SAME day; if none are free that day it is skipped entirely and the
    // same preferences are retried the next day (at most one lesson/day).
    // -------------------------------------------------------------------------
    const preferredStartDate = body.startDate;
    const preferredTimesRaw = Array.isArray(body.preferredTimes) ? body.preferredTimes : null;
    if (preferredStartDate && preferredTimesRaw) {
      if (!isValidDateISO(String(preferredStartDate))) {
        throw new BookingError(422, "validation_error", "The picked start date is invalid.");
      }
      if (preferredTimesRaw.length === 0 || preferredTimesRaw.length > 3) {
        throw new BookingError(
          422,
          "validation_error",
          "Pick between 1 and 3 preferred times.",
        );
      }
      const gridStarts = new Set(candidateStartMinutes(config).map((m) => m));
      const preferredMinutes: number[] = [];
      for (const t of preferredTimesRaw) {
        if (!isValidTime(String(t))) {
          throw new BookingError(422, "validation_error", "One of the preferred times is invalid.");
        }
        const m = timeToMinutes(String(t));
        if (!gridStarts.has(m)) {
          throw new BookingError(422, "validation_error", "One of the preferred times is outside the bookable grid.");
        }
        preferredMinutes.push(m);
      }
      if (new Set(preferredMinutes).size !== preferredMinutes.length) {
        throw new BookingError(422, "validation_error", "Preferred times must be distinct.");
      }
      const inWindow = String(preferredStartDate) >= dateFrom && String(preferredStartDate) <= dateTo;
      if (!inWindow) {
        throw new BookingError(422, "validation_error", "The picked start date is outside the bookable range.");
      }

      console.log("[get-booking-slots][preferred] engineInput:", {
        instructorCount: engineInput.instructors.length,
        learnerArea: engineInput.learnerArea,
        datesCount: engineInput.dates?.length,
        slotConfig: engineInput.slotConfig,
        femalePreference: engineInput.femalePreference,
        femaleMode: engineInput.femaleMode,
        holdMinutes: engineInput.holdMinutes,
        gapMinutes: engineInput.gapMinutes,
        blocksCount: engineInput.blocks?.length,
      });
      const plan = computeCoursePlanPreferred(
        engineInput,
        String(preferredStartDate),
        preferredMinutes,
        courseTotalLessons,
      );
      console.log("[get-booking-slots][preferred] plan result:", {
        ok: plan.ok,
        instructorId: plan.instructorId,
        totalLessons: plan.totalLessons,
        lessonsCount: plan.lessons?.length,
        firstLesson: plan.lessons?.[0],
        lastLesson: plan.lessons?.[plan.lessons?.length - 1],
      });

      // -----------------------------------------------------------------------
      // B — mandatory fallback ladder.
      //
      // The legacy planner above stays the PRIMARY path. This runs EVERY
      // eligible instructor through the hierarchy:
      //   F1 all instructors evaluated independently (never stop at the first
      //      failure)
      //   F2 a lesson whose preferred times are taken is moved to the next
      //      eligible date, retrying the SAME exact preferences, then the later
      //      lessons are revalidated
      //   F3 the horizon is extended — capped here to the bookable window so a
      //      plan never reaches past what the calendar allows
      //   F4 later start dates inside that window
      //
      // It also produces the reason codes (D), the supply-gap classification and
      // the customer's next step (F5 / F6) when nothing completes.
      //
      // F4 is a SUGGESTION, never a silent substitution: a proposal whose first
      // lesson is not on the requested Start Date is never adopted as the plan.
      // It is surfaced as `alternativeStartDates` with an explicit message.
      // -----------------------------------------------------------------------
      const windowDaysFromStart = Math.max(
        1,
        daysInclusiveISO(String(preferredStartDate), dateTo),
      );
      const schedulingOutcome = planPreferredCourseWithFallbacks({
        input: engineInput,
        startDate: String(preferredStartDate),
        preferredStartMinutes: preferredMinutes,
        totalLessons: courseTotalLessons,
        options: {
          // F3 can never extend past the bookable window.
          maxHorizonDays: windowDaysFromStart,
          // F4 may look at later start dates inside the same window.
          maxStartDateShiftDays: windowDaysFromStart - 1,
          // Ceiling: a slow search must never hang the request.
          maxMillis: 2000,
        },
      });
      const schedulingSummary = toPublicSchedulingSummary(schedulingOutcome);
      const ladderPlan = schedulingOutcome.best?.lessons?.length
        ? {
            ok: true,
            instructorId: schedulingOutcome.best.instructorId,
            totalLessons: courseTotalLessons,
            lessons: schedulingOutcome.best.lessons,
          }
        : null;
      // Adopt the ladder's proposal only when it keeps the requested start date.
      const primaryPlan = plan.ok
        ? plan
        : ladderPlan && !schedulingOutcome.best?.startDateShifted
          ? ladderPlan
          : plan;
      console.log("[get-booking-slots][preferred] scheduling", {
        legacyOk: plan.ok,
        ladderOk: schedulingOutcome.ok,
        primaryOk: primaryPlan.ok,
        startDateShifted: schedulingOutcome.best?.startDateShifted ?? false,
        eligible: schedulingOutcome.eligibleInstructorCount,
        considered: schedulingOutcome.consideredInstructorCount,
        failureCode: schedulingOutcome.failureCode,
        alternatives: schedulingSummary.alternativeStartDates.length,
        exhaustive: schedulingOutcome.searchExhaustive,
      });

      const totalSlots = primaryPlan.ok ? primaryPlan.lessons!.length : 0;

      const editLesson = body.editLesson == null ? NaN : Number(body.editLesson);
      const isPlanEdit =
        Number.isInteger(editLesson) && editLesson >= 1 && editLesson <= courseTotalLessons;
      if (isPlanEdit && primaryPlan.ok) {
        // Lesson 1's date/time is derived from the Start Date + preferences,
        // not an independently-picked slot — "changing" it means picking a
        // new Start Date or preferences, not editing it in place (that would
        // silently fall back to the unrelated legacy replanning algorithm).
        if (editLesson === 1) {
          throw new BookingError(
            422,
            "validation_error",
            "To change your first lesson, go back and pick a different start date or preferred times.",
          );
        }
        if (body.editDate && body.editStart) {
          if (!isValidDateISO(String(body.editDate)) || !isValidTime(String(body.editStart))) {
            throw new BookingError(422, "validation_error", "The picked lesson time is invalid.");
          }
          const applied = applyPlanEdit(
            engineInput,
            primaryPlan,
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
              // TEMP-TEST (instructor name in slots)
              instructorName: instructorNameOf(applied.instructorId),
              lessons: withLessonNames(applied.lessons, instructorNameOf(applied.instructorId)),
            },
            startDate: preferredStartDate,
            preferredTimes: preferredTimesRaw,
          });
        }
        const candidates = computePlanEditCandidates(engineInput, primaryPlan, editLesson);
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
            // TEMP-TEST (instructor name in slots)
            instructorName: instructorNameOf(primaryPlan.instructorId),
            slots: withLessonNames(candidates.slots, instructorNameOf(primaryPlan.instructorId)),
          },
          message:
            candidates.slots.length === 0
              ? "There are no other free times for this lesson right now. Please try again shortly."
              : undefined,
        });
      }

      // --- funnel instrumentation (never fatal) ---------------------------
      if (plan.ok) {
        await emitSlotsFunnelEvent(client, body, req.headers.get("user-agent"), {
          eventName: "slot_selected",
          properties: {
            course_id: String(course.id ?? ""),
            course_code: course.code == null ? null : String(course.code),
            slot_date: String(preferredStartDate),
            slot_start: preferredTimesRaw[0] != null ? String(preferredTimesRaw[0]) : null,
          },
          clientEventId: await deriveHashedClientEventId(
            "preferred-slot",
            course.id ?? "",
            String(preferredStartDate),
            preferredTimesRaw.join(","),
          ),
        });
      }

      // F6 — a course that cannot be built is a SUPPLY GAP, not a dead end: the
      // lead stays alive and the failure is measurable. Best-effort; never fatal.
      if (!primaryPlan.ok) {
        await emitSlotsFunnelEvent(client, body, req.headers.get("user-agent"), {
          eventName: "supply_gap_logged",
          properties: supplyGapEventProperties({
            outcome: schedulingOutcome,
            courseId: String(course.id ?? ""),
            courseCode: course.code == null ? null : String(course.code),
            areaId: area?.id ?? null,
            areaName: area?.name ?? null,
            dlStatus: body.has_a_DL ? "has_4w_dl" : "no_4w_dl",
            preferredTimes: preferredTimesRaw.map((t) => String(t)),
            requestedDate: String(preferredStartDate),
          }),
          clientEventId: await deriveHashedClientEventId(
            "supply-gap",
            String(course.id ?? ""),
            String(preferredStartDate),
            preferredTimesRaw.join(","),
            String(days),
          ),
        });
      }

      const alternatives = primaryPlan.ok ? [] : schedulingSummary.alternativeStartDates;
      const alternativeMessage = alternatives.length > 0
        ? `We can start your course on ${alternatives[0].startDate} instead.`
        : null;

      const resp = {
        enabled: true,
        schedulingMode: totalSlots > 0 ? "direct" : "assign_later",
        femaleInstructorAvailable: femaleInstructorsAvailable(engineInput),
        dateFrom,
        dateTo,
        days,
        totalLessons: courseTotalLessons,
        plan: {
          ok: primaryPlan.ok,
          totalLessons: courseTotalLessons,
          // TEMP-TEST (instructor name in slots)
          instructorName: instructorNameOf(primaryPlan.instructorId),
          lessons: withLessonNames(
            primaryPlan.ok ? primaryPlan.lessons : [],
            instructorNameOf(primaryPlan.instructorId),
          ),
        },
        startDate: preferredStartDate,
        preferredTimes: preferredTimesRaw,
        // Spec B / D / F5 / F6 — additive, privacy-safe scheduling explanation:
        // what was searched, why it failed, and the customer's next step.
        scheduling: schedulingSummary,
        failureCode: primaryPlan.ok ? undefined : schedulingOutcome.failureCode,
        supplyGap: primaryPlan.ok ? undefined : schedulingOutcome.supplyGap,
        nextSteps: primaryPlan.ok ? [] : schedulingOutcome.nextSteps,
        alternativeStartDates: alternatives,
        message: primaryPlan.ok
          ? schedulingSummary.startDateShifted && schedulingSummary.proposedStartDate
            ? `Your first lesson is on ${schedulingSummary.proposedStartDate} — the earliest date your preferred times are free.`
            : undefined
          : alternativeMessage
            ? `Your exact start date isn't free. ${alternativeMessage}`
            : "We couldn't build a full schedule with those preferences. Please try a different start date or preferred times.",
      };
      console.log("[get-booking-slots][preferred] result", {
        ok: primaryPlan.ok,
        count: primaryPlan.lessons?.length,
        failureCode: resp.failureCode,
        alternatives: resp.alternativeStartDates.length,
      });
      return jsonResponse(resp);
    }

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
              // TEMP-TEST (instructor name in slots)
              instructorName: instructorNameOf(applied.instructorId),
              lessons: withLessonNames(applied.lessons, instructorNameOf(applied.instructorId)),
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
            // TEMP-TEST (instructor name in slots)
            instructorName: instructorNameOf(plan.instructorId),
            slots: withLessonNames(candidates.slots, instructorNameOf(plan.instructorId)),
          },
          message:
            candidates.slots.length === 0
              ? "There are no other free times for this lesson right now. Please try again shortly."
              : undefined,
        });
      }

      // --- funnel instrumentation (never fatal) ---------------------------
      // The customer committed to a concrete first lesson and the server
      // built a full course plan for it.
      if (plan.ok) {
        await emitSlotsFunnelEvent(client, body, req.headers.get("user-agent"), {
          eventName: "slot_selected",
          properties: {
            course_id: String(course.id ?? ""),
            course_code: course.code == null ? null : String(course.code),
            slot_date: pointer.date,
            slot_start: pointer.start,
          },
          clientEventId: await deriveHashedClientEventId(
            "slot",
            course.id ?? "",
            pointer.date,
            pointer.start,
          ),
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
          // TEMP-TEST (instructor name in slots)
          instructorName: instructorNameOf(plan.instructorId),
          lessons: withLessonNames(plan.ok ? plan.lessons : [], instructorNameOf(plan.instructorId)),
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

    // --- funnel instrumentation (never fatal) ------------------------------
    // The availability grid was rendered for this course/area.
    await emitSlotsFunnelEvent(client, body, req.headers.get("user-agent"), {
      eventName: "slots_viewed",
      properties: {
        slot_count: totalSlots,
        course_id: String(course.id ?? ""),
        course_code: course.code == null ? null : String(course.code),
        area_id: area?.id ? String(area.id) : null,
        scheduling_mode: schedulingMode,
      },
      clientEventId: await deriveHashedClientEventId(
        "slots",
        course.id ?? "",
        area?.id ?? "",
        totalSlots,
        dateFrom,
      ),
    });

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
          // TEMP-TEST (instructor name in slots)
          instructorName: instructorNameOf(s.instructors?.[0]),
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


