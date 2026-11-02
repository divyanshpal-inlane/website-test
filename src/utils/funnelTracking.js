/**
 * Client-side funnel tracker + authoritative lead capture.
 *
 * TRUST BOUNDARY
 * --------------
 * The browser may only report the client-allowed half of the canonical PRD
 * section 4 taxonomy. It may NOT:
 *   * emit a server-only event (`lead_captured`, `payment_*`, `booking_confirmed`,
 *     `supply_gap_logged`, `priority_hold_*`) — the server rejects them with
 *     403 and the tracker never sends them;
 *   * supply a `lead_id` — the lead is always resolved server-side from the
 *     session, and only `capture-lead` may set it;
 *   * set the lead state or the prioritisation tier — both are recomputed
 *     server-side on every event.
 *
 * The tracker is deliberately fire-and-forget: a tracking failure must NEVER
 * break a customer journey. Every error is swallowed.
 *
 * KILL SWITCH
 * -----------
 * `VITE_FUNNEL_TRACKING=off` disables every outbound call — both the event
 * tracker and the lead capture.
 *
 * IDEMPOTENCY
 * -----------
 * `client_event_id` is a deterministic hash of the event name + its target.
 * React StrictMode double-renders, a re-mount, a retry and a double click
 * therefore collapse into ONE row on the server (`unique (session_id,
 * client_event_id)`), while a genuinely different target is a new event.
 */

import { resolveUTMsForSubmission } from "./utmTracking";

const SESSION_STORAGE_KEY = "lane_funnel_session_id";

/**
 * The client-allowed PRD section 4 events (server-only ones removed).
 * Kept in sync with `inlane-web-main/supabase/functions/_shared/funnelTaxonomy.ts`
 * -> `CLIENT_EVENT_NAMES`.
 */
const CLIENT_EVENT_NAMES = new Set([
  "home_viewed",
  "location_entered",
  "dl_status_selected",
  "course_list_viewed",
  "price_unlock_attempted",
  "lead_sheet_dismissed",
  "expert_contact_requested",
  "slots_viewed",
  "slot_selected",
  "course_selected",
  "plan_page_viewed",
  "payment_option_selected",
  "lead_capture_started",
]);

// `import.meta.env` is replaced statically by Vite. The `?? {}` keeps the
// module importable outside a bundler (e.g. a plain Node import) without
// throwing.
const FUNNEL_ENV = import.meta.env ?? {};

const TRACKING_ENABLED = FUNNEL_ENV.VITE_FUNNEL_TRACKING !== "off";

const SUPABASE_URL = FUNNEL_ENV.VITE_SUPABASE_URL || "";
const ANON_KEY = FUNNEL_ENV.VITE_SUPABASE_ANON_KEY || "";

// Fallback session id when sessionStorage is unavailable (private browsing,
// blocked storage). The session then lives only for this page view.
let memorySessionId = null;

/**
 * A stable, non-cryptographic 32-bit hash (FNV-1a) rendered as 8 hex chars.
 * Deterministic across reloads — that is the whole point.
 */
function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function uuidv4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC-4122 v4 from crypto.getRandomValues (or a Math.random fallback).
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

/**
 * The funnel session id for this browsing session.
 *
 * A uuid4 kept in `sessionStorage` — it dies with the tab, so it is NOT a
 * durable identifier and can never be used to follow a customer across
 * sessions. It is NEVER an e-mail address or a phone number.
 */
export function getFunnelSessionId() {
  if (memorySessionId) return memorySessionId;
  try {
    const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (
      stored &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)
    ) {
      memorySessionId = stored;
      return memorySessionId;
    }
    const created = uuidv4();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    memorySessionId = created;
    return memorySessionId;
  } catch {
    memorySessionId = uuidv4();
    return memorySessionId;
  }
}

/**
 * The deterministic idempotency key for a client event.
 *
 * `target` is the discriminator that makes two occurrences of the SAME event
 * different (e.g. the course id for `course_selected`). When it is omitted the
 * event name alone is used, which means "once per session".
 */
export function buildClientEventId(eventName, target) {
  return `c:${fnv1a(`${eventName}|${target ?? ""}`)}`;
}

/** The current page path WITHOUT the query string (no PII in URLs). */
function currentPagePath() {
  try {
    return window.location.pathname || "/";
  } catch {
    return "/";
  }
}

/** The referring host (never the full URL, never the path). */
function currentReferrerHost() {
  try {
    if (!document.referrer) return "";
    const host = new URL(document.referrer).hostname.toLowerCase();
    if (host === window.location.hostname.toLowerCase()) return "";
    return host;
  } catch {
    return "";
  }
}

/** Attribution for the current event: utm source/medium/campaign + referrer host. */
export function getFunnelAttribution() {
  try {
    const utms = resolveUTMsForSubmission();
    return {
      utm_source: utms.utm_source || "",
      utm_medium: utms.utm_medium || "",
      utm_campaign: utms.utm_campaign || "",
      referrer_host: currentReferrerHost(),
    };
  } catch {
    return {
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      referrer_host: "",
    };
  }
}

/**
 * The last-touch + first-touch attribution the lead capture needs.
 * Mirrors the shape the server's `sanitizeLeadUtms` / `sanitizeLeadFirstTouch`
 * accept.
 */
export function getLeadAttribution() {
  try {
    const utms = resolveUTMsForSubmission();
    return {
      attribution: {
        utm_source: utms.utm_source || "",
        utm_medium: utms.utm_medium || "",
        utm_campaign: utms.utm_campaign || "",
        utm_term: utms.utm_term || "",
        utm_content: utms.utm_content || "",
        gclid: utms.gclid || "",
      },
      first_touch: {
        first_utm_source: utms.first_utm_source || "",
        first_utm_medium: utms.first_utm_medium || "",
        first_utm_campaign: utms.first_utm_campaign || "",
        first_utm_term: utms.first_utm_term || "",
        first_utm_content: utms.first_utm_content || "",
        first_gclid: utms.first_gclid || "",
        first_captured_at: utms.first_captured_at || "",
      },
    };
  } catch {
    return { attribution: {}, first_touch: {} };
  }
}

function edgeHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  };
}

function postEvent(payload) {
  if (!SUPABASE_URL || !ANON_KEY) return Promise.resolve(false);
  try {
    return fetch(`${SUPABASE_URL}/functions/v1/track-event`, {
      method: "POST",
      headers: edgeHeaders(),
      body: JSON.stringify(payload),
      // Keeps the request alive when the page is being unloaded.
      keepalive: true,
    })
      .then((response) => response.ok)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Report one funnel event.
 *
 * @param {string} eventName   A PRD section 4 client-allowed event name.
 * @param {object} [properties] Allowlisted properties only (the server drops
 *   everything else and never stores free text).
 * @param {object} [options]
 * @param {string} [options.target]  Discriminator for the idempotency key.
 * @param {string} [options.occurredAt] ISO timestamp of the real occurrence.
 * @returns {Promise<boolean>} whether the event was accepted by the server.
 */
export function trackFunnelEvent(eventName, properties, options = {}) {
  if (!TRACKING_ENABLED) return Promise.resolve(false);
  if (!CLIENT_EVENT_NAMES.has(eventName)) {
    // A server-only or unknown event. Silently ignored — the browser is never
    // allowed to write those.
    return Promise.resolve(false);
  }

  const payload = {
    event_name: eventName,
    client_session_id: getFunnelSessionId(),
    client_event_id: buildClientEventId(eventName, options.target),
    occurred_at: options.occurredAt || new Date().toISOString(),
    page_path: currentPagePath(),
    properties: properties && typeof properties === "object" ? properties : {},
    attribution: getFunnelAttribution(),
  };

  return postEvent(payload);
}

/**
 * Report a batch of events in one request (max 10 on the server).
 * @param {Array<{event_name: string, properties?: object, target?: string}>} events
 */
export function trackFunnelEvents(events) {
  if (!TRACKING_ENABLED) return Promise.resolve(false);
  if (!Array.isArray(events) || events.length === 0) return Promise.resolve(false);

  const sessionId = getFunnelSessionId();
  const attribution = getFunnelAttribution();
  const pagePath = currentPagePath();
  const now = new Date().toISOString();

  const batch = events
    .filter((e) => e && CLIENT_EVENT_NAMES.has(e.event_name))
    .slice(0, 10)
    .map((e) => ({
      event_name: e.event_name,
      client_session_id: sessionId,
      client_event_id: buildClientEventId(e.event_name, e.target),
      occurred_at: e.occurred_at || now,
      page_path: pagePath,
      properties:
        e.properties && typeof e.properties === "object" ? e.properties : {},
      attribution,
    }));

  if (batch.length === 0) return Promise.resolve(false);

  if (!SUPABASE_URL || !ANON_KEY) return Promise.resolve(false);
  try {
    return fetch(`${SUPABASE_URL}/functions/v1/track-event`, {
      method: "POST",
      headers: edgeHeaders(),
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    })
      .then((response) => response.ok)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Capture a lead through the authoritative server path.
 *
 * The server owns the CRM (Cratio) and lead-sheet delivery: it records the
 * lead, writes the `lead_captured` event and forwards the lead downstream.
 *
 * The response tells the caller what to do next:
 *   * `clientFallback: false` — the server delivered the lead. The caller
 *     must NOT deliver it again.
 *   * `clientFallback: true`  — the server did NOT deliver the lead (the CRM
 *     is not configured, or the CRM call failed). The caller MUST perform its
 *     original browser-side delivery so the lead is never lost.
 *
 * @param {object} lead  The lead fields (see the `capture-lead` contract).
 * @returns {Promise<{ok: boolean, clientFallback: boolean, response: object}>}
 */
export async function captureFunnelLead(lead) {
  const fallback = { ok: false, clientFallback: true, response: {} };
  if (!TRACKING_ENABLED) return fallback;
  if (!SUPABASE_URL || !ANON_KEY) return fallback;

  const { attribution, first_touch } = getLeadAttribution();
  const body = {
    ...lead,
    client_session_id: getFunnelSessionId(),
    page_path: currentPagePath(),
    attribution,
    first_touch,
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/capture-lead`, {
      method: "POST",
      headers: edgeHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      // 429 (rate limited) or a server error — the caller falls back.
      return fallback;
    }
    const data = await response.json();
    return {
      ok: true,
      // Be conservative: anything other than an explicit "false" means the
      // caller must deliver the lead itself.
      clientFallback: data?.clientFallback !== false,
      response: data || {},
    };
  } catch {
    return fallback;
  }
}

export { CLIENT_EVENT_NAMES };
/ /   F o r c e   d e p l o y   1 1 / 0 2 / 2 0 2 6   1 6 : 4 8 : 4 5  
 