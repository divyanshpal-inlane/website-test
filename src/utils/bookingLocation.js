/**
 * Calls the booking funnel's already-deployed `check-location-serviceability`
 * edge function directly from the marketing site, so a visitor's pickup point
 * can be verified BEFORE they ever leave inlane.in for the funnel.
 *
 * Same Supabase project, same public (verify_jwt=false) function the funnel
 * itself calls — see `inlane-web-main/supabase/functions/check-location-serviceability`.
 */
const ENV = import.meta.env ?? {};
const SUPABASE_URL = ENV.VITE_SUPABASE_URL || "";
const ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY || "";

export class BookingLocationError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = "BookingLocationError";
    this.code = code || "request_failed";
    this.status = status || 0;
  }
}

/**
 * @param {{latitude: number, longitude: number, input_source?: string}} params
 * @returns {Promise<{serviceable: boolean, areaId: string|null, areaName: string|null, eligibleInstructorCount: number}>}
 */
export async function checkLocationServiceability({ latitude, longitude, input_source }) {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new BookingLocationError("Booking isn't configured on this site yet.", {
      code: "not_configured",
    });
  }
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/check-location-serviceability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ latitude, longitude, input_source }),
    });
  } catch {
    throw new BookingLocationError(
      "We couldn't verify your location right now. Please check your connection and try again.",
      { code: "network_error" },
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = payload?.error || {};
    throw new BookingLocationError(
      err.message || "We couldn't verify your location right now. Please try again.",
      { code: err.code || "request_failed", status: response.status },
    );
  }

  return payload || { serviceable: false, areaId: null, areaName: null, eligibleInstructorCount: 0 };
}
