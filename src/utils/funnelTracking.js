/**
 * Client-side funnel tracker.
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
 * `VITE_FUNNEL_TRACKING=off` disables every outbound call. The session id is
 * still created (so the booking flow can keep stitching events), but nothing
 * is sent.
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
 * Kept in sync with `_shared/funnelTaxonomy.ts` -> `CLIENT_EVENT_NAMES`.
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
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) {
      memorySessionId = stored;
      return memorySessionId;
    }
    const created = uuidv4();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    memorySessionId = created;
    return created;
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

function postEvent(payload) {
  if (!SUPABASE_URL || !ANON_KEY) return Promise.resolve(false);
  try {
    return fetch(`${SUPABASE_URL}/functions/v1/track-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
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
      properties: e.properties && typeof e.properties === "object" ? e.properties : {},
      attribution,
    }));

  if (batch.length === 0) return Promise.resolve(false);

  if (!SUPABASE_URL || !ANON_KEY) return Promise.resolve(false);
  try {
    return fetch(`${SUPABASE_URL}/functions/v1/track-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    })
      .then((response) => response.ok)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

export { CLIENT_EVENT_NAMES };
