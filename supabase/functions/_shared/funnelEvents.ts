// Funnel event orchestration.
//
// Sits between the edge functions and the two pure modules
// (`funnelTaxonomy.ts` — the canonical taxonomy, `funnelStore.ts` — the
// persistence layer) and owns the policy:
//
//   * a browser may only report a client-allowed event, and never with a
//     `lead_id` of its own;
//   * every event is sanitised before it is written;
//   * the lead's state and prioritisation tier are recomputed server-side on
//     every event and re-tiering is upward-only;
//   * instrumentation NEVER breaks the caller — every public function here
//     swallows its own errors and reports a result instead of throwing.
//
// Pure of Deno-only APIs so the Node test harness can import it.

import {
  classifyDevice,
  deriveCaptureClientEventId,
  deriveSurface,
  isClientEvent,
  isKnownFunnelEvent,
  isUuid,
  mergePriorityTier,
  nextLeadState,
  normalizeClientEventId,
  normalizeDlStatus,
  normalizeForm,
  normalizeOccurredAt,
  normalizePropertyKey,
  phoneToLast10,
  sanitizePagePath,
  sanitizeProperties,
  sanitizeReferrerHost,
  computePriorityTier,
  SCHEMA_VERSION,
  type FunnelEventName,
  type LeadState,
  type PriorityTier,
  type TierSignals,
} from "./funnelTaxonomy.ts";

import {
  backstitchLeadEvents,
  consumeRateLimit,
  hitRateLimit,
  linkSessionToLead,
  recordEvent,
  resolveSession,
  updateLeadProgress,
  upsertLead,
  type FunnelDbClient,
  type LeadAttribution,
  type SessionAttribution,
} from "./funnelStore.ts";

// ---------------------------------------------------------------------------
// Hashing helpers (never persist a raw identifier)
// ---------------------------------------------------------------------------

/** Hex SHA-256 of a string. Available in Deno and Node 18+. */
export async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Non-cryptographic fallback; only used if WebCrypto is unavailable.
    let h = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `fnv${h.toString(16).padStart(8, "0")}`;
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A durable rate-limit bucket key for an IP address. */
export async function ipBucketKey(ip: string): Promise<string> {
  return `ip:${await sha256Hex(ip)}`;
}

/** A durable rate-limit bucket key for a phone number. */
export async function phoneBucketKey(phoneNormalized: string): Promise<string> {
  return `phone:${await sha256Hex(phoneNormalized)}`;
}

/** A durable rate-limit bucket key for a session. */
export async function sessionBucketKey(sessionId: string): Promise<string> {
  return `session:${await sha256Hex(sessionId)}`;
}

/**
 * A deterministic, non-reversible idempotency key built from a set of parts.
 *
 * The raw parts are NEVER persisted — only their digest. Two identical
 * requests in the same session therefore collapse into ONE event (a retry or
 * a double render is not double counted) while a different input is a new
 * event.
 */
export async function deriveHashedClientEventId(
  prefix: string,
  ...parts: (string | number | null | undefined)[]
): Promise<string> {
  const payload = parts
    .map((p) => (p === null || p === undefined ? "" : String(p)))
    .join("|");
  const digest = await sha256Hex(payload);
  return `${prefix}:${digest.slice(0, 24)}`;
}

/**
 * A deterministic, non-reversible idempotency key for a coordinate-scoped
 * event.
 *
 * The raw coordinates are NEVER persisted — they are hashed. Two identical
 * checks in the same session therefore collapse into ONE event (a retry or a
 * double render is not double counted) while a different position is a new
 * event.
 */
export async function deriveCoordinateClientEventId(
  prefix: string,
  lat: number,
  lng: number,
): Promise<string> {
  return deriveHashedClientEventId(prefix, lat.toFixed(4), lng.toFixed(4));
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/** Best-effort client IP from the usual proxy headers. Never persisted raw. */
export function extractClientIp(req: {
  headers: { get(name: string): string | null };
}): string | null {
  const candidates = [
    req.headers.get("cf-connecting-ip"),
    req.headers.get("x-real-ip"),
    req.headers.get("x-forwarded-for"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return null;
}

/** Extract the attribution values a client is allowed to send. */
export function readAttribution(input: unknown): SessionAttribution & LeadAttribution {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return out as SessionAttribution & LeadAttribution;
  }
  const allowed = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "referrer_host",
  ];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = key.trim().toLowerCase();
    if (!allowed.includes(k)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 200) continue;
    out[k] = trimmed;
  }
  return out as SessionAttribution & LeadAttribution;
}

// ---------------------------------------------------------------------------
// Server-side emission
// ---------------------------------------------------------------------------

export interface EmitInput {
  eventName: FunnelEventName;
  sessionId: string;
  /** Server-derived lead id. Never supplied by a browser. */
  leadId?: string | null;
  /** When the event happened (already clamped). Defaults to now. */
  occurredAt?: string;
  pagePath?: string | null;
  properties?: Record<string, unknown>;
  correlationId?: string | null;
  /** Idempotency key. */
  clientEventId: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  deviceType?: string | null;
  /** Recompute the lead state / tier after the write. Defaults to true. */
  syncLead?: boolean;
}

export interface EmitResult {
  recorded: boolean;
  duplicate: boolean;
  error?: string;
}

/**
 * Record one event and (optionally) re-derive the lead's state and tier.
 *
 * Never throws. Instrumentation must never fail a booking.
 */
export async function emitFunnelEvent(
  client: FunnelDbClient,
  input: EmitInput,
): Promise<EmitResult> {
  try {
    const { properties: sanitized } = sanitizeProperties(input.eventName, input.properties ?? {});
    const pagePath = sanitizePagePath(input.pagePath);
    // Envelope metadata is derived server-side, AFTER sanitisation, so a client
    // can never forge it:
    //   * `schema_version` lets a later contract change be detected in the raw
    //     log without a migration;
    //   * `surface` records which product surface the action came from — the
    //     "source" capability — derived from the sanitised page path rather
    //     than a new column.
    const properties = {
      ...sanitized,
      schema_version: SCHEMA_VERSION,
      surface: deriveSurface(pagePath),
    };
    const result = await recordEvent(client, {
      sessionId: input.sessionId,
      leadId: input.leadId ?? null,
      eventName: input.eventName,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      pagePath,
      properties,
      // `lead_events.correlation_id` is a uuid column — a non-uuid would make
      // the whole insert fail.
      correlationId: isUuid(input.correlationId) ? input.correlationId : null,
      clientEventId: input.clientEventId,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      deviceType: input.deviceType ?? null,
    });

    if (input.syncLead !== false && input.leadId) {
      await syncLeadProgress(client, input.leadId, input.eventName, properties);
    }

    return { recorded: result.inserted, duplicate: !result.inserted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("funnel: emit_failed", input.eventName, message);
    return { recorded: false, duplicate: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Server-side emission (edge functions)
// ---------------------------------------------------------------------------

/**
 * Emit `funnel_session_started` exactly once for a session that was just
 * created.
 *
 * Server-derived and idempotent: the key is a hash of the session id, so a
 * concurrent retry, a second event arriving from the same brand-new session,
 * or a duplicate page render can never produce a second row (the DB also
 * enforces `(session_id, client_event_id)` uniqueness). Never throws.
 */
export async function emitSessionStarted(
  client: FunnelDbClient,
  session: {
    id: string;
    first_page_path?: string | null;
    first_utm_source?: string | null;
    first_utm_medium?: string | null;
    first_utm_campaign?: string | null;
  },
  deviceType?: string | null,
): Promise<EmitResult> {
  return await emitFunnelEvent(client, {
    eventName: "funnel_session_started",
    sessionId: session.id,
    leadId: null,
    pagePath: session.first_page_path ?? null,
    // `surface` + `schema_version` are injected by emitFunnelEvent.
    properties: {},
    clientEventId: await deriveHashedClientEventId("s", session.id),
    utmSource: session.first_utm_source ?? null,
    utmMedium: session.first_utm_medium ?? null,
    utmCampaign: session.first_utm_campaign ?? null,
    deviceType: deviceType ?? null,
    // A brand-new session is by definition not yet a lead.
    syncLead: false,
  });
}

export interface ServerEventInput {
  eventName: FunnelEventName;
  /** The browser's session id, when the caller has one. */
  clientSessionId?: string | null;
  /** Server-derived lead id (never from the browser). */
  leadId?: string | null;
  occurredAt?: string;
  pagePath?: string | null;
  properties?: Record<string, unknown>;
  correlationId?: string | null;
  /** Idempotency key — must be stable across retries. */
  clientEventId: string;
  userAgent?: string | null;
  attribution?: SessionAttribution;
}

/**
 * Emit an event from inside an edge function.
 *
 * When the caller can supply the browser's `client_session_id`, the event is
 * stitched into that session (so it participates in the pre-capture back-stitch
 * and in the per-session rate limit). When it cannot, a synthetic server-side
 * session is created so the event is never dropped.
 *
 * Never throws.
 */
export async function emitServerEvent(
  client: FunnelDbClient,
  input: ServerEventInput,
): Promise<EmitResult> {
  try {
    const effectiveSessionId = isUuid(input.clientSessionId)
      ? String(input.clientSessionId)
      : crypto.randomUUID();

    const session = await resolveSession(client, {
      clientSessionId: effectiveSessionId,
      attribution: input.attribution ?? {},
      pagePath: input.pagePath ?? null,
    });

    if (session.created) {
      await emitSessionStarted(client, session.session, classifyDevice(input.userAgent));
    }

    return await emitFunnelEvent(client, {
      eventName: input.eventName,
      sessionId: session.session.id,
      leadId: input.leadId ?? session.session.lead_id ?? null,
      occurredAt: input.occurredAt,
      pagePath: input.pagePath,
      properties: input.properties ?? {},
      correlationId: input.correlationId,
      clientEventId: input.clientEventId,
      utmSource: input.attribution?.utm_source ?? null,
      utmMedium: input.attribution?.utm_medium ?? null,
      utmCampaign: input.attribution?.utm_campaign ?? null,
      deviceType: classifyDevice(input.userAgent),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("funnel: emit_server_event_failed", input.eventName, message);
    return { recorded: false, duplicate: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Lead progress (state + tier)
// ---------------------------------------------------------------------------

export interface LeadProgressOutcome {
  leadState: LeadState | null;
  priorityTier: PriorityTier | null;
}

/**
 * Recompute a lead's PRD section 4 state and prioritisation tier from its
 * recorded events and persist them.
 *
 * The tier is merged upward-only: a lead that already reached P0 never drops
 * back to P3.
 */
export async function syncLeadProgress(
  client: FunnelDbClient,
  leadId: string,
  eventName?: FunnelEventName | string,
  properties?: Record<string, string | number | boolean>,
): Promise<LeadProgressOutcome> {
  const outcome: LeadProgressOutcome = { leadState: null, priorityTier: null };
  try {
    const { data: leadRow } = await client
      .from("funnel_leads")
      .select("lead_state, priority_tier")
      .eq("id", leadId)
      .maybeSingle();

    const currentState = String((leadRow as { lead_state?: string } | null)?.lead_state ?? "new");
    const currentTier = (leadRow as { priority_tier?: string | null } | null)?.priority_tier ?? null;

    // 1. Lead state.
    let nextState: LeadState | null = null;
    if (eventName) {
      nextState = nextLeadState(currentState, eventName);
    }
    if (nextState && nextState !== currentState) {
      outcome.leadState = nextState;
    }

    // 2. Tier.
    const signals = await deriveLeadSignals(client, leadId);
    if (properties && typeof properties.blocked_reason === "string") {
      if (properties.blocked_reason === "out_of_area") signals.outOfArea = true;
    }
    const computed = computePriorityTier(signals);
    const merged = mergePriorityTier(currentTier, computed);
    if (merged && merged !== currentTier) {
      outcome.priorityTier = merged;
    }

    if (outcome.leadState || outcome.priorityTier) {
      await updateLeadProgress(client, leadId, {
        leadState: outcome.leadState,
        priorityTier: outcome.priorityTier,
        dlStatus: signals.dlStatus ?? null,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("funnel: sync_lead_progress_failed", leadId, message);
  }
  return outcome;
}

export interface DerivedSignals extends TierSignals {
  dlStatus?: string | null;
}

/**
 * Derive the tier signals for a lead from its recorded events.
 *
 * Phase 0 note: the site does not yet gate prices behind a lead (PRD
 * section 7 lands in Phase 1), so `price_unlock_attempted` never fires yet.
 * `course_list_viewed` — which renders the price-inclusive catalogue — is used
 * as the prices-viewed proxy so the P2/P3 split is meaningful from day one.
 * Both events are recorded, so the metric switches to the canonical signal the
 * moment Phase 1 ships.
 */
export async function deriveLeadSignals(
  client: FunnelDbClient,
  leadId: string,
): Promise<DerivedSignals> {
  const signals: DerivedSignals = {
    captured: false,
    expertRequested: false,
    paymentAttempted: false,
    paymentSucceeded: false,
    planReached: false,
    slotSelected: false,
    pricesViewed: false,
    supplyBlocked: false,
    outOfArea: false,
  };

  const { data } = await client
    .from("lead_events")
    .select("event_name, properties")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false })
    .limit(500);

  const rows = (data as { event_name?: string; properties?: Record<string, unknown> }[] | null) ?? [];
  for (const row of rows) {
    const name = String(row.event_name ?? "");
    switch (name) {
      case "lead_captured":
        signals.captured = true;
        break;
      case "expert_contact_requested":
        signals.expertRequested = true;
        break;
      case "payment_initiated":
        signals.paymentAttempted = true;
        break;
      case "payment_success":
      case "booking_confirmed":
        signals.paymentSucceeded = true;
        signals.paymentAttempted = true;
        break;
      case "plan_page_viewed":
        signals.planReached = true;
        break;
      case "slot_selected":
        signals.slotSelected = true;
        break;
      case "price_unlock_attempted":
      case "course_list_viewed":
        signals.pricesViewed = true;
        break;
      case "supply_gap_logged":
        signals.supplyBlocked = true;
        break;
      default:
        break;
    }
    const dl = normalizeDlStatus(row.properties?.dl_status);
    if (dl) signals.dlStatus = dl;
    if (row.properties?.blocked_reason === "out_of_area") signals.outOfArea = true;
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Client-reported events
// ---------------------------------------------------------------------------

export interface ClientEventRequest {
  eventName: unknown;
  clientSessionId: unknown;
  clientEventId: unknown;
  occurredAt?: unknown;
  pagePath?: unknown;
  properties?: unknown;
  correlationId?: unknown;
  attribution?: unknown;
  userAgent?: string | null;
}

export type ClientEventRejection =
  | "invalid_event"
  | "server_only_event"
  | "invalid_session"
  | "invalid_client_event_id"
  | "rate_limited";

export interface ClientEventOutcome {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

/**
 * Handle a browser-reported funnel event.
 *
 * Trust boundary:
 *   * the client chooses the event NAME (from the client-allowed list only);
 *   * the client never supplies a lead id — the server resolves it from the
 *     session, and only `capture-lead` may set it;
 *   * the client never supplies the lead state or the tier.
 */
export async function handleClientEvent(
  client: FunnelDbClient,
  request: ClientEventRequest,
  opts: {
    /** Per-session in-memory limit. */
    sessionLimit: number;
    sessionWindowMs: number;
    /** Per-IP in-memory limit (the IP itself is never persisted). */
    ipLimit: number;
    ipWindowMs: number;
    /** Durable per-IP limit. */
    durableIpLimit: number;
    durableIpWindowMs: number;
    /** The raw client IP (hashed before it is used as a bucket key). */
    clientIp?: string | null;
  },
): Promise<ClientEventOutcome> {
  if (!isKnownFunnelEvent(request.eventName)) {
    return {
      ok: false,
      status: 422,
      body: { error: { code: "invalid_event", message: "Unknown event name." } },
    };
  }
  const eventName = request.eventName;
  if (!isClientEvent(eventName)) {
    return {
      ok: false,
      status: 403,
      body: {
        error: {
          code: "server_only_event",
          message: "This event can only be recorded by the server.",
        },
      },
    };
  }
  if (!isUuid(request.clientSessionId)) {
    return {
      ok: false,
      status: 422,
      body: { error: { code: "invalid_session", message: "Invalid session id." } },
    };
  }
  const clientEventId = normalizeClientEventId(request.clientEventId);
  if (!clientEventId) {
    return {
      ok: false,
      status: 422,
      body: {
        error: { code: "invalid_client_event_id", message: "Invalid client event id." },
      },
    };
  }

  // --- rate limits -------------------------------------------------------
  const memorySession = hitRateLimit(
    `mem:${request.clientSessionId}`,
    opts.sessionLimit,
    opts.sessionWindowMs,
  );
  if (!memorySession.allowed) {
    return {
      ok: false,
      status: 429,
      body: { error: { code: "rate_limited", message: "Too many events. Slow down." } },
    };
  }

  if (opts.clientIp) {
    const memoryIp = hitRateLimit(
      `memip:${opts.clientIp}`,
      opts.ipLimit,
      opts.ipWindowMs,
    );
    if (!memoryIp.allowed) {
      return {
        ok: false,
        status: 429,
        body: { error: { code: "rate_limited", message: "Too many events. Slow down." } },
      };
    }
    const bucket = await ipBucketKey(opts.clientIp);
    const durable = await consumeRateLimit(client, {
      bucketKey: bucket,
      limit: opts.durableIpLimit,
      windowMs: opts.durableIpWindowMs,
    });
    if (!durable.allowed) {
      return {
        ok: false,
        status: 429,
        body: { error: { code: "rate_limited", message: "Too many events. Slow down." } },
      };
    }
  }

  // --- session + write ----------------------------------------------------
  const attribution = readAttribution(request.attribution);
  const pagePath = sanitizePagePath(request.pagePath);
  const deviceType = classifyDevice(request.userAgent);

  let session;
  try {
    session = await resolveSession(client, {
      clientSessionId: String(request.clientSessionId),
      attribution: {
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        referrer_host: attribution.referrer_host,
      },
      pagePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("funnel: resolve_session_failed", message);
    return {
      ok: false,
      status: 500,
      body: { error: { code: "internal", message: "Could not record the event." } },
    };
  }

  // A brand-new browsing session gets exactly one `funnel_session_started`
  // row. Best-effort: it can never change the outcome of the client's event.
  if (session.created) {
    await emitSessionStarted(client, session.session, deviceType);
  }

  const result = await emitFunnelEvent(client, {
    eventName,
    sessionId: session.session.id,
    // The client can never supply a lead id. The session's own link (written
    // by capture-lead) is the only source of truth.
    leadId: session.session.lead_id ?? null,
    occurredAt: normalizeOccurredAt(request.occurredAt),
    pagePath,
    properties: (request.properties ?? {}) as Record<string, unknown>,
    correlationId: typeof request.correlationId === "string" ? request.correlationId : null,
    clientEventId,
    utmSource: attribution.utm_source ?? null,
    utmMedium: attribution.utm_medium ?? null,
    utmCampaign: attribution.utm_campaign ?? null,
    deviceType,
  });

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      recorded: result.recorded,
      duplicate: result.duplicate,
    },
  };
}

// ---------------------------------------------------------------------------
// Lead capture
// ---------------------------------------------------------------------------

export interface CaptureLeadInput {
  phone: string;
  name?: string | null;
  email?: string | null;
  locality?: string | null;
  area?: string | null;
  source?: string | null;
  serviceInterest?: string | null;
  leadSource?: string | null;
  clientSessionId?: string | null;
  /** PRD section 4: `out_of_area` for a non-serviceable location. */
  blockedReason?: string | null;
  dlStatus?: string | null;
  areaId?: string | null;
  state?: string | null;
  marketingConsent?: boolean | null;
  attribution?: unknown;
  pagePath?: string | null;
  userAgent?: string | null;
  occurredAt?: unknown;
}

export interface CaptureLeadOutcome {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  leadId?: string;
  sessionId?: string;
  duplicate?: boolean;
}

/**
 * Capture a lead: create/match the lead row, link the session, back-stitch
 * the pre-capture events and record the `lead_captured` event.
 *
 * The `lead_captured` event is written only AFTER the lead row exists — the
 * funnel's commit point is a confirmed backend write, never a client claim.
 */
export async function captureLead(
  client: FunnelDbClient,
  input: CaptureLeadInput,
): Promise<CaptureLeadOutcome> {
  const phoneNormalized = phoneToLast10(input.phone);
  if (!phoneNormalized) {
    return {
      ok: false,
      status: 422,
      body: { error: { code: "invalid_phone", message: "A valid phone number is required." } },
    };
  }

  const attribution = readAttribution(input.attribution);
  const pagePath = sanitizePagePath(input.pagePath);
  const deviceType = classifyDevice(input.userAgent);
  const occurredAt = normalizeOccurredAt(input.occurredAt);

  // Session. The client SHOULD supply its uuid4 so the pre-capture events can
  // be back-stitched; when it does not, the server creates a synthetic
  // session so that `lead_captured` is never lost.
  let sessionId: string | null = null;
  let sessionLeadId: string | null = null;
  let firstTouch: SessionAttribution = {};
  const effectiveClientSessionId = isUuid(input.clientSessionId)
    ? String(input.clientSessionId)
    : crypto.randomUUID();
  try {
    const session = await resolveSession(client, {
      clientSessionId: effectiveClientSessionId,
      attribution: {
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        referrer_host: attribution.referrer_host,
      },
      pagePath,
    });
    sessionId = session.session.id;
    sessionLeadId = session.session.lead_id ?? null;
    if (session.created) {
      await emitSessionStarted(client, session.session, deviceType);
    }
    firstTouch = {
      utm_source: session.session.first_utm_source ?? undefined,
      utm_medium: session.session.first_utm_medium ?? undefined,
      utm_campaign: session.session.first_utm_campaign ?? undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("funnel: capture_resolve_session_failed", message);
  }

  const leadState = "captured";
  const lead = await upsertLead(client, {
    phoneNormalized,
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    locality: input.locality ?? null,
    area: input.area ?? null,
    source: input.source ?? null,
    serviceInterest: input.serviceInterest ?? null,
    leadSource: input.leadSource ?? null,
    sessionId: sessionId ?? null,
    attribution,
    firstTouch,
    leadState,
    marketingConsent: input.marketingConsent ?? null,
  });

  const leadId = lead.id;

  // Link the session to the lead and back-stitch the pre-capture events.
  if (sessionId) {
    await linkSessionToLead(client, sessionId, leadId);
    await backstitchLeadEvents(client, sessionId, leadId);
  }

  // The commit point: exactly one `lead_captured` event per lead.
  const properties: Record<string, unknown> = {
    form: normalizeForm(input.source) ?? "homepage_popup",
    lead_source: input.leadSource ?? null,
    service_interest: input.serviceInterest ?? null,
    blocked_reason: input.blockedReason ?? null,
    dl_status: normalizeDlStatus(input.dlStatus),
    area_id: input.areaId ?? null,
  };

  let duplicate = false;
  if (sessionId) {
    const emitted = await emitFunnelEvent(client, {
      eventName: "lead_captured",
      sessionId,
      leadId,
      occurredAt,
      pagePath,
      properties,
      clientEventId: deriveCaptureClientEventId(leadId),
      utmSource: attribution.utm_source ?? null,
      utmMedium: attribution.utm_medium ?? null,
      utmCampaign: attribution.utm_campaign ?? null,
      deviceType,
      syncLead: false,
    });
    duplicate = emitted.duplicate;
  }

  await syncLeadProgress(client, leadId, "lead_captured", properties as Record<
    string,
    string | number | boolean
  >);

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      leadId,
      sessionId,
      duplicate,
      alreadyLinked: Boolean(sessionLeadId),
    },
    leadId,
    sessionId: sessionId ?? undefined,
    duplicate,
  };
}

// ---------------------------------------------------------------------------
// Small re-exports used by the edge functions
// ---------------------------------------------------------------------------

export { normalizePropertyKey, sanitizeReferrerHost };
