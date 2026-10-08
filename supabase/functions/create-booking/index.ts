// Create a direct online booking: validates everything server-side, upserts the
// learner by phone, snapshots the chosen course/add-ons, computes the price on
// the server, creates the enrollment (reused later by the existing
// create-razorpay-order) and — for licensed learners — derives the full course
// plan server-side from the customer's chosen FIRST lesson (one hidden
// instructor teaches Courses.total_lessons 1-hour lessons) and atomically
// reserves it as pending_payment Schedule rows held for the configured hold
// window. Idempotent via booking.idempotency_key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { fetchAllScheduleWindow, fetchServiceZones, fetchActiveAreas } from "../_shared/queries.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";
import { resolveServiceability } from "../_shared/serviceability.ts";
import {
  computeBookingAmounts,
  splitInstallment,
  getHalfPaymentLessons,
} from "../_shared/pricing.ts";
import {
  computeCoursePlan,
  candidateStartMinutes,
  validateConsecutiveRule,
  type InstructorLike,
  type ScheduleBlock,
} from "../_shared/availability.ts";
import { singleInstructorForSlots } from "../_shared/planEdit.ts";
import {
  addDaysISO,
  dateToWeekdayLower,
  istTodayISO,
  isValidDateISO,
  isValidTime,
  normalizePhone,
  normalizeName,
  isValidEmail,
  timeToMinutes,
} from "../_shared/validation.ts";

const TWO_WHEELER_STATES = ["none", "ll_only", "active_dl"] as const;

interface CustomerInput {
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  area?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
}

interface SlotInput {
  date?: string;
  start?: string;
}

interface CreateBookingRequest {
  idempotencyKey?: string;
  areaId?: string;
  courseId?: string;
  // What the customer is buying: classes_only | course_rto (default) | rto_only.
  // rto_only -> RTO paperwork only (no course, no schedules, no enrollment).
  caseType?: string;
  customer?: CustomerInput;
  has_a_DL?: boolean;
  twoWheelerLicenseState?: string | null;
  kaLicence?: boolean | null;
  addonIds?: string[];
  femaleInstructorPreference?: boolean;
  installmentMode?: string;
  firstSlot?: SlotInput;
  selectedSlots?: SlotInput[];
  // Final edited plan from the page-2 "change slot" flow: the server
  // re-validates these exact slots against fresh live availability and treats
  // them as the definitive schedule to reserve.
  slots?: Array<{ date?: string; start_time?: string; end_time?: string }>;
  gateway?: string;
  // Learner's checkout location (authoritative when given).
  latitude?: unknown;
  longitude?: unknown;
  locationName?: string;
}

function toMinutes(time: string): number {
  return timeToMinutes(time);
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

interface RefreshState {
  instructors: InstructorLike[];
  blocks: ScheduleBlock[];
}

async function loadRefreshState(
  client: ReturnType<typeof serviceClient>,
  dateStarts: string[],
): Promise<RefreshState> {
  const { data: instructorRows } = await client
    .from("Instructor")
    .select("id_instructor, areas, radius, latitude, longitude, gender, unavailability, status, enabled")
    .or("enabled.is.null,enabled.eq.true")
    .or("status.is.null,status.eq.active");

  const dateFrom = dateStarts[0];
  const dateTo = dateStarts[dateStarts.length - 1];

  const scheduleRows = await fetchAllScheduleWindow(client, dateFrom, dateTo);

  return {
    instructors: parseInstructors(instructorRows as Record<string, unknown>[] | null),
    blocks: (scheduleRows || []).map((r) => ({
      instructorId: String(r.instructor_id),
      date: String(r.date),
      startMinute: toMinutes(String(r.start_time)),
      endMinute: toMinutes(String(r.end_time)),
      status: String(r.status),
      bookingCreatedAt: (r.booking as { created_at?: string } | null)?.created_at ?? null,
      ownerBookingId: r.booking_id == null ? null : String(r.booking_id),
    })),
  };
}

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  // Rows this request creates. Everything before the booking insert is pure
  // validation (no writes); anything that fails after it must be undone here,
  // because prod has no scheduled janitor to clean up a half-written request.
  let writtenBookingId: string | null = null;
  let writtenEnrollmentId: string | null = null;

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

    const body = (await req.json()) as CreateBookingRequest;

    // ---------------------------------------------------------------------------
    // 1. Request sanity
    // ---------------------------------------------------------------------------
    const idempotencyKey =
      typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new BookingError(
        422,
        "validation_error",
        "A valid idempotency key is required.",
      );
    }

    if (body.gateway && body.gateway !== config.gateway) {
      throw new BookingError(
        422,
        "gateway_unsupported",
        `Only ${config.gateway} is supported for online payment right now.`,
      );
    }

    if (typeof body.has_a_DL !== "boolean") {
      throw new BookingError(
        422,
        "validation_error",
        "Missing learner licence status.",
      );
    }

    const twoWheelerState = body.twoWheelerLicenseState == null
      ? null
      : String(body.twoWheelerLicenseState).trim();
    if (twoWheelerState && !(TWO_WHEELER_STATES as readonly string[]).includes(twoWheelerState)) {
      throw new BookingError(
        422,
        "validation_error",
        "Invalid two-wheeler licence state.",
      );
    }

    // "Is your 2W licence from Karnataka?" is only asked of learners
    // without a 4W DL who hold a 2W LL/DL. Any other combination stores null.
    const has2W = twoWheelerState === "ll_only" || twoWheelerState === "active_dl";
    const kaLicence = !body.has_a_DL && has2W
      ? typeof body.kaLicence === "boolean"
        ? body.kaLicence
        : (() => {
            throw new BookingError(
              422,
              "validation_error",
              "Please tell us where your 2-wheeler licence was issued.",
            );
          })()
      : null;

    // Case type: classes_only (driving only), course_rto (driving + RTO
    // paperwork, the original behaviour), rto_only (RTO paperwork only — no
    // course, no schedule, no enrollment). Missing caseType falls back to
    // course_rto when a course is supplied, else rto_only.
    const CASE_TYPES = ["classes_only", "course_rto", "rto_only"] as const;
    const bodyCaseType =
      typeof body.caseType === "string" ? body.caseType.trim() : "";
    if (bodyCaseType && !(CASE_TYPES as readonly string[]).includes(bodyCaseType)) {
      throw new BookingError(422, "validation_error", "Invalid booking case type.");
    }
    const caseType = bodyCaseType || (body.courseId ? "course_rto" : "rto_only");
    const isRtoOnly = caseType === "rto_only";
    const isClassesOnly = caseType === "classes_only";

    // ---------------------------------------------------------------------------
    // 2. Idempotency replay
    // ---------------------------------------------------------------------------
    const { data: existingBooking } = await client
      .from("booking")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingBooking) {
      const status = String(existingBooking.status);
      if (status === "created" || status === "payment_completed" || status === "confirmed") {
        const heldRows = await fetchHeldSlots(client, String(existingBooking.id), status === "confirmed");
        console.log("create-booking: replay", { idempotencyKey, status });
        return jsonResponse({
          replay: true,
          status,
          bookingId: existingBooking.id,
          learnerId: existingBooking.learner_id,
          caseType: existingBooking.case_type,
          courseId: existingBooking.course_id,
          courseName: existingBooking.course_name,
          amounts: {
            base: Number(existingBooking.base_amount),
            addons: Number(existingBooking.addons_amount),
            discount: Number(existingBooking.discount_amount),
            total: Number(existingBooking.total_amount),
          },
          installment: {
            mode: existingBooking.installment_mode,
            installment1: Number(existingBooking.installment1_amount),
            installment2: Number(existingBooking.installment2_amount),
          },
          hasReservedSlots: heldRows.length > 0,
          heldSlots: heldRows,
          totalLessons: heldRows.length,
          schedulingMode:
            status === "confirmed"
              ? (Array.isArray(existingBooking.selected_slots) &&
                  existingBooking.selected_slots.length > 0
                  ? "direct"
                  : "assign_later")
              : heldRows.length > 0
                ? "direct"
                : "created",
        });
      }
      if (status === "conflict") {
        throw new BookingError(
          409,
          "slot_conflict",
          "Your previous attempt hit a slot conflict. Please pick a new first-lesson time and try again.",
        );
      }
      throw new BookingError(
        422,
        status === "failed" ? "payment_failed" : "booking_abandoned",
        "This booking attempt cannot continue. Please start a fresh booking.",
      );
    }

    // ---------------------------------------------------------------------------
    // 3. Customer + area
    // ---------------------------------------------------------------------------
    const customer = body.customer ?? ({} as CustomerInput);

    const name = normalizeName(customer.name);
    if (!name) {
      throw new BookingError(422, "validation_error", "Please enter your full name.");
    }

    const phone = normalizePhone(customer.phone);
    if (!phone) {
      throw new BookingError(422, "validation_error", "Please enter a valid 10-digit phone number.");
    }

    const email = typeof customer.email === "string" ? customer.email.trim() : "";
    if (!email) {
      throw new BookingError(
        422,
        "validation_error",
        "Please enter your email address — it is required for your booking.",
      );
    }
    if (!isValidEmail(email)) {
      throw new BookingError(422, "validation_error", "Please enter a valid email address.");
    }

    let lat: number | null = null;
    let lng: number | null = null;
    if (customer.lat != null || customer.lng != null) {
      lat = Number(customer.lat);
      lng = Number(customer.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new BookingError(422, "validation_error", "Invalid pickup location coordinates.");
      }
    }

    // Learner's checkout location (top-level latitude/longitude). When given it
    // is authoritative: the service area is re-derived from the DB
    // (non-rough zone polygon only) and must agree with the client's areaId.
    const hasLocLat = body.latitude !== undefined && body.latitude !== null && body.latitude !== "";
    const hasLocLng = body.longitude !== undefined && body.longitude !== null && body.longitude !== "";
    const locationName =
      typeof body.locationName === "string" && body.locationName.trim()
        ? body.locationName.trim()
        : null;
    if (hasLocLat !== hasLocLng) {
      throw new BookingError(
        422,
        "validation_error",
        "Both latitude and longitude are required.",
      );
    }
    let locLat: number | null = null;
    let locLng: number | null = null;
    if (hasLocLat) {
      locLat = Number(body.latitude);
      locLng = Number(body.longitude);
      if (
        !Number.isFinite(locLat) || !Number.isFinite(locLng) ||
        Math.abs(locLat) > 90 || Math.abs(locLng) > 180
      ) {
        throw new BookingError(422, "validation_error", "Invalid learner coordinates.");
      }
    }

    // Area resolution: authoritative location path OR client-supplied areaId.
    let area: { id: string | null; name: string } | null = null;
    let locationEligibleInstructors: InstructorLike[] | null = null;
    if (locLat != null && locLng != null) {
      const [zones, activeAreas, instructorRows] = await Promise.all([
        fetchServiceZones(client),
        fetchActiveAreas(client),
        client
          .from("Instructor")
          .select("id_instructor, areas, radius, latitude, longitude, gender, unavailability, status, enabled")
          .or("enabled.is.null,enabled.eq.true")
          .or("status.is.null,status.eq.active"),
      ]);
      const result = resolveServiceability({
        lat: locLat,
        lng: locLng,
        zones,
        instructors:
          parseInstructors(instructorRows.data as Record<string, unknown>[] | null),
        areas: activeAreas,
        fallbackLabel: locationName,
      });
      if (!result.serviceable || !result.areaLabel) {
        throw new BookingError(
          422,
          "location_not_serviceable",
          "We can't book this course at that location yet. Try another nearby location or get in touch.",
        );
      }
      if (body.areaId && result.areaId && String(body.areaId) !== result.areaId) {
        throw new BookingError(
          422,
          "location_area_mismatch",
          "The selected area doesn't match your location. Please re-check your area or location.",
        );
      }
      area = { id: result.areaId, name: result.areaLabel };
      locationEligibleInstructors = result.eligibleInstructors;
    } else {
      const { data: areaRow } = await client
        .from("Serviceable_Areas")
        .select("id, name")
        .eq("id", body.areaId ?? "")
        .eq("active", true)
        .maybeSingle();
      if (!areaRow) {
        throw new BookingError(
          422,
          "validation_error",
          "Missing learner location.",
        );
      }
      area = { id: String(areaRow.id), name: String(areaRow.name) };
    }
    const resolvedArea = area!;

    // The area is trusted from the dropdown (Serviceable_Areas); matching
    // instructors are resolved from the Instructor.areas array by the
    // availability engine, so no pincode verification is needed.

    // ---------------------------------------------------------------------------
    // 4. Course (not required for rto_only bookings)
    // ---------------------------------------------------------------------------
    let courseId: string | null = null;
    let courseName: string | null = null;
    let coursePrice = 0;
    let courseDuration = 0;
    let courseTotalLessons = 0;

    if (!isRtoOnly) {
      const { data: course } = await client
        .from("Courses")
        .select("id, name, duration, total_lessons, price")
        .eq("id", body.courseId ?? "")
        .or("enabled.is.null,enabled.eq.true")
        .maybeSingle();
      if (!course) {
        throw new BookingError(404, "course_not_found", "This course is not available.");
      }
      courseId = String(course.id);
      courseName = String(course.name);
      coursePrice = Number(course.price);
      courseDuration = Number(course.duration);
      courseTotalLessons = Number(course.total_lessons);
      if (!Number.isFinite(coursePrice) || coursePrice < 0) {
        throw new BookingError(
          422,
          "course_not_configured",
          "This course doesn't have its price configured yet.",
        );
      }
      if (!Number.isInteger(courseDuration) || courseDuration < 1) {
        throw new BookingError(
          422,
          "course_not_configured",
          "This course doesn't have its duration configured yet.",
        );
      }
      if (!Number.isInteger(courseTotalLessons) || courseTotalLessons < 1) {
        throw new BookingError(
          422,
          "course_not_configured",
          "This course doesn't have its lesson count configured yet.",
        );
      }
    }

    // ---------------------------------------------------------------------------
    // 5. Add-ons (+ "included in course" handling, e.g. RTO Assistance)
    // ---------------------------------------------------------------------------
    const addonIds = Array.isArray(body.addonIds)
      ? [...new Set(body.addonIds.map((a) => String(a)))]
      : [];
    let addons: Array<{ id: string; code: string; name: string; price: number }> = [];
    let includedAddonIds = new Set<string>();
    const RTO_CODE_PREFIX = "rto_";

    if (addonIds.length > 0) {
      const { data: addonRows } = await client
        .from("booking_addons")
        .select("id, code, name, price")
        .eq("active", true)
        .in("id", addonIds);
      if (!addonRows || addonRows.length !== addonIds.length) {
        throw new BookingError(422, "addon_not_found", "One or more selected add-ons are not available.");
      }
      const addonById = new Map(addonRows.map((a) => [String(a.id), a]));
      addons = addonIds.map((id) => ({
        id,
        code: String(addonById.get(id)!.code),
        name: String(addonById.get(id)!.name),
        price: Number(addonById.get(id)!.price) || 0,
      }));
    }

    // Case-type integrity: RTO paperwork can only be purchased with course_rto
    // (optional) or rto_only (required, at least one). classes_only is driving
    // classes only — never RTO paperwork. These guards run even when NO addon
    // was selected so rto_only can never proceed without a service.
    const rtoAddons = addons.filter((a) => a.code.startsWith(RTO_CODE_PREFIX));
    if (isRtoOnly && rtoAddons.length === 0) {
      throw new BookingError(
        422,
        "rto_service_required",
        "Please choose at least one RTO service to continue.",
      );
    }
    if (isClassesOnly && rtoAddons.length > 0) {
      throw new BookingError(
        422,
        "dependencies_do_not_match",
        "RTO services can't be added to a classes-only booking. Pick 'Classes + RTO' instead.",
      );
    }

    if (!isRtoOnly && courseId && addons.length > 0) {
      const { data: includedRows } = await client
        .from("course_addons")
        .select("addon_id")
        .eq("course_id", courseId)
        .eq("included", true)
        .in("addon_id", addonIds);
      includedAddonIds = new Set((includedRows || []).map((r) => String(r.addon_id)));
    }

    const purchasedAddons = addons.filter((a) => !includedAddonIds.has(a.id));

    // ---------------------------------------------------------------------------
    // 6. Pricing (server-computed, nothing trusted from the client)
    // ---------------------------------------------------------------------------
    const amounts = computeBookingAmounts(
      coursePrice,
      purchasedAddons.map((a) => a.price),
      0,
    );

    const allowedInstallments = config.installment_modes;
    const requestedInstallment =
      typeof body.installmentMode === "string" && allowedInstallments.includes(body.installmentMode)
        ? body.installmentMode
        : allowedInstallments[0];
    const installment = splitInstallment(amounts.totalPaise, requestedInstallment);

    // ---------------------------------------------------------------------------
    // 7. Learner upsert (phone is the identity)
    // ---------------------------------------------------------------------------
    // An explicit final plan (page-2 "change slot" flow). When present the
    // server re-validates these EXACT slots against fresh live availability and
    // reserves them as-is; otherwise the whole plan is derived from firstSlot.
    const explicitSlots =
      Array.isArray(body.slots) && body.slots.length > 0
        ? body.slots.filter((s) => s && typeof s === "object")
        : [];
    const userSelectedSlots = explicitSlots.map((s) => ({
      date: String((s.date as string | undefined) ?? ""),
      start_time: String((s.start_time as string | undefined) ?? ""),
      end_time: String((s.end_time as string | undefined) ?? ""),
    }));
    const hasExplicitSlots = userSelectedSlots.length > 0;

    const firstSlotRaw: SlotInput | undefined = hasExplicitSlots
      ? { date: userSelectedSlots[0].date, start: userSelectedSlots[0].start_time }
      : Array.isArray(body.selectedSlots) && body.selectedSlots.length > 0
        ? body.selectedSlots[0]
        : body.firstSlot;
    const learnerWillSelfSchedule =
      !isRtoOnly && Boolean(body.has_a_DL && (firstSlotRaw ?? hasExplicitSlots));

    // Validate the picked first lesson BEFORE any write. These checks need only
    // the request + config, so a bad slot must never leave a Learner / booking /
    // enrollment row behind (no scheduled janitor runs in prod to tidy them up).
    if (body.has_a_DL && !isRtoOnly) {
      if (!firstSlotRaw || !isValidDateISO(String(firstSlotRaw.date)) || !isValidTime(String(firstSlotRaw.start))) {
        throw new BookingError(422, "validation_error", "Pick a first-lesson time to continue.");
      }
      if (courseTotalLessons > config.max_slots_per_booking) {
        throw new BookingError(
          422,
          "validation_error",
          `This course needs ${courseTotalLessons} lessons which is more than the maximum of ${config.max_slots_per_booking} per booking.`,
        );
      }
      const preTomorrow = addDaysISO(istTodayISO(), 1);
      const preLast = addDaysISO(preTomorrow, config.booking_days_ahead - 1);
      const preGrid = new Set(candidateStartMinutes(config));
      const preDate = String(firstSlotRaw.date);
      if (preDate < preTomorrow || preDate > preLast || !preGrid.has(timeToMinutes(String(firstSlotRaw.start)))) {
        throw new BookingError(422, "validation_error", "The picked first lesson is outside the bookable range.");
      }

      // Explicit edited plan (page-2 "change slot"): validate shape/count/grid/
      // window BEFORE any write so a bad payload never leaves an orphan booking.
      if (hasExplicitSlots) {
        if (userSelectedSlots.length !== courseTotalLessons) {
          throw new BookingError(
            422,
            "validation_error",
            `This course needs exactly ${courseTotalLessons} lessons. Please go back and adjust the schedule.`,
          );
        }
        for (const s of userSelectedSlots) {
          if (
            !isValidDateISO(s.date) ||
            !isValidTime(s.start_time) ||
            !isValidTime(s.end_time) ||
            timeToMinutes(s.end_time) <= timeToMinutes(s.start_time)
          ) {
            throw new BookingError(
              422,
              "validation_error",
              "One of the picked lesson times is invalid. Please refresh the schedule and try again.",
            );
          }
          const gridStart = timeToMinutes(s.start_time);
          if (s.date < preTomorrow || s.date > preLast || !preGrid.has(gridStart)) {
            throw new BookingError(
              422,
              "validation_error",
              "One of the picked lessons is outside the bookable range. Please refresh the schedule and try again.",
            );
          }
        }
      }
    }

    const learnerFields = {
      name: name as string,
      ...(email ? { email } : {}),
      city: typeof customer.city === "string" && customer.city.trim() ? customer.city.trim() : undefined,
      area: String(resolvedArea.name),
      ...(typeof customer.address === "string" && customer.address.trim()
        ? { pick_up_location: customer.address.trim() }
        : {}),
      ...(lat != null && lng != null ? { address_lat: lat, address_lng: lng } : {}),
      has_a_DL: body.has_a_DL,
      two_wheeler_license_state: twoWheelerState,
      has_two_wheeler_license:
        twoWheelerState === "active_dl" || twoWheelerState === "ll_only",
      ...(kaLicence == null ? {} : { two_wheeler_licence_in_ka: kaLicence }),
      address_change_required: kaLicence === false,
      LL_received: twoWheelerState === "ll_only",
      needs_scheduling: !learnerWillSelfSchedule,
    };

    const { data: existingLearner } = await client
      .from("Learner")
      .select("id")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let learnerId: string;
    if (existingLearner) {
      learnerId = String(existingLearner.id);
      const { error: learnerUpdateError } = await client
        .from("Learner")
        .update(learnerFields)
        .eq("id", learnerId);
      if (learnerUpdateError) throw learnerUpdateError;
    } else {
      const { data: createdLearner, error: learnerCreateError } = await client
        .from("Learner")
        .insert([{ ...learnerFields, phone, email: email || null, onboarding_completed: false }])
        .select("id")
        .single();
      if (learnerCreateError) throw learnerCreateError;
      learnerId = String(createdLearner.id);
    }

    // ---------------------------------------------------------------------------
    // 8. Already fully paid this course? (not applicable to rto_only)
    // ---------------------------------------------------------------------------
    if (!isRtoOnly) {
      const { data: fullPaid } = await client
        .from("enrollment")
        .select("id")
        .eq("learner_id", learnerId)
        .eq("course_id", courseId)
        .eq("payment_status", "full_paid")
        .maybeSingle();
      if (fullPaid) {
        throw new BookingError(
          422,
          "course_already_owned",
          "This course is already fully paid. You can purchase top-up lessons instead.",
        );
      }
    }

    // ---------------------------------------------------------------------------
    // 9. Booking row (snapshot) — idempotent insert with conflict handling (R11)
    // ---------------------------------------------------------------------------
    let bookingId: string;
    try {
      const { data: bookingRow, error: bookingError } = await client
        .from("booking")
        .insert([
          {
            idempotency_key: idempotencyKey,
            learner_id: learnerId,
            area_id: resolvedArea.id,
            area_name: String(resolvedArea.name),
            case_type: caseType,
            ...(locLat != null && locLng != null
              ? { latitude: locLat, longitude: locLng, location_name: locationName }
              : {}),
            ...(isRtoOnly
              ? { course_id: null, course_name: null, course_price: 0 }
              : { course_id: courseId, course_name: courseName, course_price: coursePrice }),
            has_a_DL: body.has_a_DL,
            two_wheeler_license_state: twoWheelerState,
            two_wheeler_licence_in_ka: kaLicence,
            female_instructor_preference: Boolean(body.femaleInstructorPreference),
            base_amount: amounts.base,
            addons_amount: amounts.addons,
            discount_amount: amounts.discount,
            total_amount: amounts.total,
            installment_mode: installment.installmentMode,
            installment1_amount: installment.installment1,
            installment2_amount: installment.installment2,
            gateway: config.gateway,
            selected_slots: [],
            status: "created",
            addon_ids: addonIds.length > 0 ? addonIds : null,
          },
        ])
        .select("id")
        .single();
      if (bookingError) throw bookingError;
      bookingId = String(bookingRow.id);
      writtenBookingId = bookingId;
    } catch (e: unknown) {
      // Unique violation on idempotency_key → fetch existing and replay
      const isUniqueViolation =
        e && typeof e === "object" && "code" in e && e.code === "23505";
      if (isUniqueViolation) {
        const { data: existingBooking } = await client
          .from("booking")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (existingBooking) {
          const status = String(existingBooking.status);
          const heldRows = await fetchHeldSlots(client, String(existingBooking.id), status === "confirmed");
          console.log("create-booking: replay (race)", { idempotencyKey, status });
          return jsonResponse({
            replay: true,
            status,
            bookingId: existingBooking.id,
            learnerId: existingBooking.learner_id,
            caseType: existingBooking.case_type,
            courseId: existingBooking.course_id,
            courseName: existingBooking.course_name,
            amounts: {
              base: Number(existingBooking.base_amount),
              addons: Number(existingBooking.addons_amount),
              discount: Number(existingBooking.discount_amount),
              total: Number(existingBooking.total_amount),
            },
            installment: {
              mode: existingBooking.installment_mode,
              installment1: Number(existingBooking.installment1_amount),
              installment2: Number(existingBooking.installment2_amount),
            },
            hasReservedSlots: heldRows.length > 0,
            heldSlots: heldRows,
            totalLessons: heldRows.length,
            schedulingMode:
              status === "confirmed"
                ? (Array.isArray(existingBooking.selected_slots) &&
                    existingBooking.selected_slots.length > 0
                    ? "direct"
                    : "assign_later")
                : heldRows.length > 0
                  ? "direct"
                  : "created",
          });
        }
      }
      throw e;
    }

    // ---------------------------------------------------------------------------
    // 10. Enrollment (reused by the existing create-razorpay-order). Skipped for
    //     rto_only — RTO paperwork has no course/enrollment, only a booking.
    // ---------------------------------------------------------------------------
    let enrollmentId: string | null = null;
    if (!isRtoOnly) {
      const { data: enrollmentRow, error: enrollmentError } = await client
        .from("enrollment")
        .insert([
          {
            learner_id: learnerId,
            course_id: courseId,
            payment_id: null,
            status: "pending",
            payment_status: "pending",
            installment_mode: installment.installmentMode,
            installment1_amount: installment.installment1,
            installment2_amount: installment.installment2,
            amount: Math.round(amounts.total),
            unlocked_lessons:
              installment.installmentMode === "first_half"
                ? getHalfPaymentLessons(courseDuration)
                : [],
            progress: { type: "course", total_hours: courseDuration },
          },
        ])
        .select("id")
        .single();
      if (enrollmentError) throw enrollmentError;
      enrollmentId = String(enrollmentRow.id);
      writtenEnrollmentId = enrollmentId;
    }

    // ---------------------------------------------------------------------------
    // 11. Purchased add-on snapshots
    // ---------------------------------------------------------------------------
    if (enrollmentId && purchasedAddons.length > 0) {
      const { error: addonError } = await client.from("enrollment_addons").insert(
        purchasedAddons.map((a) => ({
          enrollment_id: enrollmentId,
          addon_id: a.id,
          name_snapshot: a.name,
          price_snapshot: a.price,
        })),
      );
      if (addonError) throw addonError;
    }

    // ---------------------------------------------------------------------------
    // 12. Full-course plan + atomic reservation (licensed learners only).
    //     Default: the customer only picks the FIRST lesson; the engine derives
    //     the rest of the course for the SAME hidden instructor. When the page-2
    //     "change slot" flow sent an explicit `slots` array, the server instead
    //     re-validates THOSE exact slots against fresh live availability (one
    //     instructor must be free for every slot, consecutive rule, grid +
    //     window) and reserves them as-is. Both paths end in the same
    //     reserve_booking_slots RPC — advisory lock + exclusion constraint are
    //     the concurrency / double-booking backstop.
    // ---------------------------------------------------------------------------
    let reserved = 0;
    let heldSlots: Array<{ lesson: number; scheduleId: number; date: string; start_time: string; end_time: string }> = [];
    const finalSelectedSlots: Array<{ lesson: number; date: string; start_time: string; end_time: string }> = [];

    if (body.has_a_DL && !isRtoOnly) {
      if (!firstSlotRaw || !isValidDateISO(String(firstSlotRaw.date)) || !isValidTime(String(firstSlotRaw.start))) {
        throw new BookingError(
          422,
          "validation_error",
          "Pick a first-lesson time to continue.",
        );
      }

      if (courseTotalLessons > config.max_slots_per_booking) {
        throw new BookingError(
          422,
          "validation_error",
          `This course needs ${courseTotalLessons} lessons which is more than the maximum of ${config.max_slots_per_booking} per booking.`,
        );
      }

      const todayIso = istTodayISO();
      const tomorrowIso = addDaysISO(todayIso, 1);
      const dateFrom = tomorrowIso;
      const dateTo = addDaysISO(tomorrowIso, config.booking_days_ahead - 1);
      const slotDuration = config.slotDurationMinutes;

      const firstDate = String(firstSlotRaw.date);
      const firstStart = String(firstSlotRaw.start);
      const gridStarts = new Set(candidateStartMinutes(config).map((m) => m));
      const startMinutes = timeToMinutes(firstStart);
      if (firstDate < tomorrowIso || firstDate > dateTo || !gridStarts.has(startMinutes)) {
        throw new BookingError(
          422,
          "validation_error",
          "The picked first lesson is outside the bookable range.",
        );
      }

      const dateStarts: string[] = [];
      for (let i = 0; i < config.booking_days_ahead; i++) dateStarts.push(addDaysISO(dateFrom, i));
      const { instructors, blocks } = await loadRefreshState(client, dateStarts);
      // Location mode: scope the engine to the polygon-eligible instructors
      // derived at reservation time (same set the slots grid used).
      const planInstructors = locationEligibleInstructors ?? instructors;

      const engineInput = {
        instructors: planInstructors,
        learnerArea: String(resolvedArea.name),
        learner:
          locLat != null && locLng != null
            ? { lat: locLat, lng: locLng }
            : (lat != null && lng != null ? { lat, lng } : null),
        blocks,
        dates: dateStarts,
        slotConfig: {
          slotStart: config.slotStart,
          slotEnd: config.slotEnd,
          gridMinutes: config.gridMinutes,
          slotDurationMinutes: slotDuration,
        },
        femalePreference: Boolean(body.femaleInstructorPreference),
        femaleMode: config.female_instructor_mode,
        holdMinutes: config.hold_minutes,
        gapMinutes: config.instructor_gap_minutes,
      };

      let planLessons: Array<{ lesson: number; date: string; day: string; start_time: string; end_time: string }> = [];
      let slotsToReserve: Array<{ date: string; start_time: string; end_time: string; instructor_id: string }> = [];

      if (hasExplicitSlots) {
        // Page-2 "change slot" flow: the customer edited the preview plan.
        // Shape/count/grid/window were validated BEFORE any write; here we
        // re-verify against FRESH live availability that exactly ONE eligible
        // instructor is free for every submitted slot (no double-booking, no
        // overlap). The reserve RPC below stays as the atomic backstop.
        if (userSelectedSlots.length !== courseTotalLessons) {
          throw new BookingError(
            422,
            "validation_error",
            `This course needs exactly ${courseTotalLessons} lessons. Please refresh the schedule and try again.`,
          );
        }
        const instructorId = singleInstructorForSlots(engineInput, userSelectedSlots, courseTotalLessons);
        if (!instructorId) {
          throw new BookingError(
            409,
            "slot_conflict",
            "One of the lesson times you picked is no longer free. Please go back and adjust the schedule.",
          );
        }
        planLessons = userSelectedSlots.map((s, i) => ({
          lesson: i + 1,
          date: s.date,
          day: dateToWeekdayLower(s.date),
          start_time: s.start_time,
          end_time: s.end_time,
        }));
        slotsToReserve = userSelectedSlots.map((s) => ({
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time,
          instructor_id: instructorId,
        }));
      } else {
        const plan = computeCoursePlan(
          engineInput,
          { date: firstDate, start: firstStart },
          courseTotalLessons,
        );

        if (!plan.ok || !plan.lessons || plan.lessons.length !== courseTotalLessons) {
          throw new BookingError(
            409,
            "slot_conflict",
            `The first-lesson time you picked can't form a full ${courseTotalLessons}-lesson schedule anymore. Please go back and pick another time.`,
          );
        }

        // Consecutive-slot rule defense: the server plan must never carry more
        // than 2 same-day lessons or a discontinuous same-day pair.
        const ruleError = validateConsecutiveRule(plan.lessons);
        if (ruleError) {
          throw new BookingError(
            409,
            "slot_conflict",
            `The generated schedule violates the booking rules (${ruleError}). Please pick another first-lesson time.`,
          );
        }

        planLessons = plan.lessons;
        slotsToReserve = plan.lessons.map((l) => ({
          date: l.date,
          start_time: l.start_time,
          end_time: l.end_time,
          instructor_id: plan.instructorId!,
        }));
      }

      const { data: rpcResult, error: rpcError } = await client.rpc("reserve_booking_slots", {
        p_booking_id: bookingId,
        p_learner_id: learnerId,
        p_course_id: courseId,
        p_slots: slotsToReserve,
      });

      if (rpcError) throw rpcError;
      const rpcOut = (rpcResult ?? {}) as { ok?: boolean; error?: string; reserved?: number };
      if (!rpcOut.ok) {
        throw new BookingError(
          409,
          "slot_conflict",
          rpcOut.error === "slot_conflict"
            ? "One of the lessons for this schedule was just taken by someone else. Please go back and pick a new time."
            : "We couldn't reserve your lessons right now. Please try again.",
        );
      }
      reserved = Number(rpcOut.reserved) || planLessons.length;

      for (const l of planLessons) {
        finalSelectedSlots.push({
          lesson: l.lesson,
          date: l.date,
          start_time: l.start_time,
          end_time: l.end_time,
        });
      }

      const heldRows = await fetchHeldSlots(client, bookingId, false);
      heldSlots = heldRows.map((r) => ({
        lesson: r.lesson,
        scheduleId: r.scheduleId,
        date: r.date,
        start_time: r.start_time,
        end_time: r.end_time,
      }));

      const { error: selectUpdateError } = await client
        .from("booking")
        .update({ selected_slots: finalSelectedSlots })
        .eq("id", bookingId);
      if (selectUpdateError) throw selectUpdateError;
    } else {
      // Non-licensed learner: no slot reservation; admin schedules later.
      reserved = 0;
    }

    console.log("create-booking: created", {
      bookingId,
      learnerId,
      enrollmentId,
      courseId,
      total: amounts.total,
      reserved,
      totalLessons: courseTotalLessons,
    });

    return jsonResponse({
      bookingId,
      learnerId,
      enrollmentId,
      courseId,
      courseName,
      caseType,
      amounts: {
        base: amounts.base,
        addons: amounts.addons,
        discount: amounts.discount,
        total: amounts.total,
      },
      installment: {
        mode: installment.installmentMode,
        installment1: installment.installment1,
        installment2: installment.installment2,
      },
      hasReservedSlots: reserved > 0,
      reserved,
      heldSlots,
      totalLessons: isRtoOnly ? 0 : courseTotalLessons,
      schedulingMode: reserved > 0 ? "direct" : "assign_later",
      gateway: config.gateway,
      customer: { name, email, phone },
    });
  } catch (error) {
    // Undo every row this request wrote before reporting the failure. Skipped
    // for pre-validation errors (nothing written) and for the idempotent replay
    // path (that returns early — the winning request owns those rows).
    if (writtenBookingId || writtenEnrollmentId) {
      await discardFailedBooking(writtenBookingId, writtenEnrollmentId);
    }
    return errorResponse(error);
  }
});

/**
 * Undo every row a failed create-booking wrote (booking, its pending holds, the
 * pending enrollment and its add-ons) so a rejected/failed request leaves the
 * database exactly as it found it.
 *
 * Order matters and is driven by the real FK rules:
 *  - `Schedule.booking_id -> booking.id` is ON DELETE **SET NULL**, so deleting
 *    the booking first would orphan the holds. An unlinked `pending_payment` row
 *    is invisible to `_expire_stale_booking_holds` (which requires a booking) and
 *    would block that instructor's slot forever — hence rows go first.
 *  - Only this booking's *held* rows are removed; `booked` lessons are never
 *    touched, so a failed follow-up call can never damage confirmed lessons.
 *  - `enrollment_addons.enrollment_id` cascades, and `Schedule.enrollment_id` /
 *    `booking.learner_id` are SET NULL / CASCADE, so the enrollment can go next.
 *  - `booking_addons` is the *catalogue* (it has no booking_id) and is never
 *    written here, so it is deliberately not deleted from.
 */
async function discardFailedBooking(
  bookingId: string | null,
  enrollmentId: string | null,
): Promise<void> {
  try {
    const client = serviceClient();
    if (bookingId) {
      await client
        .from("Schedule")
        .delete()
        .eq("booking_id", bookingId)
        .eq("status", "pending_payment");
    }
    if (enrollmentId) {
      await client.from("enrollment_addons").delete().eq("enrollment_id", enrollmentId);
      await client.from("enrollment").delete().eq("id", enrollmentId);
    }
    if (bookingId) {
      await client.from("booking").delete().eq("id", bookingId);
    }
    console.warn("create-booking: rolled back rows for a failed request", {
      bookingId,
      enrollmentId,
    });
  } catch (cleanupError) {
    // Never mask the original failure — and never throw from the error path.
    console.error("create-booking: rollback of failed request failed", {
      bookingId,
      enrollmentId,
      error: String(cleanupError),
    });
  }
}

interface HeldSlotRow {
  lesson: number;
  scheduleId: number;
  date: string;
  start_time: string;
  end_time: string;
}

async function fetchHeldSlots(
  client: ReturnType<typeof serviceClient>,
  bookingId: string,
  confirmed: boolean,
): Promise<HeldSlotRow[]> {
  // Confirmed bookings hold post-payment lessons in 'tentative' (awaiting Ops
  // approval) or 'booked' (already approved); pre-confirm holds are
  // 'pending_payment'.
  const statusFilter = confirmed
    ? ["pending_payment", "tentative", "booked"]
    : ["pending_payment"];
  const { data: heldRows } = await client
    .from("Schedule")
    .select("id, date, start_time, end_time")
    .eq("booking_id", bookingId)
    .in("status", statusFilter)
    .order("id", { ascending: true });
  return (heldRows || []).map((r, i) => ({
    lesson: i + 1,
    scheduleId: Number(r.id),
    date: String(r.date),
    start_time: String(r.start_time),
    end_time: String(r.end_time),
  }));
}