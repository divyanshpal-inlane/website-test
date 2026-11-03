// Canonical acquisition-funnel event taxonomy + property sanitiser.
//
// Pure module — no Deno imports, no network, no DB. Importable from the Node
// test harness (`supabase/functions/_tests/`) and from every funnel edge
// function.
//
// ---------------------------------------------------------------------------
// PROVENANCE
// ---------------------------------------------------------------------------
// The event names below are the PRD section 4 "Canonical event names" list,
// verbatim and in PRD order. Do NOT rename, re-order or invent events: the
// metric queries in PHASE0_PLAN.md section 9 and the PRD success metrics
// (lead capture rate, price-unlock rate, session conversion, supply-blocked
// rate, priority-hold conversion) are all expressed in these names.
//
//   home_viewed, location_entered, dl_status_selected, course_list_viewed,
//   price_unlock_attempted, lead_sheet_dismissed, lead_captured,
//   expert_contact_requested, slots_viewed, slot_selected, course_selected,
//   plan_page_viewed, payment_option_selected, payment_initiated,
//   payment_success, payment_failed, booking_confirmed, supply_gap_logged,
//   priority_hold_initiated, priority_hold_paid, priority_hold_declined
//
// ---------------------------------------------------------------------------
// SECURITY POSTURE
// ---------------------------------------------------------------------------
// * ALLOWLIST, not denylist. A property that is not explicitly listed for the
//   event is dropped. New PII can therefore never leak into the event log by
//   accident.
// * A PII denylist is applied ON TOP of the allowlist as defense in depth.
// * No nested objects/arrays are accepted (no free-form payloads).
// * Strings are truncated; key count is capped.
// * Page paths are stripped of query string + hash (no PII in URLs).
// * `lead_captured` and every payment/booking event is SERVER-ONLY. Clients may
//   never emit them, and clients may NEVER supply a `lead_id`.
// * Deliberate deviations from the PRD's literal wording (documented in
//   PHASE0_PLAN.md section 3.3 and the Phase 0 verification report):
//   - `location_entered` does NOT store the raw location string or the
//     resolved coordinates. The raw string is free text and can contain a home
//     address; the coordinates are precise location. We store the resolved
//     area id / area name / locality / serviceability instead.
//   - `course_list_viewed` stores course codes as a comma-separated string
//     (the event log rejects arrays).

export const FUNNEL_EVENTS = [
  "home_viewed",
  "location_entered",
  "dl_status_selected",
  "course_list_viewed",
  "price_unlock_attempted",
  "lead_sheet_dismissed",
  "lead_captured",
  "expert_contact_requested",
  "slots_viewed",
  "slot_selected",
  "course_selected",
  "plan_page_viewed",
  "payment_option_selected",
  "payment_initiated",
  "payment_success",
  "payment_failed",
  "booking_confirmed",
  "supply_gap_logged",
  "priority_hold_initiated",
  "priority_hold_paid",
  "priority_hold_declined",
] as const;

/** A PRD section 4 canonical event name. */
export type PrdEventName = (typeof FUNNEL_EVENTS)[number];

/**
 * Additive Phase 0 *lifecycle* events.
 *
 * These are deliberately NOT part of `FUNNEL_EVENTS`: PRD section 4 defines
 * exactly 21 canonical events and the metric queries are written against those
 * names. Lifecycle events instrument the ingestion pipeline itself (session
 * start, serviceability-check start, lead-form open) and are declared
 * separately so the PRD contract stays verifiable and cannot silently drift.
 */
export const LIFECYCLE_EVENTS = [
  "funnel_session_started",
  "serviceability_check_started",
  "lead_capture_started",
] as const;

export type LifecycleEventName = (typeof LIFECYCLE_EVENTS)[number];

export type FunnelEventName = PrdEventName | LifecycleEventName;

/** Every event name the ingestion path accepts (PRD §4 + lifecycle). */
export const ALL_EVENT_NAMES = [...FUNNEL_EVENTS, ...LIFECYCLE_EVENTS] as const;

/**
 * Events only the server may write.
 *
 * `lead_captured` is the funnel commit point — it is emitted by `capture-lead`
 * after the backend has confirmed the lead write, never by a browser.
 * The payment/booking/supply/priority events are all produced by edge
 * functions that own the corresponding state transition.
 *
 * The two server lifecycle events are *derived server-side* (a new session
 * row, an inbound serviceability request), so a browser can never forge them.
 */
export const SERVER_ONLY_EVENT_NAMES: readonly FunnelEventName[] = [
  "lead_captured",
  "payment_initiated",
  "payment_success",
  "payment_failed",
  "booking_confirmed",
  "supply_gap_logged",
  "priority_hold_initiated",
  "priority_hold_paid",
  "priority_hold_declined",
  "funnel_session_started",
  "serviceability_check_started",
];

/** Events a browser client is allowed to report. */
export const CLIENT_EVENT_NAMES: readonly FunnelEventName[] = ALL_EVENT_NAMES.filter(
  (n) => !SERVER_ONLY_EVENT_NAMES.includes(n),
);

/**
 * PRD section 4: events that only exist from Phase 5 / Phase 6 onwards.
 * Phase 0 records none of them; they are listed so the wiring is future-proof
 * and so the "computable at Phase 0 exit" audit stays honest.
 */
export const LATER_PHASE_EVENT_NAMES: readonly FunnelEventName[] = [
  "price_unlock_attempted",
  "supply_gap_logged",
  "priority_hold_initiated",
  "priority_hold_paid",
  "priority_hold_declined",
];

/** The canonical lead source / form identifiers used across the funnel. */
export const FUNNEL_FORMS = [
  "homepage_popup",
  "signup_page",
  "signup_page_2",
  "rto_modal",
  "talk_to_expert",
  "booking_flow",
] as const;

export type FunnelForm = (typeof FUNNEL_FORMS)[number];

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
export const MAX_PROPERTY_KEYS = 12;
export const MAX_PROPERTY_STRING_LENGTH = 200;
export const MAX_PAGE_PATH_LENGTH = 300;
export const MAX_CLIENT_EVENT_ID_LENGTH = 120;
export const MAX_FORM_NAME_LENGTH = 60;

/** Client-event rate limit: 60 events per session per 10 minutes. */
export const EVENT_RATE_LIMIT_MAX = 60;
export const EVENT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Client-event rate limit: 300 events per hashed-IP per 10 minutes. */
export const EVENT_IP_RATE_LIMIT_MAX = 300;
export const EVENT_IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Lead-capture rate limit: 5 capture attempts per phone per 10 minutes. */
export const CAPTURE_RATE_LIMIT_MAX = 5;
export const CAPTURE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Lead-capture rate limit: 20 capture attempts per hashed IP per 10 minutes. */
export const CAPTURE_IP_RATE_LIMIT_MAX = 20;
export const CAPTURE_IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** How far in the past a client-supplied `occurred_at` may be. */
export const MAX_OCCURRED_AT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** How far in the future a client-supplied `occurred_at` may be. */
export const MAX_OCCURRED_AT_SKEW_MS = 5 * 60 * 1000;

/**
 * Version of the persisted event envelope.
 *
 * Every event written through `emitFunnelEvent` carries this under
 * `properties.schema_version` (server-controlled, never client-supplied) so a
 * later contract change can be detected in the raw log without a migration.
 */
export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Property allowlists
// ---------------------------------------------------------------------------

/** Property keys allowed on EVERY event. */
export const COMMON_PROPERTY_KEYS: readonly string[] = [
  "form",
  "page_type",
  "referrer_host",
];

/** Per-event property allowlists. */
export const EVENT_PROPERTY_KEYS: Record<FunnelEventName, readonly string[]> = {
  home_viewed: ["page_type"],
  // Area id / name / locality only — NEVER the raw input string, NEVER lat/lng.
  location_entered: ["area_id", "area_name", "locality", "serviceable", "input_source"],
  dl_status_selected: ["dl_status"],
  course_list_viewed: ["course_count", "course_ids", "dl_status"],
  price_unlock_attempted: ["course_id", "course_code"],
  lead_sheet_dismissed: ["form", "page_type"],
  lead_captured: [
    "form",
    "lead_source",
    "service_interest",
    "blocked_reason",
    "dl_status",
    "area_id",
  ],
  expert_contact_requested: [
    "cta_location",
    "page_type",
    "dl_status",
    "area_id",
    "courses_viewed_count",
  ],
  slots_viewed: ["slot_count", "course_id", "course_code", "area_id", "scheduling_mode"],
  slot_selected: ["course_id", "course_code", "slot_date", "slot_start"],
  course_selected: ["course_id", "course_code", "course_price"],
  plan_page_viewed: ["course_id", "course_code", "total_lessons", "plan_mode"],
  // `installment_mode` mirrors the existing `booking.installment_mode` /
  // `payment.installment_type` vocabulary (full | first_half) so the funnel
  // log and the booking row can be joined without a translation table.
  payment_option_selected: ["installment_mode", "amount"],
  payment_initiated: ["installment_mode", "amount", "gateway"],
  payment_success: ["installment_mode", "amount", "gateway", "payment_id"],
  payment_failed: ["installment_mode", "amount", "gateway", "error_code", "reason"],
  booking_confirmed: ["course_id", "course_code", "amount", "scheduled_count", "booking_id"],
  // F6 — exactly the payload `supplyGapEventProperties()` emits (12 keys, which
  // is MAX_PROPERTY_KEYS). `slot_count` is retired: the fallback ladder explains
  // WHY a course could not be built instead of only how many slots existed.
  supply_gap_logged: [
    "area_id",
    "course_id",
    "cause",
    "supply_kind",
    "requested_date",
    "requested_window",
    "preferred_times",
    "dl_status",
    "eligible_instructor_count",
    "considered_instructor_count",
    "search_exhaustive",
    "failure_reason",
  ],
  priority_hold_initiated: ["course_id", "course_code", "amount", "expires_at"],
  priority_hold_paid: ["course_id", "course_code", "amount", "expires_at"],
  priority_hold_declined: ["course_id", "course_code", "amount"],
  // --- additive Phase 0 lifecycle events (not PRD §4) ---
  // `surface` is injected server-side from the sanitised page path; a client
  // value is always overwritten.
  funnel_session_started: ["surface"],
  serviceability_check_started: ["input_source"],
  lead_capture_started: ["form", "page_type"],
};

/**
 * PII / sensitive key denylist applied on top of the allowlist.
 * Matched case-insensitively against the normalised key.
 */
export const PII_PROPERTY_KEYS: readonly string[] = [
  "name",
  "full_name",
  "first_name",
  "last_name",
  "surname",
  "email",
  "email_address",
  "phone",
  "phone_number",
  "mobile",
  "contact",
  "contact_number",
  "address",
  "street",
  "landmark",
  "apartment",
  "flat",
  "pincode",
  "pin_code",
  "zipcode",
  "zip",
  "dob",
  "birth_date",
  "password",
  "passcode",
  "otp",
  "token",
  "auth",
  "authorization",
  "cookie",
  "session_token",
  "ip",
  "ip_address",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "long",
  "message",
  "note",
  "notes",
  "comment",
  "comments",
  "description",
  "free_text",
  "user_input",
  "detail",
  "details",
  "query",
  "search",
  "utm_term",
  "utm_content",
  "gclid",
  "device_id",
  "idfa",
  "imei",
  "fingerprint",
];

// ---------------------------------------------------------------------------
// Lead states (PRD section 4)
// ---------------------------------------------------------------------------

export const LEAD_STATES = [
  "new",
  "captured",
  "slot_engaged",
  "payment_attempted",
  "converted",
  "dropped",
  "supply_blocked",
  "priority_hold",
] as const;

export type LeadState = (typeof LEAD_STATES)[number];

// ---------------------------------------------------------------------------
// Prioritisation tiers (PRD section 4)
// ---------------------------------------------------------------------------

export const PRIORITY_TIERS = ["P0", "P1", "P2", "P3", "S", "X"] as const;
export type PriorityTier = (typeof PRIORITY_TIERS)[number];

/**
 * Rank used to enforce "re-tiering is upward-only, never downward".
 *
 * The P ladder is P3 < P2 < P1 < P0. S (supply blocked) and X (out of area)
 * are different queues, not lower rungs of the sales ladder, so they sit at
 * the bottom of the rank and are only replaced by a genuine P-tier.
 */
const TIER_RANK: Record<PriorityTier, number> = {
  X: 1,
  S: 2,
  P3: 3,
  P2: 4,
  P1: 5,
  P0: 6,
};

/** Merge two tiers, keeping the higher-ranked one (upward-only). */
export function mergePriorityTier(
  current: string | null | undefined,
  next: PriorityTier | null | undefined,
): PriorityTier | null {
  const cur = isPriorityTier(current) ? current : null;
  const nxt = isPriorityTier(next) ? next : null;
  if (!cur) return nxt;
  if (!nxt) return cur;
  return TIER_RANK[nxt] > TIER_RANK[cur] ? nxt : cur;
}

export function isPriorityTier(value: unknown): value is PriorityTier {
  return typeof value === "string" && (PRIORITY_TIERS as readonly string[]).includes(value);
}

export function isLeadState(value: unknown): value is LeadState {
  return typeof value === "string" && (LEAD_STATES as readonly string[]).includes(value);
}

/** Everything the server knows about a lead when it recomputes the tier. */
export interface TierSignals {
  /** The lead has been captured (a `lead_captured` event exists). */
  captured?: boolean;
  /** The customer asked for a person ("Talk to an expert"). */
  expertRequested?: boolean;
  /** A payment was started. */
  paymentAttempted?: boolean;
  /** The payment completed. */
  paymentSucceeded?: boolean;
  /** The customer reached the plan page with a slot + course selected. */
  planReached?: boolean;
  /** A slot was selected. */
  slotSelected?: boolean;
  /** Prices were viewed (unlock attempted). */
  pricesViewed?: boolean;
  /** Zero slots in the requested area -> routed to instructor acquisition. */
  supplyBlocked?: boolean;
  /** The resolved location is outside our service area. */
  outOfArea?: boolean;
}

/**
 * Compute the prioritisation tier for a lead from its accumulated signals.
 *
 * Precedence (PRD section 4 + section 7 acceptance criteria):
 *   1. Out of area -> X. The PRD states "Out-of-area leads never enter the
 *      sales calling queue", so X wins over the P ladder even when the lead
 *      also asked for an expert.
 *   2. Supply blocked -> S. Routed to instructor acquisition, not the sales
 *      queue.
 *   3. P0 — expert request, or payment initiated but not completed.
 *   4. P1 — slot + course selected and the plan page reached, no payment.
 *   5. P2 — captured, prices viewed, no slot selected.
 *   6. P3 — captured, exited before viewing prices.
 */
export function computePriorityTier(signals: TierSignals): PriorityTier | null {
  if (signals.outOfArea) return "X";
  if (signals.supplyBlocked) return "S";
  if (signals.expertRequested) return "P0";
  if (signals.paymentAttempted && !signals.paymentSucceeded) return "P0";
  if (signals.planReached && signals.slotSelected) return "P1";
  if (signals.captured && signals.pricesViewed && !signals.slotSelected) return "P2";
  if (signals.captured && !signals.pricesViewed) return "P3";
  return null;
}

/**
 * Advance the lead state for an event.
 *
 * PRD section 4: new -> captured -> slot_engaged -> payment_attempted ->
 * converted | dropped | supply_blocked | priority_hold.
 *
 * `converted` and `dropped` are final. `supply_blocked` / `priority_hold` are
 * off-path states: a lead that later pays moves on to payment_attempted and
 * finally converted.
 *
 * Returns the NEW state, or null when the event does not move the lead.
 */
export function nextLeadState(
  current: string | null | undefined,
  eventName: FunnelEventName | string,
): LeadState | null {
  const cur = isLeadState(current) ? current : "new";
  if (cur === "converted" || cur === "dropped") return null;

  switch (eventName) {
    case "lead_captured":
      return "captured";
    case "slots_viewed":
    case "slot_selected":
      // Only meaningful once the lead exists; a pre-capture slot view still
      // moves a captured lead forward.
      return cur === "new" ? null : "slot_engaged";
    case "payment_initiated":
      return "payment_attempted";
    case "payment_success":
    case "booking_confirmed":
      return "converted";
    case "supply_gap_logged":
      return "supply_blocked";
    case "priority_hold_initiated":
      return "priority_hold";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a property key: lowercase, trim, non `[a-z0-9_]` -> `_`. */
export function normalizePropertyKey(key: unknown): string | null {
  if (typeof key !== "string") return null;
  const normalized = key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  if (!normalized) return null;
  return normalized.slice(0, 64);
}

export function isKnownFunnelEvent(name: unknown): name is FunnelEventName {
  return typeof name === "string" && (ALL_EVENT_NAMES as readonly string[]).includes(name);
}

export function isClientEvent(name: unknown): name is FunnelEventName {
  return isKnownFunnelEvent(name) && !SERVER_ONLY_EVENT_NAMES.includes(name);
}

export function isServerOnlyEvent(name: unknown): boolean {
  return typeof name === "string" && (SERVER_ONLY_EVENT_NAMES as readonly string[]).includes(name);
}

/** The set of property keys a given event may carry. */
export function allowedPropertyKeys(eventName: FunnelEventName): Set<string> {
  return new Set<string>([
    ...COMMON_PROPERTY_KEYS,
    ...(EVENT_PROPERTY_KEYS[eventName] ?? []),
  ]);
}

/**
 * Coerce a single property value to a storable primitive.
 * Returns `undefined` when the value is not acceptable.
 */
export function coercePropertyValue(
  value: unknown,
): string | number | boolean | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, MAX_PROPERTY_STRING_LENGTH);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value;
  }
  if (typeof value === "boolean") return value;
  // Objects, arrays, null, undefined, functions, symbols -> dropped.
  return undefined;
}

export interface SanitizePropertiesResult {
  properties: Record<string, string | number | boolean>;
  /** Normalised property keys that were dropped (schema keys only, no values). */
  dropped: string[];
}

/**
 * Sanitise the client-supplied property bag for an event.
 *
 * Unknown keys, PII keys, nested structures, over-long strings and
 * over-many keys are all dropped. The result is always safe to persist.
 */
export function sanitizeProperties(
  eventName: FunnelEventName,
  input: unknown,
): SanitizePropertiesResult {
  const properties: Record<string, string | number | boolean> = {};
  const dropped: string[] = [];

  if (!isKnownFunnelEvent(eventName)) return { properties, dropped };
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { properties, dropped };
  }

  const allowed = allowedPropertyKeys(eventName);
  const denied = new Set(PII_PROPERTY_KEYS);

  for (const rawKey of Object.keys(input as Record<string, unknown>)) {
    const key = normalizePropertyKey(rawKey);
    if (!key) {
      dropped.push("<invalid>");
      continue;
    }
    if (denied.has(key)) {
      dropped.push(key);
      continue;
    }
    if (!allowed.has(key)) {
      dropped.push(key);
      continue;
    }
    if (Object.keys(properties).length >= MAX_PROPERTY_KEYS) {
      dropped.push(key);
      continue;
    }
    const value = coercePropertyValue((input as Record<string, unknown>)[rawKey]);
    if (value === undefined) {
      dropped.push(key);
      continue;
    }
    properties[key] = value;
  }

  return { properties, dropped };
}

/**
 * Sanitise a page path. Only the path survives — query string and hash are
 * stripped so no PII (emails, phones, tokens in query params) is ever stored.
 */
export function sanitizePagePath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let path = input.trim();
  if (!path.startsWith("/")) return null;
  const hashIndex = path.indexOf("#");
  if (hashIndex !== -1) path = path.slice(0, hashIndex);
  const queryIndex = path.indexOf("?");
  if (queryIndex !== -1) path = path.slice(0, queryIndex);
  path = path.replace(/\s+/g, " ").trim();
  if (!path) return null;
  if (path.length > MAX_PAGE_PATH_LENGTH) path = path.slice(0, MAX_PAGE_PATH_LENGTH);
  return path;
}

/**
 * Coarse "source surface" label derived from an already-sanitised page path.
 *
 * This fills the *source* capability of the event log (which surface of the
 * product the action came from) without adding a column and without trusting
 * a client-supplied value: it is always recomputed server-side from
 * `page_path`.
 */
export function deriveSurface(pagePath: string | null | undefined): string {
  const path = typeof pagePath === "string" ? pagePath.trim().toLowerCase() : "";
  if (!path) return "unknown";
  if (path === "/") return "marketing_home";
  if (path.startsWith("/book")) return "booking_flow";
  if (path.startsWith("/course")) return "courses";
  if (path.startsWith("/rto")) return "rto";
  if (path.startsWith("/signup") || path.startsWith("/login")) return "auth";
  if (path.startsWith("/thank-you") || path.startsWith("/thankyou")) return "thank_you";
  if (path.startsWith("/checkout") || path.startsWith("/payment")) return "checkout";
  if (path.startsWith("/mygate")) return "mygate";
  return "other";
}

/**
 * Reduce a referrer to its host only. No path, no query, no user info.
 */
export function sanitizeReferrerHost(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  let host = trimmed;
  const schemeIndex = host.indexOf("://");
  if (schemeIndex !== -1) host = host.slice(schemeIndex + 3);
  const slashIndex = host.indexOf("/");
  if (slashIndex !== -1) host = host.slice(0, slashIndex);
  const atIndex = host.indexOf("@");
  if (atIndex !== -1) host = host.slice(atIndex + 1);
  host = host.split(":")[0].trim().toLowerCase();
  if (!host) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return host.slice(0, 120);
}

/** Normalise a funnel form identifier. Returns null when not recognised. */
export function normalizeForm(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  if ((FUNNEL_FORMS as readonly string[]).includes(trimmed)) return trimmed;
  if (trimmed.length > MAX_FORM_NAME_LENGTH) return null;
  return trimmed;
}

/**
 * The server-derived idempotency key for a lead capture.
 * Guarantees exactly ONE `lead_captured` row per lead (the DB also enforces
 * this with a partial unique index).
 */
export function deriveCaptureClientEventId(leadId: string): string {
  return `capture:${leadId}`;
}

/**
 * Normalise a client event id: trimmed, bounded, no control characters.
 * Returns null when the value is unusable.
 */
export function normalizeClientEventId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\x00-\x1f]/g, "").trim();
  if (!cleaned) return null;
  if (cleaned.length > MAX_CLIENT_EVENT_ID_LENGTH) {
    return cleaned.slice(0, MAX_CLIENT_EVENT_ID_LENGTH);
  }
  return cleaned;
}

/** Is this a syntactically valid UUID (any version)? */
export function isUuid(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Normalise a phone number to the lead dedupe key: the last 10 digits.
 * Rejects anything that is not at least 10 digits.
 */
export function phoneToLast10(input: unknown): string | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const digits = String(input).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * Clamp a client-supplied event timestamp into a sane window.
 *
 * The event's real occurrence time is preserved (that is the whole point of
 * the funnel log); only absurd values — far in the past (stale queue) or in
 * the future (clock skew / spoofing) — are clamped. Ingestion time is always
 * recorded separately in `created_at`.
 */
export function normalizeOccurredAt(input: unknown, now: number = Date.now()): string {
  const fallback = new Date(now).toISOString();
  if (typeof input !== "string" && typeof input !== "number") return fallback;
  const parsed = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(parsed)) return fallback;
  const min = now - MAX_OCCURRED_AT_AGE_MS;
  const max = now + MAX_OCCURRED_AT_SKEW_MS;
  const clamped = Math.min(Math.max(parsed, min), max);
  return new Date(clamped).toISOString();
}

/**
 * Coarse device class from the User-Agent. Deliberately NOT fingerprinting:
 * no canvas, no fonts, no hardware ids, no screen metrics, no IP.
 */
export function classifyDevice(userAgent: string | null | undefined): "desktop" | "mobile" | "tablet" {
  if (typeof userAgent !== "string" || !userAgent) return "desktop";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk|kindle/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini|windows phone/.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

/** Normalise the coarse DL qualification label stored on the lead row. */
export function normalizeDlStatus(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  const allowed = [
    "has_dl",
    "no_dl",
    "two_wheeler_ll_only",
    "two_wheeler_active_dl",
    "unknown",
  ];
  return allowed.includes(v) ? v : null;
}
