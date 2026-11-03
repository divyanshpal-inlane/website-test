// Authoritative lead capture for the acquisition funnel.
//
// This is the funnel's COMMIT POINT: the `lead_captured` event is written only
// after the backend has confirmed the lead row exists.
//
// It is also the single authoritative forwarder for the downstream lead
// destinations (CRM = Cratio, lead sheet = Google Apps Script). The website
// used to POST to those endpoints from the browser; that duplication is
// removed in favour of this function (see PHASE0_PLAN.md, decision D1).
//
// ROLLOUT SAFETY: if the CRM destination is not configured, or the CRM call
// fails, the response carries `clientFallback: true` and the website keeps
// performing its original browser-side delivery. No lead is ever lost, and no
// lead is ever delivered twice (the CRM is attempted first; the sheet is only
// attempted once the CRM has accepted the lead).
//
// IDEMPOTENT DELIVERY: a repeat capture of the same phone (double submit,
// retry after a network blip, duplicate `lead_captured` event) does NOT
// create a second CRM lead. The lead row's `cratio_sync_status` records the
// outcome of the previous attempt, so a lead that was already delivered is a
// no-op downstream (`delivery.cratio = "already_sent"`, `clientFallback:
// false`). A lead whose previous attempt FAILED is retried — a transient CRM
// outage must never lose the lead.
//
// KILL SWITCH: unsetting `CRATIO_WEBHOOK_URL` (and `CRATIO_RTO_WEBHOOK_URL`)
// disables ALL external delivery — the function then reports
// `delivery.cratio = "not_configured"`, `delivery.sheets = "skipped"` and
// `clientFallback: true`, and writes nothing to Cratio or the lead sheet.
// Use this before running the E2E harness against production.
//
// Request body:
//   {
//     "phone": "9876543210",           // required, 10 digits
//     "country_code": "+91",           // optional, default "91"; a leading "+" is preserved
//     "name": "...", "email": "...",
//     "city": "...", "area": "...",
//     "license": "yes" | "no",
//     "source": "homepage_popup",      // canonical funnel form id
//     "ad_name": "Popup Signup Form",
//     "sheets_target": "signup" | "signup_and_mygate" | "none",
//     "service_interest": "...",
//     "service": "...",                 // RTO form only
//     "lead_owner": "...",              // RTO form only
//     "locality": "...",                // RTO form only (raw location string)
//     "lift_activation": "...",         // lift/QR activation source token
//     "society": "...",                 // lift/QR activation society
//     "client_session_id": "<uuid>",   // links the pre-capture events
//     "dl_status": "has_dl" | "no_dl" | ...,
//     "area_id": "...", "state": "Karnataka",
//     "blocked_reason": "out_of_area" | null,
//     "marketing_consent": true | false | null,
//     "attribution": { "utm_source": "...", ... },
//     "first_touch": { "first_utm_source": "...", ... },
//     "page_path": "/"
//   }
//
// Response: { ok, leadId, sessionId, duplicate, delivery, clientFallback }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { captureLead, extractClientIp, ipBucketKey, phoneBucketKey } from "../_shared/funnelEvents.ts";
import { consumeRateLimit, hitRateLimit, updateLeadProgress } from "../_shared/funnelStore.ts";
import {
  CAPTURE_IP_RATE_LIMIT_MAX,
  CAPTURE_IP_RATE_LIMIT_WINDOW_MS,
  CAPTURE_RATE_LIMIT_MAX,
  CAPTURE_RATE_LIMIT_WINDOW_MS,
  phoneToLast10,
} from "../_shared/funnelTaxonomy.ts";
import {
  FORM_TYPE_BY_SOURCE,
  buildCratioPayload,
  buildFullPhone,
  buildLeadSheetPayload,
  buildLeadSource,
  buildMyGateCategory,
  buildMyGateSheetPayload,
  buildRtoLeadPayload,
  sanitizeLeadFirstTouch,
  sanitizeLeadUtms,
} from "../_shared/leadAttribution.ts";

/**
 * The lead sheet used by the popup / signup forms.
 *
 * This URL is already hardcoded in the public website bundle
 * (`inlane-web/src/components/SignupPopup.jsx`), so embedding it here adds no
 * new exposure. It can be overridden with the `SIGNUP_SHEET_URL` edge secret.
 */
const DEFAULT_SIGNUP_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbz45poihO1GSt_f-UxHHWltKWHh8mDNyaXPcFzbIURMvTVKj1qPn9STBILUaMiGme7r/exec";

/** Read the first non-empty environment variable from a list of candidates. */
function envFirst(...names: string[]): string | null {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

interface CaptureBody {
  phone?: unknown;
  country_code?: unknown;
  name?: unknown;
  email?: unknown;
  city?: unknown;
  area?: unknown;
  license?: unknown;
  source?: unknown;
  ad_name?: unknown;
  sheets_target?: unknown;
  service_interest?: unknown;
  service?: unknown;
  lead_owner?: unknown;
  locality?: unknown;
  lift_activation?: unknown;
  society?: unknown;
  client_session_id?: unknown;
  dl_status?: unknown;
  area_id?: unknown;
  state?: unknown;
  blocked_reason?: unknown;
  marketing_consent?: unknown;
  attribution?: unknown;
  first_touch?: unknown;
  page_path?: unknown;
}

function str(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** POST a JSON payload to a downstream lead destination. */
async function postJson(
  url: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, status: response.status };
    }
    return { ok: false, status: response.status, error: `http_${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, error: message.slice(0, 120) };
  }
}

serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(
      { error: { code: "method_not_allowed", message: "Use POST." } },
      405,
    );
  }

  let body: CaptureBody;
  try {
    const raw = await req.text();
    const parsed = raw && raw.trim() ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse(
        { error: { code: "validation_error", message: "Malformed JSON body." } },
        422,
      );
    }
    body = parsed as CaptureBody;
  } catch {
    return jsonResponse(
      { error: { code: "validation_error", message: "Malformed JSON body." } },
      422,
    );
  }

  const phoneNormalized = phoneToLast10(body.phone);
  if (!phoneNormalized) {
    return jsonResponse(
      { error: { code: "invalid_phone", message: "A valid phone number is required." } },
      422,
    );
  }

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error("capture-lead: service_client_failed", error?.message ?? error);
    return jsonResponse(
      { error: { code: "internal", message: "Could not capture the lead." } },
      500,
    );
  }

  // --- rate limits --------------------------------------------------------
  const clientIp = extractClientIp(req);

  const memoryPhone = hitRateLimit(
    `memcap:${phoneNormalized}`,
    CAPTURE_RATE_LIMIT_MAX,
    CAPTURE_RATE_LIMIT_WINDOW_MS,
  );
  if (!memoryPhone.allowed) {
    return jsonResponse(
      { error: { code: "rate_limited", message: "Too many attempts. Try again shortly." } },
      429,
    );
  }

  const durablePhone = await consumeRateLimit(client, {
    bucketKey: await phoneBucketKey(phoneNormalized),
    limit: CAPTURE_RATE_LIMIT_MAX,
    windowMs: CAPTURE_RATE_LIMIT_WINDOW_MS,
  });
  if (!durablePhone.allowed) {
    return jsonResponse(
      { error: { code: "rate_limited", message: "Too many attempts. Try again shortly." } },
      429,
    );
  }

  if (clientIp) {
    const memoryIp = hitRateLimit(
      `memcapip:${clientIp}`,
      CAPTURE_IP_RATE_LIMIT_MAX,
      CAPTURE_IP_RATE_LIMIT_WINDOW_MS,
    );
    if (!memoryIp.allowed) {
      return jsonResponse(
        { error: { code: "rate_limited", message: "Too many attempts. Try again shortly." } },
        429,
      );
    }
    const durableIp = await consumeRateLimit(client, {
      bucketKey: await ipBucketKey(clientIp),
      limit: CAPTURE_IP_RATE_LIMIT_MAX,
      windowMs: CAPTURE_IP_RATE_LIMIT_WINDOW_MS,
    });
    if (!durableIp.allowed) {
      return jsonResponse(
        { error: { code: "rate_limited", message: "Too many attempts. Try again shortly." } },
        429,
      );
    }
  }

  // --- capture ------------------------------------------------------------
  const source = str(body.source, 60) ?? "homepage_popup";
  const utms = sanitizeLeadUtms(body.attribution);
  const firstTouch = sanitizeLeadFirstTouch(body.first_touch);

  let capture;
  try {
    capture = await captureLead(client as never, {
      phone: phoneNormalized,
      name: str(body.name, 120),
      email: str(body.email, 200),
      locality: str(body.city, 120),
      area: str(body.area, 120),
      source,
      serviceInterest: str(body.service_interest, 120),
      leadSource: null,
      clientSessionId:
        typeof body.client_session_id === "string" ? body.client_session_id : null,
      blockedReason: str(body.blocked_reason, 40),
      dlStatus: str(body.dl_status, 40),
      areaId: str(body.area_id, 80),
      state: str(body.state, 80),
      marketingConsent:
        typeof body.marketing_consent === "boolean" ? body.marketing_consent : null,
      attribution: utms,
      pagePath: typeof body.page_path === "string" ? body.page_path : null,
      userAgent: req.headers.get("user-agent"),
    });
  } catch (error) {
    console.error("capture-lead: capture_failed", error?.message ?? error);
    return jsonResponse(
      { error: { code: "internal", message: "Could not capture the lead." } },
      500,
    );
  }

  if (!capture.ok) {
    return jsonResponse(capture.body, capture.status);
  }

  const leadId = capture.leadId as string;

  // --- downstream delivery ------------------------------------------------
  const formType = FORM_TYPE_BY_SOURCE[source] ?? "popup";
  const leadSource = buildLeadSource(utms, formType);

  // The legacy browser payload was `${countryCode}${phone}` with a literal
  // "+91" country code, so the delivered phone was "+919876543210". The
  // leading plus is preserved when the client sends one, otherwise the sheet
  // and the CRM would receive a different string than they used to.
  const fullPhone = buildFullPhone(str(body.country_code, 8), phoneNormalized);

  const adName = str(body.ad_name, 80) ??
    (source === "homepage_popup"
      ? "Popup Signup Form"
      : source === "rto_modal"
        ? "RTO Lead Form"
        : "Signup Form");

  const city = str(body.city, 120);
  const area = str(body.area, 120);
  const isRto = formType === "rto";

  const sheetPayload = buildLeadSheetPayload({
    email: str(body.email, 200),
    name: str(body.name, 120),
    phone: fullPhone,
    license: body.license === "yes" ? "yes" : "no",
    city,
    area,
    adName,
    leadSource,
    marketingConsent:
      typeof body.marketing_consent === "boolean" ? body.marketing_consent : null,
    liftActivation: str(body.lift_activation, 80),
    society: str(body.society, 120),
  });

  // The RTO form has its own CRM payload (no licence, plus service + owner)
  // and never touched the Google Sheet in the legacy client flow.
  const rtoPayload = buildRtoLeadPayload({
    email: str(body.email, 200),
    name: str(body.name, 120),
    phone: fullPhone,
    locality: str(body.locality, 200) ?? `${city ?? ""}, ${area ?? ""}`,
    adName,
    leadSource,
    service: str(body.service, 120),
    serviceInterest: str(body.service_interest, 200),
    leadOwner: str(body.lead_owner, 120),
  });

  const cratioPayload = buildCratioPayload(
    utms,
    firstTouch,
    isRto ? rtoPayload : sheetPayload,
    new Date().toISOString(),
  );

  const cratioUrl = isRto
    ? envFirst("CRATIO_RTO_WEBHOOK_URL", "VITE_CRATIO_RTO_WEBHOOK_URL")
    : envFirst("CRATIO_WEBHOOK_URL", "VITE_CRATIO_WEBHOOK_URL");

  // Which Google Sheet (if any) receives the lead.
  //   "signup"            -> the signup/popup sheet (legacy default)
  //   "signup_and_mygate" -> signup sheet + the MyGate lift-activation tab
  //   "none"              -> no sheet (the legacy RTO form never had one)
  const requestedSheetTarget = str(body.sheets_target, 30);
  const sheetsTarget = requestedSheetTarget === "signup" ||
      requestedSheetTarget === "signup_and_mygate" ||
      requestedSheetTarget === "none"
    ? requestedSheetTarget
    : isRto
      ? "none"
      : "signup";

  const signupSheetUrl = envFirst("SIGNUP_SHEET_URL") ?? DEFAULT_SIGNUP_SHEET_URL;
  const mygateSheetUrl = envFirst("MYGATE_SHEET_URL", "VITE_MYGATE_SHEET_URL");

  // --- idempotent delivery ------------------------------------------------
  // A repeat capture of the same phone must NOT create a second CRM lead.
  // `cratio_sync_status` on the lead row records the outcome of the previous
  // delivery attempt, so a capture whose lead was already delivered is a
  // no-op downstream. A lead whose previous attempt FAILED is retried — a
  // transient CRM outage must never lose the lead.
  let alreadyDelivered = false;
  if (capture.duplicate) {
    try {
      const { data: leadRow } = await client
        .from("funnel_leads")
        .select("cratio_sync_status")
        .eq("id", leadId)
        .maybeSingle();
      alreadyDelivered =
        String(
          (leadRow as { cratio_sync_status?: string | null } | null)?.cratio_sync_status ?? "",
        ) === "sent";
    } catch {
      // Ignore — fall through to delivering (never lose a lead).
    }
  }

  const delivery: Record<string, string> = {
    cratio: cratioUrl ? "pending" : "not_configured",
    sheets: "pending",
  };
  let clientFallback = true;

  if (alreadyDelivered) {
    // The lead is already in the CRM and the lead sheet. The client must not
    // deliver it again either.
    delivery.cratio = "already_sent";
    delivery.sheets = "already_sent";
    clientFallback = false;
  } else if (cratioUrl) {
    const cratioResult = await postJson(cratioUrl, cratioPayload);
    if (cratioResult.ok) {
      delivery.cratio = "sent";
      clientFallback = false;
      if (sheetsTarget === "none") {
        delivery.sheets = "skipped";
      } else {
        const submittedAt = new Date().toISOString();
        const targets: Array<{ url: string | null; payload: Record<string, string> }> = [
          { url: signupSheetUrl, payload: sheetPayload },
        ];
        if (sheetsTarget === "signup_and_mygate" && mygateSheetUrl) {
          targets.push({
            url: mygateSheetUrl,
            payload: buildMyGateSheetPayload(
              buildMyGateCategory(utms),
              sheetPayload,
              submittedAt,
            ),
          });
        }
        let sheetsFailure: string | null = null;
        for (const target of targets) {
          if (!target.url) continue;
          const sheetsResult = await postJson(target.url, target.payload);
          if (!sheetsResult.ok && !sheetsFailure) {
            sheetsFailure = sheetsResult.error ?? "unknown";
          }
        }
        delivery.sheets = sheetsFailure ? `failed:${sheetsFailure}` : "sent";
      }
    } else {
      delivery.cratio = `failed:${cratioResult.error ?? "unknown"}`;
      delivery.sheets = "skipped";
    }
  } else {
    delivery.sheets = "skipped";
  }

  // Record the delivery outcome on the lead (best effort — never fatal).
  // `already_sent` must NOT downgrade a previously successful delivery back
  // to `pending`, otherwise the next capture would deliver a second time.
  try {
    await updateLeadProgress(client as never, leadId, {
      cratioSyncStatus:
        delivery.cratio === "sent" || delivery.cratio === "already_sent"
          ? "sent"
          : "pending",
    });
  } catch {
    // Ignore.
  }

  return jsonResponse({
    ok: true,
    leadId,
    sessionId: capture.sessionId ?? null,
    duplicate: Boolean(capture.duplicate),
    leadSource,
    delivery,
    clientFallback,
  });
});
