// Location serviceability check for the website direct booking flow.
// Given a learner's latitude/longitude, reports whether their point can be
// served: ONLY when it is inside an active instructor's non-rough driving-zone
// polygon (instructor_service_zones), where the instructor also maps to an active
// Serviceable_Areas entry. No base-radius fallback. Returns only serviceable-area info — never
// instructor identities.
//
// Response fields: serviceable, areaId, areaName, eligibleInstructorCount.
// Non-serviceable points return 200 with serviceable:false (areaId/areaName
// null, count 0). Malformed/missing coordinates return 422 validation_error.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { errorResponse, isBookingError, BookingError } from "../_shared/errors.ts";
import { serviceClient } from "../_shared/client.ts";
import { fetchServiceZones, fetchActiveAreas } from "../_shared/queries.ts";
import { readBookingFlowConfig } from "../_shared/config.ts";
import { resolveServiceability, type ServiceabilityInput } from "../_shared/serviceability.ts";

function parseCoordinate(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
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

    const body = (await req.json()) as { latitude?: unknown; longitude?: unknown };

    const hasLat = body.latitude !== undefined && body.latitude !== null && body.latitude !== "";
    const hasLng = body.longitude !== undefined && body.longitude !== null && body.longitude !== "";
    if (hasLat !== hasLng) {
      throw new BookingError(
        422,
        "validation_error",
        "Both latitude and longitude are required.",
      );
    }
    if (!hasLat) {
      throw new BookingError(
        422,
        "validation_error",
        "Missing learner location.",
      );
    }

    const lat = parseCoordinate(body.latitude);
    const lng = parseCoordinate(body.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BookingError(
        422,
        "validation_error",
        "Invalid learner coordinates.",
      );
    }

    const [instructorRows, zones, activeAreas] = await Promise.all([
      client
        .from("Instructor")
        .select("id_instructor, name, areas, radius, latitude, longitude, status, enabled"),
      fetchServiceZones(client),
      fetchActiveAreas(client),
    ]);

    const instructors = (instructorRows.data as Record<string, unknown>[] | null || []).map((r) => ({
      id: String(r.id_instructor),
      name: String(r.name ?? ""),
      areas: (r.areas as string[] | null) || [],
      radiusKm: r.radius == null ? null : Number(r.radius),
      lat: r.latitude == null ? null : Number(r.latitude),
      lng: r.longitude == null ? null : Number(r.longitude),
      status: r.status == null ? null : String(r.status),
      enabled: r.enabled == null ? null : Boolean(r.enabled),
    }));

    const input: ServiceabilityInput = { lat, lng, zones, instructors, areas: activeAreas };
    const result = resolveServiceability(input);

    return jsonResponse({
      serviceable: result.serviceable,
      areaId: result.areaId,
      areaName: result.areaName,
      areaLabel: result.areaLabel,
      eligibleInstructorCount: result.eligibleInstructorCount,
    });
  } catch (error) {
    if (isBookingError(error)) return errorResponse(error);
    // Anything unexpected (DB blip, zone parse edge, downstream fetch failure)
    // must fail as a structured, retry-able error — never leak the raw 500
    // body or a bare "Unexpected error" to the booking UI.
    console.error("check-location-serviceability internal error:", error);
    return jsonResponse(
      {
        error: {
          code: "serviceability_check_failed",
          message: "We couldn't verify your location right now. Please try again in a moment.",
        },
      },
      503,
    );
  }
});